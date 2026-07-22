<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import type { DirectoryPetDto, DirectoryProfileDto, PetGrantAction } from "@klinok/protocol";
import AppIcon from "../components/AppIcon.vue";
import AppPaginator from "../components/AppPaginator.vue";
import ConfirmationDialog from "../components/ConfirmationDialog.vue";
import MedicalRecordEntry from "../components/MedicalRecordEntry.vue";
import ModalDialog from "../components/ModalDialog.vue";
import PetAccessManager from "../components/PetAccessManager.vue";
import PetProfileDetails from "../components/PetProfileDetails.vue";
import PetProfileHeader from "../components/PetProfileHeader.vue";
import WhatHappenedTree from "../components/WhatHappenedTree.vue";
import WorkspaceShell from "../components/WorkspaceShell.vue";
import {
  appState,
  loadDoctorPets,
  lookupPetDirectory,
  logout,
  requireRepository,
  searchDoctorDirectory,
  searchPetDirectory,
} from "../appStore";
import {
  ENCOUNTER_SECTION_LABELS,
  OPTIONAL_ENCOUNTER_SECTION_KINDS,
  WHAT_HAPPENED_TAXONOMY,
  encounterSummary,
  isFreeTextValue,
  isWhatHappenedValue,
  whatHappenedPath,
} from "../medicalEncounter";
import type { PetAccessRow } from "../petAccess";
import type { MedicalEncounterSectionKind, MedicalRecordDraft } from "../repositories/types";

const props = defineProps<{ role: "doctor"; scenarioId: string }>();
type HomeSortField = "owner" | "pet";
type SortDirection = "asc" | "desc";
const route = useRoute();
const router = useRouter();
const errorMessage = ref("");
const successMessage = ref("");
const busy = ref(false);
const pageSizes = [10, 20, 50] as const;
const homeQuery = ref("");
const homeSort = ref<HomeSortField>("owner");
const homeSortDirection = ref<SortDirection>("asc");
const homePage = ref(1);
const storedPageSize = Number(localStorage.getItem("klinok:doctor-pets-page-size"));
const homePageSize = ref<(typeof pageSizes)[number]>(pageSizes.includes(storedPageSize as never) ? storedPageSize as never : 10);
const directoryPets = ref<DirectoryPetDto[]>([]);
const selectedDirectoryPet = ref<DirectoryPetDto | null>(null);
const directoryTotal = ref(0);
const requestDialogOpen = ref(props.scenarioId === "doctor-pet-request-access");
const petOwnerQuery = ref("");
const petNameQuery = ref("");
const petSearchResults = ref<DirectoryPetDto[]>([]);
const petSearchPerformed = ref(false);
const doctorQuery = ref("");
const doctors = ref<DirectoryProfileDto[]>([]);
const doctorSearchPerformed = ref(false);
const delegationTarget = ref<DirectoryProfileDto | null>(null);
const delegationDelegate = ref(false);
const delegationConfirm = ref(false);
const delegationDialogOpen = ref(false);
const delegationPage = ref(1);
const delegationPageSize = ref<(typeof pageSizes)[number]>(10);
const relinquishConfirm = ref(false);
const historyQuery = ref("");
const historyFrom = ref("");
const historyTo = ref("");
const historySection = ref<MedicalEncounterSectionKind | "">("");
const historyStatus = ref<"" | "confirmed" | "unconfirmed">("");
const historySort = ref<"desc" | "asc">("desc");
const historyPage = ref(1);
const historyPageSize = ref<(typeof pageSizes)[number]>(10);
const expandedRecordId = ref("");
const encounter = reactive({
  recordId: "",
  date: new Date().toISOString().slice(0, 10),
  selectedIds: [] as string[],
  comment: "",
  optionalKinds: [] as MedicalEncounterSectionKind[],
  texts: {} as Partial<Record<MedicalEncounterSectionKind, string>>,
});

