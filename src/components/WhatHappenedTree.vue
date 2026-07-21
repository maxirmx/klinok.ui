<script setup lang="ts">
import type { WhatHappenedOption } from "../medicalEncounter";

defineProps<{ nodes: WhatHappenedOption[]; selected: string[] }>();
const emit = defineEmits<{ toggle: [id: string] }>();
</script>

<template>
  <ul class="encounter-taxonomy">
    <li v-for="node in nodes" :key="node.id">
      <details v-if="node.children?.length">
        <summary>{{ node.label }}</summary>
        <WhatHappenedTree :nodes="node.children" :selected="selected" @toggle="emit('toggle', $event)" />
      </details>
      <label v-else class="check-row">
        <input type="checkbox" :checked="selected.includes(node.id)" @change="emit('toggle', node.id)" />
        <span>{{ node.label }}</span>
      </label>
    </li>
  </ul>
</template>
