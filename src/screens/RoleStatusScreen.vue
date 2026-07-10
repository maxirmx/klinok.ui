<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Role, RoleStatus } from "@klinok/protocol";
import BrandLogo from "../components/BrandLogo.vue";
import {
  appState,
  approveDeviceEnrollment,
  bootstrapApp,
  cancelRole,
  deleteAccount,
  getConfig,
  logout,
  importBootstrapRecovery,
  requestRole,
  revokeDevice,
  switchRole,
  updateProfile,
} from "../appStore";

const route = useRoute();
const router = useRouter();
const labels: Record<Role, string> = { administrator: "Администратор", doctor: "Врач", owner: "Владелец животного" };
const statuses: Record<RoleStatus, string> = {
  not_requested: "Не запрошена", pending: "Ожидает решения", approved: "Одобрена", rejected: "Отклонена",
  suspended: "Приостановлена", revoked: "Отозвана", expired: "Истекла",
};
const requests = computed(() => new Map(appState.control.roles.map((request) => [request.role, request])));
const recoveryText = ref("");
const recoveryPassphrase = ref("");
const deletionArmed = ref(false);
const profileDraft = reactive({ firstName: "", lastName: "", patronymic: "" });
watch(() => appState.control.profile, (profile) => {
  if (profile) Object.assign(profileDraft, { firstName: profile.firstName, lastName: profile.lastName, patronymic: profile.patronymic ?? "" });
}, { immediate: true });

async function readRecoveryFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  recoveryText.value = file ? await file.text() : "";
}

async function activate(role: Role) {
  switchRole(role);
  const destination = typeof route.query.continue === "string" && route.query.switch === role
    ? route.query.continue
    : role === "administrator" ? "/admin/home" : role === "doctor" ? "/doctor/home" : "/owner/home";
  await router.push(destination);
}
</script>

<template>
  <main class="status-page">
    <header class="workspace-header">
      <BrandLogo variant="full" size="compact" />
      <div><h1>Роли и доступ</h1><p>Выберите активную одобренную роль</p></div>
      <button class="link-action" @click="logout()">Выйти</button>
    </header>

    <p v-if="appState.error" class="form-alert error" role="alert">{{ appState.error }}</p>
    <section v-if="appState.keyRecoveryRequired" class="panel critical-panel" role="alert">
      <h2>Ключи этого аккаунта отсутствуют на устройстве</h2>
      <template v-if="appState.session.accountId === getConfig()?.p2p.bootstrapAccountId && !appState.session.devices?.length">
        <p>Для первого устройства начального администратора загрузите офлайн-пакет, созданный командой provision.</p>
        <form class="form-stack" @submit.prevent="importBootstrapRecovery(recoveryText, recoveryPassphrase)">
          <label><span>Пакет восстановления</span><input type="file" accept="application/json,.json" required @change="readRecoveryFile" /></label>
          <label><span>Пароль пакета</span><input v-model="recoveryPassphrase" type="password" required /></label>
          <button class="primary-action" :disabled="!recoveryText || recoveryPassphrase.length < 16">Импортировать ключи</button>
        </form>
      </template>
      <p v-else>Восстановление пароля не возвращает ключи P2P. Подтвердите новое устройство с уже действующего устройства. Если все ключи потеряны, обратитесь к администратору и зарегистрируйте новый аккаунт.</p>
    </section>
    <section v-else-if="appState.devicePending" class="panel" role="status">
      <h2>Устройство ожидает подтверждения</h2>
      <p>Откройте Клинок на действующем устройстве и подтвердите перенос ключей.</p>
      <button class="outline-action inline" @click="bootstrapApp(true)">Проверить статус</button>
    </section>

    <section v-if="appState.session.enrollments?.some(item => item.status === 'pending' && item.ephemeralPublicKey) && appState.session.device" class="panel critical-panel">
      <h2>Новые устройства</h2>
      <p>Подтверждайте только свои устройства. Передача ключей зашифрована для конкретного запроса.</p>
      <div v-for="enrollment in appState.session.enrollments.filter(item => item.status === 'pending' && item.ephemeralPublicKey)" :key="enrollment.enrollmentId" class="list-row">
        <div><strong>Устройство {{ enrollment.deviceId }}</strong><small>{{ enrollment.createdAt }}</small></div>
        <button class="primary-action inline" @click="approveDeviceEnrollment(enrollment.enrollmentId)">Подтвердить и передать ключи</button>
      </div>
    </section>

    <section class="role-status-grid">
      <article v-for="role in (['owner', 'doctor', 'administrator'] as Role[])" :key="role" class="panel role-status-card">
        <div>
          <h2>{{ labels[role] }}</h2>
          <span class="status-badge" :class="requests.get(role)?.status ?? 'not_requested'">
            {{ statuses[requests.get(role)?.status ?? 'not_requested'] }}
          </span>
        </div>
        <p v-if="requests.get(role)?.reason">Причина: {{ requests.get(role)?.reason }}</p>
        <button v-if="requests.get(role)?.status === 'approved'" class="primary-action" @click="activate(role)">Использовать роль</button>
        <button v-else-if="requests.get(role)?.status === 'pending'" class="outline-action" @click="cancelRole(role)">Отменить запрос</button>
        <button v-else class="outline-action" @click="requestRole(role)">{{ requests.has(role) ? 'Отправить повторно' : 'Запросить роль' }}</button>
      </article>
    </section>

    <section v-if="appState.control.notifications.length" class="panel">
      <h2>Уведомления</h2>
      <article v-for="item in appState.control.notifications" :key="item.id" class="list-row">
        <strong>{{ item.title }}</strong><span>{{ item.message }}</span><small>{{ item.createdAt }}</small>
      </article>
    </section>

    <section class="panel critical-panel">
      <h2>Профиль</h2>
      <form class="form-stack" @submit.prevent="updateProfile({ ...profileDraft, patronymic: profileDraft.patronymic || undefined })">
        <label><span>Имя</span><input v-model="profileDraft.firstName" required /></label>
        <label><span>Фамилия</span><input v-model="profileDraft.lastName" required /></label>
        <label><span>Отчество, если есть</span><input v-model="profileDraft.patronymic" /></label>
        <button class="primary-action inline">Сохранить профиль</button>
      </form>
    </section>

    <section class="panel critical-panel account-security">
      <h2>Аккаунт и устройства</h2>
      <div v-for="device in appState.session.devices" :key="device.deviceId" class="list-row">
        <div><strong>{{ device.deviceId }}</strong><span>{{ device.status === 'active' ? 'Действующее устройство' : 'Устройство отозвано' }}</span></div>
        <button v-if="device.status === 'active'" class="outline-action inline" @click="revokeDevice(device.deviceId)">Отозвать устройство</button>
      </div>
      <div class="row-actions">
        <button class="outline-action inline" @click="logout(true)">Выйти на всех устройствах</button>
        <button v-if="!deletionArmed" class="outline-action inline danger-link" @click="deletionArmed = true">Удалить аккаунт</button>
      </div>
      <div v-if="deletionArmed" class="form-alert error" role="alert">
        <p>Удаление необратимо. Медицинская история останется в подписанном журнале, но аккаунт потеряет доступ.</p>
        <div class="row-actions">
          <button class="outline-action inline" @click="deletionArmed = false">Отмена</button>
          <button class="primary-action inline" @click="deleteAccount">Подтвердить удаление</button>
        </div>
      </div>
    </section>
  </main>
</template>
