<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Role } from "@klinok/protocol";
import AppIcon from "../components/AppIcon.vue";
import BrandLogo from "../components/BrandLogo.vue";
import PasswordInput from "../components/PasswordInput.vue";
import { appState, forgotPassword, getConfig, login, register, resetPassword, verifyEmail } from "../appStore";
import { getOrCreateDeviceName } from "../repositories/deviceVault";
import { roleHomePath } from "../roleNavigation";
import { APP_VERSION } from "../version";

type InitialRole = Extract<Role, "owner" | "doctor">;

const props = defineProps<{ scenarioId: string }>();
const route = useRoute();
const router = useRouter();
const email = ref("");
const password = ref("");
const deviceName = ref(getOrCreateDeviceName());
const confirmPassword = ref("");
const registrationConfirmPassword = ref("");
const initialRole = ref<InitialRole>("owner");
const acceptedConsent = ref(false);
const acceptedAgreement = ref(false);
const ageConfirmed = ref(false);
const localMessage = ref("");
const registration = reactive({
  firstName: "", lastName: "", patronymic: "", email: "", password: "",
});

const mode = computed(() => props.scenarioId.replace("auth-", ""));
const title = computed(() => ({
  login: "Вход в Клинок", register: "Создание аккаунта", consent: "Согласия и возраст",
  verify: "Подтверждение почты", forgot: "Восстановление доступа", reset: "Новый пароль",
}[mode.value] ?? "Клинок"));

async function submitLogin() {
  try {
    await login(email.value, password.value, deviceName.value);
    const destination = appState.keyRecoveryRequired || appState.devicePending
      ? "/roles"
      : roleHomePath(appState.activeRole);
    await router.replace(destination);
  } catch { /* app store exposes a localized error */ }
}

function continueRegistration() {
  if (!registration.firstName.trim() || !registration.lastName.trim() || !registration.email.includes("@") ||
    registration.password.length < 12 || registration.password !== registrationConfirmPassword.value) return;
  sessionStorage.setItem("klinok:registration", JSON.stringify({ ...registration, requestedRoles: [initialRole.value] }));
  void router.push("/auth/register/consent");
}

async function submitRegistration() {
  const saved = sessionStorage.getItem("klinok:registration");
  if (!saved || !acceptedConsent.value || !acceptedAgreement.value || !ageConfirmed.value) return;
  const input = JSON.parse(saved) as typeof registration & { requestedRoles: InitialRole[] };
  try {
    await register({ ...input, patronymic: input.patronymic || undefined, ageConfirmed: true });
    sessionStorage.removeItem("klinok:registration");
    localMessage.value = "Письмо отправлено. Перейдите по ссылке из письма, затем войдите.";
  } catch { /* app store exposes a localized error */ }
}

async function submitForgot() {
  await forgotPassword(email.value);
  localMessage.value = "Если аккаунт существует, письмо для восстановления отправлено.";
}

async function submitReset() {
  if (password.value !== confirmPassword.value) return;
  try {
    await resetPassword(String(route.query.token ?? ""), password.value);
    localMessage.value = "Пароль изменён. Теперь войдите в аккаунт.";
  } catch { /* app store exposes a localized error */ }
}

onMounted(async () => {
  if (mode.value === "consent") {
    const saved = sessionStorage.getItem("klinok:registration");
    if (!saved) await router.replace("/auth/register");
  }
  if (mode.value === "verify" && route.query.token) {
    try { await verifyEmail(String(route.query.token)); localMessage.value = "Почта подтверждена. Теперь войдите в аккаунт."; }
    catch { /* app store exposes a localized error */ }
  }
});
</script>

