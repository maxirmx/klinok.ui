// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { defaultAppointment } from "../src/data";
import {
  createParticipantKeyPair,
  decryptCaseEventRecord,
  decryptReplicatedEventRecord,
  encryptCaseEvent,
  encryptReplicatedEvent,
  generateCaseKey,
  stableSerialize,
} from "../src/cases/crypto";
import { createOwnerRequestEvent } from "../src/cases/events";
import { createDappEvent } from "../src/dapp/repository";
import { seedDrugRecords } from "../src/dapp/seeds";

describe("case encryption", () => {
  it("roundtrips encrypted case events for invited participants only", async () => {
    const [owner, vet, outsider] = await Promise.all([
      createParticipantKeyPair("owner"),
      createParticipantKeyPair("vet"),
      createParticipantKeyPair("outsider"),
    ]);
    const caseKey = await generateCaseKey();
    const event = createOwnerRequestEvent(defaultAppointment, {
      actorId: "owner",
      caseId: "case-encrypted",
      eventId: "event-encrypted",
      visitId: 9100,
      createdAt: "2026-06-24T10:00:00.000Z",
    });

    const record = await encryptCaseEvent(event, caseKey, [owner, vet]);

    expect(record.cipher.text).not.toContain(defaultAppointment.reason);
    await expect(decryptCaseEventRecord(record, owner)).resolves.toEqual(event);
    await expect(decryptCaseEventRecord(record, vet)).resolves.toEqual(event);
    await expect(decryptCaseEventRecord(record, outsider)).rejects.toThrow("No case key envelope");
  });

  it("serializes equivalent event payloads in stable key order", () => {
    const left = stableSerialize({ b: 2, a: { d: 4, c: 3 } });
    const right = stableSerialize({ a: { c: 3, d: 4 }, b: 2 });

    expect(left).toBe(right);
    expect(left).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("roundtrips generic replicated dApp events", async () => {
    const [owner, vet] = await Promise.all([
      createParticipantKeyPair("owner"),
      createParticipantKeyPair("vet"),
    ]);
    const eventKey = await generateCaseKey();
    const event = createDappEvent({
      id: "dapp-event-encrypted",
      type: "drug.record.saved",
      payload: { record: seedDrugRecords[0] },
      actorId: "owner",
      createdAt: "2026-06-24T11:00:00.000Z",
    });

    const record = await encryptReplicatedEvent(event, eventKey, [owner, vet]);

    expect(record.schemaVersion).toBe(2);
    expect(record.eventType).toBe("drug.record.saved");
    expect(record.cipher.text).not.toContain(seedDrugRecords[0].activeSubstanceRu);
    await expect(decryptReplicatedEventRecord(record, owner)).resolves.toEqual(event);
    await expect(decryptReplicatedEventRecord(record, vet)).resolves.toEqual(event);
    await expect(decryptCaseEventRecord(record, owner)).rejects.toThrow("is not a case event");
  });
});
