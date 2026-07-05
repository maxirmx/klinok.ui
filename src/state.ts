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
  users,
  visits,
  type AnalysisDraft,
  type AppointmentDraft,
  type Pet,
  type Role,
  type Visit,
} from "./data";
import { createCaseRepository, type CaseRepository } from "./cases/repository";
import {
  CLINICAL_SECTION_TITLES,
  findLatestClinicalSection,
  sortClinicalEntries,
  summarizeClinicalSection,
  visitToCaseView,
} from "./cases/events";
import type {
  CaseActorRole,
  CaseView,
  ClinicalEntry,
  ClinicalSection,
  ClinicalSectionId,
  ClinicalSectionPayload,
} from "./cases/types";
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
export const localCases = ref<CaseView[]>(visits.map(visitToCaseView));
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
export const selectedMedicalComplaintTemplateId = ref(complaintTemplates.value[0]?.id ?? "");
export const selectedMedicalComplaintOptionIds = ref<string[]>([]);
export const selectedDrugTemplateId = ref(drugTemplates.value[0]?.id ?? "");
export const drugDraft = reactive<DrugRecordDraft>(createEmptyDrugDraft());

type ClinicalDraftPayload = Record<string, string>;

export interface ClinicalEntryDraft {
  entryDate: string;
  sections: Record<ClinicalSectionId, ClinicalDraftPayload>;
}

export interface MedicalHistoryHeader {
  species: string;
  name: string;
  breed: string;
  sex: string;
  age: string;
  color: string;
  chip: string;
  brandMark: string;
  latestVaccination: string;
  weight: string;
}

export interface MedicalHistoryEntryView extends ClinicalEntry {
  displayDate: string;
  isFallback: boolean;
}

export interface MedicalHistoryEpicrisisRow {
  id: string;
  date: string;
  complaint: string;
  outcome: string;
}

export interface MedicalHistoryView {
  caseView: CaseView;
  header: MedicalHistoryHeader;
  epicrisisRows: MedicalHistoryEpicrisisRow[];
  entries: MedicalHistoryEntryView[];
}

export const clinicalOutcomeOptions = [
  "Без наблюдения",
  "В стадии наблюдения",
  "В стадии обследования",
  "Выздоровление",
  "Улучшение",
  "Ухудшение",
  "Смерть",
];

export function todayInputDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createClinicalDraftSections(): Record<ClinicalSectionId, ClinicalDraftPayload> {
  return {
    complaint: {
      freeText: "",
      details: "",
    },
    habitus: {
      weightKg: "",
      temperatureC: "",
      heartRate: "",
      respiratoryRate: "",
      bloodPressure: "",
    },
    therapeutic: {
      anamnesisDisease: "",
      anamnesisLife: "",
      exam: "",
      recommendations: "",
      prescriptions: "",
    },
    diagnosis: {
      preliminaryDiagnosis: "",
      differentialDiagnoses: "",
      concomitantDiagnoses: "",
    },
    vaccination: {
      previousVaccineDate: "",
      previousVaccineName: "",
      complications: "",
      currentVaccineDate: "",
      currentVaccineName: "",
      series: "",
      expiryDate: "",
      chipNumber: "",
      injectionSite: "",
    },
    recommendations: {
      text: "",
    },
    laboratory: {
      studyDate: "",
      studyName: "",
      laboratoryName: "",
      labWorkerName: "",
      equipmentName: "",
      indicators: "",
      comment: "",
    },
    instrumental: {
      text: "",
    },
    manipulations: {
      text: "",
    },
    outcome: {
      status: "",
    },
  };
}

export function createEmptyClinicalEntryDraft(): ClinicalEntryDraft {
  return {
    entryDate: todayInputDate(),
    sections: createClinicalDraftSections(),
  };
}

export const medicalEntryDraft = reactive<ClinicalEntryDraft>(createEmptyClinicalEntryDraft());

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

let caseRepository: CaseRepository = createUnavailableCaseRepository("Backend is still initializing.");

function assertBackendAvailable() {
  if (!backendReady.value) {
    throw new Error("Backend is still initializing.");
  }
  if (backendError.value) {
    throw new Error(backendError.value);
  }
}

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

  if (!complaintTemplates.value.some((template) => template.id === selectedMedicalComplaintTemplateId.value)) {
    selectedMedicalComplaintTemplateId.value = complaintTemplates.value[0]?.id ?? "";
    selectedMedicalComplaintOptionIds.value = [];
  }

  if (!drugTemplates.value.some((template) => template.id === selectedDrugTemplateId.value)) {
    selectedDrugTemplateId.value = drugTemplates.value[0]?.id ?? "";
  }
}

