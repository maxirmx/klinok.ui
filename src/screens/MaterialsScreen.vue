<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import AppIcon from "../components/AppIcon.vue";
import { materialArticles, materials, templates, type MaterialSection } from "../data";
import type { DrugGroup, DrugRecord } from "../dapp/types";
import {
  deleteDrugRecord,
  drugDraft,
  drugGroups,
  drugRecords,
  fillDrugDraft,
  findDrugRecord,
  resetDrugDraft,
  saveDrugDraft,
  selectedDrugTemplate,
  showToast,
  updateDrugDraft,
  validateDrugDraft,
} from "../state";

const props = defineProps<{
  scenarioId: string;
}>();

const route = useRoute();
const router = useRouter();
const query = ref("");
type MaterialsMode = "drugs" | "diseases" | "templates";
const NO_DRUG_GROUP_ID = "";
const NO_DRUG_GROUP_TITLE = "Без группы";
const mode = ref<MaterialsMode>("drugs");
const confirmDelete = ref(false);
const isDrugCreate = computed(() => props.scenarioId === "owner-drug-create");
const isDrugDetail = computed(() => props.scenarioId === "owner-drug-detail");
const isDrugEdit = computed(() => props.scenarioId === "owner-drug-edit");
const drugRecord = computed(() => {
  if (!isDrugDetail.value && !isDrugEdit.value) return null;
  return findDrugRecord(String(route.params.id ?? ""));
});
const isDrugForm = computed(() => isDrugCreate.value || (isDrugEdit.value && Boolean(drugRecord.value)));
const drugFormTitle = computed(() => (isDrugEdit.value ? "Редактировать препарат" : "Новый препарат"));
const drugFormSubtitle = computed(() => (isDrugEdit.value ? "Редактирование записи" : undefined));
const drugFormBackTo = computed(() =>
  isDrugEdit.value && drugRecord.value ? `/owner/materials/drugs/${drugRecord.value.id}` : "/owner/materials",
);

const article = computed(() => {
  if (isDrugCreate.value || isDrugDetail.value || isDrugEdit.value) return null;
  const id = String(route.params.id ?? "");
  return materialArticles.find((item) => item.id === id) ?? null;
});

const openState = ref<Record<string, boolean>>(
  Object.fromEntries(materials.map((s) => [s.title, s.open]))
);

const sortedDrugGroups = computed(() => [...drugGroups.value].sort(compareDrugGroups));
const drugGroupById = computed(() => new Map(drugGroups.value.map((group) => [group.id, group])));
const selectedDrugGroupId = computed({
  get: () => drugDraft.groupIds[0] ?? NO_DRUG_GROUP_ID,
  set: (groupId: string) => {
    drugDraft.groupIds = groupId ? [groupId] : [];
  },
});

function toggleSection(title: string) {
  if (query.value.trim()) return;
  openState.value[title] = !openState.value[title];
}

const visibleDiseaseSections = computed(() => {
  const value = query.value.trim().toLowerCase();
  const diseaseSections = materials.filter(isMockDiseaseSection);
  if (!value) {
    return diseaseSections
      .map((section) => ({
        ...section,
        open: openState.value[section.title] ?? section.open,
      }))
      .filter((section) => section.items.length > 0);
  }
  return diseaseSections
    .map((section) => ({
      ...section,
      open: true,
      items: section.items.filter((item) => item.toLowerCase().includes(value)),
    }))
    .filter((section) => section.items.length > 0);
});

const visibleDrugRecords = computed(() => {
  const value = query.value.trim().toLowerCase();
  return drugRecords.value
    .filter((record) => drugRecordMatchesSearch(record, value))
    .sort(compareDrugRecords);
});

const visibleDrugSections = computed(() => {
  const recordsByGroup = new Map<string, DrugRecord[]>();
  for (const record of visibleDrugRecords.value) {
    const groupId = getPrimaryDrugGroupId(record);
    recordsByGroup.set(groupId, [...(recordsByGroup.get(groupId) ?? []), record]);
  }

  const groupedSections = sortedDrugGroups.value
    .map((group) => ({
      id: group.id,
      title: group.title,
      records: recordsByGroup.get(group.id) ?? [],
    }))
    .filter((section) => section.records.length > 0);

  const ungroupedRecords = recordsByGroup.get(NO_DRUG_GROUP_ID) ?? [];
  if (ungroupedRecords.length) {
    groupedSections.push({
      id: NO_DRUG_GROUP_ID,
      title: NO_DRUG_GROUP_TITLE,
      records: ungroupedRecords,
    });
  }

  return groupedSections;
});

const visibleTemplates = computed(() => {
  const value = query.value.trim().toLowerCase();
  if (!value) return templates;
  return templates.filter((template) => template.toLowerCase().includes(value));
});