const profileName = computed(() => [appState.control.profile?.firstName, appState.control.profile?.patronymic, appState.control.profile?.lastName].filter(Boolean).join(" "));
const petId = computed(() => String(route.params.petId ?? ""));
const selectedPet = computed(() => appState.medical.pets.find((pet) => pet.petId === petId.value) ?? null);
const selectedGrant = computed(() => appState.medical.grants.find((grant) => grant.petId === petId.value
  && grant.granteeAccountId === appState.session.accountId && grant.status === "active") ?? null);
const canWrite = computed(() => selectedGrant.value?.actions.includes("write_unconfirmed") ?? false);
const canDelegate = computed(() => selectedGrant.value?.actions.includes("delegate") ?? false);
const confirmedIds = computed(() => new Set(appState.medical.confirmedRecordIds));
const petRecords = computed(() => appState.medical.records.filter((record) => record.petId === petId.value));
const currentDirectoryPet = computed(() => selectedDirectoryPet.value?.petId === petId.value
  ? selectedDirectoryPet.value
  : directoryPets.value.find((pet) => pet.petId === petId.value));
const delegatedAccessRows = computed<PetAccessRow[]>(() => {
  if (!selectedGrant.value) return [];
  return appState.medical.grants
    .filter((grant) => grant.parentGrantId === selectedGrant.value!.grantId)
    .map((grant): PetAccessRow => {
      const profile = appState.control.profiles.find((candidate) => candidate.accountId === grant.granteeAccountId);
      return {
        accountId: grant.granteeAccountId,
        displayName: grant.granteeDisplayName
          || (profile ? [profile.firstName, profile.patronymic, profile.lastName].filter(Boolean).join(" ") : grant.granteeAccountId),
        status: grant.status === "active" ? "granted" : "revoked",
        delegationAllowed: grant.actions.includes("delegate"),
        grantId: grant.grantId,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ru"));
});
const delegationPageCount = computed(() => Math.max(1, Math.ceil(delegatedAccessRows.value.length / delegationPageSize.value)));
const optionalAvailable = computed(() => OPTIONAL_ENCOUNTER_SECTION_KINDS.filter((kind) => !encounter.optionalKinds.includes(kind)));

const filteredRecords = computed(() => petRecords.value.filter((record) => {
  const confirmed = confirmedIds.value.has(record.recordId);
  if (historyStatus.value === "confirmed" && !confirmed) return false;
  if (historyStatus.value === "unconfirmed" && confirmed) return false;
  if (historyFrom.value && record.encounterDate < historyFrom.value) return false;
  if (historyTo.value && record.encounterDate > historyTo.value) return false;
  if (historySection.value && !record.sections[historySection.value]) return false;
  const content = `${encounterSummary(record)} ${record.authorDisplayName} ${record.authorAccountId} ${Object.values(record.sections).map((section) => section && isFreeTextValue(section.value) ? section.value.text : "").join(" ")}`.toLocaleLowerCase("ru");
  return !historyQuery.value.trim() || content.includes(historyQuery.value.trim().toLocaleLowerCase("ru"));
}).sort((left, right) => (historySort.value === "desc" ? -1 : 1) * (left.encounterDate.localeCompare(right.encounterDate) || left.createdAt.localeCompare(right.createdAt))));
const pagedRecords = computed(() => filteredRecords.value.slice((historyPage.value - 1) * historyPageSize.value, historyPage.value * historyPageSize.value));

async function perform(task: () => Promise<unknown>, success = ""): Promise<boolean> {
  busy.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    await task();
    successMessage.value = success;
    return true;
  } catch (reason) {
    errorMessage.value = reason instanceof Error ? reason.message : "Операция не выполнена.";
    return false;
  } finally {
    busy.value = false;
  }
}

async function signOut() {
  await logout();
  await router.replace("/auth/login");
}

async function refreshPets() {
  try {
    const result = await loadDoctorPets(
      homeQuery.value,
      homePage.value,
      homePageSize.value,
      homeSort.value,
      homeSortDirection.value,
    );
    directoryPets.value = result.items;
    directoryTotal.value = result.total;
  } catch {
    const direction = homeSortDirection.value === "asc" ? 1 : -1;
    const pets = appState.medical.pets.map((pet) => {
      const grant = appState.medical.grants.find((item) => item.petId === pet.petId && item.granteeAccountId === appState.session.accountId && item.status === "active");
      return { petId: pet.petId, ownerAccountId: pet.ownerAccountId, ownerDisplayName: pet.ownerAccountId, species: pet.species, name: pet.name, updatedAt: pet.updatedAt, permissions: grant?.actions, grantId: grant?.grantId };
    }).sort((left, right) => direction * (homeSort.value === "pet"
      ? left.name.localeCompare(right.name, "ru") || left.ownerDisplayName.localeCompare(right.ownerDisplayName, "ru")
      : left.ownerDisplayName.localeCompare(right.ownerDisplayName, "ru") || left.name.localeCompare(right.name, "ru")));
    directoryTotal.value = pets.length;
    directoryPets.value = pets.slice((homePage.value - 1) * homePageSize.value, homePage.value * homePageSize.value);
  }
}

async function refreshSelectedDirectoryPet(id: string) {
  selectedDirectoryPet.value = null;
  if (!id) return;
  try {
    selectedDirectoryPet.value = await lookupPetDirectory(id);
  } catch {
    // The paged directory remains a useful fallback when the direct lookup is unavailable.
  }
}

function changeHomeSort(field: HomeSortField) {
  if (homeSort.value === field) homeSortDirection.value = homeSortDirection.value === "asc" ? "desc" : "asc";
  else {
    homeSort.value = field;
    homeSortDirection.value = "asc";
  }
}

function homeSortAria(field: HomeSortField): "ascending" | "descending" | "none" {
  if (homeSort.value !== field) return "none";
  return homeSortDirection.value === "asc" ? "ascending" : "descending";
}

async function findPets() {
  petSearchResults.value = [];
  petSearchPerformed.value = false;
  await perform(async () => {
    const result = await searchPetDirectory(petOwnerQuery.value, petNameQuery.value, 1, 50);
    petSearchResults.value = result.items;
    petSearchPerformed.value = true;
  });
}

async function requestAccess(pet: DirectoryPetDto) {
  const succeeded = await perform(async () => {
    await requireRepository().medical.requestAccess(pet.petId);
    petSearchResults.value = petSearchResults.value.filter((candidate) => candidate.petId !== pet.petId);
    if (!petSearchResults.value.length) petSearchPerformed.value = false;
  }, "Запрос отправлен владельцу.");
  if (succeeded) requestDialogOpen.value = false;
}

function openRequestDialog() {
  errorMessage.value = "";
  petSearchResults.value = [];
  petSearchPerformed.value = false;
  requestDialogOpen.value = true;
}

function toggleSelection(id: string) {
  const index = encounter.selectedIds.indexOf(id);
  if (index >= 0) encounter.selectedIds.splice(index, 1);
  else encounter.selectedIds.push(id);
}

function addOptional(kind: MedicalEncounterSectionKind) {
  if (!encounter.optionalKinds.includes(kind)) encounter.optionalKinds.push(kind);
}

function removeOptional(kind: MedicalEncounterSectionKind) {
  encounter.optionalKinds = encounter.optionalKinds.filter((item) => item !== kind);
  delete encounter.texts[kind];
}

function resetEncounter() {
  encounter.recordId = "";
  encounter.date = new Date().toISOString().slice(0, 10);
  encounter.selectedIds = [];
  encounter.comment = "";
  encounter.optionalKinds = [];
  encounter.texts = {};
}

async function saveEncounter() {
  await perform(async () => {
    const sections: Parameters<ReturnType<typeof requireRepository>["medical"]["saveEncounter"]>[0]["sections"] = {
      "what-happened": { selectedIds: [...encounter.selectedIds], comment: encounter.comment },
    };
    for (const kind of encounter.optionalKinds) sections[kind] = { text: encounter.texts[kind] ?? "" };
    await requireRepository().medical.saveEncounter({
      petId: petId.value,
      encounterDate: encounter.date,
      sections,
      ...(encounter.recordId ? { recordId: encounter.recordId } : {}),
    });
    resetEncounter();
  }, "Приём сохранён.");
}

function editRecord(record: (typeof appState.medical.records)[number]) {
  if (confirmedIds.value.has(record.recordId)) return;
  encounter.recordId = record.recordId;
  encounter.date = record.encounterDate;
  const what = record.sections["what-happened"]?.value;
  encounter.selectedIds = isWhatHappenedValue(what) ? [...what.selectedIds] : [];
  encounter.comment = isWhatHappenedValue(what) ? what.comment : record.text;
  encounter.optionalKinds = OPTIONAL_ENCOUNTER_SECTION_KINDS.filter((kind) => Boolean(record.sections[kind]));
  encounter.texts = Object.fromEntries(encounter.optionalKinds.map((kind) => [kind, isFreeTextValue(record.sections[kind]?.value) ? record.sections[kind]!.value.text : ""]));
}

async function findDoctors() {
  doctorSearchPerformed.value = false;
  await perform(async () => {
    const result = await searchDoctorDirectory(doctorQuery.value, 1, 50);
    const existing = new Set(appState.medical.grants.filter((grant) => grant.petId === petId.value && grant.status === "active").map((grant) => grant.granteeAccountId));
    doctors.value = result.items.filter((doctor) => doctor.accountId !== appState.session.accountId && !existing.has(doctor.accountId));
    doctorSearchPerformed.value = true;
  });
}

function openDelegationDialog() {
  doctorQuery.value = "";
  doctors.value = [];
  doctorSearchPerformed.value = false;
  delegationTarget.value = null;
  delegationDelegate.value = false;
  delegationDialogOpen.value = true;
}

async function delegate() {
  if (!delegationTarget.value || !selectedGrant.value) return;
  const actions: PetGrantAction[] = selectedGrant.value.actions.filter((action) => action !== "delegate");
  if (delegationDelegate.value && selectedGrant.value.actions.includes("delegate")) actions.push("delegate");
  delegationConfirm.value = false;
  delegationDialogOpen.value = false;
  await perform(async () => {
    await requireRepository().medical.delegateGrant(selectedGrant.value!.grantId, delegationTarget.value!.accountId, actions);
    await router.push(`/doctor/pets/${petId.value}`);
  }, "Доступ делегирован.");
}

async function relinquish() {
  if (!selectedGrant.value) return;
  relinquishConfirm.value = false;
  await perform(async () => {
    await requireRepository().medical.relinquishAccess(selectedGrant.value!.grantId);
    await router.replace("/doctor/home");
  });
}

function openRecord(record: MedicalRecordDraft) {
  expandedRecordId.value = record.recordId;
  requestAnimationFrame(() => document.getElementById(`encounter-${record.recordId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

watch([homeQuery, homeSort, homeSortDirection, homePageSize], () => {
  localStorage.setItem("klinok:doctor-pets-page-size", String(homePageSize.value));
  if (homePage.value === 1) void refreshPets();
  else homePage.value = 1;
});
watch(homePage, () => { void refreshPets(); });
watch(petId, (id) => { void refreshSelectedDirectoryPet(id); }, { immediate: true });
watch(() => props.scenarioId, (scenarioId) => {
  if (scenarioId === "doctor-pet-request-access") openRequestDialog();
});
watch(requestDialogOpen, (open) => {
  if (!open && props.scenarioId === "doctor-pet-request-access") void router.replace("/doctor/home");
});
watch([historyQuery, historyFrom, historyTo, historySection, historyStatus, historySort, historyPageSize], () => { historyPage.value = 1; });
watch([petId, delegationPageSize], () => { delegationPage.value = 1; });
watch(delegationPageCount, (pageCount) => {
  if (delegationPage.value > pageCount) delegationPage.value = pageCount;
});
onMounted(() => { void refreshPets(); });
</script>

<template>
  <WorkspaceShell role="doctor" title="Кабинет врача" :profile-name="profileName" @sign-out="signOut">
    <p v-if="errorMessage || appState.feedback?.kind === 'error'" class="form-alert error" role="alert">{{ errorMessage || appState.feedback?.text }}</p>
    <p v-if="successMessage" class="form-alert success" role="status">{{ successMessage }}</p>

    <section v-if="scenarioId === 'doctor-home' || scenarioId === 'doctor-pet-request-access'" class="panel doctor-page">
      <div class="doctor-heading"><h2>Медицинские карты</h2></div>
      <label class="administrator-search">
        <span>ФИО владельца, кличка, вид или полный ID</span>
        <span class="administrator-search-control">
          <AppIcon name="search" />
          <input v-model="homeQuery" type="search" placeholder="Поиск" />
        </span>
      </label>
      <div class="owner-access-table-wrap">
        <table class="owner-access-table doctor-access-table">
          <thead>
            <tr>
              <th class="owner-access-actions-header">
                <button
                  class="primary-action inline access-icon-action"
                  type="button"
                  title="Запросить доступ"
                  aria-label="Запросить доступ"
                  @click="openRequestDialog"
                >
                  <AppIcon name="plus" />
                </button>
                <span class="visually-hidden">Действия</span>
              </th>
              <th :aria-sort="homeSortAria('pet')">
                <button class="doctor-sort-button" type="button" @click="changeHomeSort('pet')">
                  Питомец
                  <AppIcon name="chevron-down" :class="{ descending: homeSort === 'pet' && homeSortDirection === 'desc' }" />
                </button>
              </th>
              <th :aria-sort="homeSortAria('owner')">
                <button class="doctor-sort-button" type="button" @click="changeHomeSort('owner')">
                  Владелец
                  <AppIcon name="chevron-down" :class="{ descending: homeSort === 'owner' && homeSortDirection === 'desc' }" />
                </button>
              </th>
              <th>Делегирование</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pet in directoryPets" :key="pet.petId">
              <td class="owner-access-actions" data-label="Действия">
                <div class="owner-access-action-list">
                  <RouterLink
                    class="primary-action inline access-icon-action"
                    :to="`/doctor/pets/${pet.petId}`"
                    title="Открыть медицинскую карту"
                    aria-label="Открыть медицинскую карту"
                  >
                    <AppIcon name="eye" />
                  </RouterLink>
                  <RouterLink
                    v-if="pet.permissions?.includes('delegate')"
                    class="outline-action inline access-icon-action"
                    :to="`/doctor/pets/${pet.petId}/delegate`"
                    title="Делегировать доступ"
                    aria-label="Делегировать доступ"
                  >
                    <AppIcon name="share" />
                  </RouterLink>
                  <RouterLink
                    class="outline-action inline danger-outline access-icon-action"
                    :to="`/doctor/pets/${pet.petId}/cancel-access`"
                    title="Отказаться от доступа"
                    aria-label="Отказаться от доступа"
                  >
                    <AppIcon name="close" />
                  </RouterLink>
                </div>
              </td>
              <td class="owner-access-doctor" data-label="Питомец"><strong>{{ pet.species }} {{ pet.name }}</strong><small>{{ pet.petId }}</small></td>
              <td class="owner-access-doctor" data-label="Владелец"><strong>{{ pet.ownerDisplayName }}</strong><small>{{ pet.ownerAccountId }}</small></td>
              <td data-label="Делегирование">{{ pet.permissions?.includes('delegate') ? 'Да' : 'Нет' }}</td>
            </tr>
            <tr v-if="!directoryPets.length"><td class="doctor-access-empty" colspan="4">Доступных питомцев не найдено.</td></tr>
          </tbody>
        </table>
      </div>
      <AppPaginator
        v-model:page="homePage"
        v-model:page-size="homePageSize"
        class="doctor-access-pagination"
        :total-items="directoryTotal"
        :page-sizes="pageSizes"
        page-size-label="Питомцев на странице"
        aria-label="Навигация по питомцам"
      />

      <ModalDialog v-model="requestDialogOpen" title="Запросить доступ" :busy="busy">
        <div class="form-stack grant-access-form doctor-request-access-form">
          <p v-if="errorMessage" class="form-alert error" role="alert">{{ errorMessage }}</p>
          <form class="form-stack doctor-request-search-form" @submit.prevent="findPets">
            <label><span>ФИО владельца, его часть или полный ID</span><input v-model="petOwnerQuery" type="search" required /></label>
            <label><span>Кличка, её часть или полный ID питомца</span><input v-model="petNameQuery" type="search" required /></label>
            <button class="primary-action inline access-icon-action" type="submit" :disabled="busy" :title="busy ? 'Поиск питомца…' : 'Найти питомца'" :aria-label="busy ? 'Поиск питомца…' : 'Найти питомца'"><AppIcon name="search" /></button>
          </form>
          <div v-for="pet in petSearchResults" :key="pet.petId" class="list-row doctor-request-result">
            <div><strong>{{ pet.species }} {{ pet.name }}</strong><small>{{ pet.petId }}</small><span>{{ pet.ownerDisplayName }}</span><small>{{ pet.ownerAccountId }}</small></div>
            <button class="primary-action inline access-icon-action" type="button" :disabled="busy" title="Отправить запрос" aria-label="Отправить запрос" @click="requestAccess(pet)"><AppIcon name="check" /></button>
          </div>
          <p v-if="petSearchPerformed && !petSearchResults.length">Питомцы не найдены.</p>
          <div class="confirmation-dialog-actions"><button class="outline-action inline access-icon-action" type="button" :disabled="busy" title="Закрыть" aria-label="Закрыть" @click="requestDialogOpen = false"><AppIcon name="close" /></button></div>
        </div>
      </ModalDialog>
    </section>

    <section v-else-if="selectedPet && scenarioId === 'doctor-pet-detail'" class="doctor-page doctor-pet-detail">
      <article class="panel owner-pet-profile">
        <PetProfileHeader :pet="selectedPet" :show-details="false">
          <template #actions>
            <RouterLink v-if="canDelegate" class="outline-action inline owner-profile-action" :to="`/doctor/pets/${petId}/delegate`" title="Делегировать доступ" aria-label="Делегировать доступ"><AppIcon name="share" /></RouterLink>
            <RouterLink class="outline-action inline danger-outline owner-profile-action" :to="`/doctor/pets/${petId}/cancel-access`" title="Отказаться от доступа" aria-label="Отказаться от доступа"><AppIcon name="close" /></RouterLink>
          </template>
        </PetProfileHeader>
        <PetProfileDetails :pet="selectedPet" :owner-display-name="currentDirectoryPet?.ownerDisplayName || selectedPet.ownerAccountId" />
      </article>

      <article class="panel">
        <h2>Эпикриз</h2>
        <div class="doctor-history-filters"><input v-model="historyQuery" type="search" placeholder="Содержание или автор" aria-label="Поиск по истории" /><input v-model="historyFrom" type="date" aria-label="Дата с" /><input v-model="historyTo" type="date" aria-label="Дата по" /><select v-model="historySection" aria-label="Раздел"><option value="">Все разделы</option><option v-for="(label, kind) in ENCOUNTER_SECTION_LABELS" :key="kind" :value="kind">{{ label }}</option></select><select v-model="historyStatus" aria-label="Статус"><option value="">Все статусы</option><option value="confirmed">Подтверждённые</option><option value="unconfirmed">Не подтверждённые</option></select><select v-model="historySort" aria-label="Порядок"><option value="desc">Сначала новые</option><option value="asc">Сначала старые</option></select></div>
        <MedicalRecordEntry
          v-for="record in pagedRecords"
          :key="record.recordId"
          :record="record"
          mode="epicrisis"
          :confirmed="confirmedIds.has(record.recordId)"
          @activate="openRecord"
        />
      </article>

      <article v-if="canWrite" class="panel encounter-editor"><h2>{{ encounter.recordId ? 'Редактирование приёма' : 'Сегодняшний приём' }}</h2><form class="form-stack" @submit.prevent="saveEncounter"><label><span>Дата</span><input v-model="encounter.date" type="date" required /></label><fieldset><legend>Что случилось</legend><div class="encounter-chips"><button v-for="id in encounter.selectedIds" :key="id" type="button" class="selection-chip" @click="toggleSelection(id)">{{ whatHappenedPath(id) }} ×</button></div><WhatHappenedTree :nodes="WHAT_HAPPENED_TAXONOMY" :selected="encounter.selectedIds" @toggle="toggleSelection" /><label><span>Комментарий</span><textarea v-model="encounter.comment" rows="4" /></label></fieldset><article v-for="kind in encounter.optionalKinds" :key="kind" class="encounter-section-card"><div class="doctor-heading"><h3>{{ ENCOUNTER_SECTION_LABELS[kind] }}</h3><button type="button" class="outline-action inline danger-link" @click="removeOptional(kind)">Удалить раздел</button></div><p class="temporary-note">Временный универсальный шаблон free-text-v0.</p><textarea v-model="encounter.texts[kind]" rows="4" required /></article><label v-if="optionalAvailable.length"><span>Добавить раздел</span><select @change="addOptional(($event.target as HTMLSelectElement).value as MedicalEncounterSectionKind); ($event.target as HTMLSelectElement).value = ''"><option value="">Выберите раздел</option><option v-for="kind in optionalAvailable" :key="kind" :value="kind">{{ ENCOUNTER_SECTION_LABELS[kind] }}</option></select></label><div class="row-actions"><button class="primary-action inline" :disabled="busy">Сохранить приём</button><button v-if="encounter.recordId" type="button" class="outline-action inline" @click="resetEncounter">Отмена</button></div></form></article>
      <article v-else class="panel"><p>Доступ только для чтения: создание и изменение приёмов недоступно.</p></article>

      <article class="panel">
        <h2>Предыдущие приёмы</h2>
        <MedicalRecordEntry
          v-for="record in pagedRecords"
          :key="record.recordId"
          :record="record"
          mode="details"
          :confirmed="confirmedIds.has(record.recordId)"
          :action="canWrite ? 'edit' : 'none'"
          :open="expandedRecordId === record.recordId"
          show-author-account-id
          @edit="editRecord"
        />
        <AppPaginator
          v-if="filteredRecords.length"
          v-model:page="historyPage"
          v-model:page-size="historyPageSize"
          :total-items="filteredRecords.length"
          :page-sizes="pageSizes"
          page-size-label="Записей на странице"
          aria-label="Навигация по медицинским записям"
        />
      </article>
    </section>

    <PetAccessManager
      v-else-if="selectedPet && scenarioId === 'doctor-pet-delegate'"
      v-model:page="delegationPage"
      v-model:page-size="delegationPageSize"
      :pet="selectedPet"
      :rows="delegatedAccessRows"
      :page-sizes="pageSizes"
      :owner-display-name="currentDirectoryPet?.ownerDisplayName || selectedPet.ownerAccountId"
      :owner-account-id="currentDirectoryPet?.ownerAccountId || selectedPet.ownerAccountId"
      :can-add="canDelegate"
      add-label="Делегировать доступ"
      empty-message="Делегированные доступы отсутствуют."
      @add="openDelegationDialog"
    >
      <template #headerActions>
        <RouterLink class="outline-action inline owner-profile-action" :to="`/doctor/pets/${selectedPet.petId}`" title="Назад к медицинской карте" aria-label="Назад к медицинской карте"><AppIcon name="chevron-left" /></RouterLink>
      </template>
      <p v-if="!canDelegate" class="form-alert error">Текущий доступ не разрешает делегирование.</p>
      <ModalDialog v-model="delegationDialogOpen" title="Делегировать доступ" :busy="busy">
        <div class="form-stack grant-access-form">
          <form class="form-stack grant-search-form" @submit.prevent="findDoctors">
            <label><span>ФИО врача, его часть или полный ID</span><input v-model="doctorQuery" required /></label>
            <button class="primary-action inline access-icon-action grant-search-action" type="submit" :disabled="busy" :title="busy ? 'Поиск врача…' : 'Найти врача'" :aria-label="busy ? 'Поиск врача…' : 'Найти врача'"><AppIcon name="search" /></button>
          </form>
          <div v-for="doctor in doctors" :key="doctor.accountId" class="list-row"><div><strong>{{ doctor.displayName }}</strong><span>{{ doctor.accountId }}</span></div><button class="outline-action inline access-icon-action" type="button" title="Выбрать врача" aria-label="Выбрать врача" @click="delegationTarget = doctor"><AppIcon name="check" /></button></div>
          <p v-if="doctorSearchPerformed && !doctors.length">Врачи не найдены.</p>
          <form v-if="delegationTarget" class="form-stack" @submit.prevent="delegationConfirm = true">
            <strong>Выбран врач: {{ delegationTarget.displayName }}</strong>
            <label v-if="selectedGrant?.actions.includes('delegate')" class="check-row"><input v-model="delegationDelegate" type="checkbox" /><span>Разрешить дальнейшее делегирование</span></label>
            <div class="confirmation-dialog-actions">
              <button class="outline-action inline access-icon-action" type="button" :disabled="busy" title="Отмена" aria-label="Отмена" @click="delegationDialogOpen = false"><AppIcon name="close" /></button>
              <button class="primary-action inline access-icon-action" type="submit" :disabled="busy" title="Делегировать доступ" aria-label="Делегировать доступ"><AppIcon name="check" /></button>
            </div>
          </form>
          <div v-else class="confirmation-dialog-actions"><button class="outline-action inline access-icon-action" type="button" :disabled="busy" title="Отмена" aria-label="Отмена" @click="delegationDialogOpen = false"><AppIcon name="close" /></button></div>
        </div>
      </ModalDialog>
    </PetAccessManager>

    <section v-else-if="selectedPet && scenarioId === 'doctor-pet-cancel-access'" class="panel doctor-page"><h2>Отказаться от доступа</h2><p>Вы и все врачи, которым вы делегировали доступ к {{ selectedPet.name }}, потеряете медицинскую карту. Ключ питомца будет заменён.</p><button class="primary-action inline danger-link" @click="relinquishConfirm = true">Подтвердить отказ</button></section>
    <section v-else class="owner-empty-state"><p>Питомец недоступен или данные ещё не синхронизированы.</p><RouterLink class="primary-action inline" to="/doctor/home">На главную</RouterLink></section>

    <ConfirmationDialog v-model="delegationConfirm" title="Подтвердить делегирование?" description="Выбранный врач получит доступ к медицинской карте." confirm-label="Делегировать" @confirm="delegate" />
    <ConfirmationDialog v-model="relinquishConfirm" title="Отказаться от доступа?" description="Действие отзовёт вашу ветвь делегирования и заменит ключ питомца." confirm-label="Отказаться" @confirm="relinquish" />
  </WorkspaceShell>
</template>
