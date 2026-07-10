import type {
  EncryptedPayload,
  ExportedUserKeySet,
  KeyEnvelope,
  SignedEvent,
  UserKeySet,
} from "./types.js";
import { eventSigningValue, stableSerialize } from "./stable.js";

const RSA_ALGORITHM: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};
const AES_ALGORITHM: AesKeyGenParams = { name: "AES-GCM", length: 256 };
const ECDSA_ALGORITHM: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" };

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error("WebCrypto SubtleCrypto is required.");
  return globalThis.crypto.subtle;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function generateUserKeySet(version = 1): Promise<UserKeySet> {
  const [signing, encryption] = await Promise.all([
    subtle().generateKey(ECDSA_ALGORITHM, true, ["sign", "verify"]),
    subtle().generateKey(RSA_ALGORITHM, true, ["wrapKey", "unwrapKey"]),
  ]);
  return {
    version,
    signingPublicKey: signing.publicKey,
    signingPrivateKey: signing.privateKey,
    encryptionPublicKey: encryption.publicKey,
    encryptionPrivateKey: encryption.privateKey,
  };
}

export async function exportUserKeySet(keys: UserKeySet): Promise<ExportedUserKeySet> {
  const [signingPublicKey, signingPrivateKey, encryptionPublicKey, encryptionPrivateKey] = await Promise.all([
    subtle().exportKey("jwk", keys.signingPublicKey),
    subtle().exportKey("jwk", keys.signingPrivateKey),
    subtle().exportKey("jwk", keys.encryptionPublicKey),
    subtle().exportKey("jwk", keys.encryptionPrivateKey),
  ]);
  return { version: keys.version, signingPublicKey, signingPrivateKey, encryptionPublicKey, encryptionPrivateKey };
}

export async function importUserKeySet(keys: ExportedUserKeySet): Promise<UserKeySet> {
  const [signingPublicKey, signingPrivateKey, encryptionPublicKey, encryptionPrivateKey] = await Promise.all([
    subtle().importKey("jwk", keys.signingPublicKey, ECDSA_ALGORITHM, true, ["verify"]),
    subtle().importKey("jwk", keys.signingPrivateKey, ECDSA_ALGORITHM, true, ["sign"]),
    subtle().importKey("jwk", keys.encryptionPublicKey, RSA_ALGORITHM, true, ["wrapKey"]),
    subtle().importKey("jwk", keys.encryptionPrivateKey, RSA_ALGORITHM, true, ["unwrapKey"]),
  ]);
  return { version: keys.version, signingPublicKey, signingPrivateKey, encryptionPublicKey, encryptionPrivateKey };
}

export async function importSigningPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle().importKey("jwk", jwk, ECDSA_ALGORITHM, true, ["verify"]);
}

export async function importEncryptionPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return subtle().importKey("jwk", jwk, RSA_ALGORITHM, true, ["wrapKey"]);
}

export async function generateDataKey(): Promise<CryptoKey> {
  return subtle().generateKey(AES_ALGORITHM, true, ["encrypt", "decrypt"]);
}

export async function encryptPayload(value: unknown, dataKey: CryptoKey): Promise<EncryptedPayload> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const cleartext = new TextEncoder().encode(stableSerialize(value));
  const ciphertext = await subtle().encrypt({ name: "AES-GCM", iv }, dataKey, cleartext);
  return { algorithm: "AES-GCM-256", iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptPayload<T>(payload: EncryptedPayload, dataKey: CryptoKey): Promise<T> {
  const cleartext = await subtle().decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.iv) },
    dataKey,
    fromBase64(payload.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(cleartext)) as T;
}

export async function wrapDataKey(
  dataKey: CryptoKey,
  recipients: Array<{ recipientId: string; keyVersion: number; publicKey: CryptoKey }>,
): Promise<KeyEnvelope[]> {
  return Promise.all(recipients.map(async (recipient) => ({
    recipientId: recipient.recipientId,
    keyVersion: recipient.keyVersion,
    algorithm: "RSA-OAEP-256" as const,
    wrappedKey: toBase64(new Uint8Array(await subtle().wrapKey("raw", dataKey, recipient.publicKey, RSA_ALGORITHM))),
  })));
}

export async function unwrapDataKey(envelope: KeyEnvelope, privateKey: CryptoKey): Promise<CryptoKey> {
  return subtle().unwrapKey(
    "raw",
    fromBase64(envelope.wrappedKey),
    privateKey,
    RSA_ALGORITHM,
    AES_ALGORITHM,
    true,
    ["encrypt", "decrypt"],
  );
}

export async function signEvent<T extends Record<string, unknown>>(
  event: Omit<SignedEvent<T>, "signature">,
  privateKey: CryptoKey,
): Promise<SignedEvent<T>> {
  const value = new TextEncoder().encode(eventSigningValue(event as unknown as Record<string, unknown>));
  const signature = await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, value);
  return { ...event, signature: { algorithm: "ECDSA-P256-SHA256", value: toBase64(new Uint8Array(signature)) } };
}

export async function verifyEventSignature(event: SignedEvent, publicKey: CryptoKey): Promise<boolean> {
  try {
    return await subtle().verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      fromBase64(event.signature.value),
      new TextEncoder().encode(eventSigningValue(event as unknown as Record<string, unknown>)),
    );
  } catch {
    return false;
  }
}
