<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import type { CaseView, ClinicalSection, ClinicalSectionId, ClinicalSectionPayloadValue } from "../cases/types";
import { getNextComplaintOptions } from "../dapp/templates";
import {
  clinicalOutcomeOptions,
  clearMedicalComplaintOptions,
  complaintTemplates,
  getMedicalHistoryView,
  medicalEntryDraft,
  saveMedicalEntry,
  selectedMedicalComplaintOptionIds,
  selectedMedicalComplaintOptions,
  selectedMedicalComplaintTemplate,
  selectedMedicalComplaintTemplateId,
  selectMedicalComplaintOption,
  showToast,
} from "../state";

const props = defineProps<{
  caseView: CaseView;
}>();

const history = computed(() => getMedicalHistoryView(props.caseView));
const headerFields = computed(() => [
  { label: "Вид", value: history.value.header.species },
  { label: "Кличка", value: history.value.header.name },
  { label: "Порода", value: history.value.header.breed },
  { label: "Пол", value: history.value.header.sex },
  { label: "Возраст", value: history.value.header.age },
  { label: "Окрас", value: history.value.header.color },
  { label: "Номер чипа", value: history.value.header.chip },
  { label: "Клеймо", value: history.value.header.brandMark },
  { label: "Последняя вакцинация", value: history.value.header.latestVaccination },
  { label: "Вес", value: history.value.header.weight },
]);
const nextComplaintOptions = computed(() => {
  return selectedMedicalComplaintTemplate.value
    ? getNextComplaintOptions(selectedMedicalComplaintTemplate.value, selectedMedicalComplaintOptionIds.value)
    : [];
});
const selectedComplaintPath = computed(() => selectedMedicalComplaintOptions.value.map((option) => option.label).join(" / "));

const payloadLabels: Partial<Record<ClinicalSectionId, Record<string, string>>> = {
  complaint: {
    selectedOptionLabels: "Выбранные признаки",
    freeText: "Комментарий",
    details: "Подробности",
  },
  habitus: {
    weightKg: "Вес, кг",
    temperatureC: "Температура, C",
    heartRate: "ЧСС",
    respiratoryRate: "ЧДД",
    bloodPressure: "АД",
  },
  therapeutic: {
    anamnesisDisease: "Анамнез болезни",
    anamnesisLife: "Анамнез жизни",
    exam: "Осмотр",
    recommendations: "Рекомендации",
    prescriptions: "Назначения",
  },
  diagnosis: {
    preliminaryDiagnosis: "Предварительный диагноз",
    differentialDiagnoses: "Дифференциальные диагнозы",
    concomitantDiagnoses: "Сопутствующие диагнозы",
  },
  vaccination: {
    previousVaccineDate: "Дата предыдущей вакцинации",
    previousVaccineName: "Предыдущая вакцина",
    complications: "Осложнения",
    currentVaccineDate: "Дата нынешней вакцинации",
    currentVaccineName: "Нынешняя вакцина",
    series: "Серия или номер",
    expiryDate: "Срок годности",
    chipNumber: "Номер чипа",
    injectionSite: "Место введения",
  },
  recommendations: {
    text: "Рекомендации",
  },
  laboratory: {
    studyDate: "Дата исследования",
    studyName: "Название исследования",
    laboratoryName: "Лаборатория",
    labWorkerName: "Лаборант",
    equipmentName: "Оборудование",
    indicators: "Показатели",
    comment: "Комментарий",
  },
  instrumental: {
    text: "Инструментальные исследования",
  },
  manipulations: {
    text: "Манипуляции",
  },
  outcome: {
    status: "Исход",
  },
};

const hiddenPayloadKeys = new Set(["templateId", "templateTitle", "selectedOptionIds"]);

function payloadValueText(value: ClinicalSectionPayloadValue) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ");
  return value;
}

function sectionRows(section: ClinicalSection) {
  const labels = payloadLabels[section.id] ?? {};
  return Object.entries(section.payload)
    .filter(([key, value]) => !hiddenPayloadKeys.has(key) && payloadValueText(value).trim())
    .map(([key, value]) => ({
      label: labels[key] ?? key,
      value: payloadValueText(value),
    }));
}

function formatFilledAt(value: string) {
  return value ? value.replace("T", " ").slice(0, 16) : "Дата не указана";
}

function changeComplaintTemplate() {
  clearMedicalComplaintOptions();
}

async function saveEntry() {
  try {
    await saveMedicalEntry(props.caseView.caseId);
    showToast("Запись истории сохранена");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Не удалось сохранить запись");
  }
}
</script>

