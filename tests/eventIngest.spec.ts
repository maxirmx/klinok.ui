// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import {
  createProtocolState,
  deviceProjectionKey,
  exportUserKeySet,
  generateUserKeySet,
  reduceSignedEvents,
  signEvent,
  type ActiveRoleContext,
  type DeviceCertificate,
  type SignedEvent,
} from "@klinok/protocol";
import { EventIngestService, handleEventIngestRequest } from "../p2p-node/src/eventIngest";
import { ControlRepository } from "../src/repositories/controlRepository";
import { MemoryEventTransport } from "../src/repositories/eventTransport";

async function generatedAccount(accountId = "owner-account", deviceId = "owner-device") {
  const keys = await generateUserKeySet();
  const exported = await exportUserKeySet(keys);
  const context: ActiveRoleContext = {
    accountId,
    deviceId,
    orbitIdentityId: `klinok-device-${deviceId}`,
    role: "owner",
    roleProofId: "setup-owner",
    userKeyVersion: 1,
  };
  const certificate: DeviceCertificate = {
    deviceId: context.deviceId,
    accountId: context.accountId,
    orbitIdentityId: context.orbitIdentityId,
    status: "active",
    userKeyVersion: 1,
    signingPublicKey: exported.signingPublicKey,
    encryptionPublicKey: exported.encryptionPublicKey,
    issuedAt: "2026-07-15T10:00:00.000Z",
    attestation: "test-attestation",
  };
  const transport = new MemoryEventTransport();
  await transport.initialize();
  const repository = new ControlRepository(transport, context, keys, certificate, "bootstrap-administrator");
  await repository.initialize({
    profile: { firstName: "Ольга", lastName: "Владелец" },
    requestedRoles: ["owner"],
    ageConfirmed: true,
    personalDataConsentVersion: "1",
    userAgreementVersion: "1",
  });
  return { events: await transport.list("control"), keys, certificate };
}

async function generatedEvents(accountId = "owner-account", deviceId = "owner-device"): Promise<SignedEvent[]> {
  return (await generatedAccount(accountId, deviceId)).events;
}

function service() {
  const persisted: SignedEvent[] = [];
  const state = createProtocolState("bootstrap-administrator");
  const ingest = new EventIngestService({
    state,
    databases: {
      control: { async add(event) { persisted.push(event); } },
      medical: { async add(event) { persisted.push(event); } },
    },
    verification: { requireTrustedAttestation: false },
  });
  return { ingest, persisted, state };
}

