// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

export type BackendMode = "mock" | "p2p";

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
  apiUrl: string;
  enableLog: boolean;
  backendMode: BackendMode;
  p2p: P2PClientConfig;
}

export const defaultRuntimeConfig: AppRuntimeConfig = {
  apiUrl: "http://localhost:8080/api",
  enableLog: true,
  backendMode: "mock",
  p2p: {
    databaseName: "klinok-cases",
    identityId: "klinok-browser-owner",
    participantId: "owner-demo",
    trustedNodeMultiaddrs: [],
    writeIdentityIds: ["*"],
    participantPublicKeys: {},
  },
};

function normalizeRuntimeConfig(value: Partial<AppRuntimeConfig>): AppRuntimeConfig {
  const p2p: Partial<P2PClientConfig> = value.p2p ?? {};
  const backendMode = value.backendMode === "p2p" ? "p2p" : "mock";
  const participantPublicKeys =
    p2p.participantPublicKeys &&
    typeof p2p.participantPublicKeys === "object" &&
    !Array.isArray(p2p.participantPublicKeys)
      ? (p2p.participantPublicKeys as Record<string, JsonWebKey>)
      : {};

  return {
    ...defaultRuntimeConfig,
    ...value,
    backendMode,
    p2p: {
      ...defaultRuntimeConfig.p2p,
      ...p2p,
      trustedNodeMultiaddrs: Array.isArray(p2p.trustedNodeMultiaddrs) ? p2p.trustedNodeMultiaddrs : [],
      writeIdentityIds: Array.isArray(p2p.writeIdentityIds) ? p2p.writeIdentityIds : ["*"],
      participantPublicKeys,
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
