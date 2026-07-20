<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { PET_SEXES, type PetSex } from "@klinok/protocol";
import AppIcon from "../components/AppIcon.vue";
import ConfirmationDialog from "../components/ConfirmationDialog.vue";
import WorkspaceShell from "../components/WorkspaceShell.vue";
import { appState, logout, requireRepository } from "../appStore";
import {
  normalizePetInput,
  petBirthSummary,
  preparePetPhoto,
} from "../petProfile";
import type { PetProfile, PetProfileInput } from "../repositories/types";

const props = defineProps<{ role: "owner"; scenarioId: string }>();
const route = useRoute();
const router = useRouter();
const actionError = ref("");
const actionMessage = ref("");
const photoBusy = ref(false);
const deleteConfirmation = ref(false);
const manualGrant = reactive({ doctorAccountId: "", delegate: false });
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
const isForm = computed(() => isCreate.value || isEdit.value);
const pageTitle = computed(() => {
  if (isCreate.value) return "Добавить питомца";
  if (isEdit.value) return selectedPet.value ? `Редактировать: ${selectedPet.value.name}` : "Редактировать питомца";
  if (selectedPet.value) return selectedPet.value.name;
  return "Кабинет владельца";
});
const petRecords = computed(() =>
  selectedPet.value ? appState.medical.records.filter((record) => record.petId === selectedPet.value!.petId) : [],
);
const confirmedIds = computed(() => new Set(appState.medical.confirmations.map((item) => item.recordId)));
const pendingRequests = computed(() =>
  selectedPet.value
    ? appState.medical.accessRequests.filter((request) => request.petId === selectedPet.value!.petId && request.status === "pending")
    : [],
);
const activeGrants = computed(() =>
  selectedPet.value
    ? appState.medical.grants.filter((grant) => grant.petId === selectedPet.value!.petId && grant.status === "active")
    : [],
);
const revokedGrants = computed(() =>
  selectedPet.value
    ? appState.medical.grants.filter((grant) => grant.petId === selectedPet.value!.petId && grant.status === "revoked")
    : [],
);

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

function requesterName(requestId?: string, accountId?: string) {
  const request = appState.medical.accessRequests.find((candidate) => candidate.requestId === requestId);
  return request?.requesterDisplayName || accountId || "Аккаунт врача";
}

async function grantDoctor() {
  if (!selectedPet.value) return;
  await action(async () => {
    await requireRepository().medical.grantDoctor(
      selectedPet.value!.petId,
      manualGrant.doctorAccountId.trim(),
      ["read", "write_unconfirmed", ...(manualGrant.delegate ? ["delegate" as const] : [])],
    );
    manualGrant.doctorAccountId = "";
    manualGrant.delegate = false;
  }, "Доступ предоставлен.");
}

async function deletePet() {
  if (!selectedPet.value) return;
  deleteConfirmation.value = false;
  await action(async () => {
    await requireRepository().medical.deletePet(selectedPet.value!.petId);
    await router.push("/owner/home");
  });
}

function formatDate(value?: string) {
  if (!value) return "Не указана";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}
</script>

