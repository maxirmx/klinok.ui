// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { AppointmentDraft } from "../data";

export interface ComplaintOptionNode {
  id: string;
  label: string;
  children?: ComplaintOptionNode[];
}

export interface ComplaintTemplate {
  id: string;
  title: string;
  mode: "freeText" | "hierarchical";
  prompt: string;
  options: ComplaintOptionNode[];
}

export interface ComplaintRecord {
  id: string;
  templateId: string;
  templateTitle: string;
  pet: string;
  urgency: AppointmentDraft["urgency"];
  date: string;
  time: string;
  selectedOptionIds: string[];
  selectedOptionLabels: string[];
  freeText: string;
  details: string;
  createdAt: string;
}

export type DrugPharmacyType = "vet" | "human";

export interface DrugDose {
  text: string;
  source: string;
}

export interface DrugGroup {
  id: string;
  title: string;
  sortOrder: number;
  description?: string;
}

export type DrugTemplateFieldId = Exclude<keyof DrugRecordDraft, "groupIds">;

export interface DrugTemplateField {
  id: DrugTemplateFieldId;
  label: string;
  multiline?: boolean;
  required?: boolean;
}

export interface DrugTemplate {
  id: string;
  title: string;
  description: string;
  fields: DrugTemplateField[];
}

export interface DrugRecordDraft {
  activeSubstanceRu: string;
  activeSubstanceLatin: string;
  pharmacyType: DrugPharmacyType;
  groupIds: string[];
  tradeNames: string;
  pharmacokinetics: string;
  pharmacodynamics: string;
  dogDoseText: string;
  dogDoseSource: string;
  catDoseText: string;
  catDoseSource: string;
}

export interface DrugRecord {
  id: string;
  templateId: string;
  templateTitle: string;
  activeSubstanceRu: string;
  activeSubstanceLatin: string;
  pharmacyType: DrugPharmacyType;
  groupIds: string[];
  tradeNames: string[];
  pharmacokinetics: string;
  pharmacodynamics: string;
  dogDose: DrugDose;
  catDose: DrugDose;
  createdAt: string;
  updatedAt: string;
}

export interface DappCollections {
  complaintTemplates: ComplaintTemplate[];
  complaintRecords: ComplaintRecord[];
  drugGroups: DrugGroup[];
  drugTemplates: DrugTemplate[];
  drugRecords: DrugRecord[];
}
