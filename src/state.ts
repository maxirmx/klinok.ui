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
import { defaultRuntimeConfig, loadRuntimeConfig, type AppRuntimeConfig, type BackendMode } from "./runtimeConfig";

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
export const backendMode = ref<BackendMode>("mock");
export const backendReady = ref(false);
export const backendError = ref("");

let caseRepository: CaseRepository = createMockCaseRepository({ seedVisits: visits });
let unsubscribeCases: (() => void) | null = null;

function subscribeToCases(repository: CaseRepository) {
  unsubscribeCases?.();
  unsubscribeCases = repository.watchCases((cases) => {
    localVisits.value = caseViewsToVisits(cases);
  });
}

export async function initializeBackend(config?: AppRuntimeConfig) {
  backendReady.value = false;
  backendError.value = "";
  const runtimeConfig = config ?? (await loadRuntimeConfig());

  try {
    const nextRepository = await createCaseRepository(runtimeConfig, visits);
    await nextRepository.initialize(runtimeConfig);
    caseRepository = nextRepository;
    backendMode.value = runtimeConfig.backendMode;
    subscribeToCases(nextRepository);
  } catch (error) {
    const fallback = createMockCaseRepository({ seedVisits: visits });
    await fallback.initialize(defaultRuntimeConfig);
    caseRepository = fallback;
    backendMode.value = "mock";
    backendError.value = error instanceof Error ? error.message : "Failed to initialize backend.";
    subscribeToCases(fallback);
  } finally {
    backendReady.value = true;
  }
}

export const selectedRoleLabel = computed(() => {
  return roles.find((role) => role.id === selectedRole.value)?.label ?? "";
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

export async function submitAppointment() {
  const view = await caseRepository.createCaseFromAppointment({ ...appointment });
  localVisits.value = caseViewsToVisits(await caseRepository.listCases());
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

export function showToast(message: string) {
  toast.value = message;
  window.setTimeout(() => {
    if (toast.value === message) toast.value = "";
  }, 1800);
}

export async function resetBackendForTests(repository?: CaseRepository, mode: BackendMode = "mock") {
  unsubscribeCases?.();
  unsubscribeCases = null;
  caseRepository = repository ?? createMockCaseRepository({ seedVisits: visits });
  await caseRepository.initialize(defaultRuntimeConfig);
  subscribeToCases(caseRepository);
  backendMode.value = mode;
  backendReady.value = true;
  backendError.value = "";
}
