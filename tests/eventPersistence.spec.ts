import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProtocolState,
  deviceProjectionKey,
  exportUserKeySet,
  generateUserKeySet,
  signEvent,
  type SignedEvent,
} from "@klinok/protocol";
import { AttestationService } from "../auth-node/src/attestation";
import { closeBrowserHeliaStorage, createBrowserHeliaInit } from "../src/repositories/browserStorage";
import { createAndStoreUserKeys, loadUserKeys } from "../src/repositories/deviceVault";
import { IndexedDbEventTransport } from "../src/repositories/eventTransport";
import { getPetKey, putPetKey } from "../src/repositories/petKeyVault";
import { parentOrdered, recoverableDeviceAttestations, waitForInitialReplication } from "../src/repositories/orbitTransport";

const databaseNames = [
  "klinok-events-v1",
  "klinok-identity-v1",
  "klinok-pet-keys-v1",
  "klinok-test-helia-blocks",
  "klinok-test-helia-data",
];

function event(eventId: string, parents: string[] = []): SignedEvent {
  return {
    schemaVersion: 1,
    database: "control",
    eventId,
    operationId: `operation-${eventId}`,
    eventType: "profile.updated",
    aggregateId: "account",
    resourceId: "account",
    createdAt: `2026-07-15T10:00:0${parents.length}.000Z`,
    actorAccountId: "account",
    actorDeviceId: "device",
    orbitIdentityId: "identity",
    activeRole: "owner",
    parents,
    keyVersion: 1,
    proofIds: [],
    metadata: {},
    keyring: [],
    payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
    signature: { algorithm: "ECDSA-P256-SHA256", value: "signature" },
  };
}

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Database ${name} is still open.`));
  });
}

afterEach(async () => {
  for (const name of databaseNames) await deleteDatabase(name);
});

describe("durable browser event storage", () => {
  it("revalidates a legacy cross-account attestation conflict for requeue", async () => {
    const attestation = await AttestationService.create();
    const authAttestationPublicKey = await attestation.publicJwk();
    const sharedDeviceId = "shared-browser-device";
    const firstKeys = await generateUserKeySet();
    const firstExported = await exportUserKeySet(firstKeys);
    const firstCertificate = await attestation.certificate({
      enrollmentId: "first-enrollment", operationId: "first-operation", accountId: "first-account",
      deviceId: sharedDeviceId, orbitIdentityId: `klinok-device-${sharedDeviceId}`, status: "active",
      signingPublicKey: firstExported.signingPublicKey, encryptionPublicKey: firstExported.encryptionPublicKey,
      createdAt: "2026-07-15T10:00:00.000Z",
    });
    const secondKeys = await generateUserKeySet();
    const secondExported = await exportUserKeySet(secondKeys);
    const secondCertificate = await attestation.certificate({
      enrollmentId: "second-enrollment", operationId: "second-operation", accountId: "second-account",
      deviceId: sharedDeviceId, orbitIdentityId: `klinok-device-${sharedDeviceId}`, status: "active",
      signingPublicKey: secondExported.signingPublicKey, encryptionPublicKey: secondExported.encryptionPublicKey,
      createdAt: "2026-07-15T10:01:00.000Z",
    });
    const secondEvent = await signEvent({
      schemaVersion: 1, database: "control", eventId: "second-attestation", operationId: "second-operation",
      eventType: "device.attested", aggregateId: "second-account", resourceId: sharedDeviceId,
      createdAt: "2026-07-15T10:01:00.000Z", actorAccountId: "second-account", actorDeviceId: sharedDeviceId,
      orbitIdentityId: `klinok-device-${sharedDeviceId}`, activeRole: "owner", parents: [], keyVersion: 1,
      proofIds: [], metadata: { certificate: secondCertificate as unknown as Record<string, unknown> }, keyring: [],
      payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
    }, secondKeys.signingPrivateKey);
    const state = createProtocolState("bootstrap-administrator");
    state.devices.set(deviceProjectionKey(firstCertificate.accountId, firstCertificate.deviceId), firstCertificate);

    await expect(recoverableDeviceAttestations(
      [secondEvent],
      [{ eventId: secondEvent.eventId, database: "control", code: "DEVICE_BINDING_INVALID", message: "legacy collision", createdAt: secondEvent.createdAt }],
      state,
      { authAttestationPublicKey },
    )).resolves.toEqual([secondEvent]);
  });

  it("retains events, pending work, and conflict history without carrying failure status into a new session", async () => {
    const first = new IndexedDbEventTransport();
    await first.initialize();
    const saved = event("event-1");
    await first.append(saved);
    await first.queueOutbox(saved);
    await first.recordConflict({
      eventId: "rejected-event",
      database: "control",
      code: "EVENT_REJECTED",
      message: "Rejected",
      createdAt: saved.createdAt,
    });
    expect(await first.syncStatus()).toMatchObject({ pendingCount: 1, failedCount: 1 });
    await first.dispose();

    const reopened = new IndexedDbEventTransport();
    await reopened.initialize();
    expect(await reopened.list("control")).toEqual([saved]);
    expect(await reopened.pendingOutbox()).toEqual([saved]);
    expect(await reopened.listConflicts()).toEqual([expect.objectContaining({ eventId: "rejected-event" })]);
    expect(await reopened.syncStatus()).toMatchObject({ pendingCount: 1, failedCount: 0 });
    await reopened.recordConflict({
      eventId: "current-session-rejection",
      database: "control",
      code: "EVENT_REJECTED",
      message: "Rejected in the current session",
      createdAt: saved.createdAt,
    });
    expect(await reopened.syncStatus()).toMatchObject({ pendingCount: 1, failedCount: 1 });
    await reopened.removeConflict("current-session-rejection");
    expect(await reopened.listConflicts()).toEqual([expect.objectContaining({ eventId: "rejected-event" })]);
    expect(await reopened.syncStatus()).toMatchObject({ pendingCount: 1, failedCount: 0 });
    await reopened.dispose();
  });

  it("retains user and pet encryption keys after reopening their vaults", async () => {
    const userKeys = await createAndStoreUserKeys("account");
    const dataKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    await putPetKey("account", "pet", 3, dataKey);

    expect((await loadUserKeys("account"))?.version).toBe(userKeys.version);
    expect(await getPetKey("account", "pet")).toMatchObject({ version: 3, key: expect.any(CryptoKey) });
  });

  it("closes browser Helia stores before their IndexedDB databases are deleted", async () => {
    const storage = await createBrowserHeliaInit("klinok-test-helia");
    await closeBrowserHeliaStorage(storage);

    await expect(deleteDatabase("klinok-test-helia-blocks")).resolves.toBeUndefined();
    await expect(deleteDatabase("klinok-test-helia-data")).resolves.toBeUndefined();
  });

  it("orders queued descendants after their parents", () => {
    const root = event("root");
    const child = event("child", [root.eventId]);
    const grandchild = event("grandchild", [child.eventId]);
    expect(parentOrdered([grandchild, child, root]).map((item) => item.eventId)).toEqual(["root", "child", "grandchild"]);
  });

  it("waits for OrbitDB to finish exchanging peer heads", async () => {
    const listeners = new Set<(...args: unknown[]) => void>();
    const ready = waitForInitialReplication({
      add: async () => undefined,
      iterator: async function* () {},
      close: async () => undefined,
      events: {
        on: (_name, listener) => listeners.add(listener),
        off: (_name, listener) => listeners.delete(listener),
      },
    }, 100);

    expect(listeners.size).toBe(1);
    for (const listener of listeners) listener("trusted-peer", []);
    await expect(ready).resolves.toBe(true);
    expect(listeners.size).toBe(0);
  });
});
