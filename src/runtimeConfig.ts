// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

export const DEVELOPMENT_TRUSTED_NODE_MULTIADDR = "/ip4/127.0.0.1/tcp/8089/ws";
export const PRODUCTION_TRUSTED_NODE_MULTIADDR = "/dns4/klinok.sw.consulting/tcp/8089/tls/ws";

export interface P2PClientConfig {
  databaseName: string;
  databaseAddress?: string;
  identityId: string;
  participantId: string;
  trustedNodeMultiaddrs: string[];
  writeIdentityIds: string[];
  participantPublicKeys: Record<string, JsonWebKey>;
  participantPrivateKey?: JsonWebKey;
}

export interface AppRuntimeConfig {
  enableLog: boolean;
  p2p: P2PClientConfig;
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalString(value: unknown, fallback?: string): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];

  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return items.length ? items : [...fallback];
}

function normalizePublicKeys(value: unknown): Record<string, JsonWebKey> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const result: Record<string, JsonWebKey> = Object.create(null);
  for (const [key, jwk] of Object.entries(value as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (jwk && typeof jwk === "object" && !Array.isArray(jwk)) {
      result[key] = jwk as JsonWebKey;
    }
  }
  return result;
}

export function getDefaultTrustedNodeMultiaddrs(isDevelopment = import.meta.env.DEV): string[] {
  return [isDevelopment ? DEVELOPMENT_TRUSTED_NODE_MULTIADDR : PRODUCTION_TRUSTED_NODE_MULTIADDR];
}

export function createDefaultRuntimeConfig(isDevelopment = import.meta.env.DEV): AppRuntimeConfig {
  return {
    enableLog: true,
    p2p: {
      databaseName: "klinok-cases",
      identityId: "klinok-browser-owner",
      participantId: "owner-demo",
      trustedNodeMultiaddrs: getDefaultTrustedNodeMultiaddrs(isDevelopment),
      writeIdentityIds: ["*"],
      participantPublicKeys: {},
    },
  };
}

export const defaultRuntimeConfig: AppRuntimeConfig = createDefaultRuntimeConfig();

export function normalizeRuntimeConfig(
  value: Partial<AppRuntimeConfig>,
  defaults: AppRuntimeConfig = defaultRuntimeConfig,
): AppRuntimeConfig {
  const p2p: Partial<P2PClientConfig> = value.p2p ?? {};

  return {
    enableLog: typeof value.enableLog === "boolean" ? value.enableLog : defaults.enableLog,
    p2p: {
      databaseName: normalizeString(p2p.databaseName, defaults.p2p.databaseName),
      databaseAddress: normalizeOptionalString(p2p.databaseAddress, defaults.p2p.databaseAddress),
      identityId: normalizeString(p2p.identityId, defaults.p2p.identityId),
      participantId: normalizeString(p2p.participantId, defaults.p2p.participantId),
      trustedNodeMultiaddrs: normalizeStringList(p2p.trustedNodeMultiaddrs, defaults.p2p.trustedNodeMultiaddrs),
      writeIdentityIds: normalizeStringList(p2p.writeIdentityIds, defaults.p2p.writeIdentityIds),
      participantPublicKeys: normalizePublicKeys(p2p.participantPublicKeys),
      participantPrivateKey:
        p2p.participantPrivateKey && typeof p2p.participantPrivateKey === "object" && !Array.isArray(p2p.participantPrivateKey)
          ? (p2p.participantPrivateKey as JsonWebKey)
          : undefined,
    },
  };
}

export async function loadRuntimeConfig(): Promise<AppRuntimeConfig> {
  if (typeof fetch !== "function") {
    return defaultRuntimeConfig;
  }

  try {
    const response = await fetch("/config.json", { cache: "no-store" });
    if (!response.ok) {
      return defaultRuntimeConfig;
    }

    const json = (await response.json()) as Partial<AppRuntimeConfig>;
    return normalizeRuntimeConfig(json);
  } catch {
    return defaultRuntimeConfig;
  }
}
