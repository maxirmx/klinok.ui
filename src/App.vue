<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import QaScenarioMenu from "./components/QaScenarioMenu.vue";
import ToastHost from "./components/ToastHost.vue";
import { darkMode } from "./state";

const route = useRoute();
const qaHotkeyOpen = ref(false);
const qaQueryVisible = computed(() => route.query.qa === "1");
const qaVisible = computed(() => qaQueryVisible.value || qaHotkeyOpen.value);

function onKeydown(event: KeyboardEvent) {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    qaHotkeyOpen.value = !qaHotkeyOpen.value;
  }
}

watch(
  () => route.fullPath,
  () => {
    if (!qaQueryVisible.value) qaHotkeyOpen.value = false;
  },
);

onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <div class="prototype" :class="{ 'is-dark': darkMode }">
    <RouterView />
    <QaScenarioMenu v-if="qaVisible" @close="qaHotkeyOpen = false" />
    <ToastHost />
  </div>
</template>
