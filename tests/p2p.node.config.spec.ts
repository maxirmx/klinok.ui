// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  encodePrivateKey,
  formatErrorSummary,
  getLibp2pListenMultiaddrs,
  getTlsFilePaths,
  getWebSocketListenMultiaddr,
  loadOrCreateLibp2pPrivateKey,
} from "../p2p-node/src/config.js";
import { KlinokAccessController } from "../p2p-node/src/accessController.js";
import {
  isRecoverableOrbitDbSyncError,
  registerOrbitDbEventHandlers,
  registerRecoverableProcessErrorHandlers,
} from "../p2p-node/src/events.js";

describe("p2p node config", () => {
  it("selects plain websocket locally and secure websocket when TLS is configured", () => {
    expect(getWebSocketListenMultiaddr("8089", false)).toBe("/ip4/0.0.0.0/tcp/8089/ws");
    expect(getWebSocketListenMultiaddr("8089", true)).toBe("/ip4/0.0.0.0/tcp/8089/tls/ws");
  });

  it("listens only on the websocket trusted-node port", () => {
    expect(getLibp2pListenMultiaddrs("8089", false)).toEqual(["/ip4/0.0.0.0/tcp/8089/ws"]);
    expect(getLibp2pListenMultiaddrs("8089", true)).toEqual(["/ip4/0.0.0.0/tcp/8089/tls/ws"]);
    expect(getLibp2pListenMultiaddrs("8089", false)).not.toContain("/ip4/0.0.0.0/tcp/51240");
  });

  it("requires both TLS certificate and key paths", () => {
    expect(getTlsFilePaths({ KLINOK_P2P_TLS_CERT: "/cert.pem" })).toBeNull();
    expect(getTlsFilePaths({ KLINOK_P2P_TLS_KEY: "/key.pem" })).toBeNull();
    expect(getTlsFilePaths({ KLINOK_P2P_TLS_CERT: "/cert.pem", KLINOK_P2P_TLS_KEY: "/key.pem" })).toEqual({
      certPath: "/cert.pem",
      keyPath: "/key.pem",
    });
  });

  it("summarizes aggregate OrbitDB sync errors without losing nested causes", () => {
    const noRouters = new Error("No content routers available");
    noRouters.name = "NoContentRoutersError";
    const aborted = new Error("Want was aborted");
    aborted.name = "AbortError";

    expect(formatErrorSummary(new AggregateError([noRouters, aborted], "All promises were rejected"))).toBe(
      "AggregateError: All promises were rejected (NoContentRoutersError: No content routers available; AbortError: Want was aborted)",
    );
  });

  it("handles OrbitDB sync errors as warnings instead of unhandled EventEmitter errors", () => {
    const events = new EventEmitter();
    const logger = { log: vi.fn(), warn: vi.fn() };
    const db = { events, all: vi.fn() };
    const noRouters = new Error("No content routers available");
    noRouters.name = "NoContentRoutersError";

    const unregister = registerOrbitDbEventHandlers(db, logger);

    expect(() => {
      events.emit("error", new AggregateError([noRouters], "All promises were rejected"));
    }).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      "OrbitDB sync warning:",
      "AggregateError: All promises were rejected (NoContentRoutersError: No content routers available)",
    );

    unregister();
  });

  it("handles recoverable OrbitDB sync rejections without exiting the node process", () => {
    const processLike = new EventEmitter() as EventEmitter & { exit?: ReturnType<typeof vi.fn>; exitCode?: number };
    processLike.exit = vi.fn();
    const logger = { error: vi.fn(), warn: vi.fn() };
    const noRouters = new Error("No content routers available");
    noRouters.name = "NoContentRoutersError";

    const unregister = registerRecoverableProcessErrorHandlers(processLike, logger);

    processLike.emit("unhandledRejection", new AggregateError([noRouters], "All promises were rejected"));

    expect(logger.warn).toHaveBeenCalledWith(
      "OrbitDB background sync warning:",
      "AggregateError: All promises were rejected (NoContentRoutersError: No content routers available)",
    );
    expect(processLike.exit).not.toHaveBeenCalled();
    expect(processLike.exitCode).toBeUndefined();

    unregister();
  });

  it("detects gateway and bitswap sync misses as recoverable OrbitDB sync errors", () => {
    const gateway = new AggregateError([], "Unable to fetch raw block for CID bafyrei from any gateway");
    const aborted = new Error("Want was aborted");
    aborted.name = "AbortError";

    expect(isRecoverableOrbitDbSyncError(new AggregateError([gateway, aborted], "All promises were rejected"))).toBe(true);
    expect(isRecoverableOrbitDbSyncError(new Error("database corruption"))).toBe(false);
  });

  it("allows wildcard writes without fetching writer identity blocks", async () => {
    const access = await KlinokAccessController({ write: ["*"] })({
      identities: {
        getIdentity: vi.fn(async () => {
          throw new Error("identity should not be fetched for wildcard writes");
        }),
        verifyIdentity: vi.fn(async () => false),
      },
    });

    await expect(access.canAppend({ identity: "missing-identity-block" })).resolves.toBe(true);
  });

  it("keeps explicit write identities verified through OrbitDB identities", async () => {
    const writerIdentity = { id: "owner-demo" };
    const identities = {
      getIdentity: vi.fn(async () => writerIdentity),
      verifyIdentity: vi.fn(async () => true),
    };
    const access = await KlinokAccessController({ write: ["owner-demo"] })({ identities });

    await expect(access.canAppend({ identity: "identity-hash" })).resolves.toBe(true);
    expect(identities.getIdentity).toHaveBeenCalledWith("identity-hash");
    expect(identities.verifyIdentity).toHaveBeenCalledWith(writerIdentity);
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
