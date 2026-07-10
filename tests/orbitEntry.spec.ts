import { describe, expect, it } from "vitest";
import { describeOrbitEntryShape, extractSignedEvent, type SignedEvent } from "@klinok/protocol";

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
});
