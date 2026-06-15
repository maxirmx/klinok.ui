<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppShell from "../components/AppShell.vue";
import AppIcon from "../components/AppIcon.vue";
import { materialArticles, materials, templates } from "../data";
import { showToast } from "../state";

const route = useRoute();
const query = ref("");
const mode = ref<"guide" | "templates">("guide");

const article = computed(() => {
  const id = String(route.params.id ?? "");
  return materialArticles.find((item) => item.id === id) ?? null;
});

const openState = ref<Record<string, boolean>>(
  Object.fromEntries(materials.map((s) => [s.title, s.open]))
);

function toggleSection(title: string) {
  if (query.value.trim()) return;
  openState.value[title] = !openState.value[title];
}

const visibleSections = computed(() => {
  const value = query.value.trim().toLowerCase();
  if (!value) return materials.map((s) => ({ ...s, open: openState.value[s.title] ?? s.open }));
  return materials
    .map((section) => ({
      ...section,
      open: true,
      items: section.items.filter((item) => item.toLowerCase().includes(value)),
    }))
    .filter((section) => section.items.length > 0);
});

function articlePath(title: string): string | null {
  const articleByTitle = materialArticles.find((item) => item.title === title);
  return articleByTitle ? `/owner/materials/${articleByTitle.id}` : null;
}
</script>

<template>
  <AppShell v-if="article" :title="article.title" :subtitle="article.section" back-to="/owner/materials">
    <section class="panel material-detail">
      <p class="highlight">{{ article.warning }}</p>
      <p>{{ article.body }}</p>
      <button class="primary-action inline" @click="showToast('Материал добавлен в избранное')">Добавить в избранное</button>
    </section>
  </AppShell>

  <AppShell v-else title="Справочник" subtitle="Препараты, болезни и шаблоны" back-to="/owner/home">
    <section class="panel materials-panel">
      <h2>Полезные материалы</h2>
      <div class="segmented">
        <button :class="{ active: mode === 'guide' }" @click="mode = 'guide'">Справочник</button>
        <button :class="{ active: mode === 'templates' }" @click="mode = 'templates'">Шаблоны</button>
      </div>
      <label class="search-input materials-search">
        <AppIcon name="search" />
        <input v-model="query" placeholder="Поиск" />
      </label>

      <div v-if="mode === 'guide'" class="accordion">
        <section v-for="section in visibleSections" :key="section.title">
          <button class="accordion-head" @click="toggleSection(section.title)">
            <span>{{ section.title }}</span>
            <span class="tiny-control"><AppIcon :name="section.open ? 'chevron-down' : 'chevron'" /></span>
          </button>
          <template v-if="section.open">
            <template v-for="item in section.items" :key="item">
              <RouterLink v-if="articlePath(item)" class="material-row" :to="articlePath(item)!">
                <span>{{ item }}</span><AppIcon name="chevron" />
              </RouterLink>
              <div v-else class="material-row">
                <span>{{ item }}</span><AppIcon name="chevron" />
              </div>
            </template>
          </template>
        </section>
      </div>

      <div v-else class="accordion">
        <button v-for="template in templates" :key="template" class="material-row" @click="showToast('Шаблон скопирован')">
          <span>{{ template }}</span><AppIcon name="chevron" />
        </button>
      </div>
    </section>
  </AppShell>
</template>
