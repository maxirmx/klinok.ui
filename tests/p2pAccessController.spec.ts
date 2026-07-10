import { describe, expect, it, vi } from "vitest";
import { ACCESS_CONTROLLER_TYPES, type SignedEvent } from "@klinok/protocol";
import { createDynamicAccessController } from "../p2p-node/src/accessController";

describe("trusted node access controllers", () => {
  it("uses different OrbitDB access-controller types for control and medical databases", () => {
    const control = createDynamicAccessController({ database: "control" });
    const medical = createDynamicAccessController({ database: "medical" });

    expect(control.type).toBe(ACCESS_CONTROLLER_TYPES.control);
    expect(medical.type).toBe(ACCESS_CONTROLLER_TYPES.medical);
    expect(control.type).not.toBe(medical.type);
  });

  it("reports invalid OrbitDB payloads separately from identity mismatches", async () => {
    const onRejected = vi.fn();
    const factory = createDynamicAccessController({ database: "control", onRejected });
    const controller = await factory();

    await expect(controller.canAppend({ identity: "identity-hash", payload: { value: { op: "ADD", value: { invalid: true } } } })).resolves.toBe(false);
    expect(onRejected).toHaveBeenCalledWith(undefined, "EVENT_PAYLOAD_INVALID", expect.objectContaining({
      entryShape: "payload.value>value>object",
    }));
  });

  it("unwraps OrbitDB Events operations before protocol authorization", async () => {
    const onRejected = vi.fn();
    const event = {
      schemaVersion: 1,
      eventId: "event-1",
      eventType: "profile.updated",
      database: "control",
      orbitIdentityId: "event-orbit",
    } as SignedEvent;
    const factory = createDynamicAccessController({ database: "control", onRejected });
    const controller = await factory();

    await expect(controller.canAppend({ identity: "identity-hash", payload: { value: { op: "ADD", key: null, value: event } } })).resolves.toBe(false);
    expect(onRejected).toHaveBeenCalledWith(event, "EVENT_SCHEMA_INVALID", expect.objectContaining({
      entryShape: "payload.value>value>signed-event",
      eventOrbitIdentity: "event-orbit",
    }));
  });

  it("defers causal authorization when OrbitDB replays a child before its parent", async () => {
    const onRejected = vi.fn();
    const onDeferred = vi.fn();
    const event = {
      schemaVersion: 1,
      eventId: "child-event",
      eventType: "profile.updated",
      database: "control",
      aggregateId: "account-1",
      resourceId: "account-1",
      operationId: "operation-1",
      actorAccountId: "account-1",
      actorDeviceId: "device-1",
      orbitIdentityId: "klinok-device-1",
      activeRole: "owner",
      parents: ["parent-event"],
      proofIds: [],
      keyVersion: 1,
      createdAt: "2026-07-11T00:00:00.000Z",
      metadata: {},
      keyring: [],
      payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
      signature: { algorithm: "ECDSA-P256-SHA256", value: "signature" },
    } satisfies SignedEvent;
    const factory = createDynamicAccessController({ database: "control", onRejected, onDeferred });
    const controller = await factory();

    await expect(controller.canAppend({ identity: "identity-hash", payload: { value: { op: "ADD", value: event } } })).resolves.toBe(true);
    expect(onDeferred).toHaveBeenCalledWith(event, "EVENT_PARENT_MISSING", expect.objectContaining({
      eventOrbitIdentity: "klinok-device-1",
    }));
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("defers authorization when an event is replayed before its device certificate", async () => {
    const onDeferred = vi.fn();
    const event = {
      schemaVersion: 1,
      eventId: "event-before-certificate",
      eventType: "profile.updated",
      database: "control",
      aggregateId: "account-1",
      resourceId: "account-1",
      operationId: "operation-2",
      actorAccountId: "account-1",
      actorDeviceId: "device-1",
      orbitIdentityId: "klinok-device-1",
      activeRole: "owner",
      parents: [],
      proofIds: [],
      keyVersion: 1,
      createdAt: "2026-07-11T00:00:01.000Z",
      metadata: {},
      keyring: [],
      payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
      signature: { algorithm: "ECDSA-P256-SHA256", value: "signature" },
    } satisfies SignedEvent;
    const controller = await createDynamicAccessController({ database: "control", onDeferred })();

    await expect(controller.canAppend({ identity: "identity-hash", payload: { value: { op: "ADD", value: event } } })).resolves.toBe(true);
    expect(onDeferred).toHaveBeenCalledWith(event, "DEVICE_UNKNOWN", expect.any(Object));
  });
});
