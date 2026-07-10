import { signMessage, verifyMessage } from "@orbitdb/core/src/key-store.js";

interface OrbitKeyStore {
  getKey(id: string): Promise<unknown | null>;
}

interface OrbitIdentity {
  id: string;
  publicKey: string;
  signatures: { id: string; publicKey: string };
}

interface ProviderOptions {
  id?: string;
  keystore?: OrbitKeyStore;
}

interface ProviderFactory {
  (): Promise<{
    type: string;
    getId(options?: ProviderOptions): Promise<string>;
    signIdentity(data: string, options?: ProviderOptions): Promise<string>;
  }>;
  type: string;
  verifyIdentity(identity: OrbitIdentity): Promise<boolean>;
}

const type = "klinok-device";

export const KlinokIdentityProvider = (async () => ({
  type,
  async getId({ id }: ProviderOptions = {}) {
    if (!id) throw new Error("Klinok device identity id is required.");
    return id;
  },
  async signIdentity(data: string, { id, keystore }: ProviderOptions = {}) {
    if (!id) throw new Error("Klinok device identity id is required.");
    if (!keystore) throw new Error("OrbitDB keystore is required.");
    const key = await keystore.getKey(id);
    if (!key) throw new Error(`Signing key for '${id}' was not found.`);
    return signMessage(key, data);
  },
})) as ProviderFactory;

KlinokIdentityProvider.type = type;
KlinokIdentityProvider.verifyIdentity = async ({ publicKey, signatures }: OrbitIdentity) =>
  verifyMessage(signatures.publicKey, publicKey, publicKey + signatures.id);
