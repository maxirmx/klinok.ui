<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  PET_SEXES,
  type DirectoryProfileDto,
  type PetSex,
} from "@klinok/protocol";
import AppIcon from "../components/AppIcon.vue";
import AppPaginator from "../components/AppPaginator.vue";
import ConfirmationDialog from "../components/ConfirmationDialog.vue";
import MedicalRecordEntry from "../components/MedicalRecordEntry.vue";
import ModalDialog from "../components/ModalDialog.vue";
import PetAccessManager from "../components/PetAccessManager.vue";
import PetProfileDetails from "../components/PetProfileDetails.vue";
import PetProfileHeader from "../components/PetProfileHeader.vue";
import WorkspaceShell from "../components/WorkspaceShell.vue";
import { appState, deleteDirectoryPet, logout, requireRepository, searchDoctorDirectory, syncDirectoryPet } from "../appStore";
import {
  normalizePetInput,
  petBirthSummary,
  preparePetPhoto,
} from "../petProfile";
import type { PetAccessRow } from "../petAccess";
import type { MedicalRecordDraft, PetProfile, PetProfileInput } from "../repositories/types";

const props = defineProps<{ role: "owner"; scenarioId: string }>();
const route = useRoute();
const router = useRouter();
const actionError = ref("");
const actionMessage = ref("");
const photoBusy = ref(false);
const deleteConfirmation = ref(false);
const grantDialogOpen = ref(false);
const grantBusy = ref(false);
const grantError = ref("");
const doctorQuery = ref("");
const doctorResults = ref<DirectoryProfileDto[]>([]);
const doctorSearchPerformed = ref(false);
const selectedDoctor = ref<DirectoryProfileDto | null>(null);
const grantDelegate = ref(false);
const birthMode = ref<"date" | "year">("date");
const draft = reactive({
  name: "",
  species: "Собака",
  breed: "",
  sex: "" as PetSex | "",
  photoDataUrl: "",
  birthDate: "",
  birthYear: "",
  color: "",
  chip: "",
  brandMark: "",
  vaccinationDate: "",
  vaccinationName: "",
  weightKg: "",
  notes: "",
});

const profileName = computed(() =>
  [appState.control.profile?.firstName, appState.control.profile?.patronymic, appState.control.profile?.lastName]
    .filter(Boolean)
    .join(" "),
);
const selectedPet = computed(() =>
  appState.medical.pets.find((pet) => pet.petId === String(route.params.petId ?? "")) ?? null,
);
const isHome = computed(() => props.scenarioId === "owner-home");
const isCreate = computed(() => props.scenarioId === "owner-pet-create");
const isEdit = computed(() => props.scenarioId === "owner-pet-edit");
const isAccess = computed(() => props.scenarioId === "owner-pet-access");
const isForm = computed(() => isCreate.value || isEdit.value);
const pageSizes = [10, 20, 50] as const;
const medicalPage = ref(1);
const medicalPageSize = ref<(typeof pageSizes)[number]>(10);
const accessPage = ref(1);
const accessPageSize = ref<(typeof pageSizes)[number]>(10);
const expandedRecordId = ref("");
const pageTitle = computed(() => {
  if (isHome.value) return "Мои питомцы";
  if (isCreate.value) return "Добавить питомца";
  if (isEdit.value) return selectedPet.value ? `Редактировать: ${selectedPet.value.name}` : "Редактировать питомца";
  if (isAccess.value) return "Доступ врачей";
  if (selectedPet.value) return selectedPet.value.name;
  return "Питомец не найден";
});
const petRecords = computed(() =>
  selectedPet.value
    ? appState.medical.records
      .filter((record) => record.petId === selectedPet.value!.petId)
      .sort((left, right) => right.encounterDate.localeCompare(left.encounterDate)
        || right.createdAt.localeCompare(left.createdAt))
    : [],
);
const medicalPageCount = computed(() => Math.max(1, Math.ceil(petRecords.value.length / medicalPageSize.value)));
const pagedPetRecords = computed(() => petRecords.value.slice(
  (medicalPage.value - 1) * medicalPageSize.value,
  medicalPage.value * medicalPageSize.value,
));
const confirmedIds = computed(() => new Set(appState.medical.confirmedRecordIds));

watch([() => selectedPet.value?.petId, medicalPageSize], () => { medicalPage.value = 1; });
watch(medicalPageCount, (pageCount) => {
  if (medicalPage.value > pageCount) medicalPage.value = pageCount;
});

