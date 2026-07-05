// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  encodePrivateKey,
  getTlsFilePaths,
  getWebSocketListenMultiaddr,
  loadOrCreateLibp2pPrivateKey,
} from "../p2p-node/src/config.js";

describe("p2p node config", () => {
  it("selects plain websocket locally and secure websocket when TLS is configured", () => {
    expect(getWebSocketListenMultiaddr("8089", false)).toBe("/ip4/0.0.0.0/tcp/8089/ws");
    expect(getWebSocketListenMultiaddr("8089", true)).toBe("/ip4/0.0.0.0/tcp/8089/tls/ws");
  });

  it("requires both TLS certificate and key paths", () => {
    expect(getTlsFilePaths({ KLINOK_P2P_TLS_CERT: "/cert.pem" })).toBeNull();
    expect(getTlsFilePaths({ KLINOK_P2P_TLS_KEY: "/key.pem" })).toBeNull();
    expect(getTlsFilePaths({ KLINOK_P2P_TLS_CERT: "/cert.pem", KLINOK_P2P_TLS_KEY: "/key.pem" })).toEqual({
      certPath: "/cert.pem",
      keyPath: "/key.pem",
    });
  });

  it("persists a generated libp2p private key and accepts an explicit key from env", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "klinok-p2p-key-"));
    const keyPath = join(tempDir, "libp2p-private-key.base64");

    try {
      const firstKey = await loadOrCreateLibp2pPrivateKey({ env: {}, dataDir: tempDir, keyPath });
      const firstEncoded = encodePrivateKey(firstKey);
      const secondKey = await loadOrCreateLibp2pPrivateKey({ env: {}, dataDir: tempDir, keyPath });

      expect(encodePrivateKey(secondKey)).toBe(firstEncoded);

      const envKey = await loadOrCreateLibp2pPrivateKey({
        env: { KLINOK_P2P_PRIVATE_KEY: firstEncoded },
        dataDir: tempDir,
        keyPath: join(tempDir, "ignored.base64"),
      });

      expect(encodePrivateKey(envKey)).toBe(firstEncoded);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
