<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Role, RoleStatus } from "@klinok/protocol";
import AppIcon from "../components/AppIcon.vue";
import ConfirmationDialog from "../components/ConfirmationDialog.vue";
import PasswordInput from "../components/PasswordInput.vue";
import RoleSelectionCards from "../components/RoleSelectionCards.vue";
import SyncStatus from "../components/SyncStatus.vue";
import WorkspaceShell from "../components/WorkspaceShell.vue";
import { getDeviceName } from "../repositories/deviceVault";
import {
  appState,
  approveDeviceEnrollment,
  bootstrapApp,
  cancelRole,
  deleteAccount,
  getConfig,
  logout,
  importBootstrapRecovery,
  rejectDeviceEnrollment,
  replaceLostBootstrapDevice,
  requestRole,
  revokeDevice,
  switchRole,
  updateCredentials,
  updateProfile,
} from "../appStore";

type FeedbackKey = "forms" | "roles" | "devices";
type Feedback = { kind: "success" | "error"; text: string } | null;
type ProfileValues = { firstName: string; lastName: string; patronymic: string };

const route = useRoute();
const router = useRouter();
const statuses: Record<RoleStatus, string> = {
  not_requested: "Не запрошена", pending: "Ожидает решения", approved: "Одобрена", rejected: "Отклонена",
  suspended: "Приостановлена", revoked: "Отозвана", expired: "Истекла",
};
const requests = computed(() => new Map(appState.control.roles.map((request) => [request.role, request])));
const roleStatuses = computed<Partial<Record<Role, RoleStatus | "not_requested">>>(() => ({
  owner: requests.value.get("owner")?.status ?? "not_requested",
  doctor: requests.value.get("doctor")?.status ?? "not_requested",
  administrator: requests.value.get("administrator")?.status ?? "not_requested",
}));
const disabledRoleSelection = computed<Role[]>(() => (["owner", "doctor", "administrator"] as Role[])
  .filter((role) => requests.value.get(role)?.status !== "approved"));
const recoveryText = ref("");
const recoveryPassphrase = ref("");
const accountDeletionConfirmation = ref(false);
const devicePendingRevocation = ref<{ deviceId: string; deviceName: string } | null>(null);
const feedback = reactive<Record<FeedbackKey, Feedback>>({ forms: null, roles: null, devices: null });
const profileDraft = reactive<ProfileValues>({ firstName: "", lastName: "", patronymic: "" });
const savedProfile = reactive<ProfileValues>({ firstName: "", lastName: "", patronymic: "" });
const credentialsDraft = reactive({ email: "", password: "", confirmPassword: "" });
const savedEmail = ref("");
const savedEmailDisplay = ref("");
const normalizedProfileDraft = computed<ProfileValues>(() => ({
  firstName: profileDraft.firstName.trim(),
  lastName: profileDraft.lastName.trim(),
  patronymic: profileDraft.patronymic.trim(),
}));
const profileName = computed(() => [
  savedProfile.firstName,
  savedProfile.patronymic,
  savedProfile.lastName,
].filter(Boolean).join(" "));
const profileCanSave = computed(() => {
  const draft = normalizedProfileDraft.value;
  return Boolean(draft.firstName && draft.lastName) && (
    draft.firstName !== savedProfile.firstName
    || draft.lastName !== savedProfile.lastName
    || draft.patronymic !== savedProfile.patronymic
  );
});
const profileCanRestore = computed(() => (
  profileDraft.firstName !== savedProfile.firstName
  || profileDraft.lastName !== savedProfile.lastName
  || profileDraft.patronymic !== savedProfile.patronymic
));
const normalizedEmailDraft = computed(() => credentialsDraft.email.trim().toLocaleLowerCase());
const credentialsCanSave = computed(() => {
  const password = credentialsDraft.password;
  const passwordValid = password
    ? password.length >= 6 && password.length <= 128 && password === credentialsDraft.confirmPassword
    : !credentialsDraft.confirmPassword;
  const hasChanges = normalizedEmailDraft.value !== savedEmail.value || Boolean(password);
  return normalizedEmailDraft.value.includes("@") && passwordValid && hasChanges;
});
const credentialsCanRestore = computed(() => (
  credentialsDraft.email !== savedEmailDisplay.value
  || Boolean(credentialsDraft.password)
  || Boolean(credentialsDraft.confirmPassword)
));
const visibleDevices = computed(() => (appState.session.devices ?? [])
  .filter((device) => device.status === "active"));
