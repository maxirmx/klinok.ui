import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
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
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
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
  orbitIdentityId: string;
  signingPublicKey?: JsonWebKey;
  encryptionPublicKey?: JsonWebKey;
  ephemeralPublicKey?: JsonWebKey;
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
  const app = Fastify({ logger: { redact: ["req.headers.cookie", "req.headers.authorization", "password", "token"] }, bodyLimit: 64 * 1024 });
  await app.register(cookie);
  const store = options.store ?? new AuthStore(options.config.dataDir);
  const mailer = options.mailer ?? new SmtpMailer(options.config);
  const metrics = {
    loginFailures: 0,
    loginLocks: 0,
    sessionsIssued: 0,
    sessionsRevoked: 0,
    mailDelivered: 0,
    originRejected: 0,
    csrfRejected: 0,
  };
  const countedMailer: Mailer = {
    async send(message) {
      await mailer.send(message);
      metrics.mailDelivered += 1;
    },
  };
  const attestation = options.attestation ?? await AttestationService.loadOrCreate(options.config.attestationKeyPath);
  const now = options.now ?? (() => new Date());
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

  app.post<{ Body: RegistrationBody }>("/api/auth/register", async (request, reply) => {
    const body = request.body;
    const email = normalizeEmail(body.email ?? "");
    const roles = [...new Set(body.requestedRoles ?? [])].filter((role): role is Role => ["administrator", "doctor", "owner"].includes(role));
    const valid = body.firstName?.trim() && body.lastName?.trim() && email.includes("@") && validatePassword(body.password ?? "") &&
      body.ageConfirmed === true && roles.length > 0 &&
      body.personalDataConsentVersion === options.config.legal.personalDataConsentVersion &&
      body.userAgreementVersion === options.config.legal.userAgreementVersion;
    if (!valid) return error(reply, 400, "REGISTRATION_INVALID", "Проверьте регистрационные данные и согласия.");

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

  app.post<{ Body: { token: string } }>("/api/auth/verify-email", async (request, reply) => {
    const token = await store.getToken("verification", digestToken(request.body.token ?? ""));
    if (!token || token.usedAt || new Date(token.expiresAt).getTime() <= now().getTime()) {
      return error(reply, 400, "VERIFICATION_TOKEN_INVALID", "Ссылка подтверждения недействительна или устарела.");
    }
    const account = await store.getAccount(token.accountId);
    if (!account) return error(reply, 400, "VERIFICATION_TOKEN_INVALID", "Ссылка подтверждения недействительна или устарела.");
    await store.useToken(token, now().toISOString());
    await store.putAccount({ ...account, credentialStatus: "active", verificationState: "verified", updatedAt: now().toISOString() });
    return { verified: true };
  });

  app.post<{ Body: { email: string; password: string; deviceId?: string } }>("/api/auth/login", async (request, reply) => {
    const email = normalizeEmail(request.body.email ?? "");
    const account = await store.getAccountByEmail(email);
    const current = now().getTime();
    const generic = () => {
      metrics.loginFailures += 1;
      return error(reply, 401, "LOGIN_FAILED", "Неверная электронная почта или пароль.");
    };
    if (!account || account.credentialStatus === "deleted") return generic();
    if (account.verificationState !== "verified") return error(reply, 403, "EMAIL_NOT_VERIFIED", "Сначала подтвердите электронную почту.");
    if (account.lockedUntil && new Date(account.lockedUntil).getTime() > current) {
      metrics.loginLocks += 1;
      return error(reply, 423, "LOGIN_LOCKED", "Вход временно заблокирован. Повторите попытку позже.");
    }
    if (!(await verifyPassword(account.passwordHash, request.body.password ?? ""))) {
      const failureTimes = account.failureTimes.filter((value) => new Date(value).getTime() > current - LOGIN_WINDOW_MS);
      failureTimes.push(now().toISOString());
      const lockedUntil = failureTimes.length >= 5 ? new Date(current + LOCK_MS).toISOString() : undefined;
      await store.putAccount({ ...account, failureTimes, ...(lockedUntil ? { lockedUntil } : {}), updatedAt: now().toISOString() });
      return generic();
    }
    const clean = { ...account, failureTimes: [], lockedUntil: undefined, credentialStatus: "active" as const, updatedAt: now().toISOString() };
    const deviceId = clean.devices.some((device) => device.deviceId === request.body.deviceId && device.status === "active")
      ? request.body.deviceId
      : undefined;
    const session = await issueSession(clean, reply, deviceId);
    return { authenticated: true, accountId: account.accountId, csrfToken: session.csrfToken };
  });

  app.get("/api/auth/session", async (request, reply) => {
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

  app.post("/api/auth/logout", async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
    await store.deleteSessionForAccount(current.session.digest, current.account);
    metrics.sessionsRevoked += 1;
    reply.clearCookie(COOKIE_NAME, cookieOptions(options.config));
    return { loggedOut: true };
  });

  app.post("/api/auth/logout-all", async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
    await store.revokeAccountSessions(current.account);
    metrics.sessionsRevoked += current.account.sessionDigests.length;
    reply.clearCookie(COOKIE_NAME, cookieOptions(options.config));
    return { loggedOut: true };
  });

  app.post<{ Body: { email: string } }>("/api/auth/password/forgot", async (request, reply) => {
    const account = await store.getAccountByEmail(normalizeEmail(request.body.email ?? ""));
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

  app.post<{ Body: { token: string; password: string } }>("/api/auth/password/reset", async (request, reply) => {
    if (!validatePassword(request.body.password ?? "")) return error(reply, 400, "PASSWORD_INVALID", "Пароль должен содержать от 12 до 128 символов.");
    const token = await store.getToken("password_reset", digestToken(request.body.token ?? ""));
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

  app.patch<{ Body: Partial<RegistrationSetupDto["profile"]> }>("/api/auth/profile", async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
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

  app.delete("/api/auth/account", async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
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

  app.post<{ Body: DeviceBody }>("/api/auth/device-enrollments", async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
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
    const enrollment: DeviceEnrollmentDto = {
      enrollmentId: randomUUID(),
      operationId: randomUUID(),
      accountId: current.account.accountId,
      deviceId: request.body.deviceId,
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
        payload: { deviceId: enrollment.deviceId },
      }],
      updatedAt: now().toISOString(),
    });
    return { enrollment, ...(enrollment.status === "active" ? { certificate: devices.at(-1) } : {}) };
  });

  app.post<{ Params: { id: string }; Body: { encryptedKeyBundle: string; signingPublicKey: JsonWebKey; encryptionPublicKey: JsonWebKey } }>("/api/auth/device-enrollments/:id/approve", async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
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

  app.delete<{ Params: { id: string }; Body: { signingPublicKey?: JsonWebKey; encryptionPublicKey?: JsonWebKey } }>("/api/auth/devices/:id", async (request, reply) => {
    const current = await authenticated(request, reply);
    if (!current) return;
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
