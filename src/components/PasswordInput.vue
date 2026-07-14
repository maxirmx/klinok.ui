<script setup lang="ts">
import { computed, ref, useId } from "vue";
import AppIcon from "./AppIcon.vue";

defineOptions({ inheritAttrs: false });

defineProps<{
  label: string;
}>();

const model = defineModel<string>({ required: true });
const visible = ref(false);
const inputId = useId();
const toggleLabel = computed(() => visible.value ? "Скрыть пароль" : "Показать пароль");
</script>

<template>
  <div class="password-field">
    <label :for="inputId">{{ label }}</label>
    <div class="password-input">
      <input
        :id="inputId"
        v-model="model"
        v-bind="$attrs"
        :type="visible ? 'text' : 'password'"
      />
      <button
        class="password-visibility-toggle"
        type="button"
        :aria-controls="inputId"
        :aria-label="toggleLabel"
        :title="toggleLabel"
        :aria-pressed="visible"
        @click="visible = !visible"
      >
        <AppIcon :name="visible ? 'eye-off' : 'eye'" />
      </button>
    </div>
  </div>
</template>
