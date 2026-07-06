// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { webcrypto } from "node:crypto";

export const SHARED_DEMO_PARTICIPANT_ID = "klinok-demo-shared";
export const BUILD_SHARED_PARTICIPANT_KEY_FILE_MODE = 0o644;
export const LOCAL_SHARED_PARTICIPANT_KEY_FILE_MODE = 0o600;

const RSA_ALGORITHM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

export function decodePrivateJwkBase64(value) {
  const json = Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8");

  try {
    return JSON.parse(json);
  } catch {
    throw new Error("Shared participant private key secret must decode to valid JSON.");
  }
}

export function encodePrivateJwkBase64(privateKey) {
  return Buffer.from(JSON.stringify(privateKey), "utf8").toString("base64");
}

export function deriveParticipantPublicKeyJwk(privateKey) {
  if (
    privateKey?.kty !== "RSA" ||
    typeof privateKey.n !== "string" ||
    typeof privateKey.e !== "string"
  ) {
    throw new Error("Shared participant private key must be an RSA JWK with n and e fields.");
  }

  return {
    kty: "RSA",
    n: privateKey.n,
    e: privateKey.e,
    alg: privateKey.alg ?? "RSA-OAEP-256",
    ext: true,
    key_ops: ["wrapKey"],
  };
}

export async function validateSharedParticipantPrivateKey(privateKey) {
  await webcrypto.subtle.importKey("jwk", privateKey, RSA_ALGORITHM, true, ["unwrapKey"]);
  const publicKey = deriveParticipantPublicKeyJwk(privateKey);
  await webcrypto.subtle.importKey("jwk", publicKey, RSA_ALGORITHM, true, ["wrapKey"]);
}

export async function createSharedParticipantKeyOverlay(privateKey) {
  await validateSharedParticipantPrivateKey(privateKey);
  const publicKey = deriveParticipantPublicKeyJwk(privateKey);

  return {
    p2p: {
      participantId: SHARED_DEMO_PARTICIPANT_ID,
      participantPrivateKey: privateKey,
      participantPublicKeys: {
        [SHARED_DEMO_PARTICIPANT_ID]: publicKey,
      },
      allowGeneratedParticipantKeys: false,
    },
  };
}

export async function generateSharedParticipantPrivateKey() {
  const pair = await webcrypto.subtle.generateKey(RSA_ALGORITHM, true, ["wrapKey", "unwrapKey"]);
  return webcrypto.subtle.exportKey("jwk", pair.privateKey);
}

export function formatSharedParticipantKeyOverlay(overlay) {
  return `${JSON.stringify(overlay, null, 2)}\n`;
}
