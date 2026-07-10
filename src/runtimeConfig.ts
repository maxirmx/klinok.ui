export const DEVELOPMENT_TRUSTED_NODE_MULTIADDR = "/ip4/127.0.0.1/tcp/8089/ws";
export const PRODUCTION_TRUSTED_NODE_MULTIADDR = "/dns4/klinok.sw.consulting/tcp/8089/tls/ws";
export const RUNTIME_CONFIG_PATHS = ["/config.json"];

export interface P2PClientConfig {
  enabled: boolean;
  controlDatabaseName: "klinok-control-v1";
  medicalDatabaseName: "klinok-medical-v3";
  controlDatabaseAddress?: string;
  medicalDatabaseAddress?: string;
  trustedNodeMultiaddrs: string[];
  bootstrapAccountId: string;
  bootstrapSigningPublicKey?: JsonWebKey;
  authAttestationPublicKey?: JsonWebKey;
}

export interface LegalDocumentConfig {
  version: string;
  href: string;
}

export interface AppRuntimeConfig {
  enableLog: boolean;
  authBaseUrl: string;
  legal: {
    personalDataConsent: LegalDocumentConfig;
    userAgreement: LegalDocumentConfig;
  };
  p2p: P2PClientConfig;
}

export type AppRuntimeConfigInput = Partial<Omit<AppRuntimeConfig, "p2p" | "legal">> & {
  p2p?: Partial<P2PClientConfig>;
  legal?: {
    personalDataConsent?: Partial<LegalDocumentConfig>;
    userAgreement?: Partial<LegalDocumentConfig>;
  };
};

function strings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const result = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return result.length ? result : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function createDefaultRuntimeConfig(isDevelopment = import.meta.env.DEV): AppRuntimeConfig {
  return {
    enableLog: false,
    authBaseUrl: "",
    legal: {
      personalDataConsent: { version: "2026-07-10", href: "/legal/personal-data-consent" },
      userAgreement: { version: "2026-07-10", href: "/legal/user-agreement" },
    },
    p2p: {
      enabled: true,
      controlDatabaseName: "klinok-control-v1",
      medicalDatabaseName: "klinok-medical-v3",
      trustedNodeMultiaddrs: [isDevelopment ? DEVELOPMENT_TRUSTED_NODE_MULTIADDR : PRODUCTION_TRUSTED_NODE_MULTIADDR],
      bootstrapAccountId: "bootstrap-administrator",
    },
  };
}

export const defaultRuntimeConfig = createDefaultRuntimeConfig();

export function normalizeRuntimeConfig(input: AppRuntimeConfigInput, defaults = defaultRuntimeConfig): AppRuntimeConfig {
  return {
    enableLog: typeof input.enableLog === "boolean" ? input.enableLog : defaults.enableLog,
    authBaseUrl: typeof input.authBaseUrl === "string" ? input.authBaseUrl.replace(/\/$/, "") : defaults.authBaseUrl,
    legal: {
      personalDataConsent: {
        version: text(input.legal?.personalDataConsent?.version, defaults.legal.personalDataConsent.version),
        href: text(input.legal?.personalDataConsent?.href, defaults.legal.personalDataConsent.href),
      },
      userAgreement: {
        version: text(input.legal?.userAgreement?.version, defaults.legal.userAgreement.version),
        href: text(input.legal?.userAgreement?.href, defaults.legal.userAgreement.href),
      },
    },
    p2p: {
      enabled: typeof input.p2p?.enabled === "boolean" ? input.p2p.enabled : defaults.p2p.enabled,
      controlDatabaseName: "klinok-control-v1",
      medicalDatabaseName: "klinok-medical-v3",
      ...(input.p2p?.controlDatabaseAddress ? { controlDatabaseAddress: input.p2p.controlDatabaseAddress } : {}),
      ...(input.p2p?.medicalDatabaseAddress ? { medicalDatabaseAddress: input.p2p.medicalDatabaseAddress } : {}),
      trustedNodeMultiaddrs: strings(input.p2p?.trustedNodeMultiaddrs, defaults.p2p.trustedNodeMultiaddrs),
      bootstrapAccountId: text(input.p2p?.bootstrapAccountId, defaults.p2p.bootstrapAccountId),
      ...(input.p2p?.bootstrapSigningPublicKey ? { bootstrapSigningPublicKey: input.p2p.bootstrapSigningPublicKey } : {}),
      ...(input.p2p?.authAttestationPublicKey ? { authAttestationPublicKey: input.p2p.authAttestationPublicKey } : {}),
    },
  };
}

export async function loadRuntimeConfig(): Promise<AppRuntimeConfig> {
  if (typeof fetch !== "function") return defaultRuntimeConfig;
  try {
    const response = await fetch(RUNTIME_CONFIG_PATHS[0], { cache: "no-store" });
    if (!response.ok) return defaultRuntimeConfig;
    return normalizeRuntimeConfig(await response.json() as AppRuntimeConfigInput);
  } catch {
    return defaultRuntimeConfig;
  }
}
