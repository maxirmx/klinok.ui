<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

withDefaults(
  defineProps<{
    variant?: "full" | "mono";
    size?: "compact" | "standard";
  }>(),
  {
    variant: "full",
    size: "standard",
  },
);
</script>

<template>
  <svg
    class="brand-logo"
    :class="[`brand-logo--${variant}`, `brand-logo--${size}`]"
    viewBox="0 0 773 198"
    role="img"
    aria-label="Клинок"
    data-brand-logo
  >
      :fill="variant === 'full' ? 'var(--brand-sky)' : 'currentColor'"
    <path
      :fill="variant === 'full' ? '#FF7F1A' : 'currentColor'"
      d="M0 77.967 L25.156 77.967 L25.156 194.267 L0 194.267 L0 77.967 Z M67.767 77.967 L96.858 77.967 L47.231 132.462 L99.425 194.267 L69.649 194.267 L17.968 133.126 L67.767 77.967 Z M222.631 77.967 L222.631 194.267 L197.818 194.267 L197.818 99.399 L154.009 99.399 L154.009 147.913 C154.009 157.66 152.526 166.023 149.56 173.001 C146.708 179.868 142.202 185.129 136.041 188.784 C129.88 192.439 121.951 194.267 112.254 194.267 L112.254 174.164 C114.992 174.164 117.445 173.554 119.613 172.336 C121.78 171.118 123.606 169.345 125.089 167.019 C126.572 164.693 127.713 161.924 128.511 158.712 C129.31 155.5 129.709 151.956 129.709 148.079 L129.709 77.967 L222.631 77.967 Z M398.454 143.095 L398.454 121.662 L454.413 121.662 L454.413 143.095 L398.454 143.095 Z M454.413 77.967 L478.884 77.967 L478.884 194.267 L454.413 194.267 L454.413 77.967 Z M373.983 77.967 L398.454 77.967 L398.454 194.267 L373.983 194.267 L373.983 77.967 Z M245.717 194.267 L245.717 77.967 L268.888 77.967 L268.888 154.519 L331.534 77.967 L354.705 77.967 L354.705 194.267 L331.534 194.267 L331.534 117.715 L268.888 194.267 L245.717 194.267 Z"
    />
      :fill="variant === 'full' ? 'var(--brand-sky)' : 'currentColor'"
  </svg>
</template>
