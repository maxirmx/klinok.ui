import {
  exportUserKeySet,
  generateUserKeySet,
  importUserKeySet,
  type ExportedUserKeySet,
  type UserKeySet,
} from "@klinok/protocol";

const DB_NAME = "klinok-identity-v1";
const STORE_NAME = "user-keys";
const ENROLLMENT_STORE = "enrollment-keys";
const DEVICE_HINT_KEY = "klinok:device-hint";
const DEVICE_NAME_KEY = "klinok:device-name";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      if (!request.result.objectStoreNames.contains(ENROLLMENT_STORE)) request.result.createObjectStore(ENROLLMENT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read(accountId: string): Promise<ExportedUserKeySet | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(accountId);
    request.onsuccess = () => resolve((request.result as ExportedUserKeySet | undefined) ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function write(accountId: string, keys: ExportedUserKeySet): Promise<void> {
  const previous = await read(accountId);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    if (previous) store.put(previous, `${accountId}:${previous.version}`);
    store.put(keys, `${accountId}:${keys.version}`);
    store.put(keys, accountId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function storeExportedUserKeys(accountId: string, exported: ExportedUserKeySet): Promise<UserKeySet> {
  await write(accountId, exported);
  return importUserKeySet(exported);
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function putEnrollmentPrivateKey(accountId: string, key: JsonWebKey): Promise<void> {
  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(ENROLLMENT_STORE, "readwrite");
    tx.objectStore(ENROLLMENT_STORE).put(key, accountId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}

async function getEnrollmentPrivateKey(accountId: string): Promise<JsonWebKey | null> {
  const database = await openDb();
  const result = await new Promise<JsonWebKey | null>((resolve, reject) => {
    const request = database.transaction(ENROLLMENT_STORE, "readonly").objectStore(ENROLLMENT_STORE).get(accountId);
    request.onsuccess = () => resolve((request.result as JsonWebKey | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

export async function loadUserKeys(accountId: string, version?: number): Promise<UserKeySet | null> {
  const exported = await read(version ? `${accountId}:${version}` : accountId);
  return exported ? importUserKeySet(exported) : null;
}

export async function createAndStoreUserKeys(accountId: string, version = 1): Promise<UserKeySet> {
  const keys = await generateUserKeySet(version);
  await write(accountId, await exportUserKeySet(keys));
  return keys;
}

export async function createEnrollmentKey(accountId: string): Promise<JsonWebKey> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  await putEnrollmentPrivateKey(accountId, await crypto.subtle.exportKey("jwk", pair.privateKey));
  return crypto.subtle.exportKey("jwk", pair.publicKey);
}

export async function encryptUserKeyBundle(targetEphemeralPublicKey: JsonWebKey, keys: UserKeySet): Promise<string> {
  const sender = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const target = await crypto.subtle.importKey("jwk", targetEphemeralPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: target }, sender.privateKey,
    { name: "AES-GCM", length: 256 }, false, ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cleartext = new TextEncoder().encode(JSON.stringify(await exportUserKeySet(keys)));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, cleartext);
  return JSON.stringify({
    senderPublicKey: await crypto.subtle.exportKey("jwk", sender.publicKey),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  });
}

export async function decryptAndStoreUserKeyBundle(accountId: string, bundle: string): Promise<UserKeySet> {
  const privateJwk = await getEnrollmentPrivateKey(accountId);
  if (!privateJwk) throw new Error("Ключ запроса устройства не найден.");
  const value = JSON.parse(bundle) as { senderPublicKey: JsonWebKey; iv: string; ciphertext: string };
  const [privateKey, senderPublicKey] = await Promise.all([
    crypto.subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]),
    crypto.subtle.importKey("jwk", value.senderPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []),
  ]);
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: senderPublicKey }, privateKey,
    { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );
  const cleartext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(value.iv) }, wrappingKey, bytes(value.ciphertext));
  const exported = JSON.parse(new TextDecoder().decode(cleartext)) as ExportedUserKeySet;
  await write(accountId, exported);
  return importUserKeySet(exported);
}

export async function importBootstrapRecoveryBundle(accountId: string, bundleText: string, passphrase: string): Promise<UserKeySet> {
  const bundle = JSON.parse(bundleText) as {
    iterations: number; salt: string; iv: string; ciphertext: string; tag: string;
  };
  const passphraseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bytes(bundle.salt), iterations: bundle.iterations, hash: "SHA-256" },
    passphraseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const ciphertext = bytes(bundle.ciphertext);
  const tag = bytes(bundle.tag);
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);
  const cleartext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(bundle.iv), tagLength: 128 }, key, combined);
  return storeExportedUserKeys(accountId, JSON.parse(new TextDecoder().decode(cleartext)) as ExportedUserKeySet);
}

export function getLastActiveRole(accountId: string, deviceId: string): string | null {
  return localStorage.getItem(`klinok:active-role:${accountId}:${deviceId}`);
}

export function setLastActiveRole(accountId: string, deviceId: string, role: string): void {
  localStorage.setItem(`klinok:active-role:${accountId}:${deviceId}`, role);
}

function getDeviceHint(): string | null {
  return localStorage.getItem(DEVICE_HINT_KEY);
}

export function clearDeviceId(): void {
  localStorage.removeItem(DEVICE_HINT_KEY);
}

export function getOrCreateDeviceId(): string {
  const existing = getDeviceHint();
  if (existing) return existing;
  const deviceId = crypto.randomUUID();
  localStorage.setItem(DEVICE_HINT_KEY, deviceId);
  return deviceId;
}

export function suggestedDeviceName(): string {
  if (typeof navigator === "undefined") return "Это устройство";
  const userAgent = navigator.userAgent;
  const browser = userAgent.includes("Edg/") ? "Microsoft Edge"
    : userAgent.includes("Firefox/") ? "Firefox"
      : userAgent.includes("Chrome/") ? "Chrome"
        : userAgent.includes("Safari/") ? "Safari"
          : "Браузер";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    || navigator.platform
    || (userAgent.includes("Android") ? "Android" : userAgent.includes("iPhone") || userAgent.includes("iPad") ? "iOS" : "устройство");
  return `${browser} · ${platform}`;
}

export function getDeviceName(): string | null {
  return localStorage.getItem(DEVICE_NAME_KEY);
}

export function setDeviceName(deviceName: string): void {
  localStorage.setItem(DEVICE_NAME_KEY, deviceName.trim().slice(0, 80));
}

export function getOrCreateDeviceName(): string {
  const existing = getDeviceName();
  if (existing) return existing;
  const deviceName = suggestedDeviceName();
  setDeviceName(deviceName);
  return deviceName;
}
