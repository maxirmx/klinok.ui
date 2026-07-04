<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import AppIcon from "../components/AppIcon.vue";
import { materialArticles, materials, templates } from "../data";
import {
  drugDraft,
  drugRecords,
  drugTemplates,
  findDrugRecord,
  resetDrugDraft,
  saveDrugDraft,
  selectedDrugTemplate,
  selectedDrugTemplateId,
  showToast,
} from "../state";

const props = defineProps<{
  scenarioId: string;
}>();

const route = useRoute();
const router = useRouter();
const query = ref("");
const mode = ref<"guide" | "templates">("guide");
const isDrugCreate = computed(() => props.scenarioId === "owner-drug-create");
const isDrugDetail = computed(() => props.scenarioId === "owner-drug-detail");
const drugRecord = computed(() => {
  if (!isDrugDetail.value) return null;
  return findDrugRecord(String(route.params.id ?? ""));
});

const article = computed(() => {
  if (isDrugCreate.value || isDrugDetail.value) return null;
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

const visibleDrugRecords = computed(() => {
  const value = query.value.trim().toLowerCase();
  return drugRecords.value.filter((record) => {
    if (!value) return true;
    return [
      record.activeSubstanceRu,
      record.activeSubstanceLatin,
      record.pharmacyType,
      ...record.tradeNames,
    ].some((item) => item.toLowerCase().includes(value));
  });
});

function articlePath(title: string): string | null {
  const drugByTitle = drugRecords.value.find((item) => item.activeSubstanceRu.toLowerCase() === title.toLowerCase());
  if (drugByTitle) return `/owner/materials/drugs/${drugByTitle.id}`;
  const articleByTitle = materialArticles.find((item) => item.title === title);
  return articleByTitle ? `/owner/materials/${articleByTitle.id}` : null;
}

function pharmacyTypeLabel(type: "vet" | "human") {
  return type === "vet" ? "Ветпрепарат" : "Медпрепарат";
}

function sourceLabel(source: string) {
  return source || "Источник не указан";
}

function createDrugRecord() {
  if (!drugDraft.activeSubstanceRu.trim()) {
    showToast("Укажите действующее вещество");
    return;
  }

  const record = saveDrugDraft();
  showToast("Препарат создан");
  router.push(`/owner/materials/drugs/${record.id}`);
}
</script>

<template>
  <AppShell v-if="isDrugCreate" title="Новый препарат" subtitle="Запись по шаблону препарата" back-to="/owner/materials">
    <section class="form-panel panel">
      <h2>Шаблон препарата</h2>
      <p class="body-copy">{{ selectedDrugTemplate?.description }}</p>
      <label>
        <span>Шаблон</span>
        <select v-model="selectedDrugTemplateId" data-test="drug-template">
          <option v-for="template in drugTemplates" :key="template.id" :value="template.id">{{ template.title }}</option>
        </select>
      </label>
      <label>
        <span>Тип препарата</span>
        <select v-model="drugDraft.pharmacyType" data-test="drug-pharmacy-type">
          <option value="vet">Ветпрепарат (ветеринарная аптека)</option>
          <option value="human">Медпрепарат (человеческая аптека)</option>
        </select>
      </label>
      <label v-for="field in selectedDrugTemplate?.fields ?? []" :key="field.id">
        <span>{{ field.label }}</span>
        <textarea v-if="field.multiline" v-model="drugDraft[field.id]" :data-test="`drug-${field.id}`" />
        <input v-else v-model="drugDraft[field.id]" :data-test="`drug-${field.id}`" />
      </label>
      <div class="action-row">
        <button class="primary-action inline" data-test="save-drug-record" @click="createDrugRecord">Создать запись</button>
        <button class="outline-action" type="button" @click="resetDrugDraft">Очистить</button>
      </div>
    </section>
  </AppShell>

  <AppShell
    v-else-if="drugRecord"
    :title="drugRecord.activeSubstanceRu"
    :subtitle="`${drugRecord.templateTitle} · ${pharmacyTypeLabel(drugRecord.pharmacyType)}`"
    back-to="/owner/materials"
  >
    <section class="panel material-detail drug-detail" data-test="drug-detail">
      <p class="highlight">Клинические дозировки показываются только при наличии источника.</p>
      <div class="field"><span>Действующее вещество</span><strong>{{ drugRecord.activeSubstanceRu }}</strong></div>
      <div class="field"><span>Латинское название</span><strong>{{ drugRecord.activeSubstanceLatin || "Не указано" }}</strong></div>
      <div class="field"><span>Тип препарата</span><strong>{{ pharmacyTypeLabel(drugRecord.pharmacyType) }}</strong></div>
      <div class="field">
        <span>Торговые названия</span>
        <strong>{{ drugRecord.tradeNames.length ? drugRecord.tradeNames.join(", ") : "Не указано" }}</strong>
      </div>
      <div class="field"><span>Фармакокинетика</span><strong>{{ drugRecord.pharmacokinetics || "Не заполнено" }}</strong></div>
      <div class="field"><span>Фармакодинамика</span><strong>{{ drugRecord.pharmacodynamics || "Не заполнено" }}</strong></div>
      <div class="field">
        <span>Собаки</span>
        <strong>{{ drugRecord.dogDose.text || "Дозировка не указана" }}</strong>
        <small>{{ sourceLabel(drugRecord.dogDose.source) }}</small>
      </div>
      <div class="field">
        <span>Кошки</span>
        <strong>{{ drugRecord.catDose.text || "Дозировка не указана" }}</strong>
        <small>{{ sourceLabel(drugRecord.catDose.source) }}</small>
      </div>
      <RouterLink class="primary-action inline" to="/owner/materials/drugs/new">Создать еще препарат</RouterLink>
    </section>
  </AppShell>

  <AppShell v-else-if="isDrugDetail" title="Препарат не найден" subtitle="Запись отсутствует" back-to="/owner/materials">
    <section class="panel success-state">
      <span><AppIcon name="search" /></span>
      <h2>Запись не найдена</h2>
      <RouterLink class="primary-action inline" to="/owner/materials/drugs/new">Создать препарат</RouterLink>
    </section>
  </AppShell>

  <AppShell v-else-if="article" :title="article.title" :subtitle="article.section" back-to="/owner/materials">
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
        <RouterLink class="material-row create-row" to="/owner/materials/drugs/new">
          <span>Создать препарат по шаблону</span><AppIcon name="plus" />
        </RouterLink>
        <RouterLink
          v-for="record in visibleDrugRecords"
          :key="record.id"
          class="material-row"
          :to="`/owner/materials/drugs/${record.id}`"
          data-test="drug-record-row"
        >
          <span>{{ record.activeSubstanceRu }}</span><AppIcon name="chevron" />
        </RouterLink>
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
