import { createHmac, randomBytes, randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  stableSerialize,
  type AuthErrorBody,
  type AuthSessionDto,
  type DeviceCertificate,
  type DeviceEnrollmentDto,
  type RegistrationSetupDto,
  type Role,
} from "@klinok/protocol";
import type { AuthConfig } from "./config.js";
import { AttestationService } from "./attestation.js";
import type { Mailer } from "./mailer.js";
import { SmtpMailer } from "./mailer.js";
import {
  createOpaqueToken,
  digestToken,
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from "./security.js";
import { AuthStore, type AuthAccount, type AuthSessionRecord } from "./store.js";
import { ControlPlaneObserver } from "./controlObserver.js";

const COOKIE_NAME = "klinok_session";
const IDLE_MS = 30 * 60_000;
const ABSOLUTE_MS = 8 * 60 * 60_000;
const ROTATE_MS = 15 * 60_000;

interface RegistrationBody {
  firstName: string;
  lastName: string;
  patronymic?: string;
  email: string;
  password: string;
  ageConfirmed: boolean;
  personalDataConsentVersion: string;
  userAgreementVersion: string;
  requestedRoles: Role[];
}

interface DeviceBody {
  deviceId: string;
  deviceName?: string;
  orbitIdentityId: string;
  signingPublicKey?: JsonWebKey;
  encryptionPublicKey?: JsonWebKey;
  ephemeralPublicKey?: JsonWebKey;
}

class RateLimitError extends Error {
  readonly statusCode = 429;
  readonly code = "RATE_LIMITED";

  constructor() {
    super("Слишком много запросов. Повторите попытку позже.");
  }
}

type RateLimitCheck = ReturnType<FastifyInstance["createRateLimit"]>;
type RateLimitResult = Awaited<ReturnType<RateLimitCheck>>;

function rateLimitExhausted(result: RateLimitResult): boolean {
  return !result.isAllowed && (result.isExceeded || result.remaining === 0);
}

function rateLimitExceeded(result: RateLimitResult): boolean {
  return !result.isAllowed && result.isExceeded;
}

export interface AuthAppOptions {
  config: AuthConfig;
  store?: AuthStore;
  mailer?: Mailer;
  attestation?: AttestationService;
  now?: () => Date;
}

function error(reply: FastifyReply, statusCode: number, code: string, message: string): FastifyReply {
  return reply.code(statusCode).send({ error: { code, message } } satisfies AuthErrorBody);
}

function cookieOptions(config: AuthConfig) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: config.cookieSecure,
    path: "/",
  };
}

