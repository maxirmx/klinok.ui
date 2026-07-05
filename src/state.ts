// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed, reactive, ref } from "vue";
import {
  analyses,
  defaultAnalysis,
  defaultAppointment,
  pets,
  roles,
  visits,
  type AnalysisDraft,
  type AppointmentDraft,
  type Pet,
  type Role,
  type Visit,
} from "./data";
import { createDefaultDappRepository } from "./dapp/repository";
import {
  createComplaintRecordFromTemplate,
  createDrugDraftFromRecord,
  createDrugRecordFromTemplate,
  createEmptyDrugDraft,
  getDrugDraftValidationError,
  getComplaintOptionPath,
  updateDrugRecordFromTemplate,
} from "./dapp/templates";
import type { ComplaintRecord, DrugRecord, DrugRecordDraft } from "./dapp/types";

export const selectedRole = ref<Role>("owner");
export const phone = ref("+7 (900) 000-00-00");
export const otp = reactive(["4", "4", "4", "4"]);
export const darkMode = ref(false);
export const petQuery = ref("");
export const selectedType = ref<Pet["species"] | "Все">("Все");
export const selectedSex = ref<Pet["sex"] | "Все">("Все");
export const appointment = reactive<AppointmentDraft>({ ...defaultAppointment });
export const analysisDraft = reactive<AnalysisDraft>({ ...defaultAnalysis, rows: [...defaultAnalysis.rows] });
export const localVisits = ref<Visit[]>([...visits]);
export const savedAnalyses = ref<AnalysisDraft[]>([...analyses]);
export const toast = ref("");

const dappRepository = createDefaultDappRepository(showToast);

export const complaintTemplates = ref(dappRepository.listComplaintTemplates());
export const complaintRecords = ref(dappRepository.listComplaintRecords());
export const drugGroups = ref(dappRepository.listDrugGroups());
export const drugTemplates = ref(dappRepository.listDrugTemplates());
export const drugRecords = ref(dappRepository.listDrugRecords());
export const selectedComplaintTemplateId = ref(complaintTemplates.value[0]?.id ?? "");
export const selectedComplaintOptionIds = ref<string[]>([]);
export const selectedDrugTemplateId = ref(drugTemplates.value[0]?.id ?? "");
export const drugDraft = reactive<DrugRecordDraft>(createEmptyDrugDraft());

export const selectedRoleLabel = computed(() => {
  return roles.find((role) => role.id === selectedRole.value)?.label ?? "";
});

export const selectedComplaintTemplate = computed(() => {
  return complaintTemplates.value.find((template) => template.id === selectedComplaintTemplateId.value) ?? complaintTemplates.value[0];
});

export const selectedComplaintOptions = computed(() => {
  const template = selectedComplaintTemplate.value;
  return template ? getComplaintOptionPath(template, selectedComplaintOptionIds.value) : [];
});

export const selectedDrugTemplate = computed(() => {
  return drugTemplates.value.find((template) => template.id === selectedDrugTemplateId.value) ?? drugTemplates.value[0];
});

export const filteredPets = computed(() => {
  const query = petQuery.value.trim().toLowerCase();
  return pets.filter((pet) => {
    const typeMatches = selectedType.value === "Все" || pet.species === selectedType.value;
    const sexMatches = selectedSex.value === "Все" || pet.sex === selectedSex.value;
    const queryMatches = !query || `${pet.name} ${pet.breed}`.toLowerCase().includes(query);
    return typeMatches && sexMatches && queryMatches;
  });
});

export function applyPetFilters(type: Pet["species"] | "Все", sex: Pet["sex"] | "Все") {
  selectedType.value = type;
  selectedSex.value = sex;
}

export function selectComplaintOption(level: number, optionId: string) {
  selectedComplaintOptionIds.value = [...selectedComplaintOptionIds.value.slice(0, level), optionId];
}

export function clearComplaintOptions() {
  selectedComplaintOptionIds.value = [];
}

