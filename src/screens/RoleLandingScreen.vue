<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppIcon from "../components/AppIcon.vue";
import BrandLogo from "../components/BrandLogo.vue";
import { users, vetRequests } from "../data";
import { darkMode } from "../state";

const props = defineProps<{
  scenarioId: string;
}>();

const isVet = computed(() => props.scenarioId.startsWith("vet-"));
const user = computed(() => users.find((item) => item.role === (isVet.value ? "vet" : "company")) ?? users[0]);
const title = computed(() => {
  if (props.scenarioId === "vet-requests") return "Заявки ветеринара";
  if (props.scenarioId === "vet-profile") return "Профиль ветеринара";
  if (props.scenarioId === "company-profile") return "Профиль юрлица";
  return isVet.value ? "Кабинет ветеринара" : "Кабинет юрлица";
});
</script>

<template>
  <section class="role-layout">
    <header class="role-header">
      <RouterLink class="brand-block" :to="isVet ? '/vet/home' : '/company/home'">
        <BrandLogo :variant="darkMode ? 'mono' : 'full'" size="compact" />
        <span>{{ title }}</span>
      </RouterLink>
      <nav>
        <RouterLink v-if="isVet" to="/vet/requests">Заявки</RouterLink>
        <RouterLink :to="isVet ? '/vet/profile' : '/company/profile'">Профиль</RouterLink>
        <RouterLink to="/owner/home">Owner demo</RouterLink>
      </nav>
    </header>

    <main class="role-main">
      <section class="panel profile-hero">
        <span class="avatar square" />
        <div>
          <h1>{{ title }}</h1>
          <p>{{ user.firstName }} {{ user.lastName }}</p>
        </div>
      </section>

      <section v-if="scenarioId === 'vet-requests'" class="panel">
        <div class="section-title"><h2>Новые заявки</h2></div>
        <article v-for="request in vetRequests" :key="request.id" class="plain-card">
          <strong>{{ request.title }}</strong>
          <span>{{ request.pet }} · {{ request.owner }} · {{ request.date }}</span>
          <small>{{ request.urgency }}</small>
        </article>
      </section>

      <section v-else class="panel profile-info">
        <h2>Основная информация</h2>
        <div class="field"><span>E-mail</span><strong>{{ user.email }}</strong></div>
        <div class="field"><span>Телефон</span><strong>{{ user.phone }}</strong></div>
        <div class="field"><span>Город</span><strong>{{ user.city }}</strong></div>
        <div v-if="user.organization" class="field"><span>Организация</span><strong>{{ user.organization }}</strong></div>
        <RouterLink v-if="isVet" class="primary-action inline" to="/vet/requests">
          <AppIcon name="calendar" />
          <span>Смотреть заявки</span>
        </RouterLink>
      </section>
    </main>
  </section>
</template>
