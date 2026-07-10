import { describe, expect, it } from "vitest";
import {
  chooseConcurrentRoleStatus,
  generateDataKey,
  generateUserKeySet,
  exportUserKeySet,
  createProtocolState,
  roleProjectionKey,
  applyAcceptedEvent,
  reconcileEffectiveEvents,
  signEvent,
  stableSerialize,
  verifyEventSignature,
  verifySignedEvent,
  wrapDataKey,
  unwrapDataKey,
  encryptPayload,
  decryptPayload,
  importEncryptionPublicKey,
  type DeviceCertificate,
  type ProtocolState,
  type Role,
  type SignedEvent,
} from "./index.js";

describe("klinok protocol", () => {
  it("uses stable canonical serialization", () => {
    expect(stableSerialize({ z: 1, a: { c: 3, b: 2 } })).toBe('{"a":{"b":2,"c":3},"z":1}');
  });

  it("signs the complete event envelope and rejects tampering", async () => {
    const keys = await generateUserKeySet();
    const unsigned: Omit<SignedEvent, "signature"> = {
      schemaVersion: 1,
      database: "control",
      eventId: "event-1",
      operationId: "operation-1",
      eventType: "profile.updated",
      aggregateId: "account-1",
      resourceId: "account-1",
      createdAt: "2026-07-10T10:00:00.000Z",
      actorAccountId: "account-1",
      actorDeviceId: "device-1",
      orbitIdentityId: "orbit-1",
      activeRole: "owner",
      parents: [],
      keyVersion: 1,
      proofIds: ["role-proof"],
      metadata: {},
      keyring: [],
      payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
    };
    const signed = await signEvent(unsigned, keys.signingPrivateKey);
    expect(await verifyEventSignature(signed, keys.signingPublicKey)).toBe(true);
    expect(await verifyEventSignature({ ...signed, resourceId: "tampered" }, keys.signingPublicKey)).toBe(false);
  });

  it("selects the more restrictive concurrent role status", () => {
    expect(chooseConcurrentRoleStatus("approved", "suspended")).toBe("suspended");
    expect(chooseConcurrentRoleStatus("rejected", "pending")).toBe("rejected");
  });

  it("can generate browser-and-node compatible data keys", async () => {
    await expect(generateDataKey()).resolves.toBeDefined();
  });

  async function actorFixture(role: Role = "owner") {
    const keys = await generateUserKeySet();
    const exported = await exportUserKeySet(keys);
    const certificate: DeviceCertificate = {
      deviceId: "device-1", accountId: "account-1", orbitIdentityId: "orbit-1", status: "active", userKeyVersion: 1,
      signingPublicKey: exported.signingPublicKey, encryptionPublicKey: exported.encryptionPublicKey,
      issuedAt: "2026-07-10T10:00:00.000Z", attestation: "trusted-attestation",
    };
    const state = createProtocolState();
    state.devices.set(certificate.deviceId, certificate);
    state.roles.set(roleProjectionKey(certificate.accountId, role), {
      request: { requestId: `${role}-proof`, accountId: certificate.accountId, role, status: "approved", profileRevision: 1, requestedAt: certificate.issuedAt },
      eventId: `${role}-proof`, parents: [],
    });
    state.knownEvents.add(`${role}-proof`);
    return { keys, certificate, state };
  }

  async function signedFor(
    state: ProtocolState,
    keys: Awaited<ReturnType<typeof generateUserKeySet>>,
    input: Partial<Omit<SignedEvent, "signature">> = {},
  ) {
    const dataKey = await generateDataKey();
    const certificate = state.devices.get("device-1")!;
    const activeRole = input.activeRole ?? "owner";
    const proof = state.roles.get(roleProjectionKey(certificate.accountId, activeRole))?.request.requestId ?? `${activeRole}-proof`;
    return signEvent({
      schemaVersion: 1, database: "control", eventId: crypto.randomUUID(), operationId: crypto.randomUUID(),
      eventType: "profile.updated", aggregateId: certificate.accountId, resourceId: certificate.accountId,
      createdAt: "2026-07-10T10:01:00.000Z", actorAccountId: certificate.accountId, actorDeviceId: certificate.deviceId,
      orbitIdentityId: certificate.orbitIdentityId, activeRole, parents: [], keyVersion: 1,
      proofIds: [proof], metadata: {},
      keyring: await wrapDataKey(dataKey, [{ recipientId: certificate.accountId, keyVersion: 1, publicKey: await importEncryptionPublicKey(certificate.encryptionPublicKey) }]),
      payload: await encryptPayload({ secret: "profile" }, dataKey),
      ...input,
    }, keys.signingPrivateKey);
  }

  it("rejects stale keys and transport identity substitution", async () => {
    const { keys, state } = await actorFixture();
    const stale = await signedFor(state, keys, { keyVersion: 2 });
    await expect(verifySignedEvent(stale, state)).resolves.toMatchObject({ accepted: false, code: "KEY_VERSION_STALE" });
    const substituted = await signedFor(state, keys, { orbitIdentityId: "attacker-orbit" });
    await expect(verifySignedEvent(substituted, state)).resolves.toMatchObject({ accepted: false, code: "DEVICE_BINDING_INVALID" });
  });

  it("rejects unsupported events and bootstrap identity spoofing", async () => {
    const { keys, state } = await actorFixture();
    const unsupported = await signedFor(state, keys, { eventType: "custom.unrestricted" });
    await expect(verifySignedEvent(unsupported, state)).resolves.toMatchObject({ accepted: false, code: "EVENT_TYPE_UNSUPPORTED" });
    const spoofedBootstrap = await signedFor(state, keys, { eventType: "account.bootstrap" });
    await expect(verifySignedEvent(spoofedBootstrap, state)).resolves.toMatchObject({ accepted: false, code: "BOOTSTRAP_IDENTITY_INVALID" });
  });

  it("requires Doctor role and a pet grant for medical writes", async () => {
    const { keys, state } = await actorFixture("doctor");
    state.petOwners.set("pet-1", "owner-1");
    const denied = await signedFor(state, keys, {
      database: "medical", eventType: "medical.record.created", aggregateId: "pet-1", resourceId: "record-1",
      activeRole: "doctor", metadata: { petId: "pet-1" },
    });
    await expect(verifySignedEvent(denied, state)).resolves.toMatchObject({ accepted: false, code: "PET_GRANT_REQUIRED" });
    state.grants.set("grant-1", {
      grantId: "grant-1", petId: "pet-1", grantorAccountId: "owner-1", granteeAccountId: "account-1",
      actions: ["read", "write_unconfirmed"], petKeyVersion: 1, status: "active", createdAt: "2026-07-10T10:00:00.000Z",
    });
    await expect(verifySignedEvent(denied, state)).resolves.toMatchObject({ accepted: false, code: "PET_GRANT_REQUIRED" });
    const allowed = await signedFor(state, keys, {
      database: "medical", eventType: "medical.record.created", aggregateId: "pet-1", resourceId: "record-1",
      activeRole: "doctor", proofIds: ["doctor-proof", "grant-1"], metadata: { petId: "pet-1" },
    });
    await expect(verifySignedEvent(allowed, state)).resolves.toMatchObject({ accepted: true });
    state.confirmedRecords.add("record-1");
    const edit = await signedFor(state, keys, {
      database: "medical", eventType: "medical.record.updated", aggregateId: "pet-1", resourceId: "record-1",
      activeRole: "doctor", proofIds: ["doctor-proof", "grant-1"], metadata: { petId: "pet-1" },
    });
    await expect(verifySignedEvent(edit, state)).resolves.toMatchObject({ accepted: false, code: "CONFIRMED_RECORD_IMMUTABLE" });
  });

  it("keeps encrypted payloads unavailable without a recipient envelope", async () => {
    const owner = await generateUserKeySet();
    const administrator = await generateUserKeySet();
    const ownerExported = await exportUserKeySet(owner);
    const dataKey = await generateDataKey();
    const payload = await encryptPayload({ diagnosis: "секрет" }, dataKey);
    const envelopes = await wrapDataKey(dataKey, [{ recipientId: "owner", keyVersion: 1, publicKey: await importEncryptionPublicKey(ownerExported.encryptionPublicKey) }]);
    await expect(decryptPayload(payload, await unwrapDataKey(envelopes[0]!, owner.encryptionPrivateKey))).resolves.toEqual({ diagnosis: "секрет" });
    await expect(unwrapDataKey(envelopes[0]!, administrator.encryptionPrivateKey)).rejects.toThrow();
    expect(envelopes.some((envelope) => envelope.recipientId === "administrator")).toBe(false);
  });

  it("converges concurrent role decisions to the restrictive state and records the losing branch", async () => {
    const { keys, state } = await actorFixture("administrator");
    state.knownEvents.add("pending-event");
    state.roles.set(roleProjectionKey("doctor-account", "doctor"), {
      request: { requestId: "doctor-request", accountId: "doctor-account", role: "doctor", status: "pending", profileRevision: 1, requestedAt: "2026-07-10T10:00:00.000Z" },
      eventId: "pending-event", parents: [],
    });
    const approved = await signedFor(state, keys, {
      eventType: "role.approved", aggregateId: "doctor-account", resourceId: "doctor-request", activeRole: "administrator",
      parents: ["pending-event"], metadata: { accountId: "doctor-account", requestId: "doctor-request", role: "doctor", status: "approved", profileRevision: 1 },
    });
    expect((await verifySignedEvent(approved, state)).accepted).toBe(true);
    applyAcceptedEvent(approved, state);
    const rejected = await signedFor(state, keys, {
      eventType: "role.rejected", aggregateId: "doctor-account", resourceId: "doctor-request", activeRole: "administrator",
      parents: ["pending-event"], metadata: { accountId: "doctor-account", requestId: "doctor-request", role: "doctor", status: "rejected", profileRevision: 1 },
    });
    expect((await verifySignedEvent(rejected, state)).accepted).toBe(true);
    applyAcceptedEvent(rejected, state);
    expect(state.roles.get(roleProjectionKey("doctor-account", "doctor"))?.request.status).toBe("rejected");
    expect(state.roleConflicts).toEqual([expect.objectContaining({ losingEventId: approved.eventId, winningEventId: rejected.eventId })]);
  });

  it("lets a causally later valid transition supersede a losing sibling branch", async () => {
    const { keys, state } = await actorFixture("administrator");
    const pending = await signedFor(state, keys, {
      eventType: "role.requested", aggregateId: "account-1", resourceId: "doctor-request", activeRole: "administrator",
      metadata: { accountId: "account-1", requestId: "doctor-request", role: "doctor", status: "pending", profileRevision: 1 },
    });
    expect((await verifySignedEvent(pending, state)).accepted).toBe(true);
    applyAcceptedEvent(pending, state);
    const approved = await signedFor(state, keys, {
      eventType: "role.approved", aggregateId: "account-1", resourceId: "doctor-request", activeRole: "administrator",
      parents: [pending.eventId], metadata: { accountId: "account-1", requestId: "doctor-request", role: "doctor", status: "approved", profileRevision: 1 },
    });
    applyAcceptedEvent(approved, state);
    const rejected = await signedFor(state, keys, {
      eventType: "role.rejected", aggregateId: "account-1", resourceId: "doctor-request", activeRole: "administrator",
      parents: [pending.eventId], metadata: { accountId: "account-1", requestId: "doctor-request", role: "doctor", status: "rejected", profileRevision: 1 },
    });
    applyAcceptedEvent(rejected, state);
    expect(state.roles.get(roleProjectionKey("account-1", "doctor"))?.request.status).toBe("rejected");
    const suspended = await signedFor(state, keys, {
      eventType: "role.suspended", aggregateId: "account-1", resourceId: "doctor-request", activeRole: "administrator",
      parents: [approved.eventId], metadata: { accountId: "account-1", requestId: "doctor-request", role: "doctor", status: "suspended", profileRevision: 1 },
    });
    expect((await verifySignedEvent(suspended, state)).accepted).toBe(true);
    applyAcceptedEvent(suspended, state);
    expect(state.roles.get(roleProjectionKey("account-1", "doctor"))?.request.status).toBe("suspended");
  });

  it("keeps causal records but invalidates an offline sibling after grant revocation", async () => {
    const { keys, state } = await actorFixture("doctor");
    state.grants.set("grant-1", {
      grantId: "grant-1", petId: "pet-1", grantorAccountId: "owner-1", granteeAccountId: "account-1",
      actions: ["read", "write_unconfirmed"], petKeyVersion: 1, status: "revoked", createdAt: "2026-07-10T10:00:00.000Z",
    });
    const causal = await signedFor(state, keys, {
      database: "medical", eventId: "causal-record", eventType: "medical.record.created", aggregateId: "pet-1", resourceId: "record-1",
      activeRole: "doctor", metadata: { petId: "pet-1" },
    });
    const offline = await signedFor(state, keys, {
      database: "medical", eventId: "offline-record", eventType: "medical.record.created", aggregateId: "pet-1", resourceId: "record-2",
      activeRole: "doctor", metadata: { petId: "pet-1" },
    });
    const revocation = await signedFor(state, keys, {
      database: "medical", eventId: "grant-revoked", eventType: "grant.revoked", aggregateId: "pet-1", resourceId: "grant-1",
      activeRole: "owner", metadata: { petId: "pet-1", priorAuthorizedEventIds: ["causal-record"] },
    });
    reconcileEffectiveEvents([causal, offline, revocation], state);
    expect(state.invalidatedEvents.has("causal-record")).toBe(false);
    expect(state.invalidatedEvents.get("offline-record")).toBe("GRANT_REVOKED");
  });
});