function latest<T>(items: T[], timestamp: (item: T) => string): T | undefined {
  return [...items].sort((left, right) => timestamp(right).localeCompare(timestamp(left)))[0];
}

const accessRows = computed<PetAccessRow[]>(() => {
  if (!selectedPet.value) return [];
  const grants = appState.medical.grants.filter((grant) => grant.petId === selectedPet.value!.petId);
  const requests = appState.medical.accessRequests.filter((request) => request.petId === selectedPet.value!.petId);
  const accountIds = new Set([
    ...grants.map((grant) => grant.granteeAccountId),
    ...requests.filter((request) => request.status === "pending").map((request) => request.requesterAccountId),
  ]);

  return [...accountIds].map((accountId): PetAccessRow | null => {
    const doctorGrants = grants.filter((grant) => grant.granteeAccountId === accountId);
    const doctorRequests = requests.filter((request) => request.requesterAccountId === accountId);
    const activeGrant = latest(
      doctorGrants.filter((grant) => grant.status === "active"),
      (grant) => grant.createdAt,
    );
    const pendingRequest = latest(
      doctorRequests.filter((request) => request.status === "pending"),
      (request) => request.requestedAt,
    );
    const revokedGrant = latest(
      doctorGrants.filter((grant) => grant.status === "revoked"),
      (grant) => grant.revokedAt ?? grant.createdAt,
    );
    const grant = activeGrant ?? revokedGrant;
    const namedRequest = latest(
      doctorRequests.filter((request) => Boolean(request.requesterDisplayName)),
      (request) => request.requestedAt,
    );
    const profile = appState.control.profiles.find((candidate) => candidate.accountId === accountId);
    const profileName = profile
      ? [profile.firstName, profile.patronymic, profile.lastName].filter(Boolean).join(" ")
      : "";
    const displayName = (activeGrant?.granteeDisplayName ??
      pendingRequest?.requesterDisplayName ??
      grant?.granteeDisplayName ??
      namedRequest?.requesterDisplayName ??
      profileName) || "ФИО не указано";

    if (activeGrant) return {
      accountId,
      displayName,
      status: "granted",
      grantId: activeGrant.grantId,
      delegationAllowed: activeGrant.actions.includes("delegate"),
    };
    if (pendingRequest) return { accountId, displayName, status: "requested", requestId: pendingRequest.requestId };
    if (revokedGrant) return { accountId, displayName, status: "revoked", grantId: revokedGrant.grantId };
    return null;
  }).filter((row): row is PetAccessRow => Boolean(row))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ru"));
});
const accessPageCount = computed(() => Math.max(1, Math.ceil(accessRows.value.length / accessPageSize.value)));

watch([() => selectedPet.value?.petId, accessPageSize], () => { accessPage.value = 1; });
watch(accessPageCount, (pageCount) => {
  if (accessPage.value > pageCount) accessPage.value = pageCount;
});

function blankDraft() {
  Object.assign(draft, {
    name: "",
    species: "Собака",
    breed: "",
    sex: "",
    photoDataUrl: "",
    birthDate: "",
    birthYear: "",
    color: "",
    chip: "",
    brandMark: "",
    vaccinationDate: "",
    vaccinationName: "",
    weightKg: "",
    notes: "",
  });
  birthMode.value = "date";
}

function hydrateDraft(pet: PetProfile | null) {
  actionError.value = "";
  actionMessage.value = "";
  if (!pet) {
    blankDraft();
    return;
  }
  Object.assign(draft, {
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    sex: pet.sex ?? "",
    photoDataUrl: pet.photoDataUrl ?? "",
    birthDate: pet.birthDate ?? "",
    birthYear: pet.birthYear ? String(pet.birthYear) : "",
    color: pet.color ?? "",
    chip: pet.chip ?? "",
    brandMark: pet.brandMark ?? "",
    vaccinationDate: pet.latestVaccination?.date ?? "",
    vaccinationName: pet.latestVaccination?.name ?? "",
    weightKg: pet.weightKg ? String(pet.weightKg) : "",
    notes: pet.notes ?? "",
  });
  birthMode.value = pet.birthDate ? "date" : "year";
}

watch(
  [() => props.scenarioId, () => selectedPet.value?.petId, () => selectedPet.value?.updatedAt],
  () => {
    if (isCreate.value) blankDraft();
    else if (isEdit.value) hydrateDraft(selectedPet.value);
  },
  { immediate: true },
);