function isMockDiseaseSection(section: MaterialSection) {
  return section.title !== "Справочник препаратов" && section.title !== "Обезболивающие";
}

function selectMode(nextMode: MaterialsMode) {
  mode.value = nextMode;
  query.value = "";
}

function compareDrugGroups(a: DrugGroup, b: DrugGroup) {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru");
}

function compareDrugRecords(a: DrugRecord, b: DrugRecord) {
  return a.activeSubstanceRu.localeCompare(b.activeSubstanceRu, "ru");
}

function getPrimaryDrugGroupId(record: DrugRecord) {
  return record.groupIds.find((groupId) => drugGroupById.value.has(groupId)) ?? NO_DRUG_GROUP_ID;
}

function drugGroupLabel(record: DrugRecord) {
  return drugGroupById.value.get(getPrimaryDrugGroupId(record))?.title ?? NO_DRUG_GROUP_TITLE;
}

function drugRecordMatchesSearch(record: DrugRecord, value: string) {
  if (!value) return true;
  return [
    record.activeSubstanceRu,
    record.activeSubstanceLatin,
    record.pharmacyType,
    pharmacyTypeLabel(record.pharmacyType),
    drugGroupLabel(record),
    ...record.tradeNames,
    ...record.groupIds.map((groupId) => drugGroupById.value.get(groupId)?.title ?? ""),
  ].some((item) => item.toLowerCase().includes(value));
}

function articlePath(title: string): string | null {
  const articleByTitle = materialArticles.find((item) => item.title === title);
  return articleByTitle ? `/owner/materials/${articleByTitle.id}` : null;
}

function pharmacyTypeLabel(type: "vet" | "human") {
  return type === "vet" ? "Ветпрепарат" : "Медпрепарат";
}

function sourceLabel(source: string) {
  return source || "Источник не указан";
}

function showValidationError() {
  const error = validateDrugDraft();
  if (error) {
    showToast(error);
    return true;
  }
  return false;
}

function createDrugRecord() {
  if (showValidationError()) return;

  const record = saveDrugDraft();
  showToast("Препарат создан");
  router.push(`/owner/materials/drugs/${record.id}`);
}

function updateDrugRecord() {
  if (!drugRecord.value || showValidationError()) return;

  const record = updateDrugDraft(drugRecord.value);
  showToast("Препарат сохранен");
  router.push(`/owner/materials/drugs/${record.id}`);
}

function submitDrugRecord() {
  if (isDrugEdit.value) {
    updateDrugRecord();
    return;
  }
  createDrugRecord();
}

function requestDrugDelete() {
  confirmDelete.value = true;
}

function cancelDrugDelete() {
  confirmDelete.value = false;
}

function confirmDrugDelete() {
  if (!drugRecord.value) return;
  const deleted = deleteDrugRecord(drugRecord.value.id);
  showToast(deleted ? "Препарат удален" : "Препарат не найден");
  router.push("/owner/materials");
}

watch(
  () => [props.scenarioId, route.params.id],
  () => {
    confirmDelete.value = false;
    if (isDrugCreate.value) {
      resetDrugDraft();
    }
    if (isDrugEdit.value && drugRecord.value) {
      fillDrugDraft(drugRecord.value);
    }
  },
  { immediate: true },
);
</script>

