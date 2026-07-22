<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import AppIcon from "./AppIcon.vue";
import { useAlertStore } from "../stores/alert";

const alertStore = useAlertStore();
</script>

<template>
  <div
    v-if="alertStore.alert"
    class="form-alert app-alert"
    :class="alertStore.alert.kind"
    :role="alertStore.alert.kind === 'error' ? 'alert' : 'status'"
  >
    <span>{{ alertStore.alert.text }}</span>
    <button
      type="button"
      title="Закрыть сообщение"
      aria-label="Закрыть сообщение"
      @click="alertStore.clear()"
    >
      <AppIcon name="close" />
    </button>
  </div>
</template>
