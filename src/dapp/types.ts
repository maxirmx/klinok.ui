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

export type MedicalSectionId =
  | "what-happened"
  | "habitus"
  | "therapeutic"
  | "diagnosis"
  | "vaccination"
  | "recommendations"
  | "labs"
  | "instrumental"
  | "manipulations"
  | "outcome";

export type MedicalFieldType = "text" | "textarea" | "select";

export interface MedicalSectionTemplateField {
  id: string;
  label: string;
  type: MedicalFieldType;
  options?: string[];
}

export interface MedicalSectionTemplate {
  id: MedicalSectionId;
  title: string;
  sortOrder: number;
  fields: MedicalSectionTemplateField[];
  suggestions?: string[];
  options?: ComplaintOptionNode[];
  repeatable?: boolean;
}

export interface MedicalLabIndicator {
  id: string;
  name: string;
  result: string;
  unit: string;
  reference: string;
}

export interface MedicalLabStudy {
  id: string;
  date: string;
  studyName: string;
  labName: string;
  technician: string;
  equipment: string;
  indicators: MedicalLabIndicator[];
  comments: string;
}

export interface MedicalHistorySection {
  id: MedicalSectionId;
  title: string;
  author: string;
  values: Record<string, string>;
  selectedOptionIds?: string[];
  selectedOptionLabels?: string[];
  labStudies?: MedicalLabStudy[];
}

export interface MedicalHistoryEntry {
  id: string;
  petId: number;
  date: string;
  author: string;
  sections: MedicalHistorySection[];
  createdAt: string;
  updatedAt: string;
}

export interface MedicalHistoryEntryDraft {
  petId: number;
  date: string;
  whatHappenedOptionIds: string[];
  whatHappenedText: string;
  habitus: Record<"weight" | "temperature" | "heartRate" | "respiratoryRate" | "bloodPressure", string>;
  therapeutic: Record<"diseaseAnamnesis" | "lifeAnamnesis" | "exam" | "recommendations" | "prescriptions", string>;
  diagnosis: Record<"preliminary" | "differential" | "concomitant", string>;
  vaccination: Record<
    "previousDate" | "previousVaccine" | "complications" | "currentVaccine" | "batch" | "expiresAt" | "chipNumber" | "injectionSite",
    string
  >;
  recommendations: string;
  labStudies: MedicalLabStudy[];
  instrumental: string;
  manipulations: string;
  outcome: string;
}

export interface MedicalHistorySummary {
  chipNumber: string;
  latestVaccination: string;
  weight: string;
}

export interface DappCollections {
  complaintTemplates: ComplaintTemplate[];
  complaintRecords: ComplaintRecord[];
  medicalSectionTemplates: MedicalSectionTemplate[];
  medicalHistoryEntries: MedicalHistoryEntry[];
  drugGroups: DrugGroup[];
  drugTemplates: DrugTemplate[];
  drugRecords: DrugRecord[];
}