export function submitAppointment() {
  const complaintRecord = createComplaintRecord();
  const id = 22138 + localVisits.value.length;
  localVisits.value = [
    {
      id,
      title: `Заявка #${id}`,
      complaint: complaintRecord.selectedOptionLabels.join(" / ") || complaintRecord.freeText || appointment.reason,
      doctor: appointment.doctor,
      role: "Откликнувшиеся врачи",
      pet: appointment.pet,
      date: appointment.date,
      tag: appointment.urgency,
      diagnosis: "Ожидает первичного приема",
      recommendation: "Дождитесь отклика врача или выберите специалиста из списка.",
    },
    ...localVisits.value,
  ];
  return id;
}

export function createComplaintRecord(): ComplaintRecord {
  if (!selectedComplaintTemplate.value) {
    throw new Error("Complaint template is not available");
  }

  const record = createComplaintRecordFromTemplate(selectedComplaintTemplate.value, {
    pet: appointment.pet,
    urgency: appointment.urgency,
    date: appointment.date,
    time: appointment.time,
    selectedOptionIds: selectedComplaintOptionIds.value,
    freeText: appointment.reason,
    details: appointment.details,
  });

  dappRepository.saveComplaintRecord(record);
  complaintRecords.value = dappRepository.listComplaintRecords();
  return record;
}

export function saveAnalysisDraft() {
  savedAnalyses.value = [
    {
      pet: analysisDraft.pet,
      templateId: analysisDraft.templateId,
      date: analysisDraft.date,
      rows: [...analysisDraft.rows],
    },
    ...savedAnalyses.value,
  ];
}

export function saveDrugDraft(): DrugRecord {
  if (!selectedDrugTemplate.value) {
    throw new Error("Drug template is not available");
  }
  const validationError = getDrugDraftValidationError(drugDraft);
  if (validationError) {
    throw new Error(validationError);
  }

  const record = createDrugRecordFromTemplate(selectedDrugTemplate.value, drugDraft);
  dappRepository.saveDrugRecord(record);
  drugRecords.value = dappRepository.listDrugRecords();
  resetDrugDraft();
  return record;
}

export function updateDrugDraft(record: DrugRecord): DrugRecord {
  if (!selectedDrugTemplate.value) {
    throw new Error("Drug template is not available");
  }
  const validationError = getDrugDraftValidationError(drugDraft);
  if (validationError) {
    throw new Error(validationError);
  }

  const updatedRecord = updateDrugRecordFromTemplate(selectedDrugTemplate.value, record, drugDraft);
  dappRepository.saveDrugRecord(updatedRecord);
  drugRecords.value = dappRepository.listDrugRecords();
  resetDrugDraft();
  return updatedRecord;
}

export function findDrugRecord(id: string) {
  return drugRecords.value.find((record) => record.id === id) ?? null;
}

export function fillDrugDraft(record: DrugRecord) {
  selectedDrugTemplateId.value = record.templateId;
  Object.assign(drugDraft, createDrugDraftFromRecord(record));
}

export function validateDrugDraft() {
  return getDrugDraftValidationError(drugDraft);
}

export function deleteDrugRecord(id: string) {
  const deleted = dappRepository.deleteDrugRecord(id);
  if (deleted) {
    drugRecords.value = dappRepository.listDrugRecords();
  }
  return deleted;
}

export function resetDrugDraft() {
  Object.assign(drugDraft, createEmptyDrugDraft());
}

export function resetDappStateForTests() {
  dappRepository.reset();
  complaintTemplates.value = dappRepository.listComplaintTemplates();
  complaintRecords.value = dappRepository.listComplaintRecords();
  drugGroups.value = dappRepository.listDrugGroups();
  drugTemplates.value = dappRepository.listDrugTemplates();
  drugRecords.value = dappRepository.listDrugRecords();
  selectedComplaintTemplateId.value = complaintTemplates.value[0]?.id ?? "";
  selectedComplaintOptionIds.value = [];
  selectedDrugTemplateId.value = drugTemplates.value[0]?.id ?? "";
  resetDrugDraft();
}

export function resetPrototypeStateForTests() {
  selectedRole.value = "owner";
  petQuery.value = "";
  applyPetFilters("Все", "Все");
  darkMode.value = false;
  Object.assign(appointment, defaultAppointment);
  Object.assign(analysisDraft, { ...defaultAnalysis, rows: [...defaultAnalysis.rows] });
  localVisits.value = [...visits];
  savedAnalyses.value = [...analyses];
  resetDappStateForTests();
}

export function showToast(message: string) {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) toast.value = "";
  }, 1800);
}
