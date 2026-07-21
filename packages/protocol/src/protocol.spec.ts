import { describe, expect, it } from "vitest";
import {
  chooseConcurrentRoleStatus,
  generateDataKey,
  isGrantEffectivelyActive,
  generateUserKeySet,
  exportUserKeySet,
  createProtocolState,
  deviceProjectionKey,
  roleProjectionKey,
  shouldDeferEventVerification,
  applyAcceptedEvent,
  reconcileEffectiveEvents,
  reduceSignedEvents,
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
  it("builds collision-safe account-scoped device projection keys", () => {
    expect(deviceProjectionKey("account:a", "device")).not.toBe(deviceProjectionKey("account", "a:device"));
    expect(deviceProjectionKey("account", "device")).toBe(deviceProjectionKey("account", "device"));
  });

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

  it("defers only verification failures that can change as protocol state arrives", () => {
    expect(shouldDeferEventVerification({ accepted: false, code: "EVENT_PARENT_MISSING" })).toBe(true);
    expect(shouldDeferEventVerification({ accepted: false, code: "DEVICE_UNKNOWN" })).toBe(true);
    expect(shouldDeferEventVerification({ accepted: false, code: "SIGNATURE_INVALID" })).toBe(false);
    expect(shouldDeferEventVerification({ accepted: false, code: "DATABASE_MISMATCH" })).toBe(false);
    expect(shouldDeferEventVerification({ accepted: false, code: "EVENT_TYPE_UNSUPPORTED" })).toBe(false);
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
    state.devices.set(deviceProjectionKey(certificate.accountId, certificate.deviceId), certificate);
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
    const certificate = state.devices.get(deviceProjectionKey("account-1", "device-1"))!;
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

  function base64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function attestCertificate(
    certificate: Omit<DeviceCertificate, "attestation">,
    privateKey: CryptoKey,
  ): Promise<DeviceCertificate> {
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      new TextEncoder().encode(stableSerialize(certificate)),
    );
    return { ...certificate, attestation: base64Url(new Uint8Array(signature)) };
  }

  it("rejects cross-account device attestation, rotation, and revocation without changing the victim projection", async () => {
    const { keys, state } = await actorFixture();
    const victimKeys = await generateUserKeySet();
    const victimExported = await exportUserKeySet(victimKeys);
    const victim: DeviceCertificate = {
      deviceId: "device-1", accountId: "account-2", orbitIdentityId: "victim-orbit", status: "active", userKeyVersion: 1,
      signingPublicKey: victimExported.signingPublicKey, encryptionPublicKey: victimExported.encryptionPublicKey,
      issuedAt: "2026-07-10T10:00:00.000Z", attestation: "victim-attestation",
    };
    state.devices.set(deviceProjectionKey(victim.accountId, victim.deviceId), victim);

    const poisonedAttestation = await signedFor(state, keys, {
      eventType: "device.attested", aggregateId: "account-1", resourceId: "device-1",
      metadata: { certificate: victim },
    });
    const poisonedRotation = await signedFor(state, keys, {
      eventType: "device.rotated", aggregateId: "account-1", resourceId: "device-1",
      metadata: { accountId: "account-1", certificate: { ...victim, userKeyVersion: 2 } },
    });
    const maliciousRevocation = await signedFor(state, keys, {
      eventType: "device.revoked", aggregateId: "account-1", resourceId: "device-1",
      metadata: { accountId: "account-2", deviceId: "device-1" },
    });
    const projection = await reduceSignedEvents([poisonedAttestation, poisonedRotation, maliciousRevocation], state);

    expect(projection.accepted).toEqual([]);
    expect(projection.conflicts.map((conflict) => conflict.result.code)).toEqual([
      "DEVICE_BINDING_INVALID",
      "DEVICE_BINDING_INVALID",
      "DEVICE_BINDING_INVALID",
    ]);
    expect(state.devices.get(deviceProjectionKey(victim.accountId, victim.deviceId))).toEqual(victim);
  });

  it("rejects mismatched and non-sequential device rotations", async () => {
    const { keys, certificate, state } = await actorFixture();
    const nextKeys = await generateUserKeySet(2);
    const nextExported = await exportUserKeySet(nextKeys);
    const nextCertificate = {
      ...certificate,
      signingPublicKey: nextExported.signingPublicKey,
      encryptionPublicKey: nextExported.encryptionPublicKey,
      userKeyVersion: 2,
      issuedAt: "2026-07-10T10:02:00.000Z",
    };
    const invalidInputs: Array<Partial<Omit<SignedEvent, "signature">>> = [
      { aggregateId: "account-2", resourceId: certificate.deviceId, metadata: { certificate: nextCertificate } },
      { resourceId: "device-2", metadata: { certificate: nextCertificate } },
      { metadata: { certificate: { ...nextCertificate, orbitIdentityId: "other-orbit" } } },
      { metadata: { certificate: { ...nextCertificate, userKeyVersion: 3 } } },
    ];

    for (const input of invalidInputs) {
      const event = await signedFor(state, keys, {
        eventType: "device.rotated", aggregateId: certificate.accountId, resourceId: certificate.deviceId,
        ...input,
      });
      await expect(verifySignedEvent(event, state)).resolves.toMatchObject({ accepted: false, code: "DEVICE_BINDING_INVALID" });
    }
  });

  it("requires a valid attestation for rotation and accepts the old-key-to-new-key transition", async () => {
    const { keys, certificate, state } = await actorFixture();
    const authKeys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const authAttestationPublicKey = await crypto.subtle.exportKey("jwk", authKeys.publicKey);
    const nextKeys = await generateUserKeySet(2);
    const nextExported = await exportUserKeySet(nextKeys);
    const { attestation: _attestation, ...currentCertificate } = certificate;
    void _attestation;
    const unsignedCertificate: Omit<DeviceCertificate, "attestation"> = {
      ...currentCertificate,
      signingPublicKey: nextExported.signingPublicKey,
      encryptionPublicKey: nextExported.encryptionPublicKey,
      userKeyVersion: 2,
      issuedAt: "2026-07-10T10:02:00.000Z",
    };
    const invalidRotation = await signedFor(state, keys, {
      eventType: "device.rotated", aggregateId: certificate.accountId, resourceId: certificate.deviceId,
      metadata: { certificate: { ...unsignedCertificate, attestation: "invalid" } },
    });
    await expect(verifySignedEvent(invalidRotation, state, { authAttestationPublicKey })).resolves.toMatchObject({
      accepted: false,
      code: "DEVICE_ATTESTATION_INVALID",
    });

    const nextCertificate = await attestCertificate(unsignedCertificate, authKeys.privateKey);
    const validRotation = await signedFor(state, keys, {
      eventType: "device.rotated", aggregateId: certificate.accountId, resourceId: certificate.deviceId,
      metadata: { accountId: certificate.accountId, certificate: nextCertificate },
    });
    await expect(verifySignedEvent(validRotation, state, { authAttestationPublicKey })).resolves.toMatchObject({ accepted: true });
    applyAcceptedEvent(validRotation, state);
    expect(state.devices.get(deviceProjectionKey(certificate.accountId, certificate.deviceId))).toEqual(nextCertificate);

    const nextEvent = await signedFor(state, nextKeys, { keyVersion: 2 });
    await expect(verifySignedEvent(nextEvent, state)).resolves.toMatchObject({ accepted: true });
  });

  it("rejects attestations whose envelope does not match their certificate", async () => {
    const keys = await generateUserKeySet();
    const exported = await exportUserKeySet(keys);
    const certificate: DeviceCertificate = {
      deviceId: "device-1", accountId: "account-1", orbitIdentityId: "orbit-1", status: "active", userKeyVersion: 1,
      signingPublicKey: exported.signingPublicKey, encryptionPublicKey: exported.encryptionPublicKey,
      issuedAt: "2026-07-10T10:00:00.000Z", attestation: "test-attestation",
    };
    const event = await signEvent({
      schemaVersion: 1, database: "control", eventId: crypto.randomUUID(), operationId: crypto.randomUUID(),
      eventType: "device.attested", aggregateId: "account-2", resourceId: certificate.deviceId,
      createdAt: certificate.issuedAt, actorAccountId: certificate.accountId, actorDeviceId: certificate.deviceId,
      orbitIdentityId: certificate.orbitIdentityId, activeRole: "owner", parents: [], keyVersion: 1,
      proofIds: [], metadata: { certificate }, keyring: [],
      payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
    }, keys.signingPrivateKey);

    await expect(verifySignedEvent(event, createProtocolState(), { requireTrustedAttestation: false })).resolves.toMatchObject({
      accepted: false,
      code: "DEVICE_BINDING_INVALID",
    });
  });

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

  it("allows one pending pet-access request and lets the requesting Doctor cancel it", async () => {
    const { keys, state } = await actorFixture("doctor");
    state.petOwners.set("pet-1", "owner-1");
    const request = {
      requestId: "request-1",
      petId: "pet-1",
      ownerAccountId: "owner-1",
      requesterAccountId: "account-1",
      status: "pending" as const,
      requestedAt: "2026-07-10T10:01:00.000Z",
    };
    const requested = await signedFor(state, keys, {
      database: "medical",
      eventType: "grant.requested",
      aggregateId: "pet-1",
      resourceId: request.requestId,
      activeRole: "doctor",
      metadata: { petId: "pet-1", request },
    });
    await expect(verifySignedEvent(requested, state)).resolves.toMatchObject({ accepted: true });
    applyAcceptedEvent(requested, state);
    expect(state.grantRequests.get(request.requestId)?.request.status).toBe("pending");

    const duplicateRequest = { ...request, requestId: "request-2" };
    const duplicate = await signedFor(state, keys, {
      database: "medical",
      eventType: "grant.requested",
      aggregateId: "pet-1",
      resourceId: duplicateRequest.requestId,
      activeRole: "doctor",
      metadata: { petId: "pet-1", request: duplicateRequest },
    });
    await expect(verifySignedEvent(duplicate, state)).resolves.toMatchObject({
      accepted: false,
      code: "PET_ACCESS_REQUEST_DUPLICATE",
    });

    const cancelled = await signedFor(state, keys, {
      database: "medical",
      eventType: "grant.request.cancelled",
      aggregateId: "pet-1",
      resourceId: request.requestId,
      activeRole: "doctor",
      parents: [requested.eventId],
      metadata: { petId: "pet-1", requestId: request.requestId },
    });
    await expect(verifySignedEvent(cancelled, state)).resolves.toMatchObject({ accepted: true });
    applyAcceptedEvent(cancelled, state);
    expect(state.grantRequests.get(request.requestId)?.request.status).toBe("cancelled");
  });

  it("lets only the pet Owner reject or approve a matching pending access request", async () => {
    const { keys, state } = await actorFixture("owner");
    state.petOwners.set("pet-1", "account-1");
    const request = {
      requestId: "request-1",
      petId: "pet-1",
      ownerAccountId: "account-1",
      requesterAccountId: "doctor-1",
      status: "pending" as const,
      requestedAt: "2026-07-10T10:01:00.000Z",
    };
    state.grantRequests.set(request.requestId, { request, eventId: "request-event" });
    state.knownEvents.add("request-event");

    const grant = {
      grantId: "grant-1",
      requestId: request.requestId,
      petId: "pet-1",
      grantorAccountId: "account-1",
      granteeAccountId: "doctor-1",
      actions: ["read", "write_unconfirmed"] as const,
      petKeyVersion: 1,
      status: "active" as const,
      createdAt: "2026-07-10T10:02:00.000Z",
    };
    const approved = await signedFor(state, keys, {
      database: "medical",
      eventType: "grant.created",
      aggregateId: "pet-1",
      resourceId: grant.grantId,
      activeRole: "owner",
      parents: ["request-event"],
      metadata: { petId: "pet-1", requestId: request.requestId, grant },
    });
    await expect(verifySignedEvent(approved, state)).resolves.toMatchObject({ accepted: true });
    applyAcceptedEvent(approved, state);
    expect(state.grantRequests.get(request.requestId)?.request.status).toBe("approved");

    const rejectedRequest = { ...request, requestId: "request-2" };
    state.grantRequests.set(rejectedRequest.requestId, { request: rejectedRequest, eventId: "request-event-2" });
    state.knownEvents.add("request-event-2");
    const rejected = await signedFor(state, keys, {
      database: "medical",
      eventType: "grant.request.rejected",
      aggregateId: "pet-1",
      resourceId: rejectedRequest.requestId,
      activeRole: "owner",
      parents: ["request-event-2"],
      metadata: { petId: "pet-1", requestId: rejectedRequest.requestId },
    });
    await expect(verifySignedEvent(rejected, state)).resolves.toMatchObject({ accepted: true });
    applyAcceptedEvent(rejected, state);
    expect(state.grantRequests.get(rejectedRequest.requestId)?.request.status).toBe("rejected");
  });

  it("lets the pet Owner toggle future delegation without revoking existing child grants", async () => {
    const { keys, state } = await actorFixture("owner");
    state.petOwners.set("pet-1", "account-1");
    state.knownEvents.add("grant-event");
    state.grants.set("grant-1", {
      grantId: "grant-1",
      petId: "pet-1",
      grantorAccountId: "account-1",
      granteeAccountId: "doctor-1",
      actions: ["read", "write_unconfirmed", "delegate"],
      petKeyVersion: 1,
      status: "active",
      createdAt: "2026-07-10T10:00:00.000Z",
    });
    state.grants.set("child-grant", {
      grantId: "child-grant",
      petId: "pet-1",
      grantorAccountId: "doctor-1",
      granteeAccountId: "doctor-2",
      actions: ["read"],
      parentGrantId: "grant-1",
      petKeyVersion: 1,
      status: "active",
      createdAt: "2026-07-10T10:01:00.000Z",
    });

    const invalid = await signedFor(state, keys, {
      database: "medical",
      eventType: "grant.actions.updated",
      aggregateId: "pet-1",
      resourceId: "grant-1",
      activeRole: "owner",
      parents: ["grant-event"],
      metadata: { petId: "pet-1", grantId: "grant-1", actions: ["read", "write_unconfirmed", "delegate"] },
    });
    await expect(verifySignedEvent(invalid, state)).resolves.toMatchObject({
      accepted: false,
      code: "PET_GRANT_ACTIONS_UPDATE_INVALID",
    });

    const updated = await signedFor(state, keys, {
      database: "medical",
      eventType: "grant.actions.updated",
      aggregateId: "pet-1",
      resourceId: "grant-1",
      activeRole: "owner",
      parents: ["grant-event"],
      metadata: { petId: "pet-1", grantId: "grant-1", actions: ["read", "write_unconfirmed"] },
    });
    await expect(verifySignedEvent(updated, state)).resolves.toMatchObject({ accepted: true });
    applyAcceptedEvent(updated, state);

    expect(state.grants.get("grant-1")?.actions).toEqual(["read", "write_unconfirmed"]);
    expect(isGrantEffectivelyActive(state, state.grants.get("child-grant"))).toBe(true);

    const reenabled = await signedFor(state, keys, {
      database: "medical",
      eventType: "grant.actions.updated",
      aggregateId: "pet-1",
      resourceId: "grant-1",
      activeRole: "owner",
      parents: [updated.eventId],
      metadata: { petId: "pet-1", grantId: "grant-1", actions: ["read", "write_unconfirmed", "delegate"] },
    });
    await expect(verifySignedEvent(reenabled, state)).resolves.toMatchObject({ accepted: true });
    applyAcceptedEvent(reenabled, state);

    expect(state.grants.get("grant-1")?.actions).toEqual(["read", "write_unconfirmed", "delegate"]);
    expect(isGrantEffectivelyActive(state, state.grants.get("child-grant"))).toBe(true);
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

  it("allows an Administrator to restore a previously rejected advanced role", async () => {
    const { keys, state } = await actorFixture("administrator");
    state.knownEvents.add("rejected-event");
    state.roles.set(roleProjectionKey("doctor-account", "doctor"), {
      request: {
        requestId: "doctor-request",
        accountId: "doctor-account",
        role: "doctor",
        status: "rejected",
        profileRevision: 1,
        requestedAt: "2026-07-10T10:00:00.000Z",
      },
      eventId: "rejected-event",
      parents: [],
    });
    const restored = await signedFor(state, keys, {
      eventType: "role.restored",
      aggregateId: "doctor-account",
      resourceId: "doctor-request",
      activeRole: "administrator",
      parents: ["rejected-event"],
      metadata: {
        accountId: "doctor-account",
        requestId: "doctor-request",
        role: "doctor",
        status: "approved",
        profileRevision: 1,
      },
    });

    await expect(verifySignedEvent(restored, state)).resolves.toMatchObject({ accepted: true });
    applyAcceptedEvent(restored, state);
    expect(state.roles.get(roleProjectionKey("doctor-account", "doctor"))?.request.status).toBe("approved");
  });

  it("rejects deletion and every non-approved transition of the bootstrap Administrator", async () => {
    const { keys, state } = await actorFixture("administrator");
    state.knownEvents.add("bootstrap-role-event");
    state.roles.set(roleProjectionKey(state.bootstrapAccountId, "administrator"), {
      request: {
        requestId: "bootstrap-role",
        accountId: state.bootstrapAccountId,
        role: "administrator",
        status: "approved",
        profileRevision: 1,
        requestedAt: "2026-07-10T10:00:00.000Z",
      },
      eventId: "bootstrap-role-event",
      parents: [],
    });

    for (const status of ["not_requested", "pending", "rejected", "suspended", "revoked", "expired"] as const) {
      const transition = await signedFor(state, keys, {
        eventType: status === "not_requested" ? "role.cancelled" : `role.${status}`,
        aggregateId: state.bootstrapAccountId,
        resourceId: "bootstrap-role",
        activeRole: "administrator",
        parents: ["bootstrap-role-event"],
        metadata: {
          accountId: state.bootstrapAccountId,
          requestId: "bootstrap-role",
          role: "administrator",
          status,
          profileRevision: 1,
        },
      });
      await expect(verifySignedEvent(transition, state)).resolves.toMatchObject({
        accepted: false,
        code: "BOOTSTRAP_PROTECTED",
      });
    }

    const deletion = await signedFor(state, keys, {
      eventType: "account.deleted",
      aggregateId: state.bootstrapAccountId,
      resourceId: state.bootstrapAccountId,
      activeRole: "administrator",
    });
    await expect(verifySignedEvent(deletion, state)).resolves.toMatchObject({
      accepted: false,
      code: "BOOTSTRAP_PROTECTED",
    });
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

  it("lets the current Doctor relinquish access and causally rotate the pet key", async () => {
    const { keys, state } = await actorFixture("doctor");
    state.grants.set("grant-1", {
      grantId: "grant-1", petId: "pet-1", grantorAccountId: "owner-1", granteeAccountId: "account-1",
      actions: ["read", "write_unconfirmed"], petKeyVersion: 1, status: "active", createdAt: "2026-07-10T10:00:00.000Z",
    });
    const relinquishment = await signedFor(state, keys, {
      database: "medical",
      eventId: "grant-relinquished",
      eventType: "grant.relinquished",
      aggregateId: "pet-1",
      resourceId: "grant-1",
      activeRole: "doctor",
      proofIds: ["doctor-proof", "grant-1"],
      metadata: { petId: "pet-1", grantId: "grant-1", nextKeyVersion: 2 },
    });
    await expect(verifySignedEvent(relinquishment, state)).resolves.toMatchObject({ accepted: true });
    applyAcceptedEvent(relinquishment, state);
    expect(state.grants.get("grant-1")?.status).toBe("relinquished");

    const rotation = await signedFor(state, keys, {
      database: "medical",
      eventId: "pet-key-rotated",
      eventType: "pet.key.rotated",
      aggregateId: "pet-1",
      resourceId: "pet-1",
      activeRole: "doctor",
      parents: [relinquishment.eventId],
      proofIds: ["doctor-proof", "grant-1"],
      metadata: { petId: "pet-1", keyVersion: 2, relinquishedGrantId: "grant-1" },
    });
    await expect(verifySignedEvent(rotation, state)).resolves.toMatchObject({ accepted: true });

    const unlinked = await signedFor(state, keys, {
      database: "medical",
      eventId: "unlinked-rotation",
      eventType: "pet.key.rotated",
      aggregateId: "pet-1",
      resourceId: "pet-1",
      activeRole: "doctor",
      proofIds: ["doctor-proof", "grant-1"],
      metadata: { petId: "pet-1", keyVersion: 2, relinquishedGrantId: "grant-1" },
    });
    await expect(verifySignedEvent(unlinked, state)).resolves.toMatchObject({
      accepted: false,
      code: "GRANT_RELINQUISHMENT_FORBIDDEN",
    });
  });
});
