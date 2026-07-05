// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { defaultAppointment } from "../src/data";
import { createCaseEvent, createOwnerRequestEvent, reduceCaseEvents } from "../src/cases/events";
import { createComplaintRecordFromTemplate } from "../src/dapp/templates";
import { seedComplaintTemplates } from "../src/dapp/seeds";

describe("case event reducer", () => {
  it("reduces owner and vet events into a stable visit view", () => {
    const created = createOwnerRequestEvent(defaultAppointment, {
      actorId: "owner-1",
      caseId: "case-1",
      eventId: "event-1",
      visitId: 9001,
      createdAt: "2026-06-24T10:00:00.000Z",
    });
    const note = createCaseEvent("case-1", {
      id: "event-2",
      type: "vet.note.added",
      payload: { note: "Осмотреть лапу в динамике." },
      actorId: "vet-1",
      actorRole: "vet",
      createdAt: "2026-06-24T10:02:00.000Z",
    });
    const diagnosis = createCaseEvent("case-1", {
      id: "event-3",
      type: "vet.diagnosis.updated",
      payload: { diagnosis: "Ушиб мягких тканей" },
      actorId: "vet-1",
      actorRole: "vet",
      createdAt: "2026-06-24T10:03:00.000Z",
    });
    const recommendation = createCaseEvent("case-1", {
      id: "event-4",
      type: "vet.recommendation.updated",
      payload: { recommendation: "Повторный осмотр через 3 дня." },
      actorId: "vet-1",
      actorRole: "vet",
      createdAt: "2026-06-24T10:04:00.000Z",
    });

    const [view] = reduceCaseEvents([recommendation, note, created, diagnosis]);

    expect(view).toMatchObject({
      id: 9001,
      caseId: "case-1",
      title: "Заявка #9001",
      complaint: defaultAppointment.reason,
      diagnosis: "Ушиб мягких тканей",
      recommendation: "Повторный осмотр через 3 дня.",
    });
    expect(view.notes).toEqual(["Осмотреть лапу в динамике."]);
    expect(view.events.map((event) => event.id)).toEqual(["event-1", "event-2", "event-3", "event-4"]);
  });

  it("deduplicates repeated append-only events by id", () => {
    const created = createOwnerRequestEvent(defaultAppointment, {
      actorId: "owner-1",
      caseId: "case-duplicate",
      eventId: "event-1",
      visitId: 9002,
      createdAt: "2026-06-24T10:00:00.000Z",
    });
    const note = createCaseEvent("case-duplicate", {
      id: "event-note",
      type: "vet.note.added",
      payload: { note: "Первичная заметка." },
      createdAt: "2026-06-24T10:01:00.000Z",
    });

    const [view] = reduceCaseEvents([created, note, note]);

    expect(view.notes).toEqual(["Первичная заметка."]);
    expect(view.events.map((event) => event.id)).toEqual(["event-1", "event-note"]);
  });

  it("keeps complaint template records on owner request events", () => {
    const complaintRecord = createComplaintRecordFromTemplate(
      seedComplaintTemplates[0],
      {
        pet: defaultAppointment.pet,
        urgency: defaultAppointment.urgency,
        date: defaultAppointment.date,
        time: defaultAppointment.time,
        selectedOptionIds: ["problem", "support", "limp"],
        freeText: defaultAppointment.reason,
        details: defaultAppointment.details,
      },
      { id: "complaint-case", now: new Date("2026-06-24T10:00:00.000Z") },
    );
    const event = createOwnerRequestEvent(
      { ...defaultAppointment, reason: complaintRecord.selectedOptionLabels.join(" / ") },
      {
        actorId: "owner-1",
        caseId: "case-complaint",
        eventId: "event-complaint",
        visitId: 9003,
        complaintRecord,
        createdAt: "2026-06-24T10:00:00.000Z",
      },
    );

    const [view] = reduceCaseEvents([event]);

    expect(view.complaint).toBe("Есть проблемы / С опороспособностью / Хромота");
    expect(view.events[0].payload).toMatchObject({ complaintRecord: { id: "complaint-case" } });
  });
});
