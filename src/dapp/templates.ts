// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type {
  ComplaintOptionNode,
  ComplaintRecord,
  ComplaintTemplate,
  DrugRecord,
  DrugRecordDraft,
  DrugTemplate,
} from "./types";
import type { AppointmentDraft } from "../data";

interface ComplaintRecordDraft {
  pet: string;
  urgency: AppointmentDraft["urgency"];
  date: string;
  time: string;
  selectedOptionIds: string[];
  freeText: string;
  details: string;
}

interface RecordCreationOptions {
  id?: string;
  now?: Date;
}

interface RecordUpdateOptions {
  now?: Date;
}

function createId(prefix: string, date: Date) {
  const stamp = date.toISOString().replace(/[-:.TZ]/g, "");
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

function trim(value: string) {
  return value.trim();
}

export function findComplaintOption(options: ComplaintOptionNode[], optionId: string): ComplaintOptionNode | null {
  for (const option of options) {
    if (option.id === optionId) return option;
    const nested = option.children ? findComplaintOption(option.children, optionId) : null;
    if (nested) return nested;
  }
  return null;
}

export function getComplaintOptionPath(template: ComplaintTemplate, selectedOptionIds: string[]) {
  const path: ComplaintOptionNode[] = [];
  let options = template.options;

  for (const id of selectedOptionIds) {
    const option = options.find((item) => item.id === id);
    if (!option) break;
    path.push(option);
    options = option.children ?? [];
  }

  return path;
}

export function getNextComplaintOptions(template: ComplaintTemplate, selectedOptionIds: string[]) {
  if (template.mode !== "hierarchical") return [];
  const path = getComplaintOptionPath(template, selectedOptionIds);
  if (selectedOptionIds.length === 0) return template.options;
  return path[path.length - 1]?.children ?? [];
}

export function createComplaintRecordFromTemplate(
  template: ComplaintTemplate,
  draft: ComplaintRecordDraft,
  options: RecordCreationOptions = {},
): ComplaintRecord {
  const now = options.now ?? new Date();
  const optionPath = getComplaintOptionPath(template, draft.selectedOptionIds);

  return {
    id: options.id ?? createId("complaint", now),
    templateId: template.id,
    templateTitle: template.title,
    pet: draft.pet,
    urgency: draft.urgency,
    date: draft.date,
    time: draft.time,
    selectedOptionIds: optionPath.map((option) => option.id),
    selectedOptionLabels: optionPath.map((option) => option.label),
    freeText: trim(draft.freeText),
    details: trim(draft.details),
    createdAt: now.toISOString(),
  };
}

export function createEmptyDrugDraft(): DrugRecordDraft {
  return {
    activeSubstanceRu: "",
    activeSubstanceLatin: "",
    pharmacyType: "vet",
    groupIds: [],
    tradeNames: "",
    pharmacokinetics: "",
    pharmacodynamics: "",
    dogDoseText: "",
    dogDoseSource: "",
    catDoseText: "",
    catDoseSource: "",
  };
}

export function createDrugDraftFromRecord(record: DrugRecord): DrugRecordDraft {
  return {
    activeSubstanceRu: record.activeSubstanceRu,
    activeSubstanceLatin: record.activeSubstanceLatin,
    pharmacyType: record.pharmacyType,
    groupIds: normalizeDrugGroupIds(record.groupIds),
    tradeNames: record.tradeNames.join(", "),
    pharmacokinetics: record.pharmacokinetics,
    pharmacodynamics: record.pharmacodynamics,
    dogDoseText: record.dogDose.text,
    dogDoseSource: record.dogDose.source,
    catDoseText: record.catDose.text,
    catDoseSource: record.catDose.source,
  };
}

export function splitTradeNames(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeDrugGroupIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? trim(item) : ""))
        .filter(Boolean),
    ),
  );
}

export function getDrugDraftValidationError(draft: DrugRecordDraft) {
  if (!trim(draft.activeSubstanceRu)) return "Укажите действующее вещество";
  if (trim(draft.dogDoseText) && !trim(draft.dogDoseSource)) return "Укажите источник дозировки для собак";
  if (trim(draft.catDoseText) && !trim(draft.catDoseSource)) return "Укажите источник дозировки для кошек";
  return "";
}

export function createDrugRecordFromTemplate(
  template: DrugTemplate,
  draft: DrugRecordDraft,
  options: RecordCreationOptions = {},
): DrugRecord {
  const now = options.now ?? new Date();

  return {
    id: options.id ?? createId("drug", now),
    templateId: template.id,
    templateTitle: template.title,
    activeSubstanceRu: trim(draft.activeSubstanceRu),
    activeSubstanceLatin: trim(draft.activeSubstanceLatin),
    pharmacyType: draft.pharmacyType,
    groupIds: normalizeDrugGroupIds(draft.groupIds),
    tradeNames: splitTradeNames(draft.tradeNames),
    pharmacokinetics: trim(draft.pharmacokinetics),
    pharmacodynamics: trim(draft.pharmacodynamics),
    dogDose: { text: trim(draft.dogDoseText), source: trim(draft.dogDoseSource) },
    catDose: { text: trim(draft.catDoseText), source: trim(draft.catDoseSource) },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function updateDrugRecordFromTemplate(
  template: DrugTemplate,
  record: DrugRecord,
  draft: DrugRecordDraft,
  options: RecordUpdateOptions = {},
): DrugRecord {
  return {
    ...createDrugRecordFromTemplate(template, draft, {
      id: record.id,
      now: options.now,
    }),
    createdAt: record.createdAt,
  };
}
