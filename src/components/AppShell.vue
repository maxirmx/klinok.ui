<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import packageJson from "../../package.json";
import { ownerNavigation } from "../navigation";
import { darkMode } from "../state";
import AppIcon from "./AppIcon.vue";
import BrandLogo from "./BrandLogo.vue";

const props = defineProps<{
  title: string;
  subtitle?: string;
  backTo?: string;
  home?: boolean;
}>();

const route = useRoute();
const router = useRouter();
const version = packageJson.version;

const title = computed(() => props.title);

function isActive(matchers: string[]) {
  return matchers.some((matcher) => route.path === matcher || route.path.startsWith(`${matcher}/`));
}

function goBack() {
  if (props.backTo) {
    router.push(props.backTo);
    return;
  }
  router.push("/owner/home");
}
</script>

<template>
  <section class="app-layout">
    <aside class="desktop-nav" aria-label="Основная навигация">
      <RouterLink class="brand-block" to="/owner/home">
        <BrandLogo :variant="darkMode ? 'mono' : 'full'" size="compact" />
        <span>Здоровье питомца под контролем</span>
      </RouterLink>

      <RouterLink
        v-for="item in ownerNavigation"
        :key="item.path"
        class="nav-item"
        :class="{ active: isActive(item.match) }"
        :to="item.path"
      >
        <AppIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </RouterLink>

      <RouterLink class="desktop-add nav-item" to="/owner/analysis">
        <AppIcon name="plus" />
        <span>Добавить анализ</span>
      </RouterLink>

      <span class="version-info">Версия {{ version }}</span>
    </aside>

    <main class="app-surface">
      <header v-if="home" class="home-header">
        <div>
          <h1>{{ title }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <RouterLink class="round-icon" aria-label="Уведомления" to="/owner/profile/notifications">
          <AppIcon name="bell" />
        </RouterLink>
      </header>

      <header v-else class="top-bar">
        <button class="icon-button" aria-label="Назад" @click="goBack">
          <AppIcon name="chevron-left" />
        </button>
        <div>
          <h1>{{ title }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <RouterLink class="icon-button" aria-label="Профиль" to="/owner/profile">
          <AppIcon name="user" />
        </RouterLink>
      </header>

      <div class="content-scroll">
        <slot />
      </div>

      <nav class="mobile-tabs" aria-label="Нижняя навигация">
        <RouterLink
          v-for="item in ownerNavigation"
          :key="item.path"
          :class="{ active: isActive(item.match) }"
          :to="item.path"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
        <RouterLink class="floating-add" aria-label="Добавить анализ" to="/owner/analysis">
          <AppIcon name="plus" />
        </RouterLink>
      </nav>
    </main>
  </section>
</template>
