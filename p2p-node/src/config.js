// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";

export function splitEnvList(name, fallback = [], env = process.env) {
  const value = env[name];
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function optionalEnv(name, env = process.env) {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

export function getWebSocketListenMultiaddr(wsPort, hasTls) {
  return `/ip4/0.0.0.0/tcp/${wsPort}/${hasTls ? "tls/ws" : "ws"}`;
}

export function getTlsFilePaths(env = process.env) {
  const certPath = optionalEnv("KLINOK_P2P_TLS_CERT", env);
  const keyPath = optionalEnv("KLINOK_P2P_TLS_KEY", env);
  return certPath && keyPath ? { certPath, keyPath } : null;
}

export function loadWebSocketTransportOptions(tlsFilePaths) {
  if (!tlsFilePaths) return {};

  return {
    https: {
      cert: readFileSync(tlsFilePaths.certPath),
      key: readFileSync(tlsFilePaths.keyPath),
    },
  };
}

export function encodePrivateKey(privateKey) {
  return Buffer.from(privateKeyToProtobuf(privateKey)).toString("base64");
}

export function decodePrivateKey(value) {
  return privateKeyFromProtobuf(Buffer.from(value.replace(/\s+/g, ""), "base64"));
}

export async function loadOrCreateLibp2pPrivateKey({
  env = process.env,
  dataDir = env.KLINOK_P2P_DATA_DIR ?? ".klinok-p2p",
  keyPath = optionalEnv("KLINOK_P2P_PRIVATE_KEY_PATH", env) ?? join(dataDir, "libp2p-private-key.base64"),
} = {}) {
  const configuredKey = optionalEnv("KLINOK_P2P_PRIVATE_KEY", env);
  if (configuredKey) {
    return decodePrivateKey(configuredKey);
  }

  if (existsSync(keyPath)) {
    return decodePrivateKey(readFileSync(keyPath, "utf8"));
  }

  const privateKey = await generateKeyPair("Ed25519");
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, `${encodePrivateKey(privateKey)}\n`, { mode: 0o600 });
  return privateKey;
}