<template>
  <AppShell v-if="isDrugForm" :title="drugFormTitle" :subtitle="drugFormSubtitle" :back-to="drugFormBackTo">
    <section class="form-panel panel">
      <label>
        <span>Тип препарата</span>
        <select v-model="drugDraft.pharmacyType" data-test="drug-pharmacy-type">
          <option value="vet">Ветпрепарат (ветеринарная аптека)</option>
          <option value="human">Медпрепарат (человеческая аптека)</option>
        </select>
      </label>
      <label>
        <span>Группа</span>
        <select v-model="selectedDrugGroupId" data-test="drug-group">
          <option value="">Без группы</option>
          <option v-for="group in sortedDrugGroups" :key="group.id" :value="group.id">{{ group.title }}</option>
        </select>
      </label>
      <label
        v-for="field in selectedDrugTemplate?.fields ?? []"
        :key="field.id"
        :class="[`drug-field-${field.id}`, { 'drug-field-growable': field.multiline }]"
      >
        <span>{{ field.label }}</span>
        <textarea v-if="field.multiline" v-model="drugDraft[field.id]" :data-test="`drug-${field.id}`" />
        <input v-else v-model="drugDraft[field.id]" :data-test="`drug-${field.id}`" />
      </label>
      <div class="action-row drug-form-actions">
        <button class="primary-action inline" data-test="save-drug-record" @click="submitDrugRecord">
          {{ isDrugEdit ? "Сохранить изменения" : "Создать запись" }}
        </button>
        <button class="outline-action" type="button" @click="resetDrugDraft">Очистить</button>
      </div>
    </section>
  </AppShell>

  <AppShell
    v-else-if="drugRecord"
    :title="drugRecord.activeSubstanceRu"
    :subtitle="pharmacyTypeLabel(drugRecord.pharmacyType)"
    back-to="/owner/materials"
  >
    <section class="panel material-detail drug-detail" data-test="drug-detail">
      <p class="highlight">Клинические дозировки показываются только при наличии источника.</p>
      <div class="field"><span>Действующее вещество</span><strong>{{ drugRecord.activeSubstanceRu }}</strong></div>
      <div class="field"><span>Латинское название</span><strong>{{ drugRecord.activeSubstanceLatin || "Не указано" }}</strong></div>
      <div class="field"><span>Тип препарата</span><strong>{{ pharmacyTypeLabel(drugRecord.pharmacyType) }}</strong></div>
      <div class="field"><span>Группа</span><strong>{{ drugGroupLabel(drugRecord) }}</strong></div>
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
      <div class="action-row">
        <RouterLink class="primary-action inline" :to="`/owner/materials/drugs/${drugRecord.id}/edit`" data-test="edit-drug-record">
          Редактировать
        </RouterLink>
        <button class="outline-action danger-outline" type="button" data-test="show-delete-drug-confirm" @click="requestDrugDelete">
          Удалить
        </button>
      </div>
      <div v-if="confirmDelete" class="delete-confirm" data-test="delete-drug-confirm">
        <p>Удалить препарат из справочника?</p>
        <div class="action-row">
          <button class="primary-action danger" type="button" data-test="confirm-delete-drug" @click="confirmDrugDelete">
            Подтвердить удаление
          </button>
          <button class="outline-action" type="button" @click="cancelDrugDelete">Отмена</button>
        </div>
      </div>
      <RouterLink class="primary-action inline" to="/owner/materials/drugs/new">Создать ещё</RouterLink>
    </section>
  </AppShell>

  <AppShell v-else-if="isDrugDetail || isDrugEdit" title="Препарат не найден" subtitle="Запись отсутствует" back-to="/owner/materials">
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
      <div class="segmented materials-tabs">
        <button :class="{ active: mode === 'drugs' }" data-test="materials-tab-drugs" @click="selectMode('drugs')">Препараты</button>
        <button :class="{ active: mode === 'diseases' }" data-test="materials-tab-diseases" @click="selectMode('diseases')">Болезни</button>
        <button :class="{ active: mode === 'templates' }" data-test="materials-tab-templates" @click="selectMode('templates')">Шаблоны</button>
      </div>
      <label class="search-input materials-search">
        <AppIcon name="search" />
        <input v-model="query" placeholder="Поиск" data-test="materials-search" />
      </label>

      <div v-if="mode === 'drugs'" class="accordion" data-test="materials-drugs-list">
        <RouterLink class="material-row create-row" to="/owner/materials/drugs/new">
          <span>Создать препарат</span><AppIcon name="plus" />
        </RouterLink>
        <section v-for="section in visibleDrugSections" :key="section.id" data-test="drug-group-section">
          <div class="accordion-head drug-group-head" data-test="drug-group-head">
            <span>{{ section.title }}</span>
          </div>
          <RouterLink
            v-for="record in section.records"
            :key="record.id"
            class="material-row"
            :to="`/owner/materials/drugs/${record.id}`"
            data-test="drug-record-row"
          >
            <span>{{ record.activeSubstanceRu }}</span><AppIcon name="chevron" />
          </RouterLink>
        </section>
      </div>

      <div v-else-if="mode === 'diseases'" class="accordion" data-test="materials-diseases-list">
        <section v-for="section in visibleDiseaseSections" :key="section.title">
          <button class="accordion-head" data-test="mock-section-head" @click="toggleSection(section.title)">
            <span>{{ section.title }}</span>
            <span class="tiny-control"><AppIcon :name="section.open ? 'chevron-down' : 'chevron'" /></span>
          </button>
          <template v-if="section.open">
            <template v-for="item in section.items" :key="item">
              <RouterLink v-if="articlePath(item)" class="material-row" :to="articlePath(item)!" data-test="mock-material-row">
                <span>{{ item }}</span><AppIcon name="chevron" />
              </RouterLink>
              <div v-else class="material-row" data-test="mock-material-row">
                <span>{{ item }}</span><AppIcon name="chevron" />
              </div>
            </template>
          </template>
        </section>
      </div>

      <div v-else class="accordion" data-test="materials-templates-list">
        <button v-for="template in visibleTemplates" :key="template" class="material-row" data-test="mock-template-row" @click="showToast('Шаблон скопирован')">
          <span>{{ template }}</span><AppIcon name="chevron" />
        </button>
      </div>
    </section>
  </AppShell>
</template>
