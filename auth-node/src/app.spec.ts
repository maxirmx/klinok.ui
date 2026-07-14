import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import { MemoryMailer } from "./mailer.js";
import { DEFAULT_AUTH_RATE_LIMITS, type AuthConfig, type AuthRateLimitConfig } from "./config.js";

const apps: Array<{ close(): Promise<void> }> = [];

async function fixture(options: { now?: () => Date; trustProxy?: AuthConfig["trustProxy"]; rateLimit?: Partial<AuthRateLimitConfig> } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "klinok-auth-test-"));
  const config: AuthConfig = {
    host: "127.0.0.1", port: 0, dataDir, publicOrigin: "https://klinok.test", attestationKeyPath: join(dataDir, "attestation.json"), cookieSecure: true, enforceOrigin: true,
    trustProxy: options.trustProxy ?? false,
    rateLimit: { ...DEFAULT_AUTH_RATE_LIMITS, ...options.rateLimit },
    smtp: { host: "localhost", port: 1025, secure: false, from: "test@klinok.test" },
    legal: { personalDataConsentVersion: "consent-v1", userAgreementVersion: "terms-v1" },
    controlObserver: { enabled: false, databaseName: "klinok-control-v1", trustedNodeMultiaddrs: [] },
  };
  const mailer = new MemoryMailer();
  const app = await buildAuthApp({ config, mailer, now: options.now });
  apps.push(app);
  return { app, mailer };
}

const registration = {
  firstName: "Иван", lastName: "Иванов", email: " User@Example.COM ", password: "correct horse battery",
  ageConfirmed: true, personalDataConsentVersion: "consent-v1", userAgreementVersion: "terms-v1", requestedRoles: ["owner"],
};

async function verifiedLogin(app: Awaited<ReturnType<typeof buildAuthApp>>, mailer: MemoryMailer) {
  await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "https://klinok.test" }, payload: registration });
  const token = mailer.messages[0]!.text.match(/token=([^\s]+)/)![1]!;
  const verification = await app.inject({ method: "POST", url: "/api/auth/verify-email", headers: { origin: "https://klinok.test" }, payload: { token: decodeURIComponent(token) } });
  expect(verification.statusCode).toBe(200);
  const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "https://klinok.test" }, payload: { email: registration.email, password: registration.password } });
  expect(login.statusCode).toBe(200);
  return { cookie: login.headers["set-cookie"]!, csrf: login.json().csrfToken as string, accountId: login.json().accountId as string };
}

afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

