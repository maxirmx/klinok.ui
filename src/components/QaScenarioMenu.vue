<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { figmaCoverage, scenarioRegistry, type ScenarioRole } from "../scenarios";
import AppIcon from "./AppIcon.vue";

defineEmits<{
  close: [];
}>();

const route = useRoute();
const selectedRole = ref<ScenarioRole | "all">("all");
const roles: { id: ScenarioRole | "all"; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "auth", label: "Вход" },
  { id: "owner", label: "Владелец" },
  { id: "doctor", label: "Врач" },
  { id: "administrator", label: "Администратор" },
  { id: "shared", label: "Общие" },
];

const scenarios = computed(() => {
  if (selectedRole.value === "all") return scenarioRegistry;
  return scenarioRegistry.filter((scenario) => scenario.role === selectedRole.value);
});

const coverageStatus = computed(() => {
  const implemented = figmaCoverage.filter((entry) => entry.status === "implemented").length;
  const duplicate = figmaCoverage.filter((entry) => entry.status === "duplicate").length;
  const referenceOnly = figmaCoverage.filter((entry) => entry.status === "reference-only").length;
  return { implemented, duplicate, referenceOnly };
});
</script>

<template>
  <aside class="qa-panel" aria-label="QA сценарии">
    <header>
      <div>
        <strong>QA сценарии</strong>
        <span>
          {{ coverageStatus.implemented }} implemented · {{ coverageStatus.duplicate }} duplicate ·
          {{ coverageStatus.referenceOnly }} reference
        </span>
      </div>
      <button aria-label="Закрыть QA меню" @click="$emit('close')">
        <AppIcon name="close" />
      </button>
    </header>

    <div class="qa-role-filter" aria-label="Фильтр ролей">
      <button
        v-for="role in roles"
        :key="role.id"
        :class="{ active: selectedRole === role.id }"
        @click="selectedRole = role.id"
      >
        {{ role.label }}
      </button>
    </div>

    <div class="qa-list">
      <RouterLink
        v-for="scenario in scenarios"
        :key="scenario.id"
        class="qa-row"
        :class="{ current: route.name === scenario.id }"
        :to="scenario.path"
      >
        <span class="qa-status" :class="{ done: scenario.implemented }">
          {{ scenario.implemented ? "done" : "todo" }}
        </span>
        <span>
          <strong>{{ scenario.title }}</strong>
          <small>{{ scenario.id }} · {{ scenario.role }} · {{ scenario.path }}</small>
          <small>{{ scenario.figmaNodeId }} · {{ scenario.exportName ?? "live" }}</small>
        </span>
      </RouterLink>
    </div>
  </aside>
</template>
