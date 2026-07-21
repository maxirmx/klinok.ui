<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import type { PetGrantAction, Role } from "@klinok/protocol";
import WorkspaceShell from "../components/WorkspaceShell.vue";
import { appState, logout, requireRepository } from "../appStore";

defineProps<{ role: Role; scenarioId: string }>();
const router = useRouter();
const roleLabels: Record<Role, string> = { administrator: "Администратор", doctor: "Врач", owner: "Владелец животного" };
const recordDraft = reactive({ recordId: "", petId: "", title: "", text: "", addendumTo: "" });
const delegationDraft = reactive({ parentGrantId: "", doctorAccountId: "", read: true, write: false, delegate: false });
const accessRequestPetId = ref("");
const actionError = ref("");
const confirmedIds = computed(() => new Set(appState.medical.confirmations.map((item) => item.recordId)));

async function signOut() {
  await logout();
  await router.replace("/auth/login");
}

function formatProfileName(profile?: { firstName: string; patronymic?: string; lastName: string } | null) {
  return [profile?.firstName, profile?.patronymic, profile?.lastName].filter(Boolean).join(" ");
}

async function action(task: () => Promise<unknown>) {
  actionError.value = "";
  try { await task(); } catch (reason) { actionError.value = reason instanceof Error ? reason.message : "Операция не выполнена."; }
}

async function saveRecord() {
  await action(async () => {
    await requireRepository().medical.saveRecord({
      petId: recordDraft.petId, title: recordDraft.title, text: recordDraft.text,
      ...(recordDraft.recordId ? { recordId: recordDraft.recordId } : {}),
      ...(recordDraft.addendumTo ? { addendumTo: recordDraft.addendumTo } : {}),
    });
    Object.assign(recordDraft, { recordId: "", petId: "", title: "", text: "", addendumTo: "" });
  });
}

function editRecord(recordId: string) {
  const record = appState.medical.records.find((candidate) => candidate.recordId === recordId);
  if (record && !confirmedIds.value.has(record.recordId)) Object.assign(recordDraft, {
    recordId: record.recordId, petId: record.petId, title: record.title, text: record.text, addendumTo: "",
  });
}

async function delegateGrant() {
  const actions: PetGrantAction[] = ["read"];
  if (delegationDraft.write) actions.push("write_unconfirmed");
  if (delegationDraft.delegate) actions.push("delegate");
  await action(() => requireRepository().medical.delegateGrant(delegationDraft.parentGrantId, delegationDraft.doctorAccountId, actions));
}

async function requestPetAccess() {
  await action(async () => {
    await requireRepository().medical.requestAccess(accessRequestPetId.value.trim());
    accessRequestPetId.value = "";
  });
}

</script>

<template>
  <WorkspaceShell :role="role" :title="roleLabels[role]" :profile-name="formatProfileName(appState.control.profile)" @sign-out="signOut">
    <p v-if="actionError || appState.feedback?.kind === 'error'" class="form-alert error" role="alert">{{ actionError || appState.feedback?.text }}</p>

    <template v-if="role === 'owner'">
      <section class="owner-empty-state">
        <p>Кабинет владельца доступен на новой главной странице.</p>
        <button class="primary-action inline" @click="router.push('/owner/home')">Открыть</button>
      </section>
    </template>

    <template v-else>
      <section class="workspace-grid">
        <article id="doctor-request-access" class="panel" data-workspace-section>
          <h2>Запросить доступ к питомцу</h2>
          <form class="form-stack" @submit.prevent="requestPetAccess">
            <label><span>Идентификатор питомца</span><input v-model="accessRequestPetId" required /></label>
            <button class="primary-action">Отправить запрос</button>
          </form>
          <div v-for="request in appState.medical.accessRequests" :key="request.requestId" class="list-row">
            <strong>{{ request.petId }}</strong>
            <span>{{ request.status === 'pending' ? 'Ожидает решения владельца' : request.status === 'approved' ? 'Одобрен' : request.status === 'rejected' ? 'Отклонён' : 'Отменён' }}</span>
            <button
              v-if="request.status === 'pending'"
              class="outline-action inline"
              @click="action(() => requireRepository().medical.cancelAccessRequest(request.requestId))"
            >
              Отменить
            </button>
          </div>
        </article>
        <article id="doctor-pets" class="panel wide-panel" data-workspace-section>
          <h2>Доступные питомцы</h2>
          <div v-for="pet in appState.medical.pets" :key="pet.petId" class="pet-operational-card"><strong>{{ pet.name }}</strong><span>{{ pet.species }} · {{ pet.breed }}</span></div>
          <p v-if="!appState.medical.pets.length">Владельцы ещё не предоставили доступ.</p>
        </article>
        <article id="doctor-new-record" class="panel" data-workspace-section>
          <h2>Новая запись</h2>
          <form class="form-stack" @submit.prevent="saveRecord">
            <label><span>Питомец</span><select v-model="recordDraft.petId" required><option value="" disabled>Выберите</option><option v-for="pet in appState.medical.pets" :key="pet.petId" :value="pet.petId">{{ pet.name }}</option></select></label>
            <label><span>Заголовок</span><input v-model="recordDraft.title" required /></label>
            <label><span>Запись</span><textarea v-model="recordDraft.text" required /></label>
            <label><span>Дополнение к записи, если требуется</span><select v-model="recordDraft.addendumTo"><option value="">Новая запись</option><option v-for="record in appState.medical.records.filter(item => confirmedIds.has(item.recordId))" :key="record.recordId" :value="record.recordId">{{ record.title }}</option></select></label>
            <button class="primary-action">{{ recordDraft.recordId ? 'Сохранить изменения' : 'Сохранить черновик' }}</button>
          </form>
        </article>
        <article id="doctor-delegation" class="panel" data-workspace-section>
          <h2>Делегировать доступ врачу</h2>
          <form class="form-stack" @submit.prevent="delegateGrant">
            <label><span>Исходный доступ</span><select v-model="delegationDraft.parentGrantId" required><option value="" disabled>Выберите</option><option v-for="grant in appState.medical.grants.filter(item => item.status === 'active' && item.actions.includes('delegate') && item.granteeAccountId === appState.session.accountId)" :key="grant.grantId" :value="grant.grantId">{{ grant.petId }}</option></select></label>
            <label><span>Аккаунт врача</span><input v-model="delegationDraft.doctorAccountId" required /></label>
            <label><input v-model="delegationDraft.write" type="checkbox" /> Работа с неподтверждёнными записями</label>
            <label><input v-model="delegationDraft.delegate" type="checkbox" /> Разрешить дальнейшее делегирование</label>
            <button class="primary-action">Делегировать</button>
          </form>
        </article>
        <article id="doctor-records" class="panel wide-panel" data-workspace-section>
          <h2>Записи</h2>
          <div v-for="record in appState.medical.records" :key="record.recordId" class="record-card">
            <div><strong>{{ record.title }}</strong><p>{{ record.text }}</p><small>Редакция {{ record.revision }}</small></div>
            <span class="status-badge" :class="confirmedIds.has(record.recordId) ? 'approved' : 'pending'">{{ confirmedIds.has(record.recordId) ? 'Подтверждена владельцем' : 'Черновик' }}</span>
            <button v-if="!confirmedIds.has(record.recordId)" class="outline-action inline" @click="editRecord(record.recordId)">Редактировать</button>
          </div>
        </article>
      </section>
    </template>
  </WorkspaceShell>
</template>
