// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { AppointmentDraft, Visit } from "../data";
import type { CaseActorRole, CaseEvent, CaseEventInput, CaseView } from "./types";

const DEFAULT_DIAGNOSIS = "Ожидает первичного приема";
const DEFAULT_RECOMMENDATION = "Дождитесь отклика врача или выберите специалиста из списка.";

function createId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function createVisitId() {
  return Date.now();
}

export function createOwnerRequestEvent(
  appointment: AppointmentDraft,
  options: {
    actorId: string;
    caseId?: string;
    createdAt?: string;
    eventId?: string;
    visitId?: number;
  },
): CaseEvent {
  const visitId = options.visitId ?? createVisitId();
  const caseId = options.caseId ?? `case-${visitId}`;
  const createdAt = options.createdAt ?? new Date().toISOString();

  return {
    id: options.eventId ?? createId("event"),
    caseId,
    actorId: options.actorId,
    actorRole: "owner",
    createdAt,
    type: "owner.request.created",
    payload: {
      visitId,
      appointment: { ...appointment },
    },
  };
}

export function createCaseEvent(
  caseId: string,
  input: CaseEventInput,
  defaults: { actorId: string; actorRole?: CaseActorRole } = { actorId: "system", actorRole: "system" },
): CaseEvent {
  return {
    id: input.id ?? createId("event"),
    caseId,
    actorId: input.actorId ?? defaults.actorId,
    actorRole: input.actorRole ?? defaults.actorRole ?? "system",
    createdAt: input.createdAt ?? new Date().toISOString(),
    type: input.type,
    payload: { ...input.payload },
  } as CaseEvent;
}

export function visitToCaseView(visit: Visit): CaseView {
  const createdAt = new Date(0).toISOString();
  return {
    ...visit,
    caseId: `seed-${visit.id}`,
    notes: [],
    updatedAt: createdAt,
    events: [],
  };
}

export function caseViewToVisit(view: CaseView): Visit {
  return {
    id: view.id,
    title: view.title,
    complaint: view.complaint,
    doctor: view.doctor,
    role: view.role,
    pet: view.pet,
    date: view.date,
    tag: view.tag,
    diagnosis: view.diagnosis,
    recommendation: view.recommendation,
  };
}

export function sortCaseEvents(events: CaseEvent[]) {
  const unique = new Map<string, CaseEvent>();

  for (const event of events) {
    if (!unique.has(event.id)) {
      unique.set(event.id, event);
    }
  }

  return [...unique.values()].sort((left, right) => {
    const created = left.createdAt.localeCompare(right.createdAt);
    if (created !== 0) return created;
    return left.id.localeCompare(right.id);
  });
}

function ensureDraftView(caseId: string, event: CaseEvent): CaseView {
  return {
    id: createVisitId(),
    caseId,
    title: `Заявка ${caseId}`,
    complaint: "",
    doctor: "Врач не выбран",
    role: "Откликнувшиеся врачи",
    pet: "Питомец не выбран",
    date: "",
    tag: "Планово",
    diagnosis: DEFAULT_DIAGNOSIS,
    recommendation: DEFAULT_RECOMMENDATION,
    notes: [],
    updatedAt: event.createdAt,
    events: [],
  };
}

export function reduceCaseEvents(events: CaseEvent[]): CaseView[] {
  const grouped = new Map<string, CaseEvent[]>();

  for (const event of sortCaseEvents(events)) {
    grouped.set(event.caseId, [...(grouped.get(event.caseId) ?? []), event]);
  }

  return [...grouped.entries()]
    .map(([caseId, caseEvents]) => reduceSingleCase(caseId, caseEvents))
    .filter((view): view is CaseView => view !== null)
    .sort((left, right) => {
      const updated = right.updatedAt.localeCompare(left.updatedAt);
      if (updated !== 0) return updated;
      return right.id - left.id;
    });
}

export function reduceSingleCase(caseId: string, events: CaseEvent[]): CaseView | null {
  const orderedEvents = sortCaseEvents(events.filter((event) => event.caseId === caseId));
  if (orderedEvents.length === 0) return null;

  let view: CaseView | null = null;

  for (const event of orderedEvents) {
    if (event.type === "owner.request.created") {
      const { appointment, visitId } = event.payload;
      view = {
        id: visitId,
        caseId,
        title: `Заявка #${visitId}`,
        complaint: appointment.reason,
        doctor: appointment.doctor,
        role: "Откликнувшиеся врачи",
        pet: appointment.pet,
        date: appointment.date,
        tag: appointment.urgency,
        diagnosis: DEFAULT_DIAGNOSIS,
        recommendation: DEFAULT_RECOMMENDATION,
        notes: [],
        updatedAt: event.createdAt,
        events: [],
      };
    }

    view ??= ensureDraftView(caseId, event);

    if (event.type === "vet.note.added") {
      view.notes = [...view.notes, event.payload.note];
    }

    if (event.type === "vet.diagnosis.updated") {
      view.diagnosis = event.payload.diagnosis;
    }

    if (event.type === "vet.recommendation.updated") {
      view.recommendation = event.payload.recommendation;
    }

    view.updatedAt = event.createdAt;
    view.events = [...view.events, event];
  }

  return view;
}
