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
import { createCaseRepository, type CaseRepository } from "./cases/repository";
import { caseViewsToVisits, createMockCaseRepository } from "./cases/mockRepository";
import { createSeedCollections } from "./dapp/seeds";
import {
  createComplaintRecordFromTemplate,
  createDrugDraftFromRecord,
  createDrugRecordFromTemplate,
  createEmptyDrugDraft,
  getComplaintOptionPath,
  getDrugDraftValidationError,
  updateDrugRecordFromTemplate,
} from "./dapp/templates";
import type { ComplaintRecord, DappCollections, DrugRecord, DrugRecordDraft } from "./dapp/types";
import { defaultRuntimeConfig, loadRuntimeConfig, type AppRuntimeConfig } from "./runtimeConfig";

const seedCollections = createSeedCollections();

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
export const backendReady = ref(false);
export const backendError = ref("");
export const complaintTemplates = ref(seedCollections.complaintTemplates);
export const complaintRecords = ref(seedCollections.complaintRecords);
export const drugGroups = ref(seedCollections.drugGroups);
export const drugTemplates = ref(seedCollections.drugTemplates);
export const drugRecords = ref(seedCollections.drugRecords);
export const selectedComplaintTemplateId = ref(complaintTemplates.value[0]?.id ?? "");
export const selectedComplaintOptionIds = ref<string[]>([]);
export const selectedDrugTemplateId = ref(drugTemplates.value[0]?.id ?? "");
export const drugDraft = reactive<DrugRecordDraft>(createEmptyDrugDraft());

let unsubscribeCases: (() => void) | null = null;
let unsubscribeDapp: (() => void) | null = null;

function createUnavailableCaseRepository(message: string): CaseRepository {
  const unavailable = () => new Error(message);

  return {
    async initialize() {},
    async listCases() {
      return [];
    },
    watchCases(callback) {
      callback([]);
      return () => {};
    },
    async createCaseFromAppointment() {
      throw unavailable();
    },
    async appendCaseEvent() {
      throw unavailable();
    },
    async listDappCollections() {
      return createSeedCollections();
    },
    watchDappCollections(callback) {
      callback(createSeedCollections());
      return () => {};
    },
    async saveDrugRecord() {
      throw unavailable();
    },
    async deleteDrugRecord() {
      throw unavailable();
    },
  };
}

let caseRepository: CaseRepository = createUnavailableCaseRepository("Backend is not initialized.");

function applyDappCollections(collections: DappCollections) {
  complaintTemplates.value = collections.complaintTemplates;
  complaintRecords.value = collections.complaintRecords;
  drugGroups.value = collections.drugGroups;
  drugTemplates.value = collections.drugTemplates;
  drugRecords.value = collections.drugRecords;

  if (!complaintTemplates.value.some((template) => template.id === selectedComplaintTemplateId.value)) {
    selectedComplaintTemplateId.value = complaintTemplates.value[0]?.id ?? "";
    selectedComplaintOptionIds.value = [];
  }

  if (!drugTemplates.value.some((template) => template.id === selectedDrugTemplateId.value)) {
    selectedDrugTemplateId.value = drugTemplates.value[0]?.id ?? "";
  }
}

function subscribeToRepository(repository: CaseRepository) {
  unsubscribeCases?.();
  unsubscribeDapp?.();

  unsubscribeCases = repository.watchCases((cases) => {
    localVisits.value = caseViewsToVisits(cases);
  });
  unsubscribeDapp = repository.watchDappCollections(applyDappCollections);
}

async function refreshDappCollections() {
  applyDappCollections(await caseRepository.listDappCollections());
}

export async function initializeBackend(config?: AppRuntimeConfig) {
  backendReady.value = false;
  backendError.value = "";
  const runtimeConfig = config ?? (await loadRuntimeConfig());

  try {
    const nextRepository = await createCaseRepository(runtimeConfig);
    await nextRepository.initialize(runtimeConfig);
    caseRepository = nextRepository;
    subscribeToRepository(nextRepository);
  } catch (error) {
    backendError.value = error instanceof Error ? error.message : "Failed to initialize backend.";
    caseRepository = createUnavailableCaseRepository(backendError.value);
    subscribeToRepository(caseRepository);
  } finally {
    backendReady.value = true;
  }
}

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

