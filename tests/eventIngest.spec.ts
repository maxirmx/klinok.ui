import { describe, expect, it } from "vitest";
import {
  createProtocolState,
  exportUserKeySet,
  generateUserKeySet,
  reduceSignedEvents,
  type ActiveRoleContext,
  type DeviceCertificate,
  type SignedEvent,
} from "@klinok/protocol";
import { EventIngestService, handleEventIngestRequest } from "../p2p-node/src/eventIngest";
import { ControlRepository } from "../src/repositories/controlRepository";
import { MemoryEventTransport } from "../src/repositories/eventTransport";

async function generatedEvents(): Promise<SignedEvent[]> {
  const keys = await generateUserKeySet();
  const exported = await exportUserKeySet(keys);
  const context: ActiveRoleContext = {
    accountId: "owner-account",
    deviceId: "owner-device",
    orbitIdentityId: "owner-identity",
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
  return transport.list("control");
}

function service() {
  const persisted: SignedEvent[] = [];
  const ingest = new EventIngestService({
    state: createProtocolState("bootstrap-administrator"),
    databases: {
      control: { async add(event) { persisted.push(event); } },
      medical: { async add(event) { persisted.push(event); } },
    },
    verification: { requireTrustedAttestation: false },
  });
  return { ingest, persisted };
}

describe("trusted-node event ingestion", () => {
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