<template>
  <main class="auth-surface operational-auth">
    <aside class="auth-rail" aria-label="О приложении">
      <BrandLogo class="auth-brand" variant="full" />
      <div class="auth-rail-copy">
        <h2>Здоровье питомца под контролем</h2>
        <p>Защищённый доступ для владельцев животных и врачей.</p>
      </div>
      <span class="version-info">Версия {{ APP_VERSION }}</span>
    </aside>

    <section class="auth-panel">
      <div class="auth-center operational-form">
        <header class="auth-heading">
          <h1>{{ title }}</h1>
          <p v-if="mode === 'consent'">Каждое согласие подтверждается отдельно</p>
        </header>

        <p v-if="appState.error" class="form-alert error" role="alert">{{ appState.error }}</p>
        <p v-if="localMessage || appState.message" class="form-alert success" role="status">{{ localMessage || appState.message }}</p>

        <form v-if="mode === 'login'" class="form-stack" @submit.prevent="submitLogin">
          <label class="auth-field-label"><span>Электронная почта</span><input v-model="email" type="email" autocomplete="email" required /></label>
          <PasswordInput v-model="password" label="Пароль" autocomplete="current-password" required />
          <label class="auth-field-label"><span>Название этого устройства</span><input v-model="deviceName" maxlength="80" autocomplete="off" required /><small>Например, «Домашний ноутбук». Название увидят при подтверждении устройства.</small></label>
          <button class="primary-action" :disabled="appState.busy">Войти</button>
          <nav class="auth-login-links" aria-label="Дополнительные действия">
            <RouterLink class="auth-text-link" to="/auth/forgot-password">Забыли пароль?</RouterLink>
            <RouterLink class="auth-text-link" to="/auth/register">Создать аккаунт</RouterLink>
          </nav>
        </form>

        <form v-else-if="mode === 'register'" class="form-stack" @submit.prevent="continueRegistration">
          <label class="auth-field-label"><span>Имя</span><input v-model="registration.firstName" autocomplete="given-name" required /></label>
          <label class="auth-field-label"><span>Отчество, если есть</span><input v-model="registration.patronymic" autocomplete="additional-name" /></label>
          <label class="auth-field-label"><span>Фамилия</span><input v-model="registration.lastName" autocomplete="family-name" required /></label>
          <label class="auth-field-label"><span>Электронная почта</span><input v-model="registration.email" type="email" autocomplete="email" required /></label>
          <PasswordInput v-model="registration.password" label="Пароль — от 12 до 128 символов" minlength="12" maxlength="128" autocomplete="new-password" required />
          <PasswordInput v-model="registrationConfirmPassword" label="Повторите пароль" minlength="12" maxlength="128" autocomplete="new-password" required />
          <p v-if="registrationConfirmPassword && registration.password !== registrationConfirmPassword" class="field-error" role="alert">Пароли не совпадают.</p>
          <fieldset class="initial-role-options" aria-label="Выберите роль">
            <div class="initial-role-grid">
              <label class="initial-role-option owner" :class="{ selected: initialRole === 'owner' }">
                <input v-model="initialRole" type="radio" name="initial-role" value="owner" />
                <span>Я - владелец животного</span>
                <AppIcon class="initial-role-graphic" name="pets" />
              </label>
              <label class="initial-role-option doctor" :class="{ selected: initialRole === 'doctor' }">
                <input v-model="initialRole" type="radio" name="initial-role" value="doctor" />
                <span>Я - ветеринар</span>
                <AppIcon class="initial-role-graphic" name="medical-tools" />
              </label>
            </div>
          </fieldset>
          <button class="primary-action" :disabled="registration.password !== registrationConfirmPassword">Продолжить</button>
          <RouterLink class="auth-text-link" to="/auth/login">Уже есть аккаунт</RouterLink>
        </form>

        <form v-else-if="mode === 'consent'" class="form-stack consent-stack" @submit.prevent="submitRegistration">
          <label><input v-model="acceptedConsent" type="checkbox" required />
            <span>Я отдельно принимаю <a :href="getConfig()?.legal.personalDataConsent.href" target="_blank">согласие на обработку персональных данных</a>.</span>
          </label>
          <label><input v-model="acceptedAgreement" type="checkbox" required />
            <span>Я принимаю <a :href="getConfig()?.legal.userAgreement.href" target="_blank">пользовательское соглашение</a>.</span>
          </label>
          <label><input v-model="ageConfirmed" type="checkbox" required /> <span>Мне исполнилось 18 лет.</span></label>
          <button class="primary-action" :disabled="appState.busy">Зарегистрироваться</button>
          <RouterLink class="auth-text-link" to="/auth/register">Вернуться к данным</RouterLink>
        </form>

        <div v-else-if="mode === 'verify'" class="form-stack">
          <p v-if="!route.query.token">Откройте ссылку из письма для подтверждения электронной почты.</p>
          <RouterLink class="primary-action" to="/auth/login">Перейти ко входу</RouterLink>
        </div>

        <form v-else-if="mode === 'forgot'" class="form-stack" @submit.prevent="submitForgot">
          <label class="auth-field-label"><span>Электронная почта</span><input v-model="email" type="email" autocomplete="email" required /></label>
          <button class="primary-action">Отправить письмо</button>
          <RouterLink class="auth-text-link" to="/auth/login">Вернуться ко входу</RouterLink>
        </form>

        <form v-else class="form-stack" @submit.prevent="submitReset">
          <PasswordInput v-model="password" label="Новый пароль" minlength="12" maxlength="128" autocomplete="new-password" required />
          <PasswordInput v-model="confirmPassword" label="Повторите пароль" minlength="12" maxlength="128" autocomplete="new-password" required />
          <p v-if="confirmPassword && password !== confirmPassword" class="field-error" role="alert">Пароли не совпадают.</p>
          <button class="primary-action" :disabled="password !== confirmPassword">Изменить пароль</button>
          <RouterLink class="auth-text-link" to="/auth/login">Вернуться ко входу</RouterLink>
        </form>
      </div>
    </section>
  </main>
</template>
