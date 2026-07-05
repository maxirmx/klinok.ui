<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import AppShell from "../components/AppShell.vue";
import MedicalHistoryDocument from "../components/MedicalHistoryDocument.vue";
import { findCaseByVisitId, localVisits } from "../state";

const route = useRoute();
const selectedCase = computed(() => {
  const id = Number(route.params.id);
  return findCaseByVisitId(id);
});
</script>

<template>
  <AppShell
    v-if="selectedCase"
    title="История болезни"
    :subtitle="selectedCase.title"
    back-to="/owner/visits"
  >
    <MedicalHistoryDocument :case-view="selectedCase" />
  </AppShell>

  <AppShell v-else title="История контактов" subtitle="Визиты, заявки и документы" back-to="/owner/home">
    <section class="panel">
      <RouterLink v-for="visit in localVisits" :key="visit.id" class="visit-card list-item" :to="`/owner/visits/${visit.id}`">
        <div class="visit-card-head">
          <div>
            <h3>{{ visit.title }}</h3>
            <p>{{ visit.complaint }}</p>
          </div>
          <span>{{ visit.tag }}</span>
        </div>
        <dl>
          <div><dt>Питомец</dt><dd>{{ visit.pet }}</dd></div>
          <div><dt>Дата</dt><dd>{{ visit.date }}</dd></div>
        </dl>
      </RouterLink>
    </section>
  </AppShell>
</template>