async function signOut() {
  await logout();
  await router.replace("/auth/login");
}

async function action(task: () => Promise<unknown>, success = "") {
  actionError.value = "";
  actionMessage.value = "";
  try {
    await task();
    actionMessage.value = success;
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : "Операция не выполнена.";
  }
}

function validateDraft(): string {
  if (!draft.name.trim() || !draft.species.trim() || !draft.breed.trim() || !draft.color.trim()) {
    return "Заполните кличку, вид, породу и окрас.";
  }
  if (!draft.sex || !PET_SEXES.includes(draft.sex)) return "Выберите одно из четырёх значений пола.";
  const today = new Date().toISOString().slice(0, 10);
  if (birthMode.value === "date") {
    if (!draft.birthDate) return "Укажите дату рождения.";
    if (draft.birthDate > today) return "Дата рождения не может быть в будущем.";
  } else {
    const year = Number(draft.birthYear);
    if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) return "Укажите корректный год рождения.";
  }
  const weight = Number(draft.weightKg);
  if (!Number.isFinite(weight) || weight <= 0) return "Укажите положительный вес в килограммах.";
  if (Boolean(draft.vaccinationDate) !== Boolean(draft.vaccinationName.trim())) {
    return "Для последней вакцинации укажите и дату, и название вакцины.";
  }
  if (draft.vaccinationDate > today) return "Дата последней вакцинации не может быть в будущем.";
  return "";
}

function petInput(): PetProfileInput {
  return normalizePetInput({
    name: draft.name,
    species: draft.species,
    breed: draft.breed,
    sex: draft.sex as PetSex,
    ...(draft.photoDataUrl ? { photoDataUrl: draft.photoDataUrl } : {}),
    ...(birthMode.value === "date" ? { birthDate: draft.birthDate } : { birthYear: Number(draft.birthYear) }),
    color: draft.color,
    ...(draft.chip ? { chip: draft.chip } : {}),
    ...(draft.brandMark ? { brandMark: draft.brandMark } : {}),
    ...(draft.vaccinationDate && draft.vaccinationName
      ? { latestVaccination: { date: draft.vaccinationDate, name: draft.vaccinationName } }
      : {}),
    weightKg: Number(draft.weightKg),
    ...(draft.notes ? { notes: draft.notes } : {}),
  });
}

async function savePet() {
  const error = validateDraft();
  if (error) {
    actionError.value = error;
    return;
  }
  await action(async () => {
    if (isCreate.value) {
      const petId = await requireRepository().medical.createPet(petInput());
      await syncDirectoryPet({ petId, species: draft.species.trim(), name: draft.name.trim() });
      await router.push(`/owner/pets/${petId}`);
      return;
    }
    if (!selectedPet.value) throw new Error("Питомец не найден.");
    await requireRepository().medical.updatePet({
      petId: selectedPet.value.petId,
      ownerAccountId: selectedPet.value.ownerAccountId,
      keyVersion: selectedPet.value.keyVersion,
      tombstoned: false,
      updatedAt: selectedPet.value.updatedAt,
      ...petInput(),
    });
    await syncDirectoryPet({ petId: selectedPet.value.petId, species: draft.species.trim(), name: draft.name.trim() });
    await router.push(`/owner/pets/${selectedPet.value.petId}`);
  });
}

async function selectPhoto(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  photoBusy.value = true;
  actionError.value = "";
  try {
    draft.photoDataUrl = await preparePetPhoto(file);
  } catch (reason) {
    actionError.value = reason instanceof Error ? reason.message : "Не удалось обработать фотографию.";
  } finally {
    photoBusy.value = false;
    input.value = "";
  }
}

async function copyPetLink() {
  if (!selectedPet.value) return;
  actionError.value = "";
  actionMessage.value = "";
  try {
    const path = router.resolve(`/owner/pets/${selectedPet.value.petId}`).href;
    await navigator.clipboard.writeText(new URL(path, window.location.origin).href);
    actionMessage.value = "Ссылка скопирована.";
  } catch {
    actionError.value = "Не удалось скопировать ссылку.";
  }
}

function openGrantDialog() {
  grantError.value = "";
  doctorQuery.value = "";
  doctorResults.value = [];
  doctorSearchPerformed.value = false;
  selectedDoctor.value = null;
  grantDelegate.value = false;
  grantDialogOpen.value = true;
}

