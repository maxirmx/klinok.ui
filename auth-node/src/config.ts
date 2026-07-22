// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export interface AuthConfig {
  host: string;
  port: number;
  dataDir: string;
  publicOrigin: string;
  attestationKeyPath: string;
  escrowKeyPath: string;
  cookieSecure: boolean;
  enforceOrigin: boolean;
  trustProxy: boolean | number | string;
  bootstrapAccountId: string;
  bootstrapSigningPublicKey?: JsonWebKey;
  rateLimit: AuthRateLimitConfig;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
  };
  legal: {
    personalDataConsentVersion: string;
    userAgreementVersion: string;
  };
  controlObserver: {
    enabled: boolean;
    internalEventToken?: string;
    databaseName: string;
    databaseAddress?: string;
    medicalDatabaseName?: string;
    medicalDatabaseAddress?: string;
    trustedNodeMultiaddrs: string[];
  };
}

export interface AuthRateLimitConfig {
  registrationIpPerHour: number;
  registrationEmailPerDay: number;
  loginIpPer15Minutes: number;
  loginFailuresPerAccount15Minutes: number;
  recoveryIpPerHour: number;
  recoveryAccountPerHour: number;
  tokenIpPer15Minutes: number;
  tokenPer15Minutes: number;
  sessionIpPerMinute: number;
  mutationIpPerMinute: number;
  sensitiveMutationIpPerMinute: number;
  mutationAccountPerMinute: number;
  sensitiveMutationAccountPerMinute: number;
}

