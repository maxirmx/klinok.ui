<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterView, useRoute } from "vue-router";
import QaScenarioMenu from "./components/QaScenarioMenu.vue";
import { appState } from "./appStore";

const route = useRoute();
const qaOpen = ref(false);
const qaVisible = computed(() => route.query.qa === "1" || qaOpen.value);

function keydown(event: KeyboardEvent) {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    qaOpen.value = !qaOpen.value;
  }
}

watch(() => route.fullPath, () => { if (route.query.qa !== "1") qaOpen.value = false; });
onMounted(() => window.addEventListener("keydown", keydown));
onBeforeUnmount(() => window.removeEventListener("keydown", keydown));
</script>

<template>
  <div class="prototype operational-app">
    <div v-if="appState.busy && !appState.initialized" class="app-loading" role="status">Загрузка защищённого профиля…</div>
    <RouterView v-else />
    <QaScenarioMenu v-if="qaVisible" @close="qaOpen = false" />
  </div>
</template>
