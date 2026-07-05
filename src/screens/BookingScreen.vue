<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import AppShell from "../components/AppShell.vue";
import AppIcon from "../components/AppIcon.vue";
import { doctors, pets, type AppointmentDraft } from "../data";
import { appointment, submitAppointment } from "../state";

const props = defineProps<{
  scenarioId: string;
}>();

const router = useRouter();
const urgencyOptions: AppointmentDraft["urgency"][] = ["Планово", "Срочно", "Сегодня"];
const isSuccess = computed(() => props.scenarioId === "owner-booking-success");

async function submit() {
  await submitAppointment();
  router.push("/owner/booking/success");
}
</script>

<template>
  <AppShell
    v-if="isSuccess"
    title="Заявка создана"
    subtitle="Врачи увидят обращение и смогут откликнуться"
    back-to="/owner/home"
  >
    <section class="panel success-state">
      <span><AppIcon name="check" /></span>
      <h2>Заявка создана</h2>
      <p>Мы добавили обращение в историю контактов. Вы можете перейти к откликнувшимся врачам или вернуться на главный экран.</p>
      <div class="action-row">
        <RouterLink class="primary-action inline" to="/owner/doctors">Откликнувшиеся врачи</RouterLink>
        <RouterLink class="outline-action" to="/owner/home">На главный экран</RouterLink>
      </div>
    </section>
  </AppShell>

  <AppShell v-else title="Запись к врачу" subtitle="Оформление заявки" back-to="/owner/home">
    <section class="form-panel panel">
      <h2>Запись к врачу</h2>
      <label>
        <span>Врач</span>
        <select v-model="appointment.doctor">
          <option v-for="doctor in doctors" :key="doctor.id">{{ doctor.name }}</option>
        </select>
      </label>
      <label>
        <span>Выберите питомца</span>
        <select v-model="appointment.pet">
          <option v-for="pet in pets" :key="pet.id">{{ pet.name }}</option>
        </select>
      </label>
      <div class="segmented compact" aria-label="Срочность">
        <button
          v-for="value in urgencyOptions"
          :key="value"
          :class="{ active: appointment.urgency === value }"
          @click="appointment.urgency = value"
        >
          {{ value }}
        </button>
      </div>
      <label>
        <span>Выберите причину похода</span>
        <input v-model="appointment.reason" />
      </label>
      <label>
        <span>Опишите проблему</span>
        <textarea v-model="appointment.details" />
      </label>
      <div class="two-cols">
        <label><span>Выберите дату</span><input v-model="appointment.date" /></label>
        <label><span>Выберите время</span><input v-model="appointment.time" /></label>
      </div>
      <button class="primary-action inline" @click="submit">Оформить запись</button>
    </section>

    <section class="panel">
      <div class="section-title">
        <h2>Откликнувшиеся врачи</h2>
        <RouterLink to="/owner/doctors">Все</RouterLink>
      </div>
      <RouterLink v-for="doctor in doctors" :key="doctor.id" class="doctor-card" :to="`/owner/doctors/${doctor.id}`">
        <span class="doctor-photo" />
        <div><h3>{{ doctor.name }}</h3><p>{{ doctor.role }}</p><small>{{ doctor.experience }}</small></div>
        <div class="doctor-price"><span>{{ doctor.rating }} <AppIcon name="star" /></span><strong>{{ doctor.price }}</strong></div>
      </RouterLink>
    </section>
  </AppShell>
</template>