function complaintText(record: ComplaintRecord) {
  return record.selectedOptionLabels.join(" / ") || record.freeText || appointment.reason;
}

export function createComplaintRecord(): ComplaintRecord {
  if (!selectedComplaintTemplate.value) {
    throw new Error("Complaint template is not available");
  }

  return createComplaintRecordFromTemplate(selectedComplaintTemplate.value, {
    pet: appointment.pet,
    urgency: appointment.urgency,
    date: appointment.date,
    time: appointment.time,
    selectedOptionIds: selectedComplaintOptionIds.value,
    freeText: appointment.reason,
    details: appointment.details,
  });
}

export async function submitAppointment() {
  const complaintRecord = createComplaintRecord();
  const view = await caseRepository.createCaseFromAppointment(
    {
      ...appointment,
      reason: complaintText(complaintRecord),
    },
    { complaintRecord },
  );
  localVisits.value = caseViewsToVisits(await caseRepository.listCases());
  await refreshDappCollections();
  return view.id;
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

export async function saveDrugDraft(): Promise<DrugRecord> {
  if (!selectedDrugTemplate.value) {
    throw new Error("Drug template is not available");
  }
  const validationError = getDrugDraftValidationError(drugDraft);
  if (validationError) {
    throw new Error(validationError);
  }

  const record = createDrugRecordFromTemplate(selectedDrugTemplate.value, drugDraft);
  const saved = await caseRepository.saveDrugRecord(record);
  await refreshDappCollections();
  resetDrugDraft();
  return saved;
}

export async function updateDrugDraft(record: DrugRecord): Promise<DrugRecord> {
  if (!selectedDrugTemplate.value) {
    throw new Error("Drug template is not available");
  }
  const validationError = getDrugDraftValidationError(drugDraft);
  if (validationError) {
    throw new Error(validationError);
  }

  const updatedRecord = updateDrugRecordFromTemplate(selectedDrugTemplate.value, record, drugDraft);
  const saved = await caseRepository.saveDrugRecord(updatedRecord);
  await refreshDappCollections();
  resetDrugDraft();
  return saved;
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

export async function deleteDrugRecord(id: string) {
  const deleted = await caseRepository.deleteDrugRecord(id);
  await refreshDappCollections();
  return deleted;
}

export function resetDrugDraft() {
  Object.assign(drugDraft, createEmptyDrugDraft());
}

export function showToast(message: string) {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) toast.value = "";
  }, 1800);
}

export async function resetBackendForTests(repository?: CaseRepository) {
  unsubscribeCases?.();
  unsubscribeDapp?.();
  unsubscribeCases = null;
  unsubscribeDapp = null;
  caseRepository = repository ?? createMockCaseRepository({ seedVisits: visits });
  await caseRepository.initialize(defaultRuntimeConfig);
  subscribeToRepository(caseRepository);
  backendReady.value = true;
  backendError.value = "";
}

export async function resetDappStateForTests() {
  await resetBackendForTests();
  selectedComplaintTemplateId.value = complaintTemplates.value[0]?.id ?? "";
  selectedComplaintOptionIds.value = [];
  selectedDrugTemplateId.value = drugTemplates.value[0]?.id ?? "";
  resetDrugDraft();
}

export async function resetPrototypeStateForTests() {
  selectedRole.value = "owner";
  petQuery.value = "";
  applyPetFilters("Все", "Все");
  darkMode.value = false;
  Object.assign(appointment, defaultAppointment);
  Object.assign(analysisDraft, { ...defaultAnalysis, rows: [...defaultAnalysis.rows] });
  localVisits.value = [...visits];
  savedAnalyses.value = [...analyses];
  await resetDappStateForTests();
}
