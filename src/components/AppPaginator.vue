<script setup lang="ts">
import { computed } from "vue";
import AppIcon from "./AppIcon.vue";

const props = withDefaults(defineProps<{
  page: number;
  pageSize: number;
  totalItems: number;
  pageSizes?: readonly number[];
  pageSizeLabel?: string;
  ariaLabel?: string;
}>(), {
  pageSizes: () => [10, 20, 50],
  pageSizeLabel: "Строк на странице",
  ariaLabel: "Навигация по страницам",
});

const emit = defineEmits<{
  "update:page": [page: number];
  "update:pageSize": [pageSize: number];
}>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.totalItems / props.pageSize)));
const currentPage = computed(() => Math.min(Math.max(1, props.page), pageCount.value));
const pageStart = computed(() => props.totalItems ? (currentPage.value - 1) * props.pageSize + 1 : 0);
const pageEnd = computed(() => Math.min(currentPage.value * props.pageSize, props.totalItems));

function selectPage(page: number) {
  emit("update:page", Math.min(Math.max(1, page), pageCount.value));
}

function selectPageSize(event: Event) {
  emit("update:pageSize", Number((event.target as HTMLSelectElement).value));
}
</script>

<template>
  <nav class="app-paginator" :aria-label="ariaLabel">
    <span>Показаны {{ pageStart }}–{{ pageEnd }} из {{ totalItems }}</span>
    <div class="app-paginator-buttons">
      <button
        type="button"
        :disabled="currentPage === 1"
        title="Предыдущая страница"
        aria-label="Предыдущая страница"
        @click="selectPage(currentPage - 1)"
      >
        <AppIcon name="chevron-left" />
      </button>
      <button
        v-for="pageNumber in pageCount"
        :key="pageNumber"
        type="button"
        :class="{ active: currentPage === pageNumber }"
        :aria-label="`Страница ${pageNumber}`"
        :aria-current="currentPage === pageNumber ? 'page' : undefined"
        @click="selectPage(pageNumber)"
      >
        {{ pageNumber }}
      </button>
      <button
        type="button"
        :disabled="currentPage === pageCount"
        title="Следующая страница"
        aria-label="Следующая страница"
        @click="selectPage(currentPage + 1)"
      >
        <AppIcon name="chevron" />
      </button>
    </div>
    <label>
      <span>{{ pageSizeLabel }}</span>
      <select :value="pageSize" @change="selectPageSize">
        <option v-for="size in pageSizes" :key="size" :value="size">{{ size }}</option>
      </select>
    </label>
  </nav>
</template>
