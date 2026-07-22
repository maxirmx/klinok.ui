<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed } from "vue";
import { appState } from "../appStore";

const status = computed(() => {
  if (!appState.repositoryConnected) return {
    kind: "error",
    label: "Хранилище недоступно",
    title: appState.sync.lastError || "Подключение к хранилищу не установлено.",
  };
  if (appState.sync.lastError) return { kind: "error", label: "Ошибка синхронизации", title: appState.sync.lastError };
  if (appState.sync.failedCount) return { kind: "error", label: `Конфликты: ${appState.sync.failedCount}`, title: "Часть изменений отклонена проверкой доверенного узла." };
  if (appState.sync.pendingCount || appState.sync.syncing) {
    return {
      kind: "pending",
      label: appState.sync.pendingCount ? `Ожидает сохранения: ${appState.sync.pendingCount}` : "Синхронизация",
      title: "Изменения сохранены на устройстве и ожидают подтверждения доверенного узла.",
    };
  }
  return { kind: "saved", label: "Сохранено", title: "Все изменения подтверждены доверенным узлом." };
});
</script>

<template>
  <span class="sync-status" :class="status.kind" role="status" :title="status.title">
    <span aria-hidden="true"></span>{{ status.label }}
  </span>
</template>
