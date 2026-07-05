// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

export const KLINOK_ACCESS_CONTROLLER_TYPE = "klinok";

interface OrbitIdentity {
  id?: string;
}

interface OrbitIdentityRegistry {
  getIdentity?: (hash: string) => Promise<OrbitIdentity | null>;
  verifyIdentity?: (identity: OrbitIdentity) => Promise<boolean>;
}

interface AccessControllerInit {
  identities?: OrbitIdentityRegistry;
  address?: string;
}

interface LogEntry {
  identity?: string;
}

function normalizeWriteIdentities(write: unknown): string[] {
  return Array.isArray(write) ? write.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function parseWriteIdentitiesFromAddress(address?: string): string[] {
  if (!address?.startsWith(`/${KLINOK_ACCESS_CONTROLLER_TYPE}/`)) {
    return [];
  }

  return normalizeWriteIdentities(decodeURIComponent(address.slice(KLINOK_ACCESS_CONTROLLER_TYPE.length + 2)).split(","));
}

function createAccessControllerAddress(write: string[]) {
  return `/${KLINOK_ACCESS_CONTROLLER_TYPE}/${encodeURIComponent(write.join(","))}`;
}

export const KlinokAccessController = Object.assign(
  ({ write }: { write?: string[] } = {}) => {
    const configuredWrite = normalizeWriteIdentities(write);

    return async ({ identities, address }: AccessControllerInit = {}) => {
      const writeIdentities = configuredWrite.length ? configuredWrite : parseWriteIdentitiesFromAddress(address);
      const allowedWriters = writeIdentities.length ? writeIdentities : ["*"];

      return {
        type: KLINOK_ACCESS_CONTROLLER_TYPE,
        address: address ?? createAccessControllerAddress(allowedWriters),
        write: allowedWriters,
        async canAppend(entry: LogEntry) {
          if (allowedWriters.includes("*")) {
            return true;
          }

          if (!entry.identity || !identities?.getIdentity || !identities.verifyIdentity) {
            return false;
          }

          const writerIdentity = await identities.getIdentity(entry.identity);
          if (!writerIdentity?.id || !allowedWriters.includes(writerIdentity.id)) {
            return false;
          }

          return identities.verifyIdentity(writerIdentity);
        },
      };
    };
  },
  { type: KLINOK_ACCESS_CONTROLLER_TYPE },
);