describe("auth-node", () => {
  it("registers without exposing account existence and sends verification once", async () => {
    const { app, mailer } = await fixture();
    const first = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "https://klinok.test" }, payload: registration });
    const duplicate = await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "https://klinok.test" }, payload: registration });
    expect(first.statusCode).toBe(202);
    expect(duplicate.statusCode).toBe(202);
    expect(first.json()).toEqual(duplicate.json());
    expect(mailer.messages).toHaveLength(1);
  });

  it("rejects cross-origin mutations", async () => {
    const { app } = await fixture();
    const response = await app.inject({ method: "POST", url: "/api/auth/password/forgot", headers: { origin: "https://evil.test" }, payload: { email: "user@example.com" } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("ORIGIN_REJECTED");
  });

  it("verifies email, creates a strict session, and enforces CSRF", async () => {
    const { app, mailer } = await fixture();
    const login = await verifiedLogin(app, mailer);
    expect(login.cookie).toContain("HttpOnly");
    expect(login.cookie).toContain("SameSite=Strict");
    expect(login.cookie).toContain("Secure");
    const session = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: login.cookie } });
    expect(session.json()).toMatchObject({ authenticated: true, credentialStatus: "active", accountId: login.accountId });
    const rejected = await app.inject({ method: "POST", url: "/api/auth/logout-all", headers: { origin: "https://klinok.test", cookie: login.cookie } });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().error.code).toBe("CSRF_REJECTED");
    const accepted = await app.inject({ method: "POST", url: "/api/auth/logout-all", headers: { origin: "https://klinok.test", cookie: login.cookie, "x-csrf-token": login.csrf } });
    expect(accepted.statusCode).toBe(200);
    const revoked = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: login.cookie } });
    expect(revoked.json()).toEqual({ authenticated: false });
  });

  it("rotates opaque sessions and invalidates the previous token", async () => {
    let current = new Date("2026-07-10T10:00:00.000Z");
    const { app, mailer } = await fixture({ now: () => current });
    const login = await verifiedLogin(app, mailer);
    current = new Date("2026-07-10T10:16:00.000Z");
    const rotated = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: login.cookie } });
    const rotatedCookie = rotated.headers["set-cookie"]!;
    expect(rotatedCookie).toBeTruthy();
    expect(rotatedCookie).not.toBe(login.cookie);
    expect(rotated.json().csrfToken).not.toBe(login.csrf);
    expect((await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: login.cookie } })).json()).toEqual({ authenticated: false });
    current = new Date("2026-07-10T18:00:01.000Z");
    expect((await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: rotatedCookie } })).json()).toEqual({ authenticated: false });
  });

  it("keeps profile and deletion operations idempotent until P2P completion", async () => {
    const { app, mailer } = await fixture();
    const login = await verifiedLogin(app, mailer);
    const headers = { origin: "https://klinok.test", cookie: login.cookie, "x-csrf-token": login.csrf };
    const profilePayload = { firstName: "Иван", lastName: "Петров", patronymic: "Иванович" };
    const firstProfile = await app.inject({ method: "PATCH", url: "/api/auth/profile", headers, payload: profilePayload });
    const retriedProfile = await app.inject({ method: "PATCH", url: "/api/auth/profile", headers, payload: profilePayload });
    expect(retriedProfile.json().operationId).toBe(firstProfile.json().operationId);
    const firstDelete = await app.inject({ method: "DELETE", url: "/api/auth/account", headers });
    const retriedDelete = await app.inject({ method: "DELETE", url: "/api/auth/account", headers });
    expect(retriedDelete.json().operationId).toBe(firstDelete.json().operationId);
    const session = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: login.cookie } });
    expect(session.json()).toMatchObject({
      authenticated: true,
      pendingOperations: [
        { operationId: firstProfile.json().operationId, kind: "profile", payload: profilePayload },
        { operationId: firstDelete.json().operationId, kind: "account_delete" },
      ],
    });
  });

  it("limits failed logins per account across client addresses", async () => {
    const { app, mailer } = await fixture();
    await verifiedLogin(app, mailer);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "https://klinok.test" }, payload: { email: registration.email, password: "this password is wrong" } });
      expect(response.statusCode).toBe(401);
    }
    const limited = await app.inject({
      method: "POST", url: "/api/auth/login", remoteAddress: "203.0.113.20",
      headers: { origin: "https://klinok.test" }, payload: { email: registration.email, password: registration.password },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
    expect(limited.headers["retry-after"]).toBeTruthy();
  });

  it("does not trust forged forwarded addresses by default", async () => {
    const { app } = await fixture({ rateLimit: { recoveryIpPerHour: 2 } });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const accepted = await app.inject({
        method: "POST", url: "/api/auth/password/forgot", remoteAddress: "198.51.100.10",
        headers: { origin: "https://klinok.test", "x-forwarded-for": `203.0.113.${attempt + 1}` },
        payload: { email: `missing-${attempt}@example.com` },
      });
      expect(accepted.statusCode).toBe(202);
    }
    const limited = await app.inject({
      method: "POST", url: "/api/auth/password/forgot", remoteAddress: "198.51.100.10",
      headers: { origin: "https://klinok.test", "x-forwarded-for": "203.0.113.99" },
      payload: { email: "missing-limited@example.com" },
    });
    expect(limited.statusCode).toBe(429);
  });

  it("isolates forwarded client quotas behind one explicitly trusted proxy", async () => {
    const { app } = await fixture({ trustProxy: 1, rateLimit: { recoveryIpPerHour: 2 } });
    const request = (clientIp: string, suffix: string) => app.inject({
      method: "POST", url: "/api/auth/password/forgot", remoteAddress: "172.18.0.2",
      headers: { origin: "https://klinok.test", "x-forwarded-for": clientIp },
      payload: { email: `missing-${suffix}@example.com` },
    });
    expect((await request("203.0.113.10", "a1")).statusCode).toBe(202);
    expect((await request("203.0.113.10", "a2")).statusCode).toBe(202);
    expect((await request("203.0.113.10", "a3")).statusCode).toBe(429);
    expect((await request("203.0.113.11", "b1")).statusCode).toBe(202);
  });

  it("silently suppresses repeated recovery mail for one account", async () => {
    const { app, mailer } = await fixture({ rateLimit: { recoveryAccountPerHour: 2 } });
    await verifiedLogin(app, mailer);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await app.inject({
        method: "POST", url: "/api/auth/password/forgot",
        headers: { origin: "https://klinok.test" }, payload: { email: registration.email },
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ accepted: true });
    }
    expect(mailer.messages).toHaveLength(3);
  });

  it("shares an authenticated mutation budget across requests", async () => {
    const { app, mailer } = await fixture({ rateLimit: { mutationAccountPerMinute: 2 } });
    const login = await verifiedLogin(app, mailer);
    const headers = { origin: "https://klinok.test", cookie: login.cookie, "x-csrf-token": login.csrf };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.inject({
        method: "PATCH", url: "/api/auth/profile", headers,
        payload: { firstName: "Иван", lastName: `Петров-${attempt}` },
      });
      expect(response.statusCode).toBe(200);
    }
    const limited = await app.inject({
      method: "PATCH", url: "/api/auth/profile", headers,
      payload: { firstName: "Иван", lastName: "Петров-ограничен" },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
  });

  it("tracks operational counters without exposing secrets", async () => {
    const { app, mailer } = await fixture();
    await app.inject({ method: "POST", url: "/api/auth/register", headers: { origin: "https://klinok.test" }, payload: registration });
    await app.inject({ method: "POST", url: "/api/auth/password/forgot", headers: { origin: "https://evil.test" }, payload: { email: registration.email } });
    const token = mailer.messages[0]!.text.match(/token=([^\s]+)/)![1]!;
    await app.inject({ method: "POST", url: "/api/auth/verify-email", headers: { origin: "https://klinok.test" }, payload: { token: decodeURIComponent(token) } });
    await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "https://klinok.test" }, payload: { email: registration.email, password: "wrong password" } });
    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    expect(metrics.json()).toMatchObject({
      counters: {
        mailDelivered: 1,
        originRejected: 1,
        loginFailures: 1,
      },
    });
    expect(JSON.stringify(metrics.json())).not.toContain("wrong password");
  });

  it("auto-attests the first device and requires existing-device approval thereafter", async () => {
    const { app, mailer } = await fixture();
    const first = await verifiedLogin(app, mailer);
    const userKeys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const signingPublicKey = await crypto.subtle.exportKey("jwk", userKeys.publicKey);
    const encryptionKeys = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["wrapKey", "unwrapKey"]);
    const encryptionPublicKey = await crypto.subtle.exportKey("jwk", encryptionKeys.publicKey);
    const firstEnrollment = await app.inject({
      method: "POST", url: "/api/auth/device-enrollments",
      headers: { origin: "https://klinok.test", cookie: first.cookie, "x-csrf-token": first.csrf },
      payload: { deviceId: "device-1", deviceName: "Домашний ноутбук", orbitIdentityId: "orbit-1", signingPublicKey, encryptionPublicKey },
    });
    expect(firstEnrollment.json().certificate).toMatchObject({ deviceId: "device-1", deviceName: "Домашний ноутбук", status: "active" });

    const secondLoginResponse = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "https://klinok.test" }, payload: { email: registration.email, password: registration.password } });
    const second = { cookie: secondLoginResponse.headers["set-cookie"]!, csrf: secondLoginResponse.json().csrfToken as string };
    const secondEnrollment = await app.inject({
      method: "POST", url: "/api/auth/device-enrollments",
      headers: { origin: "https://klinok.test", cookie: second.cookie, "x-csrf-token": second.csrf },
      payload: { deviceId: "device-2", deviceName: "Телефон Максима", orbitIdentityId: "orbit-2", ephemeralPublicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" } },
    });
    expect(secondEnrollment.json().enrollment.status).toBe("pending");
    expect(secondEnrollment.json().enrollment.deviceName).toBe("Телефон Максима");
    const enrollmentId = secondEnrollment.json().enrollment.enrollmentId as string;
    const approval = await app.inject({
      method: "POST", url: `/api/auth/device-enrollments/${enrollmentId}/approve`,
      headers: { origin: "https://klinok.test", cookie: first.cookie, "x-csrf-token": first.csrf },
      payload: { encryptedKeyBundle: "encrypted-for-device-2", signingPublicKey, encryptionPublicKey },
    });
    expect(approval.statusCode).toBe(200);
    const secondSession = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: second.cookie } });
    expect(secondSession.json().device).toMatchObject({ deviceId: "device-2", deviceName: "Телефон Максима", status: "active" });
    expect(secondSession.json().enrollments).toEqual(expect.arrayContaining([expect.objectContaining({ enrollmentId, encryptedKeyBundle: "encrypted-for-device-2" })]));

    const thirdLoginResponse = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "https://klinok.test" }, payload: { email: registration.email, password: registration.password } });
    const third = { cookie: thirdLoginResponse.headers["set-cookie"]!, csrf: thirdLoginResponse.json().csrfToken as string };
    const thirdEnrollment = await app.inject({
      method: "POST", url: "/api/auth/device-enrollments",
      headers: { origin: "https://klinok.test", cookie: third.cookie, "x-csrf-token": third.csrf },
      payload: { deviceId: "device-3", deviceName: "Старый запрос", orbitIdentityId: "orbit-3", ephemeralPublicKey: { kty: "EC", crv: "P-256", x: "x", y: "y" } },
    });
    const rejected = await app.inject({
      method: "DELETE", url: `/api/auth/device-enrollments/${thirdEnrollment.json().enrollment.enrollmentId}`,
      headers: { origin: "https://klinok.test", cookie: first.cookie, "x-csrf-token": first.csrf },
    });
    expect(rejected.json()).toEqual({ rejected: true });

    const rotatedSigning = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const rotatedEncryption = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["wrapKey", "unwrapKey"]);
    const removal = await app.inject({
      method: "DELETE", url: "/api/auth/devices/device-2",
      headers: { origin: "https://klinok.test", cookie: first.cookie, "x-csrf-token": first.csrf },
      payload: {
        signingPublicKey: await crypto.subtle.exportKey("jwk", rotatedSigning.publicKey),
        encryptionPublicKey: await crypto.subtle.exportKey("jwk", rotatedEncryption.publicKey),
      },
    });
    expect(removal.json()).toMatchObject({ rotateUserKeys: true, certificate: { deviceId: "device-1", userKeyVersion: 2 } });
    const revokedFirstSession = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: first.cookie } });
    expect(revokedFirstSession.json()).toEqual({ authenticated: false });
    const relogin = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin: "https://klinok.test" }, payload: { email: registration.email, password: registration.password, deviceId: "device-1" } });
    const rebound = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: relogin.headers["set-cookie"]! } });
    expect(rebound.json().device).toMatchObject({ deviceId: "device-1", userKeyVersion: 2 });
  });

  it("uses generic password recovery and revokes sessions after reset", async () => {
    const { app, mailer } = await fixture();
    const login = await verifiedLogin(app, mailer);
    const missing = await app.inject({ method: "POST", url: "/api/auth/password/forgot", headers: { origin: "https://klinok.test" }, payload: { email: "missing@example.com" } });
    const existing = await app.inject({ method: "POST", url: "/api/auth/password/forgot", headers: { origin: "https://klinok.test" }, payload: { email: registration.email } });
    expect(missing.json()).toEqual(existing.json());
    const resetMessage = mailer.messages.at(-1)!;
    const token = decodeURIComponent(resetMessage.text.match(/token=([^\s]+)/)![1]!);
    const reset = await app.inject({ method: "POST", url: "/api/auth/password/reset", headers: { origin: "https://klinok.test" }, payload: { token, password: "a completely new password" } });
    expect(reset.statusCode).toBe(200);
    const oldSession = await app.inject({ method: "GET", url: "/api/auth/session", headers: { cookie: login.cookie } });
    expect(oldSession.json()).toEqual({ authenticated: false });
  });
});
