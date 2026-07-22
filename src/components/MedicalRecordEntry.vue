<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import AppIcon from "./AppIcon.vue";
import {
  ENCOUNTER_SECTION_LABELS,
  encounterSummary,
  freeText,
  isFreeTextValue,
  isWhatHappenedValue,
  whatHappenedComment,
  whatHappenedPath,
  whatHappenedSelectedIds,
} from "../medicalEncounter";
import type { MedicalEncounterSectionKind, MedicalRecordDraft } from "../repositories/types";

const props = withDefaults(defineProps<{
  record: MedicalRecordDraft;
  mode: "epicrisis" | "details";
  confirmed: boolean;
  action?: "none" | "confirm" | "edit";
  open?: boolean;
  editing?: boolean;
  showAuthorAccountId?: boolean;
}>(), {
  action: "none",
  open: false,
  editing: false,
  showAuthorAccountId: false,
});

const emit = defineEmits<{
  activate: [record: MedicalRecordDraft];
  confirm: [record: MedicalRecordDraft];
  edit: [record: MedicalRecordDraft];
  delete: [record: MedicalRecordDraft];
}>();

const populatedSections = computed(() =>
  (Object.entries(ENCOUNTER_SECTION_LABELS) as Array<[MedicalEncounterSectionKind, string]>)
    .flatMap(([kind, label]) => {
      const section = props.record.sections[kind];
      return section ? [{ kind, label, section }] : [];
    }),
);

const conditionHeadlines = computed(() => {
  const selectedIds = whatHappenedSelectedIds(props.record.sections["what-happened"]?.value);
  return [
    { id: "well", label: "Всё хорошо", tone: "well" },
    { id: "problem", label: "Не всё хорошо", tone: "problem" },
    { id: "critical", label: "Всё плохо", tone: "critical" },
  ].filter((condition) => selectedIds.some((id) => id === condition.id || id.startsWith(`${condition.id}.`)));
});

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function formatLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}
</script>

<template>
  <button
    v-if="mode === 'epicrisis'"
    class="epicrisis-row medical-record-entry medical-record-entry-epicrisis"
    type="button"
    :aria-label="`Открыть приём от ${formatDate(record.encounterDate)}`"
    @click="emit('activate', record)"
  >
    <span>{{ formatDate(record.encounterDate) }}</span>
    <strong>{{ encounterSummary(record) }}</strong>
    <span>{{ freeText(record.sections.outcome?.value) || 'Не заполнено' }}</span>
    <span class="status-badge" :class="confirmed ? 'approved' : 'pending'">
      {{ confirmed ? 'Подтверждена' : 'Ожидает подтверждения' }}
    </span>
  </button>

  <details
    v-else
    :id="`encounter-${record.recordId}`"
    class="owner-encounter-record medical-record-entry medical-record-entry-details"
    :open="open || editing || undefined"
  >
    <summary class="owner-encounter-summary">
      <span class="medical-record-chevron" aria-hidden="true">
        <AppIcon class="medical-record-chevron-collapsed" name="chevron" />
        <AppIcon class="medical-record-chevron-expanded" name="chevron-down" />
      </span>
      <span class="owner-encounter-summary-copy">
        <strong>
          {{ formatDate(record.encounterDate) }} ·
          <template v-if="conditionHeadlines.length">
            <template v-for="(condition, index) in conditionHeadlines" :key="condition.id">
              <span v-if="index">; </span><span class="medical-record-condition" :class="`medical-record-condition-${condition.tone}`">{{ condition.label }}</span>
            </template>
          </template>
          <template v-else>{{ encounterSummary(record) }}</template>
        </strong>
        <small>Редакция {{ record.revision }} · {{ record.authorDisplayName }}</small>
      </span>
      <span class="status-badge" :class="confirmed ? 'approved' : 'pending'">
        {{ confirmed ? 'Подтверждена' : 'Ожидает подтверждения' }}
      </span>
    </summary>

    <div class="owner-encounter-sections" :class="{ 'owner-encounter-sections-editing': editing }">
      <slot v-if="editing" name="editor" />
      <template v-else>
      <div v-for="(item, index) in populatedSections" :key="item.kind" class="encounter-history-section">
        <div class="encounter-history-heading">
          <h3>{{ item.label }}</h3>
          <span v-if="index === 0 && !confirmed && (action === 'confirm' || action === 'edit')" class="row-actions medical-record-actions">
            <button
              v-if="action === 'confirm'"
              class="primary-action inline owner-profile-action owner-encounter-confirm"
              type="button"
              title="Подтвердить запись"
              aria-label="Подтвердить запись"
              @click="emit('confirm', record)"
            >
              <AppIcon name="check" />
            </button>
            <button
              v-if="action === 'edit'"
              class="outline-action inline owner-profile-action medical-record-edit"
              type="button"
              title="Редактировать запись"
              aria-label="Редактировать запись"
              @click="emit('edit', record)"
            >
              <AppIcon name="edit" />
            </button>
            <button
              v-if="action === 'edit'"
              class="outline-action inline danger-outline owner-profile-action medical-record-delete"
              type="button"
              title="Удалить запись"
              aria-label="Удалить запись"
              @click="emit('delete', record)"
            >
              <AppIcon name="trash" />
            </button>
          </span>
        </div>
        <template v-if="isWhatHappenedValue(item.section.value)">
          <ul>
            <li v-for="id in whatHappenedSelectedIds(item.section.value)" :key="id">{{ whatHappenedPath(id) }}</li>
          </ul>
          <p v-if="whatHappenedComment(item.section.value)" class="encounter-history-comment">{{ whatHappenedComment(item.section.value) }}</p>
        </template>
        <p v-else-if="isFreeTextValue(item.section.value)">{{ freeText(item.section.value) }}</p>
        <small>
          {{ item.section.authorDisplayName }}<template v-if="showAuthorAccountId"> · {{ item.section.authorAccountId }}</template>
          · {{ formatLocalDateTime(item.section.updatedAt) }}
        </small>
      </div>

      </template>

    </div>
  </details>
</template>