export async function buildAuthApp(options: AuthAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { redact: ["req.headers.cookie", "req.headers.authorization", "password", "token"] },
    bodyLimit: 64 * 1024,
    trustProxy: options.config.trustProxy,
  });
  const metrics = {
    loginFailures: 0,
    rateLimitRejected: 0,
    sessionsIssued: 0,
    sessionsRevoked: 0,
    mailDelivered: 0,
    originRejected: 0,
    csrfRejected: 0,
  };
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    skipOnError: false,
    keyGenerator: (request) => request.ip,
    onExceeded: () => { metrics.rateLimitRejected += 1; },
    errorResponseBuilder: () => new RateLimitError(),
  });
  app.setErrorHandler((failure, _request, reply) => {
    if (failure instanceof RateLimitError) {
      return error(reply, 429, "RATE_LIMITED", "Слишком много запросов. Повторите попытку позже.");
    }
    return reply.send(failure);
  });

  const store = options.store ?? new AuthStore(options.config.dataDir);
  const mailer = options.mailer ?? new SmtpMailer(options.config);
  const countedMailer: Mailer = {
    async send(message) {
      await mailer.send(message);
      metrics.mailDelivered += 1;
    },
  };
  const attestation = options.attestation ?? await AttestationService.loadOrCreate(options.config.attestationKeyPath);
  const now = options.now ?? (() => new Date());
  const limiterKeySecret = randomBytes(32);

  function privateLimiterKey(scope: string, value: string): string {
    return `${scope}:${createHmac("sha256", limiterKeySecret).update(value).digest("base64url")}`;
  }

  function keyedLimiter(max: number, timeWindow: number): (request: FastifyRequest, key: string, increment?: boolean) => Promise<RateLimitResult> {
    const requestKeys = new WeakMap<FastifyRequest, string>();
    const check = app.createRateLimit({
      max,
      timeWindow,
      keyGenerator: (request) => {
        const key = requestKeys.get(request);
        if (!key) throw new Error("Rate-limit key is missing");
        return key;
      },
    });
    return async (request, key, increment = true) => {
      requestKeys.set(request, key);
      try {
        return await check(request, { increment });
      } finally {
        requestKeys.delete(request);
      }
    };
  }

  const registrationByEmail = keyedLimiter(options.config.rateLimit.registrationEmailPerDay, 24 * 60 * 60_000);
  const loginFailuresByAccount = keyedLimiter(options.config.rateLimit.loginFailuresPerAccount15Minutes, 15 * 60_000);
  const recoveryByAccount = keyedLimiter(options.config.rateLimit.recoveryAccountPerHour, 60 * 60_000);
  const tokenAttempts = keyedLimiter(options.config.rateLimit.tokenPer15Minutes, 15 * 60_000);
  const mutationsByAccount = keyedLimiter(options.config.rateLimit.mutationAccountPerMinute, 60_000);
  const sensitiveMutationsByAccount = keyedLimiter(options.config.rateLimit.sensitiveMutationAccountPerMinute, 60_000);

  function rejectRateLimit(reply: FastifyReply, result: RateLimitResult): FastifyReply {
    metrics.rateLimitRejected += 1;
    if (!result.isAllowed) reply.header("Retry-After", Math.max(1, result.ttlInSeconds));
    return error(reply, 429, "RATE_LIMITED", "Слишком много запросов. Повторите попытку позже.");
  }

  async function allowAccountMutation(request: FastifyRequest, reply: FastifyReply, accountId: string, sensitive = false): Promise<boolean> {
    const accountKey = privateLimiterKey("account", accountId);
    const mutationResult = await mutationsByAccount(request, accountKey);
    if (rateLimitExceeded(mutationResult)) {
      rejectRateLimit(reply, mutationResult);
      return false;
    }
    if (sensitive) {
      const sensitiveResult = await sensitiveMutationsByAccount(request, accountKey);
      if (rateLimitExceeded(sensitiveResult)) {
        rejectRateLimit(reply, sensitiveResult);
        return false;
      }
    }
    return true;
  }

  await store.open();

  app.addHook("onClose", async () => store.close());
  const observer = new ControlPlaneObserver(options.config, store, countedMailer, await attestation.publicJwk());
  await observer.start();
  app.addHook("onClose", async () => observer.stop());
  app.addHook("preHandler", async (request, reply) => {
    if (!options.config.enforceOrigin || request.method === "GET" || request.url === "/healthz") return;
    if (request.headers.origin !== options.config.publicOrigin) {
      metrics.originRejected += 1;
      return error(reply, 403, "ORIGIN_REJECTED", "Запрос с другого сайта отклонён.");
    }
  });

  async function sessionFor(request: FastifyRequest, touch = true): Promise<{ session: AuthSessionRecord; account: AuthAccount } | null> {
    const raw = request.cookies[COOKIE_NAME];
    if (!raw) return null;
    const session = await store.getSession(digestToken(raw));
    if (!session) return null;
    const account = await store.getAccount(session.accountId);
    const current = now().getTime();
    if (new Date(session.absoluteExpiresAt).getTime() <= current || new Date(session.lastSeenAt).getTime() + IDLE_MS <= current) {
      if (account) await store.deleteSessionForAccount(session.digest, account);
      else await store.deleteSession(session.digest);
      return null;
    }
    if (!account || account.credentialStatus === "deleted") {
      if (account) await store.deleteSessionForAccount(session.digest, account);
      else await store.deleteSession(session.digest);
      return null;
    }
    if (touch) {
      session.lastSeenAt = now().toISOString();
      await store.putSession(session);
    }
    return { session, account };
  }

  async function authenticated(request: FastifyRequest, reply: FastifyReply, csrf = true) {
    const current = await sessionFor(request);
    if (!current) {
      error(reply, 401, "AUTH_REQUIRED", "Необходимо войти в аккаунт.");
      return null;
    }
    if (csrf && request.headers["x-csrf-token"] !== current.session.csrfToken) {
      metrics.csrfRejected += 1;
      error(reply, 403, "CSRF_REJECTED", "Защитный токен недействителен.");
      return null;
    }
    return current;
  }

  async function issueSession(account: AuthAccount, reply: FastifyReply, deviceId?: string): Promise<AuthSessionRecord> {
    const raw = createOpaqueToken();
    const createdAt = now();
    const session: AuthSessionRecord = {
      digest: digestToken(raw),
      accountId: account.accountId,
      csrfToken: createOpaqueToken(),
      createdAt: createdAt.toISOString(),
      lastSeenAt: createdAt.toISOString(),
      absoluteExpiresAt: new Date(createdAt.getTime() + ABSOLUTE_MS).toISOString(),
      ...(deviceId ? { deviceId } : {}),
    };
    await store.putSessionForAccount(session, account);
    reply.setCookie(COOKIE_NAME, raw, cookieOptions(options.config));
    metrics.sessionsIssued += 1;
    return session;
  }

  async function rotateSession(current: { session: AuthSessionRecord; account: AuthAccount }, reply: FastifyReply) {
    const raw = createOpaqueToken();
    const rotated: AuthSessionRecord = {
      ...current.session,
      digest: digestToken(raw),
      csrfToken: createOpaqueToken(),
      createdAt: now().toISOString(),
      lastSeenAt: now().toISOString(),
    };
    current.account = await store.replaceSessionForAccount(current.session.digest, rotated, current.account);
    current.session = rotated;
    reply.setCookie(COOKIE_NAME, raw, cookieOptions(options.config));
    return current;
  }

  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/metrics", async () => ({ counters: { ...metrics } }));

  app.post<{ Body: RegistrationBody }>("/api/auth/register", {
    config: { rateLimit: { max: options.config.rateLimit.registrationIpPerHour, timeWindow: 60 * 60_000 } },
  }, async (request, reply) => {
    const body = request.body;
    const email = normalizeEmail(body.email ?? "");
    const roles = [...new Set(body.requestedRoles ?? [])].filter((role): role is Role => ["administrator", "doctor", "owner"].includes(role));
    const valid = body.firstName?.trim() && body.lastName?.trim() && email.includes("@") && validatePassword(body.password ?? "") &&
      body.ageConfirmed === true && roles.length > 0 &&
      body.personalDataConsentVersion === options.config.legal.personalDataConsentVersion &&
      body.userAgreementVersion === options.config.legal.userAgreementVersion;
    if (!valid) return error(reply, 400, "REGISTRATION_INVALID", "Проверьте регистрационные данные и согласия.");

    const emailLimit = await registrationByEmail(request, privateLimiterKey("registration-email", email));
    if (rateLimitExceeded(emailLimit)) return reply.code(202).send({ accepted: true });

    const existing = await store.getAccountByEmail(email);
    if (!existing) {
      const createdAt = now().toISOString();
      const setup: RegistrationSetupDto = {
        profile: {
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          ...(body.patronymic?.trim() ? { patronymic: body.patronymic.trim() } : {}),
        },
        requestedRoles: roles,
        ageConfirmed: true,
        personalDataConsentVersion: body.personalDataConsentVersion,
        userAgreementVersion: body.userAgreementVersion,
      };
      const account: AuthAccount = {
        accountId: randomUUID(),
        email,
        passwordHash: await hashPassword(body.password),
        credentialStatus: "pending_verification",
        verificationState: "pending",
        createdAt,
        updatedAt: createdAt,
        failureTimes: [],
        setup,
        devices: [],
        enrollments: [],
        pendingOperations: [],
        sessionDigests: [],
      };
      await store.createAccount(account);
      const token = createOpaqueToken();
      await store.putToken({ digest: digestToken(token), accountId: account.accountId, kind: "verification", expiresAt: new Date(now().getTime() + 24 * 60 * 60_000).toISOString() });
      await countedMailer.send({
        to: email,
        subject: "Подтверждение регистрации в Клинок",
        text: `Подтвердите адрес: ${options.config.publicOrigin}/auth/verify-email?token=${encodeURIComponent(token)}`,
      });
    }
    return reply.code(202).send({ accepted: true });
  });

  app.post<{ Body: { token: string } }>("/api/auth/verify-email", {
    config: { rateLimit: { max: options.config.rateLimit.tokenIpPer15Minutes, timeWindow: 15 * 60_000 } },
  }, async (request, reply) => {
    const rawToken = request.body.token ?? "";
    const tokenLimit = await tokenAttempts(request, `verification:${digestToken(rawToken)}`);
    if (rateLimitExceeded(tokenLimit)) return rejectRateLimit(reply, tokenLimit);
    const token = await store.getToken("verification", digestToken(rawToken));
    if (!token || token.usedAt || new Date(token.expiresAt).getTime() <= now().getTime()) {
      return error(reply, 400, "VERIFICATION_TOKEN_INVALID", "Ссылка подтверждения недействительна или устарела.");
    }
    const account = await store.getAccount(token.accountId);
    if (!account) return error(reply, 400, "VERIFICATION_TOKEN_INVALID", "Ссылка подтверждения недействительна или устарела.");
    await store.useToken(token, now().toISOString());
    await store.putAccount({ ...account, credentialStatus: "active", verificationState: "verified", updatedAt: now().toISOString() });
    return { verified: true };
  });

  app.post<{ Body: { email: string; password: string; deviceId?: string } }>("/api/auth/login", {
    config: { rateLimit: { max: options.config.rateLimit.loginIpPer15Minutes, timeWindow: 15 * 60_000 } },
  }, async (request, reply) => {
    const email = normalizeEmail(request.body.email ?? "");
    const accountLimitKey = privateLimiterKey("login-account", email);
    const accountLimit = await loginFailuresByAccount(request, accountLimitKey, false);
    if (rateLimitExhausted(accountLimit)) return rejectRateLimit(reply, accountLimit);
    const account = await store.getAccountByEmail(email);
    const generic = async () => {
      metrics.loginFailures += 1;
      await loginFailuresByAccount(request, accountLimitKey);
      return error(reply, 401, "LOGIN_FAILED", "Неверная электронная почта или пароль.");
    };
    if (!account || account.credentialStatus === "deleted") return await generic();
    if (account.verificationState !== "verified") return error(reply, 403, "EMAIL_NOT_VERIFIED", "Сначала подтвердите электронную почту.");
    if (!(await verifyPassword(account.passwordHash, request.body.password ?? ""))) {
      return await generic();
    }
    const clean = { ...account, failureTimes: [], lockedUntil: undefined, credentialStatus: "active" as const, updatedAt: now().toISOString() };
    const deviceId = clean.devices.some((device) => device.deviceId === request.body.deviceId && device.status === "active")
      ? request.body.deviceId
      : undefined;
    const session = await issueSession(clean, reply, deviceId);
    return { authenticated: true, accountId: account.accountId, csrfToken: session.csrfToken };
  });

  app.get("/api/auth/session", {
    config: { rateLimit: { max: options.config.rateLimit.sessionIpPerMinute, timeWindow: 60_000 } },
  }, async (request, reply) => {
    let current = await sessionFor(request);
    if (!current) return { authenticated: false } satisfies AuthSessionDto;
    if (now().getTime() - new Date(current.session.createdAt).getTime() >= ROTATE_MS) current = await rotateSession(current, reply);
    const { account, session } = current;
    const device = account.devices.find((candidate) => candidate.deviceId === session.deviceId);
    return {
      authenticated: true,
      credentialStatus: account.credentialStatus,
      accountId: account.accountId,
      csrfToken: session.csrfToken,
      ...(device ? { device } : {}),
      devices: account.devices,
      enrollments: account.enrollments,
      pendingOperations: account.pendingOperations,
      ...(account.setup ? { setup: account.setup } : {}),
    } satisfies AuthSessionDto;
  });

  app.post("/api/auth/logout", {
    config: { rateLimit: { max: options.config.rateLimit.mutationIpPerMinute, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
    if (!await allowAccountMutation(request, reply, current.account.accountId)) return;
    await store.deleteSessionForAccount(current.session.digest, current.account);
    metrics.sessionsRevoked += 1;
    reply.clearCookie(COOKIE_NAME, cookieOptions(options.config));
    return { loggedOut: true };
  });

  app.post("/api/auth/logout-all", {
    config: { rateLimit: { max: options.config.rateLimit.sensitiveMutationIpPerMinute, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
    if (!await allowAccountMutation(request, reply, current.account.accountId, true)) return;
    await store.revokeAccountSessions(current.account);
    metrics.sessionsRevoked += current.account.sessionDigests.length;
    reply.clearCookie(COOKIE_NAME, cookieOptions(options.config));
    return { loggedOut: true };
  });

  app.post<{ Body: { email: string } }>("/api/auth/password/forgot", {
    config: { rateLimit: { max: options.config.rateLimit.recoveryIpPerHour, timeWindow: 60 * 60_000 } },
  }, async (request, reply) => {
    const email = normalizeEmail(request.body.email ?? "");
    const accountLimit = await recoveryByAccount(request, privateLimiterKey("recovery-account", email));
    if (rateLimitExceeded(accountLimit)) return reply.code(202).send({ accepted: true });
    const account = await store.getAccountByEmail(email);
    if (account && account.credentialStatus !== "deleted") {
      const token = createOpaqueToken();
      await store.putToken({ digest: digestToken(token), accountId: account.accountId, kind: "password_reset", expiresAt: new Date(now().getTime() + 30 * 60_000).toISOString() });
      await countedMailer.send({
        to: account.email,
        subject: "Восстановление доступа к Клинок",
        text: `Сбросьте пароль: ${options.config.publicOrigin}/auth/reset-password?token=${encodeURIComponent(token)}`,
      });
    }
    return reply.code(202).send({ accepted: true });
  });

  app.post<{ Body: { token: string; password: string } }>("/api/auth/password/reset", {
    config: { rateLimit: { max: options.config.rateLimit.tokenIpPer15Minutes, timeWindow: 15 * 60_000 } },
  }, async (request, reply) => {
    if (!validatePassword(request.body.password ?? "")) return error(reply, 400, "PASSWORD_INVALID", "Пароль должен содержать от 12 до 128 символов.");
    const rawToken = request.body.token ?? "";
    const tokenLimit = await tokenAttempts(request, `password-reset:${digestToken(rawToken)}`);
    if (rateLimitExceeded(tokenLimit)) return rejectRateLimit(reply, tokenLimit);
    const token = await store.getToken("password_reset", digestToken(rawToken));
    if (!token || token.usedAt || new Date(token.expiresAt).getTime() <= now().getTime()) {
      return error(reply, 400, "RESET_TOKEN_INVALID", "Ссылка восстановления недействительна или устарела.");
    }
    const account = await store.getAccount(token.accountId);
    if (!account) return error(reply, 400, "RESET_TOKEN_INVALID", "Ссылка восстановления недействительна или устарела.");
    await store.useToken(token, now().toISOString());
    const revoked = await store.revokeAccountSessions(account);
    metrics.sessionsRevoked += account.sessionDigests.length;
    await store.putAccount({ ...revoked, passwordHash: await hashPassword(request.body.password), updatedAt: now().toISOString() });
    reply.clearCookie(COOKIE_NAME, cookieOptions(options.config));
    return { reset: true };
  });

  app.patch<{ Body: Partial<RegistrationSetupDto["profile"]> }>("/api/auth/profile", {
    config: { rateLimit: { max: options.config.rateLimit.mutationIpPerMinute, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
    if (!await allowAccountMutation(request, reply, current.account.accountId)) return;
    const operationId = randomUUID();
    const profile = { ...(current.account.setup?.profile ?? {}), ...request.body };
    if (!profile.firstName?.trim() || !profile.lastName?.trim()) return error(reply, 400, "PROFILE_INVALID", "Имя и фамилия обязательны.");
    const normalizedProfile = {
      firstName: profile.firstName.trim(),
      lastName: profile.lastName.trim(),
      ...(profile.patronymic?.trim() ? { patronymic: profile.patronymic.trim() } : {}),
    };
    const existing = current.account.pendingOperations.find((operation) =>
      operation.kind === "profile" && stableSerialize(operation.payload) === stableSerialize(normalizedProfile),
    );
    if (existing) return { operationId: existing.operationId };
    await store.putAccount({
      ...current.account,
      ...(current.account.setup ? { setup: { ...current.account.setup, profile: normalizedProfile } } : {}),
      pendingOperations: [...current.account.pendingOperations, { operationId, kind: "profile", createdAt: now().toISOString(), payload: normalizedProfile }],
      updatedAt: now().toISOString(),
    });
    return { operationId };
  });

  app.delete("/api/auth/account", {
    config: { rateLimit: { max: options.config.rateLimit.sensitiveMutationIpPerMinute, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
    if (!await allowAccountMutation(request, reply, current.account.accountId, true)) return;
    if (current.account.immutableBootstrap) return error(reply, 409, "BOOTSTRAP_PROTECTED", "Начальный аккаунт администратора нельзя удалить.");
    const pending = current.account.pendingOperations.find((operation) => operation.kind === "account_delete");
    if (pending) return { operationId: pending.operationId };
    const operationId = randomUUID();
    await store.putAccount({
      ...current.account,
      pendingOperations: [...current.account.pendingOperations, { operationId, kind: "account_delete", createdAt: now().toISOString() }],
      updatedAt: now().toISOString(),
    });
    return { operationId };
  });

  app.post<{ Body: DeviceBody }>("/api/auth/device-enrollments", {
    config: { rateLimit: { max: options.config.rateLimit.sensitiveMutationIpPerMinute, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
    if (!await allowAccountMutation(request, reply, current.account.accountId, true)) return;
    const existingEnrollment = current.account.enrollments.find((enrollment) => enrollment.deviceId === request.body.deviceId);
    if (existingEnrollment) {
      const certificate = current.account.devices.find((device) => device.deviceId === existingEnrollment.deviceId && device.status === "active");
      return { enrollment: existingEnrollment, ...(certificate ? { certificate } : {}) };
    }
    const hasActiveDevices = current.account.devices.some((device) => device.status === "active");
    if (!request.body.deviceId || !request.body.orbitIdentityId ||
      (!hasActiveDevices && (!request.body.signingPublicKey || !request.body.encryptionPublicKey)) ||
      (hasActiveDevices && !request.body.ephemeralPublicKey)) {
      return error(reply, 400, "DEVICE_INVALID", "Данные устройства неполны.");
    }
    const deviceName = request.body.deviceName?.trim() || `Устройство ${request.body.deviceId.slice(0, 8)}`;
    if (deviceName.length > 80) return error(reply, 400, "DEVICE_NAME_INVALID", "Название устройства не должно превышать 80 символов.");
    const enrollment: DeviceEnrollmentDto = {
      enrollmentId: randomUUID(),
      operationId: randomUUID(),
      accountId: current.account.accountId,
      deviceId: request.body.deviceId,
      deviceName,
      orbitIdentityId: request.body.orbitIdentityId,
      status: hasActiveDevices ? "pending" : "active",
      ...(request.body.signingPublicKey ? { signingPublicKey: request.body.signingPublicKey } : {}),
      ...(request.body.encryptionPublicKey ? { encryptionPublicKey: request.body.encryptionPublicKey } : {}),
      ...(request.body.ephemeralPublicKey ? { ephemeralPublicKey: request.body.ephemeralPublicKey } : {}),
      createdAt: now().toISOString(),
    };
    const devices = [...current.account.devices];
    if (enrollment.status === "active") {
      const certificate = await attestation.certificate(enrollment, now().toISOString());
      devices.push(certificate);
    }
    current.session.deviceId = enrollment.deviceId;
    await store.putSession(current.session);
    await store.putAccount({
      ...current.account,
      devices,
      enrollments: [...current.account.enrollments, enrollment],
      pendingOperations: [...current.account.pendingOperations, {
        operationId: enrollment.operationId,
        kind: "device",
        createdAt: enrollment.createdAt,
        payload: { deviceId: enrollment.deviceId, deviceName: enrollment.deviceName },
      }],
      updatedAt: now().toISOString(),
    });
    return { enrollment, ...(enrollment.status === "active" ? { certificate: devices.at(-1) } : {}) };
  });

  app.post<{ Params: { id: string }; Body: { encryptedKeyBundle: string; signingPublicKey: JsonWebKey; encryptionPublicKey: JsonWebKey } }>("/api/auth/device-enrollments/:id/approve", {
    config: { rateLimit: { max: options.config.rateLimit.sensitiveMutationIpPerMinute, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
    if (!await allowAccountMutation(request, reply, current.account.accountId, true)) return;
    if (!current.session.deviceId || !current.account.devices.some((device) => device.deviceId === current.session.deviceId && device.status === "active")) {
      return error(reply, 403, "ACTIVE_DEVICE_REQUIRED", "Подтвердить устройство можно только с действующего устройства.");
    }
    const index = current.account.enrollments.findIndex((item) => item.enrollmentId === request.params.id && item.status === "pending");
    if (index < 0) return error(reply, 404, "ENROLLMENT_NOT_FOUND", "Запрос устройства не найден.");
    if (!request.body.encryptedKeyBundle || !request.body.signingPublicKey || !request.body.encryptionPublicKey) {
      return error(reply, 400, "ENROLLMENT_APPROVAL_INVALID", "Пакет ключей устройства неполон.");
    }
    const enrollment = {
      ...current.account.enrollments[index]!, status: "active" as const,
      encryptedKeyBundle: request.body.encryptedKeyBundle,
      signingPublicKey: request.body.signingPublicKey,
      encryptionPublicKey: request.body.encryptionPublicKey,
    };
    const enrollments = [...current.account.enrollments];
    enrollments[index] = enrollment;
    const certificate = await attestation.certificate(enrollment, now().toISOString());
    await store.putAccount({ ...current.account, enrollments, devices: [...current.account.devices, certificate], updatedAt: now().toISOString() });
    return { certificate };
  });

  app.delete<{ Params: { id: string } }>("/api/auth/device-enrollments/:id", {
    config: { rateLimit: { max: options.config.rateLimit.sensitiveMutationIpPerMinute, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
    if (!await allowAccountMutation(request, reply, current.account.accountId, true)) return;
    if (!current.session.deviceId || !current.account.devices.some((device) => device.deviceId === current.session.deviceId && device.status === "active")) {
      return error(reply, 403, "ACTIVE_DEVICE_REQUIRED", "Отклонить устройство можно только с действующего устройства.");
    }
    const enrollment = current.account.enrollments.find((item) => item.enrollmentId === request.params.id && item.status === "pending");
    if (!enrollment) return error(reply, 404, "ENROLLMENT_NOT_FOUND", "Запрос устройства не найден.");
    await store.putAccount({
      ...current.account,
      enrollments: current.account.enrollments.filter((item) => item.enrollmentId !== enrollment.enrollmentId),
      updatedAt: now().toISOString(),
    });
    return { rejected: true };
  });

  app.delete<{ Params: { id: string }; Body: { signingPublicKey?: JsonWebKey; encryptionPublicKey?: JsonWebKey } }>("/api/auth/devices/:id", {
    config: { rateLimit: { max: options.config.rateLimit.sensitiveMutationIpPerMinute, timeWindow: 60_000 } },
  }, async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
    if (!await allowAccountMutation(request, reply, current.account.accountId, true)) return;
    const found = current.account.devices.find((device) => device.deviceId === request.params.id);
    if (!found) return error(reply, 404, "DEVICE_NOT_FOUND", "Устройство не найдено.");
    const currentDevice = current.account.devices.find((device) => device.deviceId === current.session.deviceId && device.status === "active");
    const canRotate = currentDevice && currentDevice.deviceId !== request.params.id && request.body?.signingPublicKey && request.body?.encryptionPublicKey;
    const revokedDeviceIds = current.account.devices
      .filter((device) => device.status === "active" && device.deviceId !== currentDevice?.deviceId)
      .map((device) => device.deviceId);
    let rotatedCertificate: DeviceCertificate | undefined;
    if (canRotate) {
      rotatedCertificate = await attestation.certificate({
        enrollmentId: randomUUID(), operationId: randomUUID(), accountId: current.account.accountId, deviceId: currentDevice.deviceId,
        ...(currentDevice.deviceName ? { deviceName: currentDevice.deviceName } : {}),
        orbitIdentityId: currentDevice.orbitIdentityId, status: "active",
        signingPublicKey: request.body.signingPublicKey!, encryptionPublicKey: request.body.encryptionPublicKey!,
        userKeyVersion: currentDevice.userKeyVersion + 1, createdAt: now().toISOString(),
      });
    }
    const devices = current.account.devices.map((device) => {
      if (rotatedCertificate && device.deviceId === rotatedCertificate.deviceId) return rotatedCertificate;
      if (device.deviceId === request.params.id || (rotatedCertificate && device.deviceId !== rotatedCertificate.deviceId)) return { ...device, status: "revoked" as const };
      return device;
    });
    const updated = await store.revokeAccountSessions({ ...current.account, devices });
    await store.putAccount(updated);
    metrics.sessionsRevoked += current.account.sessionDigests.length;
    reply.clearCookie(COOKIE_NAME, cookieOptions(options.config));
    return { revoked: true, rotateUserKeys: Boolean(rotatedCertificate), certificate: rotatedCertificate, revokedDeviceIds };
  });

  return app;
}
