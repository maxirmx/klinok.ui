// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { Identities, KeyStore, MemoryStorage, useIdentityProvider } from "@orbitdb/core";
import { KlinokIdentityProvider } from "@klinok/protocol";

describe("Klinok OrbitDB identity provider", () => {
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => close?.());

  it("preserves the attested device identity and remains cryptographically verifiable", async () => {
    useIdentityProvider(KlinokIdentityProvider);
    const keystore = await KeyStore({ storage: await MemoryStorage() });
    const identities = await Identities({ keystore, storage: await MemoryStorage() });
    close = () => identities.keystore.close();

    const identity = await identities.createIdentity({ id: "klinok-device-1", provider: KlinokIdentityProvider });

    expect(identity.id).toBe("klinok-device-1");
    await expect(identities.verifyIdentity(identity)).resolves.toBe(true);
  });
});
