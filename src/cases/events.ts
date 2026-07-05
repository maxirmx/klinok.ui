// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { AppointmentDraft, Visit } from "../data";
import type { ComplaintRecord } from "../dapp/types";
import type {
  CaseActorRole,
  CaseEvent,
  CaseEventInput,
  CaseView,
  ClinicalEntry,
  ClinicalSection,
  ClinicalSectionId,
  ClinicalSectionPayloadValue,
} from "./types";

const DEFAULT_DIAGNOSIS = "Ожидает первичного приема";
const DEFAULT_RECOMMENDATION = "Дождитесь отклика врача или выберите специалиста из списка.";

export const CLINICAL_SECTION_TITLES: Record<ClinicalSectionId, string> = {
  complaint: "Что случилось",
  habitus: "Общие данные / Габитус",
  therapeutic: "Терапевтический приём",
  diagnosis: "Диагноз",
  vaccination: "Вакцинация / чипирование",
  recommendations: "Рекомендации",
  laboratory: "Лабораторные исследования",
  instrumental: "Инструментальные исследования",
  manipulations: "Манипуляции",
  outcome: "Исход",
};

export const CLINICAL_SECTION_ORDER: ClinicalSectionId[] = [
  "complaint",
  "habitus",
  "therapeutic",
  "diagnosis",
  "vaccination",
  "recommendations",
  "laboratory",
  "instrumental",
  "manipulations",
  "outcome",
];

function createId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function payloadValueText(value: ClinicalSectionPayloadValue | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ");
  return value ?? "";
}

function cloneClinicalSection(section: ClinicalSection): ClinicalSection {
  return {
    ...section,
    payload: { ...section.payload },
  };
}

function clinicalEntryFromEvent(event: Extract<CaseEvent, { type: "clinical.entry.saved" }>): ClinicalEntry {
  return {
    id: event.payload.entryId ?? `clinical-${event.id}`,
    caseId: event.caseId,
    entryDate: event.payload.entryDate,
    actorId: event.actorId,
    actorRole: event.actorRole,
    createdAt: event.createdAt,
    sections: event.payload.sections.map(cloneClinicalSection),
  };
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
    complaintRecord?: ComplaintRecord;
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
      ...(options.complaintRecord ? { complaintRecord: options.complaintRecord } : {}),
    },
  };
}

export function isCaseEvent(event: unknown): event is CaseEvent {
  if (!event || typeof event !== "object") return false;
  const type = (event as { type?: unknown }).type;
  return (
    type === "owner.request.created" ||
    type === "vet.note.added" ||
    type === "vet.diagnosis.updated" ||
    type === "vet.recommendation.updated" ||
    type === "clinical.entry.saved"
  );
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
    clinicalEntries: [],
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

export function sortClinicalEntries(entries: ClinicalEntry[]) {
  return [...entries].sort((left, right) => {
    const date = right.entryDate.localeCompare(left.entryDate);
    if (date !== 0) return date;
    const created = right.createdAt.localeCompare(left.createdAt);
    if (created !== 0) return created;
    return right.id.localeCompare(left.id);
  });
}

export function findLatestClinicalSection(entries: ClinicalEntry[], sectionId: ClinicalSectionId) {
  for (const entry of sortClinicalEntries(entries)) {
    const section = entry.sections.find((item) => item.id === sectionId);
    if (section) return section;
  }
  return null;
}

export function summarizeClinicalSection(section: ClinicalSection | null | undefined) {
  if (!section) return "";
  const payload = section.payload;

  if (section.id === "complaint") {
    return payloadValueText(payload.selectedOptionLabels) || payloadValueText(payload.freeText) || payloadValueText(payload.details);
  }

  if (section.id === "habitus") {
    return [
      payloadValueText(payload.weightKg) ? `Вес ${payloadValueText(payload.weightKg)} кг` : "",
      payloadValueText(payload.temperatureC) ? `${payloadValueText(payload.temperatureC)} C` : "",
      payloadValueText(payload.heartRate) ? `ЧСС ${payloadValueText(payload.heartRate)}` : "",
    ].filter(Boolean).join(", ");
  }

  if (section.id === "vaccination") {
    const vaccine = [payloadValueText(payload.currentVaccineDate), payloadValueText(payload.currentVaccineName)].filter(Boolean).join(" ");
    const chip = payloadValueText(payload.chipNumber);
    return [vaccine, chip ? `чип ${chip}` : ""].filter(Boolean).join(", ");
  }

  if (section.id === "outcome") {
    return payloadValueText(payload.status);
  }

  if (section.id === "diagnosis") {
    return payloadValueText(payload.preliminaryDiagnosis) ||
      payloadValueText(payload.differentialDiagnoses) ||
      payloadValueText(payload.concomitantDiagnoses);
  }

  if (section.id === "recommendations") {
    return payloadValueText(payload.text);
  }

  if (section.id === "therapeutic") {
    return payloadValueText(payload.anamnesisDisease) ||
      payloadValueText(payload.exam) ||
      payloadValueText(payload.recommendations) ||
      payloadValueText(payload.prescriptions);
  }

  if (section.id === "laboratory") {
    return [payloadValueText(payload.studyDate), payloadValueText(payload.studyName), payloadValueText(payload.comment)]
      .filter(Boolean)
      .join(", ");
  }

  return payloadValueText(payload.text) || Object.values(payload).map(payloadValueText).find(Boolean) || "";
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
    clinicalEntries: [],
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
      const clinicalEntries: ClinicalEntry[] = view?.clinicalEntries ?? [];
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
        clinicalEntries,
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

    if (event.type === "clinical.entry.saved") {
      view.clinicalEntries = sortClinicalEntries([...view.clinicalEntries, clinicalEntryFromEvent(event)]);
    }

    view.updatedAt = event.createdAt;
    view.events = [...view.events, event];
  }

  return view;
}
