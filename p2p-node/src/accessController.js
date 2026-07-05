// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

export const KLINOK_ACCESS_CONTROLLER_TYPE = "klinok";

function normalizeWriteIdentities(write) {
  return Array.isArray(write) ? write.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function parseWriteIdentitiesFromAddress(address) {
  if (typeof address !== "string" || !address.startsWith(`/${KLINOK_ACCESS_CONTROLLER_TYPE}/`)) {
    return [];
  }

  return normalizeWriteIdentities(decodeURIComponent(address.slice(KLINOK_ACCESS_CONTROLLER_TYPE.length + 2)).split(","));
}

function createAccessControllerAddress(write) {
  return `/${KLINOK_ACCESS_CONTROLLER_TYPE}/${encodeURIComponent(write.join(","))}`;
}

export function KlinokAccessController({ write } = {}) {
  const configuredWrite = normalizeWriteIdentities(write);

  return async ({ identities, address } = {}) => {
    const writeIdentities = configuredWrite.length ? configuredWrite : parseWriteIdentitiesFromAddress(address);
    const allowedWriters = writeIdentities.length ? writeIdentities : ["*"];

    return {
      type: KLINOK_ACCESS_CONTROLLER_TYPE,
      address: address ?? createAccessControllerAddress(allowedWriters),
      write: allowedWriters,
      async canAppend(entry) {
        if (allowedWriters.includes("*")) {
          return true;
        }

        if (!entry?.identity || !identities?.getIdentity || !identities?.verifyIdentity) {
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
}

KlinokAccessController.type = KLINOK_ACCESS_CONTROLLER_TYPE;