export const DEFAULT_AUTH_RATE_LIMITS: AuthRateLimitConfig = {
  registrationIpPerHour: 5,
  registrationEmailPerDay: 1,
  loginIpPer15Minutes: 30,
  loginFailuresPerAccount15Minutes: 5,
  recoveryIpPerHour: 10,
  recoveryAccountPerHour: 3,
  tokenIpPer15Minutes: 20,
  tokenPer15Minutes: 5,
  sessionIpPerMinute: 300,
  mutationIpPerMinute: 60,
  sensitiveMutationIpPerMinute: 10,
  mutationAccountPerMinute: 60,
  sensitiveMutationAccountPerMinute: 10,
};

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Expected a positive integer, received: ${value}`);
  return parsed;
}

function trustProxy(value: string | undefined): boolean | number | string {
  if (value === undefined || value.trim() === "" || value === "false") return false;
  if (value === "true") return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

function jsonWebKey(value: string | undefined): JsonWebKey | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value) as JsonWebKey;
    if (!parsed || typeof parsed !== "object" || typeof parsed.kty !== "string") throw new Error();
    return parsed;
  } catch {
    throw new Error("KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY must be a JSON Web Key.");
  }
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  return {
    host: env.KLINOK_AUTH_HOST ?? "0.0.0.0",
    port: Number(env.KLINOK_AUTH_PORT ?? 8090),
    dataDir: env.KLINOK_AUTH_DATA_DIR ?? ".klinok-auth",
    publicOrigin: env.KLINOK_PUBLIC_ORIGIN ?? "http://localhost:8080",
    attestationKeyPath: env.KLINOK_AUTH_ATTESTATION_KEY_PATH ?? `${env.KLINOK_AUTH_DATA_DIR ?? ".klinok-auth"}/auth-attestation-key.json`,
    escrowKeyPath: env.KLINOK_AUTH_ESCROW_KEY_PATH ?? `${env.KLINOK_AUTH_DATA_DIR ?? ".klinok-auth"}/user-key-escrow-key.json`,
    cookieSecure: bool(env.KLINOK_AUTH_COOKIE_SECURE, env.NODE_ENV === "production"),
    enforceOrigin: bool(env.KLINOK_AUTH_ENFORCE_ORIGIN, true),
    trustProxy: trustProxy(env.KLINOK_AUTH_TRUST_PROXY),
    bootstrapAccountId: env.KLINOK_BOOTSTRAP_ACCOUNT_ID ?? "bootstrap-administrator",
    bootstrapSigningPublicKey: jsonWebKey(env.KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY),
    rateLimit: {
      registrationIpPerHour: positiveInteger(env.KLINOK_RATE_LIMIT_REGISTRATION_IP_PER_HOUR, DEFAULT_AUTH_RATE_LIMITS.registrationIpPerHour),
      registrationEmailPerDay: positiveInteger(env.KLINOK_RATE_LIMIT_REGISTRATION_EMAIL_PER_DAY, DEFAULT_AUTH_RATE_LIMITS.registrationEmailPerDay),
      loginIpPer15Minutes: positiveInteger(env.KLINOK_RATE_LIMIT_LOGIN_IP_PER_15_MINUTES, DEFAULT_AUTH_RATE_LIMITS.loginIpPer15Minutes),
      loginFailuresPerAccount15Minutes: positiveInteger(env.KLINOK_RATE_LIMIT_LOGIN_FAILURES_PER_ACCOUNT_15_MINUTES, DEFAULT_AUTH_RATE_LIMITS.loginFailuresPerAccount15Minutes),
      recoveryIpPerHour: positiveInteger(env.KLINOK_RATE_LIMIT_RECOVERY_IP_PER_HOUR, DEFAULT_AUTH_RATE_LIMITS.recoveryIpPerHour),
      recoveryAccountPerHour: positiveInteger(env.KLINOK_RATE_LIMIT_RECOVERY_ACCOUNT_PER_HOUR, DEFAULT_AUTH_RATE_LIMITS.recoveryAccountPerHour),
      tokenIpPer15Minutes: positiveInteger(env.KLINOK_RATE_LIMIT_TOKEN_IP_PER_15_MINUTES, DEFAULT_AUTH_RATE_LIMITS.tokenIpPer15Minutes),
      tokenPer15Minutes: positiveInteger(env.KLINOK_RATE_LIMIT_TOKEN_PER_15_MINUTES, DEFAULT_AUTH_RATE_LIMITS.tokenPer15Minutes),
      sessionIpPerMinute: positiveInteger(env.KLINOK_RATE_LIMIT_SESSION_IP_PER_MINUTE, DEFAULT_AUTH_RATE_LIMITS.sessionIpPerMinute),
      mutationIpPerMinute: positiveInteger(env.KLINOK_RATE_LIMIT_MUTATION_IP_PER_MINUTE, DEFAULT_AUTH_RATE_LIMITS.mutationIpPerMinute),
      sensitiveMutationIpPerMinute: positiveInteger(env.KLINOK_RATE_LIMIT_SENSITIVE_MUTATION_IP_PER_MINUTE, DEFAULT_AUTH_RATE_LIMITS.sensitiveMutationIpPerMinute),
      mutationAccountPerMinute: positiveInteger(env.KLINOK_RATE_LIMIT_MUTATION_ACCOUNT_PER_MINUTE, DEFAULT_AUTH_RATE_LIMITS.mutationAccountPerMinute),
      sensitiveMutationAccountPerMinute: positiveInteger(env.KLINOK_RATE_LIMIT_SENSITIVE_MUTATION_ACCOUNT_PER_MINUTE, DEFAULT_AUTH_RATE_LIMITS.sensitiveMutationAccountPerMinute),
    },
    smtp: {
      host: env.KLINOK_SMTP_HOST ?? "127.0.0.1",
      port: Number(env.KLINOK_SMTP_PORT ?? 1025),
      secure: bool(env.KLINOK_SMTP_SECURE, false),
      ...(env.KLINOK_SMTP_USER ? { user: env.KLINOK_SMTP_USER } : {}),
      ...(env.KLINOK_SMTP_PASSWORD ? { password: env.KLINOK_SMTP_PASSWORD } : {}),
      from: env.KLINOK_SMTP_FROM ?? "Клинок <noreply@klinok.local>",
    },
    legal: {
      personalDataConsentVersion: env.KLINOK_PERSONAL_DATA_CONSENT_VERSION ?? "2026-07-10",
      userAgreementVersion: env.KLINOK_USER_AGREEMENT_VERSION ?? "2026-07-10",
    },
    controlObserver: {
      enabled: bool(env.KLINOK_AUTH_CONTROL_OBSERVER_ENABLED, false),
      ...(env.KLINOK_INTERNAL_EVENT_TOKEN ? { internalEventToken: env.KLINOK_INTERNAL_EVENT_TOKEN } : {}),
      databaseName: env.KLINOK_CONTROL_DB ?? "klinok-control-v1",
      ...(env.KLINOK_CONTROL_DB_ADDRESS ? { databaseAddress: env.KLINOK_CONTROL_DB_ADDRESS } : {}),
      medicalDatabaseName: env.KLINOK_MEDICAL_DB ?? "klinok-medical-v3",
      ...(env.KLINOK_MEDICAL_DB_ADDRESS ? { medicalDatabaseAddress: env.KLINOK_MEDICAL_DB_ADDRESS } : {}),
      trustedNodeMultiaddrs: (env.KLINOK_P2P_TRUSTED_NODES ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    },
  };
}
