const DB_NAME = "klinok-pet-keys-v1";
const STORE = "keys";

interface StoredPetKey { version: number; jwk: JsonWebKey }

async function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putPetKey(accountId: string, petId: string, version: number, key: CryptoKey): Promise<void> {
  const database = await db();
  const value: StoredPetKey = { version, jwk: await crypto.subtle.exportKey("jwk", key) };
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, `${accountId}:${petId}`);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  database.close();
}

export async function getPetKey(accountId: string, petId: string): Promise<{ version: number; key: CryptoKey } | null> {
  const database = await db();
  const stored = await new Promise<StoredPetKey | null>((resolve, reject) => {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).get(`${accountId}:${petId}`);
    request.onsuccess = () => resolve((request.result as StoredPetKey | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  if (!stored) return null;
  return {
    version: stored.version,
    key: await crypto.subtle.importKey("jwk", stored.jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]),
  };
}
