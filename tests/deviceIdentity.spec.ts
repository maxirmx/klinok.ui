// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateUserKeySet, stableSerialize } from "@klinok/protocol";
import {
  clearDeviceId,
  getDeviceId,
  getDeviceName,
  getOrCreateDeviceId,
  getOrCreateDeviceName,
  setDeviceName,
  signBootstrapDeviceReplacement,
} from "../src/repositories/deviceVault";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("local device identity", () => {
  it("reuses the same device ID across application restarts", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();
    expect(getDeviceId()).toBe(first);
    expect(first).toBe("11111111-1111-4111-8111-111111111111");
    expect(second).toBe(first);
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);

    clearDeviceId();
    expect(getDeviceId()).toBeNull();
    const replacement = getOrCreateDeviceId();
    expect(replacement).toBe("22222222-2222-4222-8222-222222222222");
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2);
  });

  it("keeps a recognizable, user-editable device name", () => {
    expect(getOrCreateDeviceName()).toBeTruthy();
    setDeviceName("Домашний ноутбук");
    expect(getDeviceName()).toBe("Домашний ноутбук");
    expect(getOrCreateDeviceName()).toBe("Домашний ноутбук");
  });

  it("signs a bootstrap replacement payload with the recovered private key", async () => {
    const keys = await generateUserKeySet();
    const payload = {
      action: "bootstrap-device-replacement" as const,
      challenge: "single-use-challenge",
      accountId: "bootstrap-administrator",
      deviceId: "replacement-device",
      deviceName: "Новый ноутбук",
      orbitIdentityId: "orbit-replacement",
      userKeyVersion: 1,
      signingPublicKey: await crypto.subtle.exportKey("jwk", keys.signingPublicKey),
      encryptionPublicKey: await crypto.subtle.exportKey("jwk", keys.encryptionPublicKey),
    };
    const signature = await signBootstrapDeviceReplacement(payload, keys.signingPrivateKey);
    const bytes = Uint8Array.from(
      atob(signature.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(signature.length / 4) * 4, "=")),
      (character) => character.charCodeAt(0),
    );
    await expect(crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keys.signingPublicKey,
      bytes,
      new TextEncoder().encode(stableSerialize(payload)),
    )).resolves.toBe(true);
  });
});