<template>
  <WorkspaceShell role="owner" :title="pageTitle" :profile-name="profileName" @sign-out="signOut">
    <p v-if="actionError || appState.error" class="form-alert error" role="alert">{{ actionError || appState.error }}</p>
    <p v-if="actionMessage" class="form-alert success" role="status">{{ actionMessage }}</p>

    <section v-if="isHome" class="owner-home">
      <div class="owner-section-heading">
        <div>
          <h2>Мои питомцы</h2>
          <p>Профили и медицинская история ваших животных</p>
        </div>
        <RouterLink class="primary-action inline" to="/owner/pets/new">Добавить питомца</RouterLink>
      </div>
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
        <div class="owner-photo-editor">
          <img v-if="draft.photoDataUrl" :src="draft.photoDataUrl" alt="Предпросмотр фотографии питомца" />
          <span v-else class="owner-pet-placeholder" aria-hidden="true">{{ draft.species.slice(0, 1).toLocaleUpperCase('ru') }}</span>
          <div>
            <label class="outline-action inline">
              {{ photoBusy ? 'Обработка…' : 'Выбрать фотографию' }}
              <input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" :disabled="photoBusy" @change="selectPhoto" />
            </label>
            <button v-if="draft.photoDataUrl" class="link-action danger-link" type="button" @click="draft.photoDataUrl = ''">Удалить фотографию</button>
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
              <div class="segmented owner-birth-selector">
                <button type="button" :class="{ active: birthMode === 'date' }" @click="birthMode = 'date'">Точная дата</button>
                <button type="button" :class="{ active: birthMode === 'year' }" @click="birthMode = 'year'">Только год</button>
              </div>
              <label v-if="birthMode === 'date'"><span>Дата</span><input v-model="draft.birthDate" type="date" required /></label>
              <label v-else><span>Год</span><input v-model="draft.birthYear" type="number" min="1900" :max="new Date().getFullYear()" required /></label>
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
        <div class="row-actions">
          <button class="primary-action" :disabled="photoBusy">{{ isEdit ? 'Сохранить изменения' : 'Сохранить питомца' }}</button>
          <RouterLink class="outline-action inline" :to="selectedPet ? `/owner/pets/${selectedPet.petId}` : '/owner/home'">Отмена</RouterLink>
        </div>
      </form>
    </section>

    <section v-else-if="selectedPet" class="owner-pet-detail">
      <article class="panel owner-pet-profile">
        <div class="owner-pet-profile-header">
          <img v-if="selectedPet.photoDataUrl" :src="selectedPet.photoDataUrl" :alt="`Фотография питомца ${selectedPet.name}`" />
          <span v-else class="owner-pet-placeholder" aria-hidden="true">{{ selectedPet.species.slice(0, 1).toLocaleUpperCase('ru') }}</span>
          <div>
            <h2>{{ selectedPet.name }}</h2>
            <p>{{ selectedPet.species }} · {{ selectedPet.breed }}</p>
            <p>{{ petBirthSummary(selectedPet) }}</p>
          </div>
          <div class="row-actions owner-profile-actions">
            <RouterLink
              class="primary-action inline owner-profile-action"
              :to="`/owner/pets/${selectedPet.petId}/edit`"
              title="Редактировать"
              aria-label="Редактировать"
            >
              <AppIcon name="edit" />
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
          </div>
        </div>
        <dl class="owner-profile-fields">
          <div><dt>Вид</dt><dd>{{ selectedPet.species }}</dd></div>
          <div><dt>Кличка</dt><dd>{{ selectedPet.name }}</dd></div>
          <div><dt>Порода</dt><dd>{{ selectedPet.breed }}</dd></div>
          <div><dt>Пол</dt><dd>{{ selectedPet.sex || 'Не указан' }}</dd></div>
          <div><dt>Возраст</dt><dd>{{ petBirthSummary(selectedPet) }}</dd></div>
          <div><dt>Окрас</dt><dd>{{ selectedPet.color || 'Не указан' }}</dd></div>
          <div><dt>Номер чипа</dt><dd>{{ selectedPet.chip || 'Нет' }}</dd></div>
          <div><dt>Клеймо</dt><dd>{{ selectedPet.brandMark || 'Нет' }}</dd></div>
          <div><dt>Последняя вакцинация</dt><dd>{{ selectedPet.latestVaccination ? `${formatDate(selectedPet.latestVaccination.date)} · ${selectedPet.latestVaccination.name}` : 'Не указана' }}</dd></div>
          <div><dt>Вес</dt><dd>{{ selectedPet.weightKg ? `${selectedPet.weightKg} кг` : 'Не указан' }}</dd></div>
        </dl>
        <div v-if="selectedPet.notes" class="owner-pet-notes">
          <h3>Заметки</h3>
          <p>{{ selectedPet.notes }}</p>
        </div>
      </article>

      <article class="panel owner-medical-placeholder">
        <h2>История болезни</h2>
        <p v-if="!petRecords.length">Записи появятся здесь после приёма у врача.</p>
        <div v-for="record in petRecords" :key="record.recordId" class="record-card">
          <div><strong>{{ record.title }}</strong><p>{{ record.text }}</p><small>Редакция {{ record.revision }}</small></div>
          <span v-if="confirmedIds.has(record.recordId)" class="status-badge approved">Подтверждена</span>
          <button
            v-else
            class="primary-action inline"
            @click="action(() => requireRepository().medical.confirmRecord(record.petId, record.recordId, record.revision))"
          >
            Подтвердить
          </button>
        </div>
      </article>

      <article class="panel owner-access-panel">
        <h2>Запросы на доступ</h2>
        <p v-if="!pendingRequests.length">Ожидающих запросов нет.</p>
        <div v-for="request in pendingRequests" :key="request.requestId" class="owner-access-row">
          <div><strong>{{ request.requesterDisplayName || request.requesterAccountId }}</strong><small>{{ request.requesterAccountId }}</small></div>
          <div class="row-actions">
            <button class="primary-action inline" @click="action(() => requireRepository().medical.approveAccessRequest(request.requestId), 'Доступ предоставлен.')">Предоставить доступ</button>
            <button class="outline-action inline" @click="action(() => requireRepository().medical.rejectAccessRequest(request.requestId), 'Запрос отклонён.')">Отклонить</button>
          </div>
        </div>
      </article>

      <article class="panel owner-access-panel">
        <h2>Действующие доступы</h2>
        <p v-if="!activeGrants.length">Ни у одного врача пока нет доступа.</p>
        <div v-for="grant in activeGrants" :key="grant.grantId" class="owner-access-row">
          <div><strong>{{ requesterName(grant.requestId, grant.granteeAccountId) }}</strong><small>{{ grant.actions.join(', ') }}</small></div>
          <button class="outline-action inline danger-link" @click="action(() => requireRepository().medical.revokeGrant(grant.grantId), 'Доступ отозван.')">Отозвать</button>
        </div>
      </article>

      <article class="panel owner-access-panel">
        <h2>Предоставить доступ врачу</h2>
        <form class="form-stack" @submit.prevent="grantDoctor">
          <label><span>Идентификатор аккаунта врача</span><input v-model="manualGrant.doctorAccountId" required /></label>
          <label class="check-row"><input v-model="manualGrant.delegate" type="checkbox" /> <span>Разрешить врачу делегирование</span></label>
          <button class="primary-action">Предоставить доступ</button>
        </form>
      </article>

      <article class="panel owner-access-panel">
        <h2>Отозванные доступы</h2>
        <p v-if="!revokedGrants.length">Отозванных доступов нет.</p>
        <div v-for="grant in revokedGrants" :key="grant.grantId" class="owner-access-row">
          <div><strong>{{ requesterName(grant.requestId, grant.granteeAccountId) }}</strong><small>Отозван {{ formatDate(grant.revokedAt?.slice(0, 10)) }}</small></div>
          <button class="outline-action inline" @click="action(() => requireRepository().medical.grantDoctor(selectedPet!.petId, grant.granteeAccountId, ['read', 'write_unconfirmed']), 'Доступ предоставлен повторно.')">Предоставить снова</button>
        </div>
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
      <h2>Питомец не найден</h2>
      <p>Профиль отсутствует, удалён или ещё не синхронизирован.</p>
      <RouterLink class="primary-action inline" to="/owner/home">На главную страницу</RouterLink>
    </section>
  </WorkspaceShell>
</template>