const canRevokeDevice = computed(() => visibleDevices.value.length > 1);
const isBootstrapAccount = computed(() => Boolean(
  appState.session.accountId
  && appState.session.accountId === getConfig()?.p2p.bootstrapAccountId,
));

const deviceName = (device: { deviceId: string; deviceName?: string }) => device.deviceName?.trim()
  || (device.deviceId === appState.session.device?.deviceId ? getDeviceName() : null)
  || "Устройство без названия";

function sameProfile(left: ProfileValues, right: ProfileValues): boolean {
  return left.firstName === right.firstName
    && left.lastName === right.lastName
    && left.patronymic === right.patronymic;
}

function synchronizeProfileDraft() {
  const profile = appState.control.profile;
  const values: ProfileValues = {
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    patronymic: profile?.patronymic ?? "",
  };
  const draftIsPristine = sameProfile(profileDraft, savedProfile);
  Object.assign(savedProfile, values);
  if (draftIsPristine) Object.assign(profileDraft, values);
}

watch(() => appState.control.profile, synchronizeProfileDraft, { immediate: true });
watch(() => appState.session.email, (email) => {
  credentialsDraft.email = email ?? "";
  savedEmailDisplay.value = email ?? "";
  savedEmail.value = email?.trim().toLocaleLowerCase() ?? "";
}, { immediate: true });

function restoreProfile() {
  Object.assign(profileDraft, savedProfile);
  feedback.forms = null;
}

function restoreCredentials() {
  credentialsDraft.email = savedEmailDisplay.value;
  credentialsDraft.password = "";
  credentialsDraft.confirmPassword = "";
  feedback.forms = null;
}

async function readRecoveryFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  recoveryText.value = file ? await file.text() : "";
}

async function signOut(all = false) {
  await logout(all);
  await router.replace("/auth/login");
}

async function action(key: FeedbackKey, success: string, task: () => Promise<unknown>) {
  feedback[key] = null;
  try {
    await task();
    feedback[key] = { kind: "success", text: success };
    return true;
  } catch (reason) {
    feedback[key] = { kind: "error", text: reason instanceof Error ? reason.message : "Не удалось сохранить изменения." };
    return false;
  }
}

async function saveProfile() {
  const { firstName, lastName, patronymic } = normalizedProfileDraft.value;
  if (!firstName || !lastName) {
    feedback.forms = { kind: "error", text: "Имя и фамилия обязательны." };
    return;
  }
  const saved = await action("forms", "Изменения профиля сохранены.", () => updateProfile({
    firstName,
    lastName,
    patronymic,
  }));
  if (saved) {
    Object.assign(savedProfile, { firstName, lastName, patronymic });
    Object.assign(profileDraft, { firstName, lastName, patronymic });
  }
}

async function saveCredentials() {
  const email = normalizedEmailDraft.value;
  if (!email.includes("@")) {
    feedback.forms = { kind: "error", text: "Введите корректный адрес электронной почты." };
    return;
  }
  if (credentialsDraft.password !== credentialsDraft.confirmPassword) {
    feedback.forms = { kind: "error", text: "Пароли не совпадают." };
    return;
  }
  if (credentialsDraft.password && (credentialsDraft.password.length < 6 || credentialsDraft.password.length > 128)) {
    feedback.forms = { kind: "error", text: "Пароль должен содержать от 6 до 128 символов." };
    return;
  }

  const input = {
    ...(email !== savedEmail.value ? { email } : {}),
    ...(credentialsDraft.password ? { password: credentialsDraft.password } : {}),
  };
  if (!input.email && !input.password) {
    feedback.forms = { kind: "error", text: "Измените адрес электронной почты или укажите новый пароль." };
    return;
  }
  const successMessage = input.email && input.password
    ? "Электронная почта и пароль сохранены."
    : input.email ? "Электронная почта сохранена." : "Новый пароль сохранён.";
  const saved = await action("forms", successMessage, () => updateCredentials(input));
  if (saved) {
    savedEmail.value = email;
    savedEmailDisplay.value = email;
    credentialsDraft.email = email;
    credentialsDraft.password = "";
    credentialsDraft.confirmPassword = "";
  }
}

