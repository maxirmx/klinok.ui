<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import ModalDialog from "./ModalDialog.vue";

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

function cancel() {
  if (props.busy) return;
  emit("update:modelValue", false);
}

function confirm() {
  if (props.busy) return;
  emit("confirm");
}

</script>

<template>
  <ModalDialog
    :model-value="modelValue"
    :title="title"
    :description="description"
    :busy="busy"
    role="alertdialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="confirmation-dialog-actions">
      <button class="outline-action inline" type="button" :disabled="busy" @click="cancel">
        {{ cancelLabel }}
      </button>
      <button class="primary-action inline danger" type="button" :disabled="busy" @click="confirm">
        {{ confirmLabel }}
      </button>
    </div>
  </ModalDialog>
</template>
