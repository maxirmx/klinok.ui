<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from "vue";

const props = withDefaults(defineProps<{
  modelValue: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
}>(), {
  cancelLabel: "Отмена",
  busy: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  confirm: [];
}>();

const dialog = ref<HTMLElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const titleId = `confirmation-title-${useId()}`;
const descriptionId = `confirmation-description-${useId()}`;
let returnFocus: HTMLElement | null = null;

function cancel() {
  if (props.busy) return;
  emit("update:modelValue", false);
}

function confirm() {
  if (props.busy) return;
  emit("confirm");
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    cancel();
    return;
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const buttons = [...dialog.value.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
  const first = buttons[0];
  const last = buttons.at(-1);
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
    cancelButton.value?.focus();
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
      class="confirmation-dialog"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="descriptionId"
      @keydown="handleKeydown"
    >
      <h2 :id="titleId">{{ title }}</h2>
      <p :id="descriptionId">{{ description }}</p>
      <div class="confirmation-dialog-actions">
        <button ref="cancelButton" class="outline-action inline" type="button" :disabled="busy" @click="cancel">
          {{ cancelLabel }}
        </button>
        <button class="primary-action inline danger" type="button" :disabled="busy" @click="confirm">
          {{ confirmLabel }}
        </button>
      </div>
    </section>
  </div>
</template>
