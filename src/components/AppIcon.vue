<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

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
    | "eye"
    | "eye-off"
    | "pets"
    | "medical-tools"
    | "calendar"
    | "star"
    | "check"
    | "edit"
    | "link"
    | "trash"
    | "restore"
    | "share"
    | "share-off"
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
    <g v-else-if="name === 'eye'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M2.8 12s3.3-5.4 9.2-5.4 9.2 5.4 9.2 5.4-3.3 5.4-9.2 5.4S2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.7" />
    </g>
    <g v-else-if="name === 'eye-off'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M4.2 7.2C3.3 8.1 2.8 9 2.8 9s3.3 5.4 9.2 5.4c1.2 0 2.3-.2 3.2-.5M8.1 5.9c1.1-.4 2.4-.6 3.9-.6 5.9 0 9.2 5.4 9.2 5.4s-.7 1.1-1.9 2.3" />
      <path d="M9.7 9.7a3.2 3.2 0 0 0 4.6 4.6M3.5 3.5l17 17" />
    </g>
    <g v-else-if="name === 'pets'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.45">
      <path d="m2.6 9.1.8-4 2.8 2 2.7-2 .8 4v3.2a3.55 3.55 0 0 1-7.1 0V9.1Z" />
      <path d="M4.8 11.2h.1M7.5 11.2h.1M5.6 13.1h1.1M2.7 12.8.8-.2M9.6 12.8l-.8-.2" />
      <path d="M15.1 7.8a4.2 4.2 0 0 1 4.3 0l1.8-1.2.2 4.2v2.1a4.15 4.15 0 0 1-8.3 0v-2.1l.2-4.2 1.8 1.2Z" />
      <path d="M16 11.2h.1M18.9 11.2h.1M17.1 13.2h.8M16.8 15.1c.5.4 1.2.4 1.7 0" />
    </g>
    <g v-else-if="name === 'medical-tools'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.55">
      <path d="M3.8 3.5h6.6l3 3v13.8H3.8V3.5Z" />
      <path d="M10.4 3.5v3.3h3M6.2 11h4.7M8.55 8.7v4.7" />
      <path d="M16.2 5.2v5.1a2.4 2.4 0 0 0 4.8 0V5.2M16.2 5.2h1.3M19.7 5.2H21" />
      <path d="M18.6 12.7v2.1a3.4 3.4 0 0 1-3.4 3.4h-1.8" />
      <circle cx="12.2" cy="18.2" r="1.2" />
    </g>
    <g v-else-if="name === 'calendar'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M6.2 5.5h11.6a1.9 1.9 0 0 1 1.9 1.9v10.4a1.9 1.9 0 0 1-1.9 1.9H6.2a1.9 1.9 0 0 1-1.9-1.9V7.4a1.9 1.9 0 0 1 1.9-1.9Z" />
      <path d="M8 3.8v3M16 3.8v3M4.3 9.2h15.4" />
    </g>
    <path v-else-if="name === 'star'" fill="currentColor" d="m12 3.9 2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.4-4.6 2.4.9-5.2-3.8-3.7 5.2-.8L12 3.9Z" />
    <g v-else-if="name === 'check'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
      <path d="m5 12 4.2 4.2L19 6.5" />
    </g>
    <g v-else-if="name === 'edit'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M4.5 19.5h4l10.2-10.2a2.1 2.1 0 0 0-3-3L5.5 16.5l-1 3Z" />
      <path d="m14.5 7.5 3 3" />
    </g>
    <g v-else-if="name === 'link'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="m9.5 14.5 5-5" />
      <path d="m7.3 16.7-1.1 1.1a3.5 3.5 0 0 1-5-5l3.2-3.2a3.5 3.5 0 0 1 5 0" transform="translate(2.8 -2.8)" />
      <path d="m16.7 7.3 1.1-1.1a3.5 3.5 0 0 1 5 5l-3.2 3.2a3.5 3.5 0 0 1-5 0" transform="translate(-2.8 2.8)" />
    </g>
    <g v-else-if="name === 'trash'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M5 7h14M9 7V4.5h6V7M7 7l.8 13h8.4L17 7M10 10.5v6M14 10.5v6" />
    </g>
    <g v-else-if="name === 'restore'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <path d="M4.5 8.5V4.8m0 0h3.7M4.5 4.8l3 2.7a7.2 7.2 0 1 1-2.1 7.4" />
    </g>
    <g v-else-if="name === 'share'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <circle cx="18" cy="5" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="19" r="2.2" />
      <path d="m8 11 7.8-4.6M8 13l7.8 4.6" />
    </g>
    <g v-else-if="name === 'share-off'" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
      <circle cx="18" cy="5" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="18" cy="19" r="2.2" />
      <path d="m8 11 7.8-4.6M8 13l3.2 1.9M14.8 17l1.2.7M4 4l16 16" />
    </g>
    <g v-else-if="name === 'more'" fill="currentColor">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </g>
  </svg>
</template>
