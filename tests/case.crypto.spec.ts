// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { defaultAppointment } from "../src/data";
import {
  createParticipantKeyPair,
  decryptCaseEventRecord,
  encryptCaseEvent,
  generateCaseKey,
  stableSerialize,
} from "../src/cases/crypto";
import { createOwnerRequestEvent } from "../src/cases/events";

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
});
