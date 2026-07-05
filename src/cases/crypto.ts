// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { CaseEvent } from "./types";

const AES_ALGORITHM = { name: "AES-GCM", length: 256 };
const RSA_ALGORITHM = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

export interface ParticipantPublicKey {
  participantId: string;
  publicKey: CryptoKey;
}

export interface ParticipantKeyPair extends ParticipantPublicKey {
  privateKey: CryptoKey;
}

export interface ExportedParticipantKeyPair {
  participantId: string;
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export interface CaseKeyEnvelope {
  participantId: string;
  alg: "RSA-OAEP-256";
  wrappedKey: string;
}

export interface EncryptedCaseEventRecord {
  _id: string;
  schemaVersion: 1;
  caseId: string;
  createdAt: string;
  writerId: string;
  keyring: CaseKeyEnvelope[];
  cipher: {
    alg: "AES-GCM-256";
    iv: string;
    text: string;
  };
}

function getSubtle() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto SubtleCrypto is required for P2P case encryption.");
  }
  return subtle;
}

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) {
    value += String.fromCharCode(byte);
  }
  return btoa(value);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeForJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item));
  }

  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) {
        result[key] = normalizeForJson(child);
      }
      return result;
    }, {});
}

export function stableSerialize(value: unknown) {
  return JSON.stringify(normalizeForJson(value));
}

export async function createParticipantKeyPair(participantId: string): Promise<ParticipantKeyPair> {
  const subtle = getSubtle();
  const keyPair = await subtle.generateKey(RSA_ALGORITHM, true, ["wrapKey", "unwrapKey"]);

  return {
    participantId,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

export async function exportParticipantKeyPair(pair: ParticipantKeyPair): Promise<ExportedParticipantKeyPair> {
  const subtle = getSubtle();
  const [publicKey, privateKey] = await Promise.all([
    subtle.exportKey("jwk", pair.publicKey),
    subtle.exportKey("jwk", pair.privateKey),
  ]);

  return {
    participantId: pair.participantId,
    publicKey,
    privateKey,
  };
}

export async function importParticipantPublicKey(
  participantId: string,
  publicKey: JsonWebKey,
): Promise<ParticipantPublicKey> {
  const subtle = getSubtle();
  const imported = await subtle.importKey("jwk", publicKey, RSA_ALGORITHM, true, ["wrapKey"]);
  return { participantId, publicKey: imported };
}

export async function importParticipantKeyPair(
  participantId: string,
  publicKey: JsonWebKey,
  privateKey: JsonWebKey,
): Promise<ParticipantKeyPair> {
  const subtle = getSubtle();
  const [importedPublicKey, importedPrivateKey] = await Promise.all([
    subtle.importKey("jwk", publicKey, RSA_ALGORITHM, true, ["wrapKey"]),
    subtle.importKey("jwk", privateKey, RSA_ALGORITHM, true, ["unwrapKey"]),
  ]);

  return {
    participantId,
    publicKey: importedPublicKey,
    privateKey: importedPrivateKey,
  };
}

export async function generateCaseKey() {
  return getSubtle().generateKey(AES_ALGORITHM, true, ["encrypt", "decrypt"]);
}

export async function wrapCaseKeyForParticipants(
  caseKey: CryptoKey,
  recipients: ParticipantPublicKey[],
): Promise<CaseKeyEnvelope[]> {
  const subtle = getSubtle();
  return Promise.all(
    recipients.map(async (recipient) => {
      const wrapped = await subtle.wrapKey("raw", caseKey, recipient.publicKey, RSA_ALGORITHM);
      return {
        participantId: recipient.participantId,
        alg: "RSA-OAEP-256" as const,
        wrappedKey: bytesToBase64(new Uint8Array(wrapped)),
      };
    }),
  );
}

export async function unwrapCaseKey(
  envelope: CaseKeyEnvelope,
  privateKey: CryptoKey,
): Promise<CryptoKey> {
  return getSubtle().unwrapKey(
    "raw",
    base64ToBytes(envelope.wrappedKey),
    privateKey,
    RSA_ALGORITHM,
    AES_ALGORITHM,
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptCaseEventWithKeyring(
  event: CaseEvent,
  caseKey: CryptoKey,
  keyring: CaseKeyEnvelope[],
): Promise<EncryptedCaseEventRecord> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const text = new TextEncoder().encode(stableSerialize(event));
  const encrypted = await getSubtle().encrypt({ name: "AES-GCM", iv }, caseKey, text);

  return {
    _id: event.id,
    schemaVersion: 1,
    caseId: event.caseId,
    createdAt: event.createdAt,
    writerId: event.actorId,
    keyring,
    cipher: {
      alg: "AES-GCM-256",
      iv: bytesToBase64(iv),
      text: bytesToBase64(new Uint8Array(encrypted)),
    },
  };
}

export async function encryptCaseEvent(
  event: CaseEvent,
  caseKey: CryptoKey,
  recipients: ParticipantPublicKey[],
): Promise<EncryptedCaseEventRecord> {
  const keyring = await wrapCaseKeyForParticipants(caseKey, recipients);
  return encryptCaseEventWithKeyring(event, caseKey, keyring);
}

export async function decryptCaseEventRecord(
  record: EncryptedCaseEventRecord,
  participant: Pick<ParticipantKeyPair, "participantId" | "privateKey">,
): Promise<CaseEvent> {
  const envelope = record.keyring.find((item) => item.participantId === participant.participantId);
  if (!envelope) {
    throw new Error(`No case key envelope for participant ${participant.participantId}.`);
  }

  const caseKey = await unwrapCaseKey(envelope, participant.privateKey);
  const decrypted = await getSubtle().decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.cipher.iv) },
    caseKey,
    base64ToBytes(record.cipher.text),
  );

  return JSON.parse(new TextDecoder().decode(decrypted)) as CaseEvent;
}

export async function unwrapCaseKeyFromRecord(
  record: EncryptedCaseEventRecord,
  participant: Pick<ParticipantKeyPair, "participantId" | "privateKey">,
) {
  const envelope = record.keyring.find((item) => item.participantId === participant.participantId);
  if (!envelope) {
    throw new Error(`No case key envelope for participant ${participant.participantId}.`);
  }

  return unwrapCaseKey(envelope, participant.privateKey);
}