async function findDoctors() {
  grantBusy.value = true;
  grantError.value = "";
  doctorResults.value = [];
  doctorSearchPerformed.value = false;
  selectedDoctor.value = null;
  try {
    const result = await searchDoctorDirectory(doctorQuery.value, 1, 50);
    const activeDoctorIds = new Set(appState.medical.grants
      .filter((grant) => grant.petId === selectedPet.value?.petId && grant.status === "active")
      .map((grant) => grant.granteeAccountId));
    doctorResults.value = result.items.filter((doctor) => !activeDoctorIds.has(doctor.accountId));
    doctorSearchPerformed.value = true;
  } catch (reason) {
    grantError.value = reason instanceof Error ? reason.message : "Не удалось найти врача.";
  } finally {
    grantBusy.value = false;
  }
}

async function grantDoctor() {
  if (!selectedPet.value || !selectedDoctor.value) {
    grantError.value = "Выберите врача из результатов поиска.";
    return;
  }
  grantBusy.value = true;
  grantError.value = "";
  try {
    await requireRepository().medical.grantDoctor(
      selectedPet.value!.petId,
      selectedDoctor.value!.accountId,
      ["read", "write_unconfirmed", ...(grantDelegate.value ? ["delegate" as const] : [])],
      { granteeDisplayName: selectedDoctor.value!.displayName },
    );
    doctorQuery.value = "";
    doctorResults.value = [];
    selectedDoctor.value = null;
    grantDelegate.value = false;
    grantDialogOpen.value = false;
    actionError.value = "";
    actionMessage.value = "Доступ предоставлен.";
  } catch (reason) {
    grantError.value = reason instanceof Error ? reason.message : "Не удалось предоставить доступ.";
  } finally {
    grantBusy.value = false;
  }
}

async function regrantAccess(row: PetAccessRow) {
  if (!selectedPet.value) return;
  await action(
    () => requireRepository().medical.grantDoctor(
      selectedPet.value!.petId,
      row.accountId,
      ["read", "write_unconfirmed"],
      row.displayName === "ФИО не указано" ? {} : { granteeDisplayName: row.displayName },
    ),
    "Доступ предоставлен повторно.",
  );
}

async function deletePet() {
  if (!selectedPet.value) return;
  deleteConfirmation.value = false;
  await action(async () => {
    await requireRepository().medical.deletePet(selectedPet.value!.petId);
    await deleteDirectoryPet(selectedPet.value!.petId);
    await router.push("/owner/home");
  });
}

