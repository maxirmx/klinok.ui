<script setup lang="ts">
import { computed, useId, useSlots } from "vue";
import type { Role, RoleStatus } from "@klinok/protocol";
import AppIcon from "./AppIcon.vue";

const props = withDefaults(defineProps<{
  modelValue?: Role | null;
  includeAdministrator?: boolean;
  selectable?: boolean;
  personalizedLabels?: boolean;
  statusByRole?: Partial<Record<Role, RoleStatus | "not_requested">>;
  disabledRoles?: Role[];
}>(), {
  modelValue: null,
  includeAdministrator: false,
  selectable: true,
  personalizedLabels: false,
  statusByRole: () => ({}),
  disabledRoles: () => [],
});

const emit = defineEmits<{ "update:modelValue": [role: Role] }>();
const slots = useSlots();
const groupId = useId();
const roles = computed<Role[]>(() => props.includeAdministrator
  ? ["owner", "doctor", "administrator"]
  : ["owner", "doctor"]);
const labels: Record<Role, string> = {
  owner: "Владелец животного",
  doctor: "Ветеринар",
  administrator: "Администратор",
};
const personalLabels: Record<Role, string> = {
  owner: "Я - владелец животного",
  doctor: "Я - ветеринар",
  administrator: "Я - администратор",
};
const icons: Record<Role, "pets" | "medical-tools" | "user"> = {
  owner: "pets",
  doctor: "medical-tools",
  administrator: "user",
};

function select(role: Role) {
  if (props.selectable && !props.disabledRoles.includes(role)) emit("update:modelValue", role);
}
</script>

<template>
  <div class="role-selection-grid" :class="{ 'with-administrator': includeAdministrator }">
    <component
      :is="selectable && !slots.actions ? 'label' : 'article'"
      v-for="role in roles"
      :key="role"
      class="role-selection-card"
      :class="[role, statusByRole[role] ?? 'not_requested', { selected: modelValue === role, selectable, disabled: disabledRoles.includes(role) }]"
    >
      <input
        v-if="selectable"
        :id="`${groupId}-${role}`"
        type="radio"
        :name="`${groupId}-selected-role`"
        :value="role"
        :checked="modelValue === role"
        :disabled="disabledRoles.includes(role)"
        @change="select(role)"
      />
      <span v-else class="role-selection-marker" aria-hidden="true" />
      <label v-if="selectable && slots.actions" class="role-selection-title" :for="`${groupId}-${role}`">{{ personalizedLabels ? personalLabels[role] : labels[role] }}</label>
      <span v-else class="role-selection-title">{{ personalizedLabels ? personalLabels[role] : labels[role] }}</span>
      <div v-if="slots.meta" class="role-selection-meta"><slot name="meta" :role="role" /></div>
      <AppIcon class="role-selection-graphic" :name="icons[role]" />
      <div v-if="slots.details" class="role-selection-details"><slot name="details" :role="role" /></div>
      <div v-if="slots.actions" class="role-selection-actions"><slot name="actions" :role="role" /></div>
    </component>
  </div>
</template>
