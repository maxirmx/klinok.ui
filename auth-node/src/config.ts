export interface AuthConfig {
  host: string;
  port: number;
  dataDir: string;
  publicOrigin: string;
  attestationKeyPath: string;
  cookieSecure: boolean;
  enforceOrigin: boolean;
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
    databaseName: string;
    databaseAddress?: string;
    trustedNodeMultiaddrs: string[];
  };
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  return {
    host: env.KLINOK_AUTH_HOST ?? "0.0.0.0",
    port: Number(env.KLINOK_AUTH_PORT ?? 8090),
    dataDir: env.KLINOK_AUTH_DATA_DIR ?? ".klinok-auth",
    publicOrigin: env.KLINOK_PUBLIC_ORIGIN ?? "http://127.0.0.1:5173",
    attestationKeyPath: env.KLINOK_AUTH_ATTESTATION_KEY_PATH ?? `${env.KLINOK_AUTH_DATA_DIR ?? ".klinok-auth"}/auth-attestation-key.json`,
    cookieSecure: bool(env.KLINOK_AUTH_COOKIE_SECURE, env.NODE_ENV === "production"),
    enforceOrigin: bool(env.KLINOK_AUTH_ENFORCE_ORIGIN, true),
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
      databaseName: env.KLINOK_CONTROL_DB ?? "klinok-control-v1",
      ...(env.KLINOK_CONTROL_DB_ADDRESS ? { databaseAddress: env.KLINOK_CONTROL_DB_ADDRESS } : {}),
      trustedNodeMultiaddrs: (env.KLINOK_P2P_TRUSTED_NODES ?? "").split(",").map((item) => item.trim()).filter(Boolean),
    },
  };
}