<template>
  <article class="medical-history" data-test="medical-history">
    <section class="panel medical-pet-header" data-test="medical-pet-header">
      <h2>История болезни</h2>
      <div class="medical-header-grid">
        <div v-for="field in headerFields" :key="field.label" class="field compact">
          <span>{{ field.label }}</span>
          <strong>{{ field.value }}</strong>
        </div>
      </div>
    </section>

    <section class="panel medical-epicrisis" data-test="medical-epicrisis">
      <h2>Эпикриз</h2>
      <div class="epicrisis-list">
        <div v-for="row in history.epicrisisRows" :key="row.id" class="epicrisis-row">
          <strong>{{ row.date }}</strong>
          <span>{{ row.complaint }}</span>
          <small>{{ row.outcome }}</small>
        </div>
      </div>
    </section>

    <section class="form-panel panel medical-entry-form" data-test="medical-entry-form">
      <h2>Запись на текущую дату</h2>
      <label>
        <span>Дата записи</span>
        <input v-model="medicalEntryDraft.entryDate" type="date" data-test="medical-entry-date" />
      </label>

      <details class="medical-section" data-test="medical-section-complaint" open>
        <summary>Что случилось</summary>
        <label>
          <span>Шаблон обращения</span>
          <select v-model="selectedMedicalComplaintTemplateId" data-test="medical-complaint-template" @change="changeComplaintTemplate">
            <option v-for="template in complaintTemplates" :key="template.id" :value="template.id">{{ template.title }}</option>
          </select>
        </label>
        <div v-if="selectedMedicalComplaintTemplate?.mode === 'hierarchical'" class="template-block" data-test="medical-complaint-tree">
          <span class="field-caption">{{ selectedMedicalComplaintTemplate.prompt }}</span>
          <div v-if="selectedComplaintPath" class="selected-path">
            <strong>{{ selectedComplaintPath }}</strong>
            <button type="button" @click="clearMedicalComplaintOptions">Сбросить</button>
          </div>
          <div v-if="nextComplaintOptions.length" class="option-grid">
            <button
              v-for="option in nextComplaintOptions"
              :key="option.id"
              type="button"
              @click="selectMedicalComplaintOption(selectedMedicalComplaintOptionIds.length, option.id)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <label>
          <span>Комментарий к обращению</span>
          <input v-model="medicalEntryDraft.sections.complaint.freeText" data-test="medical-complaint-free-text" />
        </label>
        <label>
          <span>Подробности</span>
          <textarea v-model="medicalEntryDraft.sections.complaint.details" data-test="medical-complaint-details" />
        </label>
      </details>

      <details class="medical-section" data-test="medical-section-habitus">
        <summary>Общие данные / Габитус</summary>
        <div class="medical-inline-grid">
          <label><span>Вес, кг</span><input v-model="medicalEntryDraft.sections.habitus.weightKg" data-test="medical-habitus-weight" /></label>
          <label><span>Температура, C</span><input v-model="medicalEntryDraft.sections.habitus.temperatureC" /></label>
          <label><span>ЧСС</span><input v-model="medicalEntryDraft.sections.habitus.heartRate" /></label>
          <label><span>ЧДД</span><input v-model="medicalEntryDraft.sections.habitus.respiratoryRate" /></label>
          <label><span>АД</span><input v-model="medicalEntryDraft.sections.habitus.bloodPressure" /></label>
        </div>
      </details>

      <details class="medical-section" data-test="medical-section-therapeutic">
        <summary>Терапевтический приём</summary>
        <label><span>Анамнез болезни</span><textarea v-model="medicalEntryDraft.sections.therapeutic.anamnesisDisease" /></label>
        <label><span>Анамнез жизни</span><textarea v-model="medicalEntryDraft.sections.therapeutic.anamnesisLife" /></label>
        <label><span>Осмотр</span><textarea v-model="medicalEntryDraft.sections.therapeutic.exam" /></label>
        <label><span>Рекомендации</span><textarea v-model="medicalEntryDraft.sections.therapeutic.recommendations" /></label>
        <label><span>Назначения</span><textarea v-model="medicalEntryDraft.sections.therapeutic.prescriptions" /></label>
      </details>

      <details class="medical-section" data-test="medical-section-diagnosis">
        <summary>Диагноз</summary>
        <label><span>Предварительный диагноз</span><input v-model="medicalEntryDraft.sections.diagnosis.preliminaryDiagnosis" /></label>
        <label><span>Дифференциальные диагнозы</span><textarea v-model="medicalEntryDraft.sections.diagnosis.differentialDiagnoses" /></label>
        <label><span>Сопутствующие диагнозы</span><textarea v-model="medicalEntryDraft.sections.diagnosis.concomitantDiagnoses" /></label>
      </details>

      <details class="medical-section" data-test="medical-section-vaccination">
        <summary>Вакцинация / чипирование</summary>
        <div class="medical-inline-grid">
          <label><span>Дата предыдущей вакцинации</span><input v-model="medicalEntryDraft.sections.vaccination.previousVaccineDate" /></label>
          <label><span>Предыдущая вакцина</span><input v-model="medicalEntryDraft.sections.vaccination.previousVaccineName" /></label>
          <label><span>Осложнения</span><input v-model="medicalEntryDraft.sections.vaccination.complications" /></label>
          <label><span>Дата нынешней вакцинации</span><input v-model="medicalEntryDraft.sections.vaccination.currentVaccineDate" data-test="medical-vaccination-date" /></label>
          <label><span>Нынешняя вакцина</span><input v-model="medicalEntryDraft.sections.vaccination.currentVaccineName" data-test="medical-vaccination-name" /></label>
          <label><span>Серия или номер</span><input v-model="medicalEntryDraft.sections.vaccination.series" /></label>
          <label><span>Срок годности</span><input v-model="medicalEntryDraft.sections.vaccination.expiryDate" /></label>
          <label><span>Номер чипа</span><input v-model="medicalEntryDraft.sections.vaccination.chipNumber" data-test="medical-chip-number" /></label>
          <label><span>Место введения</span><input v-model="medicalEntryDraft.sections.vaccination.injectionSite" /></label>
        </div>
      </details>

      <details class="medical-section" data-test="medical-section-recommendations">
        <summary>Рекомендации</summary>
        <label><span>Текст рекомендаций</span><textarea v-model="medicalEntryDraft.sections.recommendations.text" /></label>
      </details>

      <details class="medical-section" data-test="medical-section-laboratory">
        <summary>Лабораторные исследования</summary>
        <div class="medical-inline-grid">
          <label><span>Дата исследования</span><input v-model="medicalEntryDraft.sections.laboratory.studyDate" /></label>
          <label><span>Название исследования</span><input v-model="medicalEntryDraft.sections.laboratory.studyName" /></label>
          <label><span>Лаборатория</span><input v-model="medicalEntryDraft.sections.laboratory.laboratoryName" /></label>
          <label><span>Лаборант</span><input v-model="medicalEntryDraft.sections.laboratory.labWorkerName" /></label>
          <label><span>Оборудование</span><input v-model="medicalEntryDraft.sections.laboratory.equipmentName" /></label>
        </div>
        <label><span>Показатели</span><textarea v-model="medicalEntryDraft.sections.laboratory.indicators" /></label>
        <label><span>Комментарий</span><textarea v-model="medicalEntryDraft.sections.laboratory.comment" /></label>
      </details>

      <details class="medical-section" data-test="medical-section-instrumental">
        <summary>Инструментальные исследования</summary>
        <label><span>Описание</span><textarea v-model="medicalEntryDraft.sections.instrumental.text" /></label>
      </details>

      <details class="medical-section" data-test="medical-section-manipulations">
        <summary>Манипуляции</summary>
        <label><span>Описание</span><textarea v-model="medicalEntryDraft.sections.manipulations.text" /></label>
      </details>

      <details class="medical-section" data-test="medical-section-outcome">
        <summary>Исход</summary>
        <label>
          <span>Исход</span>
          <select v-model="medicalEntryDraft.sections.outcome.status" data-test="medical-outcome-status">
            <option value="">Не выбран</option>
            <option v-for="option in clinicalOutcomeOptions" :key="option">{{ option }}</option>
          </select>
        </label>
      </details>

      <button class="primary-action inline" type="button" data-test="save-medical-entry" @click="saveEntry">Сохранить запись</button>
    </section>

    <section class="panel medical-entries" data-test="medical-previous-entries">
      <h2>Предыдущие записи</h2>
      <details v-for="entry in history.entries" :key="entry.id" class="medical-entry" data-test="medical-entry" open>
        <summary>
          <span>{{ entry.displayDate }}</span>
          <small>{{ entry.sections.length }} раздела</small>
        </summary>
        <article v-for="section in entry.sections" :key="`${entry.id}-${section.id}`" class="medical-entry-section">
          <header>
            <h3>{{ section.title }}</h3>
            <small>{{ section.authorName }} · {{ formatFilledAt(section.filledAt) }}</small>
          </header>
          <dl>
            <div v-for="row in sectionRows(section)" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
        </article>
      </details>
    </section>
  </article>
</template>
