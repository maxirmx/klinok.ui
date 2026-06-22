<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import { useRouter } from "vue-router";
import { roles, type Role } from "../data";
import { darkMode, otp, phone, selectedRole, selectedRoleLabel } from "../state";
import AppIcon from "../components/AppIcon.vue";
import BrandLogo from "../components/BrandLogo.vue";

const props = defineProps<{
  scenarioId: string;
}>();

const router = useRouter();

const step = computed(() => {
  if (props.scenarioId === "auth-login") return "login";
  if (props.scenarioId === "auth-code") return "code";
  if (props.scenarioId === "auth-welcome") return "welcome";
  return "role";
});

const heading = computed(() => {
  if (step.value === "login") return "С возвращением!";
  if (step.value === "code") return "Введите код из СМС";
  if (step.value === "welcome") return "Добро пожаловать, Даниил!";
  return "Добро пожаловать!";
});

function selectRole(role: Role) {
  selectedRole.value = role;
}

function nextStep() {
  if (step.value === "role") router.push("/auth/login");
  else if (step.value === "login") router.push("/auth/code");
  else if (step.value === "code") router.push("/auth/welcome");
  else if (selectedRole.value === "vet") router.push("/vet/home");
  else if (selectedRole.value === "company") router.push("/company/home");
  else router.push("/owner/home");
}

function goBack() {
  if (step.value === "login") router.push("/auth/role");
  else if (step.value === "code") router.push("/auth/login");
  else if (step.value === "welcome") router.push("/auth/code");
}
</script>

<template>
  <section class="auth-surface" :class="{ 'has-back': step !== 'role' }">
    <BrandLogo class="auth-brand" :variant="darkMode ? 'mono' : 'full'" />

    <button v-if="step !== 'role'" class="back-float" aria-label="Назад" @click="goBack">
      <AppIcon name="chevron-left" />
    </button>

    <div class="auth-center" :class="`step-${step}`">
      <div class="auth-heading">
        <h1>{{ heading }}</h1>
        <p v-if="step === 'role'">Давайте познакомимся</p>
        <p v-else-if="step === 'login'">Введите свой номер телефона - отправим код для подтверждения</p>
        <p v-else-if="step === 'code'">Код отправлен на номер {{ phone }}</p>
        <p v-else>{{ selectedRoleLabel }}</p>
      </div>

      <div v-if="step === 'role'" class="role-list">
        <button
          v-for="role in roles"
          :key="role.id"
          class="input-tile"
          :class="{ selected: selectedRole === role.id }"
          @click="selectRole(role.id)"
        >
          {{ role.label }}
        </button>
      </div>

      <label v-else-if="step === 'login'" class="text-input">
        <span>Телефон</span>
        <input v-model="phone" inputmode="tel" autocomplete="tel" />
      </label>

      <template v-else-if="step === 'code'">
        <div class="otp-row" aria-label="Код подтверждения">
          <input
            v-for="(_, index) in otp"
            :key="index"
            v-model="otp[index]"
            maxlength="1"
            inputmode="numeric"
          />
        </div>
        <p class="timer">Запросить новый код можно через: 0:52</p>
      </template>

      <div v-else class="welcome-card">
        <span><AppIcon name="check" /></span>
        <strong>Профиль готов</strong>
        <p>Основные разделы доступны сразу после входа.</p>
      </div>
    </div>

    <footer class="auth-footer">
      <button class="primary-action" :disabled="step === 'role' && !selectedRole" @click="nextStep">
        {{ step === "welcome" ? "Перейти в приложение" : "Продолжить" }}
      </button>
      <button v-if="step !== 'welcome'" class="link-action" @click="step === 'role' ? router.push('/auth/login') : router.push('/auth/role')">
        <span>{{ step === "role" ? "Есть аккаунт ?" : "Нет аккаунта ?" }}</span>
        <strong>{{ step === "role" ? "Войти" : "Зарегистрироваться" }}</strong>
      </button>
    </footer>
  </section>
</template>