function subscribeToRepository(repository: CaseRepository) {
  unsubscribeCases?.();
  unsubscribeDapp?.();

  unsubscribeCases = repository.watchCases((cases) => {
    localCases.value = cases;
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

export const selectedMedicalComplaintTemplate = computed(() => {
  return complaintTemplates.value.find((template) => template.id === selectedMedicalComplaintTemplateId.value) ?? complaintTemplates.value[0];
});

export const selectedMedicalComplaintOptions = computed(() => {
  const template = selectedMedicalComplaintTemplate.value;
  return template ? getComplaintOptionPath(template, selectedMedicalComplaintOptionIds.value) : [];
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

export function selectMedicalComplaintOption(level: number, optionId: string) {
  selectedMedicalComplaintOptionIds.value = [...selectedMedicalComplaintOptionIds.value.slice(0, level), optionId];
}

export function clearMedicalComplaintOptions() {
  selectedMedicalComplaintOptionIds.value = [];
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

function clinicalPayloadText(value: string | string[]) {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return value.trim();
}

function normalizeClinicalPayload(payload: ClinicalSectionPayload): ClinicalSectionPayload {
  const normalized: ClinicalSectionPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    normalized[key] = clinicalPayloadText(value);
  }
  return normalized;
}

function clinicalPayloadHasContent(payload: ClinicalSectionPayload, ignoredKeys: string[] = []) {
  const ignored = new Set(ignoredKeys);
  return Object.entries(payload).some(([key, value]) => {
    if (ignored.has(key)) return false;
    if (Array.isArray(value)) return value.length > 0;
    return value.length > 0;
  });
}

function createClinicalSection(
  id: ClinicalSectionId,
  templateStatus: "implemented" | "mocked",
  payload: ClinicalSectionPayload,
  authorName: string,
  filledAt: string,
  ignoredKeys: string[] = [],
): ClinicalSection | null {
  const normalizedPayload = normalizeClinicalPayload(payload);
  if (!clinicalPayloadHasContent(normalizedPayload, ignoredKeys)) return null;

  return {
    id,
    title: CLINICAL_SECTION_TITLES[id],
    templateStatus,
    authorName,
    filledAt,
    payload: normalizedPayload,
  };
}

function currentActor() {
  const user = users.find((item) => item.role === selectedRole.value);
  return {
    actorId: user ? `user-${user.id}` : selectedRole.value,
    actorRole: selectedRole.value as CaseActorRole,
    authorName: user ? `${user.firstName} ${user.lastName}` : selectedRoleLabel.value,
  };
}

function buildClinicalSections(filledAt: string, authorName: string) {
  const sections: ClinicalSection[] = [];
  const complaintDraft = medicalEntryDraft.sections.complaint;
  const complaintTemplate = selectedMedicalComplaintTemplate.value;
  const complaintLabels = selectedMedicalComplaintOptions.value.map((option) => option.label);
  if (complaintTemplate) {
    const complaint = createClinicalSection(
      "complaint",
      "implemented",
      {
        templateId: complaintTemplate.id,
        templateTitle: complaintTemplate.title,
        selectedOptionIds: [...selectedMedicalComplaintOptionIds.value],
        selectedOptionLabels: complaintLabels,
        freeText: complaintDraft.freeText,
        details: complaintDraft.details,
      },
      authorName,
      filledAt,
      ["templateId", "templateTitle", "selectedOptionIds"],
    );
    if (complaint) sections.push(complaint);
  }

  for (const id of [
    "habitus",
    "therapeutic",
    "diagnosis",
    "vaccination",
    "recommendations",
    "laboratory",
    "instrumental",
    "manipulations",
    "outcome",
  ] satisfies ClinicalSectionId[]) {
    const section = createClinicalSection(id, "mocked", medicalEntryDraft.sections[id], authorName, filledAt);
    if (section) sections.push(section);
  }

  return sections;
}

export function resetMedicalEntryDraft() {
  Object.assign(medicalEntryDraft, createEmptyClinicalEntryDraft());
  clearMedicalComplaintOptions();
}

export async function saveMedicalEntry(caseId: string) {
  assertBackendAvailable();
  const filledAt = new Date().toISOString();
  const actor = currentActor();
  const sections = buildClinicalSections(filledAt, actor.authorName);
  if (sections.length === 0) {
    throw new Error("Заполните хотя бы один раздел истории болезни");
  }

  const saved = await caseRepository.appendCaseEvent(caseId, {
    type: "clinical.entry.saved",
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    createdAt: filledAt,
    payload: {
      entryDate: medicalEntryDraft.entryDate || todayInputDate(),
      sections,
    },
  });
  if (!saved) {
    throw new Error("История болезни не найдена");
  }

  localCases.value = await caseRepository.listCases();
  localVisits.value = caseViewsToVisits(localCases.value);
  resetMedicalEntryDraft();
  return saved;
}

function payloadString(section: ClinicalSection | null, key: string) {
  const value = section?.payload[key];
  if (Array.isArray(value)) return value.join(" / ");
  return value ?? "";
}

function formatMedicalDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
  }
  return value || "Дата не указана";
}

function reproductiveStatus(sex: Pet["sex"] | undefined) {
  if (sex === "Кобель") return "интактный самец";
  if (sex === "Сука") return "интактная самка";
  return "Не указан";
}

function ageLabel(age: number | undefined) {
  if (typeof age !== "number") return "Не указан";
  return `${age} полных лет`;
}

function latestVaccinationLabel(section: ClinicalSection | null) {
  const vaccine = [payloadString(section, "currentVaccineDate"), payloadString(section, "currentVaccineName")]
    .filter(Boolean)
    .join(" ");
  return vaccine || "Не указана";
}

function createFallbackClinicalEntry(caseView: CaseView): MedicalHistoryEntryView {
  const filledAt = caseView.updatedAt;
  const sections = [
    createClinicalSection("complaint", "implemented", { freeText: caseView.complaint }, "Система", filledAt),
    createClinicalSection("diagnosis", "mocked", { preliminaryDiagnosis: caseView.diagnosis }, "Система", filledAt),
    createClinicalSection("recommendations", "mocked", { text: caseView.recommendation }, "Система", filledAt),
  ].filter((section): section is ClinicalSection => section !== null);

  return {
    id: `fallback-${caseView.id}`,
    caseId: caseView.caseId,
    entryDate: caseView.date,
    actorId: "system",
    actorRole: "system",
    createdAt: filledAt,
    sections,
    displayDate: formatMedicalDate(caseView.date),
    isFallback: true,
  };
}

export function findCaseByVisitId(visitId: number) {
  return localCases.value.find((view) => view.id === visitId) ?? null;
}

export function getMedicalHistoryView(caseView: CaseView): MedicalHistoryView {
  const sourceEntries = caseView.clinicalEntries.length ? sortClinicalEntries(caseView.clinicalEntries) : [createFallbackClinicalEntry(caseView)];
  const entries: MedicalHistoryEntryView[] = sourceEntries
    .map((entry) => ({
      ...entry,
      displayDate: formatMedicalDate(entry.entryDate),
      isFallback: (entry as Partial<MedicalHistoryEntryView>).isFallback === true,
    }));
  const pet = pets.find((item) => item.name === caseView.pet);
  const latestHabitus = findLatestClinicalSection(entries, "habitus");
  const latestVaccination = findLatestClinicalSection(entries, "vaccination");
  const chip = payloadString(latestVaccination, "chipNumber") || pet?.chip || "Не указан";
  const weight = payloadString(latestHabitus, "weightKg");

  return {
    caseView,
    header: {
      species: pet?.species ?? "Не указан",
      name: pet?.name ?? caseView.pet,
      breed: pet?.breed ?? "Не указана",
      sex: reproductiveStatus(pet?.sex),
      age: ageLabel(pet?.age),
      color: pet?.color ?? "Не указан",
      chip,
      brandMark: pet?.brandMark ?? "Не указано",
      latestVaccination: latestVaccinationLabel(latestVaccination),
      weight: weight ? `${weight} кг` : pet?.weight ?? "Не указан",
    },
    epicrisisRows: entries.map((entry) => {
      const complaint = summarizeClinicalSection(entry.sections.find((section) => section.id === "complaint"));
      const outcome = summarizeClinicalSection(entry.sections.find((section) => section.id === "outcome")) ||
        summarizeClinicalSection(entry.sections.find((section) => section.id === "diagnosis"));
      return {
        id: entry.id,
        date: entry.displayDate,
        complaint: complaint || caseView.complaint || "Не заполнено",
        outcome: outcome || "Не указан",
      };
    }),
    entries,
  };
}

export async function submitAppointment() {
  assertBackendAvailable();
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
  assertBackendAvailable();
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
  assertBackendAvailable();
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
  assertBackendAvailable();
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
  selectedMedicalComplaintTemplateId.value = complaintTemplates.value[0]?.id ?? "";
  resetMedicalEntryDraft();
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
  localCases.value = visits.map(visitToCaseView);
  localVisits.value = [...visits];
  savedAnalyses.value = [...analyses];
  await resetDappStateForTests();
}