async function activate(role: Role) {
  const changed = await action("roles", "Активная роль изменена.", async () => {
    await switchRole(role);
    if (typeof route.query.continue === "string" && route.query.switch === role) await router.push(route.query.continue);
  });
  if (!changed) return;
}

async function confirmAccountDeletion() {
  accountDeletionConfirmation.value = false;
  if (isBootstrapAccount.value) return;
  await action("devices", "Аккаунт удалён.", deleteAccount);
}

async function confirmDeviceRevocation() {
  const device = devicePendingRevocation.value;
  if (!device) return;
  devicePendingRevocation.value = null;
  await action("devices", "Устройство отозвано.", () => revokeDevice(device.deviceId));
}
</script>

<template>
  <WorkspaceShell :role="appState.activeRole" title="Настройки пользователя" :profile-name="profileName" settings @sign-out="signOut()">
    <div class="profile-page">
      <p v-if="appState.feedback?.kind === 'error'" class="form-alert error profile-global-alert" role="alert">{{ appState.feedback.text }}</p>

    <section v-if="appState.keyRecoveryRequired" class="panel critical-panel" role="alert">
      <h2>Ключи этого аккаунта отсутствуют на устройстве</h2>
      <template v-if="appState.session.accountId === getConfig()?.p2p.bootstrapAccountId && !appState.session.devices?.length">
        <p>Для первого устройства начального администратора загрузите офлайн-пакет, созданный командой provision.</p>
        <form class="form-stack" @submit.prevent="importBootstrapRecovery(recoveryText, recoveryPassphrase)">
          <label><span>Пакет восстановления</span><input type="file" accept="application/json,.json" required @change="readRecoveryFile" /></label>
          <PasswordInput v-model="recoveryPassphrase" label="Пароль пакета" required />
          <button class="primary-action" :disabled="!recoveryText || recoveryPassphrase.length < 16">Импортировать ключи</button>
        </form>
      </template>
      <p v-else>Восстановление пароля не возвращает ключи P2P. Подтвердите новое устройство с уже действующего устройства. Если все ключи потеряны, обратитесь к администратору и зарегистрируйте новый аккаунт.</p>
    </section>

    <section v-else-if="appState.devicePending" class="panel profile-gate" role="status">
      <h2>Устройство ожидает подтверждения</h2>
      <p>Откройте Клинок на действующем устройстве и подтвердите перенос ключей.</p>
      <template v-if="isBootstrapAccount && !appState.session.serverKeySetAvailable">
        <h3>Все действующие устройства утрачены?</h3>
        <p>Замените их только с помощью офлайн-пакета начального администратора. Все прежние устройства и сеансы будут отозваны.</p>
        <form class="form-stack" @submit.prevent="action('devices', 'Утраченное устройство заменено.', () => replaceLostBootstrapDevice(recoveryText, recoveryPassphrase))">
          <label><span>Пакет восстановления</span><input type="file" accept="application/json,.json" required @change="readRecoveryFile" /></label>
          <PasswordInput v-model="recoveryPassphrase" label="Пароль пакета" required />
          <button class="primary-action" :disabled="appState.busy || !recoveryText || recoveryPassphrase.length < 16">Заменить утраченное устройство</button>
        </form>
        <p v-if="feedback.devices" class="form-alert" :class="feedback.devices.kind" :role="feedback.devices.kind === 'error' ? 'alert' : 'status'">{{ feedback.devices.text }}</p>
      </template>
      <button class="outline-action inline" @click="bootstrapApp(true)">Проверить статус</button>
    </section>

      <div v-else class="profile-layout">
      <section class="panel profile-section">
        <div class="profile-section-heading">
          <div><h2>Личные данные</h2><p>Измените личные данные.</p></div>
          <div class="profile-section-actions">
            <button
              class="primary-action inline profile-icon-action"
              type="submit"
              form="profile-form"
              :disabled="appState.busy || !profileCanSave"
              title="Сохранить личные данные"
              aria-label="Сохранить личные данные"
            >
              <AppIcon name="check" />
            </button>
            <button
              class="outline-action inline profile-icon-action"
              type="button"
              :disabled="appState.busy || !profileCanRestore"
              title="Восстановить личные данные"
              aria-label="Восстановить личные данные"
              @click="restoreProfile"
            >
              <AppIcon name="restore" />
            </button>
          </div>
        </div>
        <form id="profile-form" class="form-stack profile-form" @submit.prevent="saveProfile">
          <label><span>Имя</span><input v-model="profileDraft.firstName" autocomplete="given-name" required /></label>
          <label><span>Отчество, если есть</span><input v-model="profileDraft.patronymic" autocomplete="additional-name" /></label>
          <label><span>Фамилия</span><input v-model="profileDraft.lastName" autocomplete="family-name" required /></label>
        </form>
      </section>

      <section class="panel profile-section">
        <div class="profile-section-heading">
          <div><h2>Электронная почта и пароль</h2><p>Для смены пароля подтвердите его повторным вводом.</p></div>
          <div class="profile-section-actions">
            <button
              class="primary-action inline profile-icon-action"
              type="submit"
              form="credentials-form"
              :disabled="appState.busy || !credentialsCanSave"
              title="Сохранить электронную почту и пароль"
              aria-label="Сохранить электронную почту и пароль"
            >
              <AppIcon name="check" />
            </button>
            <button
              class="outline-action inline profile-icon-action"
              type="button"
              :disabled="appState.busy || !credentialsCanRestore"
              title="Восстановить электронную почту и пароль"
              aria-label="Восстановить электронную почту и пароль"
              @click="restoreCredentials"
            >
              <AppIcon name="restore" />
            </button>
          </div>
        </div>
        <form id="credentials-form" class="form-stack credentials-form" @submit.prevent="saveCredentials">
          <label><span>Электронная почта</span><input v-model="credentialsDraft.email" type="email" autocomplete="email" required /></label>
          <PasswordInput v-model="credentialsDraft.password" label="Новый пароль — от 6 до 128 символов" minlength="6" maxlength="128" autocomplete="new-password" />
          <PasswordInput v-model="credentialsDraft.confirmPassword" label="Повторите новый пароль" minlength="6" maxlength="128" autocomplete="new-password" />
          <p v-if="credentialsDraft.confirmPassword && credentialsDraft.password !== credentialsDraft.confirmPassword" class="field-error" role="alert">Пароли не совпадают.</p>
        </form>
      </section>

      <div
        v-if="feedback.forms"
        class="form-alert profile-form-feedback"
        :class="feedback.forms.kind"
        :role="feedback.forms.kind === 'error' ? 'alert' : 'status'"
      >
        <span>{{ feedback.forms.text }}</span>
        <button type="button" aria-label="Закрыть сообщение" @click="feedback.forms = null">
          <AppIcon name="close" />
        </button>
      </div>

      <section class="panel profile-section profile-roles">
        <div class="profile-section-heading"><div><h2>Роли и доступ</h2><p>Измените активную роль или отправьте запрос на новую.</p></div></div>
        <p v-if="feedback.roles" class="form-alert" :class="feedback.roles.kind" :role="feedback.roles.kind === 'error' ? 'alert' : 'status'">{{ feedback.roles.text }}</p>
        <RoleSelectionCards
          :model-value="appState.activeRole"
          :status-by-role="roleStatuses"
          :disabled-roles="disabledRoleSelection"
          include-administrator
          @update:model-value="activate"
        >
          <template #meta="{ role }">
            <div class="role-status-badges">
              <span class="status-badge" :class="requests.get(role)?.status ?? 'not_requested'">{{ statuses[requests.get(role)?.status ?? 'not_requested'] }}</span>
              <span v-if="appState.activeRole === role" class="status-badge active">Активная</span>
            </div>
          </template>
          <template #details="{ role }">
            <p v-if="requests.get(role)?.reason">Причина: {{ requests.get(role)?.reason }}</p>
          </template>
          <template #actions="{ role }">
            <button v-if="requests.get(role)?.status === 'pending'" class="outline-action inline" @click="action('roles', 'Запрос на роль отменён.', () => cancelRole(role))">Отменить запрос</button>
            <button v-else-if="requests.get(role)?.status !== 'approved'" class="outline-action inline" @click="action('roles', 'Запрос на роль отправлен.', () => requestRole(role))">{{ requests.has(role) ? 'Отправить повторно' : 'Запросить роль' }}</button>
          </template>
        </RoleSelectionCards>
      </section>

      <section class="panel profile-section profile-sync-status" aria-labelledby="profile-sync-status-title">
        <div class="profile-section-heading">
          <div>
            <h2 id="profile-sync-status-title">Синхронизация данных</h2>
            <p>Показывается состояние текущего сеанса без ошибок из завершённых сеансов.</p>
          </div>
          <SyncStatus />
        </div>
      </section>

      <section class="panel profile-section account-security">
        <div class="profile-section-heading"><div><h2>Аккаунт и устройства</h2><p>Управляйте подтверждёнными устройствами и сеансами.</p></div></div>
        <p v-if="feedback.devices" class="form-alert" :class="feedback.devices.kind" :role="feedback.devices.kind === 'error' ? 'alert' : 'status'">{{ feedback.devices.text }}</p>

        <template v-if="!appState.session.serverKeySetAvailable && appState.session.enrollments?.some(item => item.status === 'pending' && item.ephemeralPublicKey) && appState.session.device">
          <h3>Новые устройства</h3>
          <p>Подтверждайте только свои устройства. Передача ключей зашифрована для конкретного запроса.</p>
          <div v-for="enrollment in appState.session.enrollments.filter(item => item.status === 'pending' && item.ephemeralPublicKey)" :key="enrollment.enrollmentId" class="list-row">
            <div><strong>{{ deviceName(enrollment) }}</strong><span>ID: {{ enrollment.deviceId }}</span><small>Запрошено {{ enrollment.createdAt }}</small></div>
            <div class="row-actions">
              <button class="primary-action inline" @click="action('devices', 'Устройство подтверждено.', () => approveDeviceEnrollment(enrollment.enrollmentId))">Подтвердить и передать ключи</button>
              <button class="outline-action inline danger-link" @click="action('devices', 'Запрос устройства отклонён.', () => rejectDeviceEnrollment(enrollment.enrollmentId))">Отклонить</button>
            </div>
          </div>
        </template>

        <p v-if="appState.session.serverKeySetAvailable">Отозванное устройство отключается, но может быть зарегистрировано снова после успешного входа в аккаунт.</p>

        <div v-for="device in visibleDevices" :key="device.deviceId" class="list-row">
          <div><strong>{{ deviceName(device) }}</strong><span>{{ device.deviceId === appState.session.device?.deviceId ? 'Это устройство' : 'Действующее устройство' }}</span><small>ID: {{ device.deviceId }}</small></div>
          <button
            class="outline-action inline"
            :disabled="!canRevokeDevice"
            :title="canRevokeDevice ? undefined : 'Нельзя отозвать последнее действующее устройство.'"
            @click="devicePendingRevocation = { deviceId: device.deviceId, deviceName: deviceName(device) }"
          >
            Отозвать устройство
          </button>
        </div>
        <div class="row-actions account-actions">
          <button class="outline-action inline" @click="signOut(true)">Выйти на всех устройствах</button>
          <button
            class="outline-action inline danger-link"
            :disabled="appState.busy || isBootstrapAccount"
            :title="isBootstrapAccount ? 'Начальный аккаунт администратора нельзя удалить.' : undefined"
            @click="accountDeletionConfirmation = true"
          >
            Удалить аккаунт
          </button>
        </div>
      </section>
      </div>
    </div>
    <ConfirmationDialog
      v-model="accountDeletionConfirmation"
      title="Удалить аккаунт?"
      description="Удаление необратимо. Медицинская карта останется в журнале, но аккаунт потеряет доступ."
      confirm-label="Удалить аккаунт"
      @confirm="confirmAccountDeletion"
    />
    <ConfirmationDialog
      :model-value="Boolean(devicePendingRevocation)"
      :title="`Отозвать устройство «${devicePendingRevocation?.deviceName ?? ''}»?`"
      description="Устройство потеряет доступ к аккаунту и больше не сможет использовать сохранённые ключи."
      confirm-label="Отозвать устройство"
      @update:model-value="value => { if (!value) devicePendingRevocation = null; }"
      @confirm="confirmDeviceRevocation"
    />
  </WorkspaceShell>
</template>
