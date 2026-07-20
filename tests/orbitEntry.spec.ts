import { describe, expect, it } from "vitest";
import { describeOrbitEntryShape, extractSignedEvent, type SignedEvent } from "@klinok/protocol";
import { sizeBoundEventBatch } from "../src/repositories/orbitTransport";

const event = {
  schemaVersion: 1,
  eventId: "event-1",
  database: "control",
} as SignedEvent;

describe("OrbitDB entry decoding", () => {
  it("extracts application events from oplog and Events iterator wrappers", () => {
    const operation = { op: "ADD", key: null, value: event };

    expect(extractSignedEvent({ identity: "identity-hash", payload: { value: operation } })).toBe(event);
    expect(extractSignedEvent({ hash: "entry-hash", value: operation })).toBe(event);
    expect(describeOrbitEntryShape({ payload: { value: operation } })).toBe("payload.value>value>signed-event");
  });

  it("rejects malformed and cyclic wrappers without throwing", () => {
    const cyclic: { value?: unknown } = {};
    cyclic.value = cyclic;

    expect(extractSignedEvent({ payload: { value: { op: "ADD", value: { invalid: true } } } })).toBeNull();
    expect(extractSignedEvent(cyclic)).toBeNull();
    expect(describeOrbitEntryShape(cyclic)).toBe("value>cycle");
  });

  it("keeps parent-ordered outbox batches below the serialized byte limit", () => {
    const first = {
      ...event,
      eventId: "large-1",
      createdAt: "2026-07-17T10:00:00.000Z",
      parents: [],
      metadata: { photo: "a".repeat(480_000) },
    } as SignedEvent;
    const second = {
      ...first,
      eventId: "large-2",
      createdAt: "2026-07-17T10:00:01.000Z",
      parents: [first.eventId],
      metadata: { photo: "b".repeat(480_000) },
    } as SignedEvent;

    const batch = sizeBoundEventBatch([second, first], 900 * 1024);
    expect(batch.map((candidate) => candidate.eventId)).toEqual(["large-1"]);
    expect(new TextEncoder().encode(JSON.stringify({ events: batch })).byteLength).toBeLessThanOrEqual(900 * 1024);
  });
});