function openMedicalRecord(record: MedicalRecordDraft) {
  expandedRecordId.value = record.recordId;
  requestAnimationFrame(() => document.getElementById(`encounter-${record.recordId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function confirmMedicalRecord(record: MedicalRecordDraft) {
  void action(
    () => requireRepository().medical.confirmRecord(record.petId, record.recordId, record.revision),
    "Приём подтверждён.",
  );
}
</script>

<template>
  <WorkspaceShell role="owner" title="Кабинет владельца" :profile-name="profileName" @sign-out="signOut">
    <p v-if="actionError || appState.feedback?.kind === 'error'" class="form-alert error" role="alert">{{ actionError || appState.feedback?.text }}</p>
    <p v-if="actionMessage" class="form-alert success" role="status">{{ actionMessage }}</p>

    <div class="owner-section-heading owner-page-heading">
      <div>
        <h2>{{ pageTitle }}</h2>
        <p v-if="isHome">Профили и медицинская история ваших животных</p>
        <p v-else-if="isAccess">Управляйте запросами, доступом и правом делегирования.</p>
      </div>
      <RouterLink
        v-if="isHome"
        class="primary-action inline owner-profile-action"
        to="/owner/pets/new"
        title="Добавить питомца"
        aria-label="Добавить питомца"
      >
        <AppIcon name="plus" />
      </RouterLink>
    </div>

    <section v-if="isHome" class="owner-home">
      <div v-if="appState.medical.pets.length" class="owner-pet-ribbon" aria-label="Питомцы">
        <RouterLink
          v-for="pet in appState.medical.pets"
          :key="pet.petId"
          class="owner-pet-card"
          :to="`/owner/pets/${pet.petId}`"
        >
          <img v-if="pet.photoDataUrl" :src="pet.photoDataUrl" :alt="`Фотография питомца ${pet.name}`" />
          <span v-else class="owner-pet-placeholder" aria-hidden="true">{{ pet.species.slice(0, 1).toLocaleUpperCase('ru') }}</span>
          <span class="owner-pet-card-copy">
            <strong>{{ pet.name }}</strong>
            <small>{{ pet.species }} · {{ pet.breed }}</small>
            <small>{{ petBirthSummary(pet) }}</small>
          </span>
        </RouterLink>
      </div>
      <div v-else class="owner-empty-state">
        <span class="owner-pet-placeholder" aria-hidden="true">+</span>
        <h2>Питомцев пока нет</h2>
        <p>Создайте первый профиль, чтобы вести медицинскую историю и управлять доступом врачей.</p>
        <RouterLink class="primary-action inline" to="/owner/pets/new">Добавить питомца</RouterLink>
      </div>
    </section>

    <section v-else-if="isForm && (isCreate || selectedPet)" class="owner-form-layout">
      <form class="panel form-stack owner-pet-form" @submit.prevent="savePet">
        <div class="owner-pet-form-header">
          <img v-if="draft.photoDataUrl" :src="draft.photoDataUrl" alt="Предпросмотр фотографии питомца" />
          <span v-else class="owner-pet-placeholder" aria-hidden="true">{{ draft.species.slice(0, 1).toLocaleUpperCase('ru') }}</span>
          <div class="owner-photo-actions">
            <label
              class="outline-action inline owner-profile-action"
              :title="photoBusy ? 'Обработка фотографии' : 'Выбрать фотографию'"
              :aria-label="photoBusy ? 'Обработка фотографии' : 'Выбрать фотографию'"
            >
              <AppIcon :name="draft.photoDataUrl ? 'edit' : 'plus'" />
              <input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" :disabled="photoBusy" @change="selectPhoto" />
            </label>
            <button
              v-if="draft.photoDataUrl"
              class="outline-action inline danger-outline owner-profile-action"
              type="button"
              title="Удалить фотографию"
              aria-label="Удалить фотографию"
              @click="draft.photoDataUrl = ''"
            >
              <AppIcon name="trash" />
            </button>
          </div>
          <div class="row-actions owner-pet-form-actions">
            <button
              class="primary-action inline owner-profile-action"
              type="submit"
              :disabled="photoBusy"
              :title="isEdit ? 'Сохранить изменения' : 'Сохранить питомца'"
              :aria-label="isEdit ? 'Сохранить изменения' : 'Сохранить питомца'"
            >
              <AppIcon name="check" />
            </button>
            <RouterLink
              class="outline-action inline owner-profile-action"
              :to="selectedPet ? `/owner/pets/${selectedPet.petId}` : '/owner/home'"
              title="Отмена"
              aria-label="Отмена"
            >
              <AppIcon name="close" />
            </RouterLink>
          </div>
        </div>

        <div class="owner-form-grid">
          <label><span>Кличка</span><input v-model="draft.name" required /></label>
          <label><span>Вид</span><input v-model="draft.species" list="pet-species" required /><datalist id="pet-species"><option value="Собака" /><option value="Кошка" /></datalist></label>
          <label><span>Порода</span><input v-model="draft.breed" required /></label>
          <label>
            <span>Пол</span>
            <select v-model="draft.sex" required>
              <option value="" disabled>Выберите</option>
              <option v-for="sex in PET_SEXES" :key="sex" :value="sex">{{ sex }}</option>
            </select>
          </label>
          <fieldset class="owner-birth-field">
            <legend>Дата рождения</legend>
            <div class="owner-birth-row">
              <div class="owner-birth-selector" role="radiogroup" aria-label="Точность даты рождения">
                <label>
                  <input v-model="birthMode" type="radio" value="date" />
                  <span>Точная дата</span>
                </label>
                <label>
                  <input v-model="birthMode" type="radio" value="year" />
                  <span>Только год</span>
                </label>
              </div>
              <input
                v-if="birthMode === 'date'"
                v-model="draft.birthDate"
                type="date"
                required
                aria-label="Точная дата рождения"
              />
              <input
                v-else
                v-model="draft.birthYear"
                type="number"
                min="1900"
                :max="new Date().getFullYear()"
                required
                aria-label="Год рождения"
              />
            </div>
          </fieldset>
          <label><span>Окрас</span><input v-model="draft.color" required /></label>
          <label><span>Вес, кг</span><input v-model="draft.weightKg" type="number" min="0.01" step="0.01" required /></label>
          <label><span>Номер чипа, если есть</span><input v-model="draft.chip" /></label>
          <label><span>Клеймо, если есть</span><input v-model="draft.brandMark" /></label>
          <label><span>Дата последней вакцинации</span><input v-model="draft.vaccinationDate" type="date" /></label>
          <label><span>Название вакцины</span><input v-model="draft.vaccinationName" /></label>
          <label class="owner-notes-field"><span>Заметки</span><textarea v-model="draft.notes" rows="5" /></label>
        </div>
      </form>
    </section>

    <PetAccessManager
      v-else-if="isAccess && selectedPet"
      v-model:page="accessPage"
      v-model:page-size="accessPageSize"
      :pet="selectedPet"
      :rows="accessRows"
      :page-sizes="pageSizes"
      empty-message="Доступы и ожидающие запросы отсутствуют."
      @add="openGrantDialog"
    >
      <template #headerActions>
        <RouterLink
          class="outline-action inline owner-profile-action"
          :to="`/owner/pets/${selectedPet.petId}`"
          title="Назад к информации о питомце"
          aria-label="Назад к информации о питомце"
        >
          <AppIcon name="chevron-left" />
        </RouterLink>
      </template>
      <template #rowActions="{ row }">
        <template v-if="row.status === 'requested' && row.requestId">
          <button class="primary-action inline access-icon-action" type="button" title="Предоставить доступ" aria-label="Предоставить доступ" @click="action(() => requireRepository().medical.approveAccessRequest(row.requestId!), 'Доступ предоставлен.')"><AppIcon name="check" /></button>
          <button class="outline-action inline danger-outline access-icon-action" type="button" title="Отклонить запрос" aria-label="Отклонить запрос" @click="action(() => requireRepository().medical.rejectAccessRequest(row.requestId!), 'Запрос отклонён.')"><AppIcon name="close" /></button>
        </template>
        <template v-else-if="row.status === 'granted' && row.grantId">
          <button class="outline-action inline access-icon-action" :class="{ 'danger-outline': row.delegationAllowed }" type="button" :title="row.delegationAllowed ? 'Отключить делегирование' : 'Разрешить делегирование'" :aria-label="row.delegationAllowed ? 'Отключить делегирование' : 'Разрешить делегирование'" @click="row.delegationAllowed ? action(() => requireRepository().medical.disableGrantDelegation(row.grantId!), 'Делегирование отключено.') : action(() => requireRepository().medical.enableGrantDelegation(row.grantId!), 'Делегирование разрешено.')"><AppIcon name="share" /></button>
          <button class="outline-action inline danger-outline access-icon-action" type="button" title="Отозвать доступ" aria-label="Отозвать доступ" @click="action(() => requireRepository().medical.revokeGrant(row.grantId!), 'Доступ отозван.')"><AppIcon name="close" /></button>
        </template>
        <button v-else class="primary-action inline access-icon-action" type="button" title="Предоставить доступ повторно" aria-label="Предоставить доступ повторно" @click="regrantAccess(row)"><AppIcon name="check" /></button>
      </template>

      <ModalDialog
        v-model="grantDialogOpen"
        title="Предоставить доступ"
        :busy="grantBusy"
      >
        <div class="form-stack grant-access-form">
          <p v-if="grantError" class="form-alert error" role="alert">{{ grantError }}</p>
          <form class="form-stack grant-search-form" @submit.prevent="findDoctors">
            <label>
              <span>ФИО врача, его часть или полный ID</span>
              <input v-model="doctorQuery" type="search" required />
            </label>
            <button
              class="primary-action inline access-icon-action grant-search-action"
              type="submit"
              :disabled="grantBusy"
              :title="grantBusy ? 'Поиск врача…' : 'Найти врача'"
              :aria-label="grantBusy ? 'Поиск врача…' : 'Найти врача'"
            >
              <AppIcon name="search" />
            </button>
          </form>
          <div v-for="doctor in doctorResults" :key="doctor.accountId" class="list-row"><div><strong>{{ doctor.displayName }}</strong><span>{{ doctor.accountId }}</span></div><button class="outline-action inline access-icon-action" type="button" title="Выбрать врача" aria-label="Выбрать врача" @click="selectedDoctor = doctor"><AppIcon name="check" /></button></div>
          <p v-if="doctorSearchPerformed && !doctorResults.length">Врачи не найдены.</p>
          <form v-if="selectedDoctor" class="form-stack" @submit.prevent="grantDoctor"><strong>Выбран врач: {{ selectedDoctor.displayName }}</strong><label class="check-row"><input v-model="grantDelegate" type="checkbox" /><span>Разрешить врачу делегирование</span></label><div class="confirmation-dialog-actions"><button class="outline-action inline access-icon-action" type="button" :disabled="grantBusy" title="Отмена" aria-label="Отмена" @click="grantDialogOpen = false"><AppIcon name="close" /></button><button class="primary-action inline access-icon-action" type="submit" :disabled="grantBusy" :title="grantBusy ? 'Предоставление доступа…' : 'Предоставить доступ'" :aria-label="grantBusy ? 'Предоставление доступа…' : 'Предоставить доступ'"><AppIcon name="check" /></button></div></form>
          <div v-else class="confirmation-dialog-actions"><button class="outline-action inline access-icon-action" type="button" :disabled="grantBusy" title="Отмена" aria-label="Отмена" @click="grantDialogOpen = false"><AppIcon name="close" /></button></div>
        </div>
      </ModalDialog>
    </PetAccessManager>

    <section v-else-if="selectedPet" class="owner-pet-detail">
      <article class="panel owner-pet-profile">
        <PetProfileHeader :pet="selectedPet" :show-details="false">
          <template #actions>
            <RouterLink
              class="primary-action inline owner-profile-action"
              :to="`/owner/pets/${selectedPet.petId}/edit`"
              title="Редактировать"
              aria-label="Редактировать"
            >
              <AppIcon name="edit" />
            </RouterLink>
            <RouterLink
              class="outline-action inline owner-profile-action"
              :to="`/owner/pets/${selectedPet.petId}/access`"
              title="Доступ врачей"
              aria-label="Доступ врачей"
            >
              <AppIcon name="user" />
            </RouterLink>
            <button
              class="outline-action inline owner-profile-action"
              type="button"
              title="Копировать ссылку"
              aria-label="Копировать ссылку"
              @click="copyPetLink"
            >
              <AppIcon name="link" />
            </button>
            <button
              class="outline-action inline danger-outline owner-profile-action"
              type="button"
              title="Удалить"
              aria-label="Удалить"
              @click="deleteConfirmation = true"
            >
              <AppIcon name="trash" />
            </button>
          </template>
        </PetProfileHeader>
        <PetProfileDetails :pet="selectedPet" />
      </article>

      <article class="panel owner-medical-placeholder">
        <h2>Эпикриз</h2>
        <p v-if="!petRecords.length">Записи появятся здесь после приёма у врача.</p>
        <MedicalRecordEntry
          v-for="record in pagedPetRecords"
          :key="record.recordId"
          :record="record"
          mode="epicrisis"
          :confirmed="confirmedIds.has(record.recordId)"
          @activate="openMedicalRecord"
        />
      </article>

      <article class="panel owner-medical-placeholder">
        <h2>Предыдущие приёмы</h2>
        <p v-if="!petRecords.length">Предыдущих приёмов пока нет.</p>
        <MedicalRecordEntry
          v-for="record in pagedPetRecords"
          :key="record.recordId"
          :record="record"
          mode="details"
          :confirmed="confirmedIds.has(record.recordId)"
          action="confirm"
          :open="expandedRecordId === record.recordId"
          @confirm="confirmMedicalRecord"
        />
        <AppPaginator
          v-if="petRecords.length"
          v-model:page="medicalPage"
          v-model:page-size="medicalPageSize"
          class="owner-medical-pagination"
          :total-items="petRecords.length"
          :page-sizes="pageSizes"
          page-size-label="Записей на странице"
          aria-label="Навигация по медицинским записям"
        />
      </article>

      <ConfirmationDialog
        v-model="deleteConfirmation"
        :title="`Удалить профиль ${selectedPet.name}?`"
        description="Профиль исчезнет из кабинета, ожидающие запросы будут отклонены, а действующие доступы — отозваны."
        confirm-label="Удалить питомца"
        @confirm="deletePet"
      />
    </section>

    <section v-else class="owner-empty-state">
      <p>Профиль отсутствует, удалён или ещё не синхронизирован.</p>
      <RouterLink class="primary-action inline" to="/owner/home">На главную страницу</RouterLink>
    </section>
  </WorkspaceShell>
</template>
