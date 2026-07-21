// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { importUserKeySet, stableSerialize, type ExportedUserKeySet } from "@klinok/protocol";
import type { EncryptedUserKeySet } from "./store.js";

interface StoredEscrowKey {
  formatVersion: 1;
  algorithm: "AES-256-GCM";
  key: string;
}

function associatedData(accountId: string, keyVersion: number): ArrayBuffer {
  return new TextEncoder().encode(stableSerialize({ accountId, formatVersion: 1, keyVersion })).buffer;
}

export class UserKeyEscrowService {
  private constructor(private readonly key: CryptoKey) {}

  static async loadOrCreate(path: string): Promise<UserKeyEscrowService> {
    try {
      const stored = JSON.parse(await readFile(path, "utf8")) as StoredEscrowKey;
      if (stored.formatVersion !== 1 || stored.algorithm !== "AES-256-GCM" || !stored.key) {
        throw new Error("The user-key escrow master key file is invalid.");
      }
      const key = await crypto.subtle.importKey(
        "raw",
        Buffer.from(stored.key, "base64url"),
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
      return new UserKeyEscrowService(key);
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
      const raw = crypto.getRandomValues(new Uint8Array(32));
      const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify({
        formatVersion: 1,
        algorithm: "AES-256-GCM",
        key: Buffer.from(raw).toString("base64url"),
      } satisfies StoredEscrowKey, null, 2)}\n`, { mode: 0o600 });
      return new UserKeyEscrowService(key);
    }
  }

  async encrypt(accountId: string, keySet: ExportedUserKeySet): Promise<EncryptedUserKeySet> {
    await importUserKeySet(keySet);
    if (!Number.isSafeInteger(keySet.version) || keySet.version <= 0) throw new Error("The user key version is invalid.");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: associatedData(accountId, keySet.version), tagLength: 128 },
      this.key,
      new TextEncoder().encode(stableSerialize(keySet)),
    );
    return {
      formatVersion: 1,
      algorithm: "AES-256-GCM",
      keyVersion: keySet.version,
      iv: Buffer.from(iv).toString("base64url"),
      ciphertext: Buffer.from(ciphertext).toString("base64url"),
    };
  }

  async decrypt(accountId: string, encrypted: EncryptedUserKeySet): Promise<ExportedUserKeySet> {
    if (encrypted.formatVersion !== 1 || encrypted.algorithm !== "AES-256-GCM") {
      throw new Error("The encrypted user key set format is not supported.");
    }
    const cleartext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: Buffer.from(encrypted.iv, "base64url"),
        additionalData: associatedData(accountId, encrypted.keyVersion),
        tagLength: 128,
      },
      this.key,
      Buffer.from(encrypted.ciphertext, "base64url"),
    );
    const keySet = JSON.parse(new TextDecoder().decode(cleartext)) as ExportedUserKeySet;
    if (keySet.version !== encrypted.keyVersion) throw new Error("The encrypted user key version does not match its metadata.");
    await importUserKeySet(keySet);
    return keySet;
  }
}
