<script setup lang="ts">
defineProps<{
  name:
    | "home"
    | "bag"
    | "plus"
    | "book"
    | "user"
    | "bell"
    | "chevron"
    | "chevron-left"
    | "chevron-down"
    | "search"
    | "filter"
    | "close"
    | "moon"
    | "calendar"
    | "star"
    | "check"
    | "more";
}>();
</script>

<template>
  <svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true">
    <g v-if="name === 'home'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M4.4 10.7 12 4.2l7.6 6.5v8.1a1.8 1.8 0 0 1-1.8 1.8H6.2a1.8 1.8 0 0 1-1.8-1.8v-8.1Z" />
      <path d="M9.2 20.6v-6h5.6v6" />
    </g>
    <g v-else-if="name === 'bag'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M6.3 8.2h11.4a1.9 1.9 0 0 1 1.9 1.9v7.6a1.9 1.9 0 0 1-1.9 1.9H6.3a1.9 1.9 0 0 1-1.9-1.9v-7.6a1.9 1.9 0 0 1 1.9-1.9Z" />
      <path d="M9 8.2V6.8a3 3 0 0 1 6 0v1.4" />
    </g>
    <g v-else-if="name === 'plus'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.9">
      <path d="M12 5v14M5 12h14" />
    </g>
    <g v-else-if="name === 'book'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v12.5H8.1A2.1 2.1 0 0 1 6 17.4V4.5Z" />
      <path d="M6 17.4A2.1 2.1 0 0 1 8.1 15H18M9 8h5.5M9 11.5h4" />
    </g>
    <g v-else-if="name === 'user'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <circle cx="12" cy="8.2" r="3.2" />
      <path d="M5.5 20c.7-3.4 3-5.3 6.5-5.3s5.8 1.9 6.5 5.3" />
    </g>
    <g v-else-if="name === 'bell'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8">
      <path d="M17.5 16H6.5l1.2-2.1V10a4.3 4.3 0 0 1 8.6 0v3.9L17.5 16Z" />
      <path d="M10 18.2a2.2 2.2 0 0 0 4 0" />
    </g>
    <g v-else-if="name === 'chevron'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
      <path d="m9 5 7 7-7 7" />
    </g>
    <g v-else-if="name === 'chevron-left'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
      <path d="m15 5-7 7 7 7" />
    </g>
    <g v-else-if="name === 'chevron-down'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
      <path d="m6 9 6 6 6-6" />
    </g>
    <g v-else-if="name === 'search'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <circle cx="10.7" cy="10.7" r="6.2" />
      <path d="m15.3 15.3 4.2 4.2" />
    </g>
    <path v-else-if="name === 'filter'" fill="currentColor" d="M4.4 5.7c0-.9.7-1.6 1.6-1.6h12c.9 0 1.6.7 1.6 1.6v1.1c0 .5-.2.9-.6 1.2l-4.6 3.2V16c0 .5-.3.9-.7 1.1l-3.2 1.4c-.9.4-1.9-.3-1.9-1.3v-6L5 8c-.4-.3-.6-.7-.6-1.2V5.7Z" />
    <g v-else-if="name === 'close'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2">
      <path d="m6 6 12 12M18 6 6 18" />
    </g>
    <g v-else-if="name === 'moon'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M18.8 15.3A7.4 7.4 0 0 1 8.7 5.2a7.8 7.8 0 1 0 10.1 10.1Z" />
    </g>
    <g v-else-if="name === 'calendar'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M6.2 5.5h11.6a1.9 1.9 0 0 1 1.9 1.9v10.4a1.9 1.9 0 0 1-1.9 1.9H6.2a1.9 1.9 0 0 1-1.9-1.9V7.4a1.9 1.9 0 0 1 1.9-1.9Z" />
      <path d="M8 3.8v3M16 3.8v3M4.3 9.2h15.4" />
    </g>
    <path v-else-if="name === 'star'" fill="currentColor" d="m12 3.9 2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2-3.8-3.7 5.2-.8L12 3.9Z" />
    <g v-else-if="name === 'check'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
      <path d="m5 12 4.2 4.2L19 6.5" />
    </g>
    <g v-else-if="name === 'more'" fill="currentColor">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </g>
  </svg>
</template>
