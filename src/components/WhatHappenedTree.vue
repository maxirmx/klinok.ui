<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { WhatHappenedOption } from "../medicalEncounter";

withDefaults(defineProps<{ node: WhatHappenedOption; selected: string[]; root?: boolean }>(), {
  root: false,
});
const emit = defineEmits<{ toggle: [id: string] }>();
</script>

<template>
  <ul v-if="root" class="encounter-taxonomy encounter-taxonomy-root" role="tree" :aria-label="node.label">
    <li role="treeitem">
      <details>
        <summary>{{ node.label }}</summary>
        <ul class="encounter-taxonomy encounter-taxonomy-children" role="group">
          <WhatHappenedTree v-for="child in node.children ?? []" :key="child.id" :node="child" :selected="selected" @toggle="emit('toggle', $event)" />
        </ul>
      </details>
    </li>
  </ul>
  <li v-else role="treeitem">
    <details v-if="node.children?.length">
      <summary>{{ node.label }}</summary>
      <ul class="encounter-taxonomy encounter-taxonomy-children" role="group">
        <WhatHappenedTree v-for="child in node.children" :key="child.id" :node="child" :selected="selected" @toggle="emit('toggle', $event)" />
      </ul>
    </details>
    <label v-else class="check-row">
      <input type="checkbox" :checked="selected.includes(node.id)" @change="emit('toggle', node.id)" />
      <span>{{ node.label }}</span>
    </label>
  </li>
</template>
