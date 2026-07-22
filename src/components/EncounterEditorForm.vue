<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref } from "vue";
import AppIcon from "./AppIcon.vue";
import WhatHappenedTree from "./WhatHappenedTree.vue";
import {
  ENCOUNTER_SECTION_LABELS,
  OPTIONAL_ENCOUNTER_SECTION_KINDS,
  WHAT_HAPPENED_TREE,
  whatHappenedPath,
} from "../medicalEncounter";
import type { MedicalEncounterSectionKind } from "../repositories/types";

defineProps<{ busy: boolean; editing: boolean }>();
const emit = defineEmits<{
  save: [];
  cancel: [];
  removeSection: [kind: MedicalEncounterSectionKind];
}>();

const date = defineModel<string>("date", { required: true });
const selectedIds = defineModel<string[]>("selectedIds", { required: true });
const comment = defineModel<string>("comment", { required: true });
const optionalKinds = defineModel<MedicalEncounterSectionKind[]>("optionalKinds", { required: true });
const texts = defineModel<Partial<Record<MedicalEncounterSectionKind, string>>>("texts", { required: true });
const form = ref<HTMLFormElement | null>(null);
const optionalAvailable = computed(() => OPTIONAL_ENCOUNTER_SECTION_KINDS.filter((kind) => !optionalKinds.value.includes(kind)));

function toggleSelection(id: string) {
  const index = selectedIds.value.indexOf(id);
  if (index >= 0) selectedIds.value = selectedIds.value.filter((selectedId) => selectedId !== id);
  else {
    const condition = id.split(".", 1)[0];
    selectedIds.value = [
      ...selectedIds.value.filter((selectedId) => selectedId.split(".", 1)[0] === condition),
      id,
    ];
  }
}

function selectOptional(event: Event) {
  const select = event.target as HTMLSelectElement;
  const kind = select.value as MedicalEncounterSectionKind;
  if (kind && !optionalKinds.value.includes(kind)) optionalKinds.value = [...optionalKinds.value, kind];
  select.value = "";
}

function updateText(kind: MedicalEncounterSectionKind, event: Event) {
  texts.value = { ...texts.value, [kind]: (event.target as HTMLTextAreaElement).value };
}

function submit() {
  if (!selectedIds.value.length || form.value?.reportValidity() === false) return;
  emit("save");
}
</script>

<template>
  <form ref="form" class="form-stack" @submit.prevent="submit">
    <div class="doctor-heading encounter-editor-heading">
      <h2>{{ editing ? 'Редактирование записи' : 'Сегодняшний приём' }}</h2>
      <div class="row-actions">
        <button class="primary-action inline owner-profile-action" type="button" :disabled="busy || !selectedIds.length" title="Сохранить запись" aria-label="Сохранить запись" @click="submit"><AppIcon name="check" /></button>
        <button v-if="editing" type="button" class="outline-action inline owner-profile-action" title="Отменить редактирование" aria-label="Отменить редактирование" @click="emit('cancel')"><AppIcon name="close" /></button>
      </div>
    </div>
    <label class="encounter-date-field"><span>Дата</span><input v-model="date" type="date" required /></label>
    <article class="encounter-section-card encounter-what-happened">
      <div class="doctor-heading"><h3>{{ WHAT_HAPPENED_TREE.label }}</h3></div>
      <div class="encounter-chips"><button v-for="id in selectedIds" :key="id" type="button" class="selection-chip" @click="toggleSelection(id)">{{ whatHappenedPath(id) }} ×</button></div>
      <div class="encounter-condition-trees">
        <WhatHappenedTree v-for="condition in WHAT_HAPPENED_TREE.children ?? []" :key="condition.id" :node="condition" :selected="selectedIds" root @toggle="toggleSelection" />
      </div>
      <label><span>Комментарий</span><textarea v-model="comment" rows="4" /></label>
    </article>
    <article v-for="kind in optionalKinds" :key="kind" class="encounter-section-card">
      <div class="doctor-heading">
        <h3>{{ ENCOUNTER_SECTION_LABELS[kind] }}</h3>
        <button type="button" class="outline-action inline danger-outline owner-profile-action encounter-section-delete" title="Удалить раздел" aria-label="Удалить раздел" @click="emit('removeSection', kind)"><AppIcon name="trash" /></button>
      </div>
      <p class="temporary-note">Временный универсальный шаблон free-text-v0.</p>
      <textarea :value="texts[kind] ?? ''" rows="4" required @input="updateText(kind, $event)" />
    </article>
    <label v-if="optionalAvailable.length" class="encounter-add-section"><span>Добавить раздел</span><select @change="selectOptional"><option value="">Выберите раздел</option><option v-for="kind in optionalAvailable" :key="kind" :value="kind">{{ ENCOUNTER_SECTION_LABELS[kind] }}</option></select></label>
  </form>
</template>
