<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { nextTick, onBeforeUnmount, ref, useId, watch } from "vue";

const props = withDefaults(defineProps<{
  modelValue: boolean;
  title: string;
  description?: string;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
}>(), {
  description: "",
  busy: false,
  role: "dialog",
});

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
const dialog = ref<HTMLElement | null>(null);
const titleId = `modal-title-${useId()}`;
const descriptionId = `modal-description-${useId()}`;
let returnFocus: HTMLElement | null = null;

function focusableElements(): HTMLElement[] {
  if (!dialog.value) return [];
  return [...dialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
  )];
}

function cancel() {
  if (!props.busy) emit("update:modelValue", false);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key !== "Tab") return;
  const elements = focusableElements();
  const first = elements[0];
  const last = elements.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(() => props.modelValue, async (open) => {
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    focusableElements()[0]?.focus();
    return;
  }
  const target = returnFocus;
  returnFocus = null;
  await nextTick();
  if (target?.isConnected) target.focus();
});

onBeforeUnmount(() => {
  if (returnFocus?.isConnected) returnFocus.focus();
});
</script>

<template>
  <div v-if="modelValue" class="confirmation-dialog-backdrop" @click.self="cancel">
    <section
      ref="dialog"
      class="confirmation-dialog modal-dialog"
      :role="role"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="description ? descriptionId : undefined"
      @keydown="handleKeydown"
    >
      <h2 :id="titleId">{{ title }}</h2>
      <p v-if="description" :id="descriptionId">{{ description }}</p>
      <slot />
    </section>
  </div>
</template>
