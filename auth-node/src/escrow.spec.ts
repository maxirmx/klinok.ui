// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportUserKeySet, generateUserKeySet } from "@klinok/protocol";
import { UserKeyEscrowService } from "./escrow.js";

describe("user-key escrow", () => {
  it("persists one master key and round-trips an encrypted account key set", async () => {
    const directory = await mkdtemp(join(tmpdir(), "klinok-escrow-test-"));
    const path = join(directory, "escrow.json");
    const keySet = await exportUserKeySet(await generateUserKeySet());
    const first = await UserKeyEscrowService.loadOrCreate(path);
    const encrypted = await first.encrypt("account-1", keySet);

    expect(JSON.stringify(encrypted)).not.toContain(keySet.signingPrivateKey.d!);
    expect(JSON.stringify(encrypted)).not.toContain(keySet.encryptionPrivateKey.d!);
    const second = await UserKeyEscrowService.loadOrCreate(path);
    await expect(second.decrypt("account-1", encrypted)).resolves.toEqual(keySet);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ formatVersion: 1, algorithm: "AES-256-GCM" });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("binds ciphertext to its account and key version", async () => {
    const directory = await mkdtemp(join(tmpdir(), "klinok-escrow-test-"));
    const service = await UserKeyEscrowService.loadOrCreate(join(directory, "escrow.json"));
    const encrypted = await service.encrypt("account-1", await exportUserKeySet(await generateUserKeySet()));

    await expect(service.decrypt("account-2", encrypted)).rejects.toThrow();
    await expect(service.decrypt("account-1", { ...encrypted, keyVersion: encrypted.keyVersion + 1 })).rejects.toThrow();
  });

  it("fails closed when an existing master-key file is invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "klinok-escrow-test-"));
    const path = join(directory, "escrow.json");
    await UserKeyEscrowService.loadOrCreate(path);
    await writeFile(path, "not-json\n");
    await expect(UserKeyEscrowService.loadOrCreate(path)).rejects.toThrow();
  });

  it("does not decrypt with another valid deployment master key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "klinok-escrow-test-"));
    const first = await UserKeyEscrowService.loadOrCreate(join(directory, "first.json"));
    const second = await UserKeyEscrowService.loadOrCreate(join(directory, "second.json"));
    const encrypted = await first.encrypt("account-1", await exportUserKeySet(await generateUserKeySet()));
    await expect(second.decrypt("account-1", encrypted)).rejects.toThrow();
  });
});