describe("trusted-node event ingestion", () => {
  it("persists independent certificates for accounts sharing an installation ID", async () => {
    const sharedDeviceId = "shared-browser-device";
    const first = await generatedEvents("first-account", sharedDeviceId);
    const second = await generatedEvents("second-account", sharedDeviceId);
    const { ingest, persisted } = service();

    const response = await ingest.ingest([...first, ...second]);

    expect(response.results.every((result) => result.status === "persisted")).toBe(true);
    expect(persisted.filter((event) => event.eventType === "device.attested")).toEqual(expect.arrayContaining([
      expect.objectContaining({ aggregateId: "first-account", resourceId: sharedDeviceId }),
      expect.objectContaining({ aggregateId: "second-account", resourceId: sharedDeviceId }),
    ]));
  });

  it("rejects cross-account device projection poisoning before persistence or state mutation", async () => {
    const sharedDeviceId = "shared-browser-device";
    const first = await generatedAccount("first-account", sharedDeviceId);
    const second = await generatedAccount("second-account", sharedDeviceId);
    const { ingest, persisted, state } = service();
    const setup = await ingest.ingest([...first.events, ...second.events]);
    expect(setup.results.every((result) => result.status === "persisted")).toBe(true);
    const persistedCount = persisted.length;

    const source = first.events.find((event) => event.eventType === "profile.updated")!;
    const { signature: _signature, ...unsignedSource } = source;
    void _signature;
    const poisonedRotation = await signEvent({
      ...unsignedSource,
      eventId: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
      eventType: "device.rotated",
      aggregateId: first.certificate.accountId,
      resourceId: sharedDeviceId,
      parents: [],
      metadata: { accountId: first.certificate.accountId, certificate: { ...second.certificate, userKeyVersion: 2 } },
    }, first.keys.signingPrivateKey);
    const maliciousRevocation = await signEvent({
      ...unsignedSource,
      eventId: crypto.randomUUID(),
      operationId: crypto.randomUUID(),
      eventType: "device.revoked",
      aggregateId: first.certificate.accountId,
      resourceId: sharedDeviceId,
      parents: [],
      metadata: { accountId: second.certificate.accountId, deviceId: sharedDeviceId },
    }, first.keys.signingPrivateKey);

    const response = await ingest.ingest([poisonedRotation, maliciousRevocation]);

    expect(response.results).toEqual([
      expect.objectContaining({ status: "rejected", code: "DEVICE_BINDING_INVALID" }),
      expect.objectContaining({ status: "rejected", code: "DEVICE_BINDING_INVALID" }),
    ]);
    expect(persisted).toHaveLength(persistedCount);
    expect(state.devices.get(deviceProjectionKey(second.certificate.accountId, sharedDeviceId))).toEqual(second.certificate);
  });

  it("reduces reversed replicated events without recording temporary dependency conflicts", async () => {
    const events = await generatedEvents();
    const projection = await reduceSignedEvents(
      [...events].reverse(),
      createProtocolState("bootstrap-administrator"),
      { requireTrustedAttestation: false },
    );
    expect(projection.accepted).toHaveLength(events.length);
    expect(projection.conflicts).toEqual([]);
  });

  it("records permanent verification failures while continuing causal replay", async () => {
    const events = await generatedEvents();
    const invalid = {
      ...events[0]!,
      eventId: crypto.randomUUID(),
      database: "medical" as const,
    };
    const projection = await reduceSignedEvents(
      [invalid, ...[...events].reverse()],
      createProtocolState("bootstrap-administrator"),
      { requireTrustedAttestation: false },
    );

    expect(projection.accepted).toHaveLength(events.length);
    expect(projection.conflicts).toEqual([
      expect.objectContaining({ event: invalid, result: expect.objectContaining({ code: "DATABASE_MISMATCH" }) }),
    ]);
  });

  it("persists a reversed dependency batch and acknowledges duplicates idempotently", async () => {
    const events = await generatedEvents();
    const { ingest, persisted } = service();
    const first = await ingest.ingest([...events].reverse());
    expect(first.results).toHaveLength(events.length);
    expect(first.results.every((result) => result.status === "persisted")).toBe(true);
    expect(persisted).toHaveLength(events.length);

    const second = await ingest.ingest(events);
    expect(second.results.every((result) => result.status === "duplicate")).toBe(true);
    expect(persisted).toHaveLength(events.length);
  });

  it("rejects malformed, cross-database, and invalidly signed events", async () => {
    const events = await generatedEvents();
    const { ingest } = service();
    await ingest.ingest(events);
    const source = events.find((event) => event.eventType === "profile.updated")!;
    const crossDatabase = { ...source, eventId: crypto.randomUUID(), database: "medical" as const };
    const invalidSignature = {
      ...source,
      eventId: crypto.randomUUID(),
      signature: { ...source.signature, value: "invalid" },
    };
    const response = await ingest.ingest([null, crossDatabase, invalidSignature]);
    expect(response.results.map((result) => result.code)).toEqual([
      "EVENT_SCHEMA_INVALID",
      "DATABASE_MISMATCH",
      "SIGNATURE_INVALID",
    ]);
  });

  it("defers a trusted-node write failure so the browser can retry it", async () => {
    const firstEvent = (await generatedEvents())[0]!;
    const ingest = new EventIngestService({
      state: createProtocolState("bootstrap-administrator"),
      databases: {
        control: { async add() { throw new Error("disk unavailable"); } },
        medical: { async add() { throw new Error("disk unavailable"); } },
      },
      verification: { requireTrustedAttestation: false },
    });
    expect(await ingest.ingest([firstEvent])).toEqual({
      results: [expect.objectContaining({ eventId: firstEvent.eventId, status: "deferred", code: "EVENT_WRITE_FAILED" })],
    });
  });

  it("defers missing authorization state but rejects permanent verification failures", async () => {
    const events = await generatedEvents();
    const dependent = events.find((event) => event.eventType === "profile.updated")!;
    const invalid = { ...dependent, eventId: crypto.randomUUID(), database: "medical" as const };
    const { ingest } = service();
    const response = await ingest.ingest([dependent, invalid]);

    expect(response.results).toEqual([
      expect.objectContaining({ eventId: dependent.eventId, status: "deferred", code: "EVENT_PARENT_MISSING" }),
      expect.objectContaining({ eventId: invalid.eventId, status: "rejected", code: "DATABASE_MISMATCH" }),
    ]);
  });

  it("serves health and batch ingestion through the HTTP request handler", async () => {
    const { ingest } = service();
    expect(await handleEventIngestRequest(ingest, { method: "GET", url: "/healthz" })).toEqual({ status: 200, body: { status: "ok" } });
    const response = await handleEventIngestRequest(ingest, {
      method: "POST",
      url: "/events",
      body: { events: await generatedEvents() },
    });
    expect(response.status).toBe(200);
    expect((response.body as { results: unknown[] }).results.length).toBeGreaterThan(0);
  });
});
