<script setup lang="ts">
import { petBirthSummary } from "../petProfile";
import type { PetProfile } from "../repositories/types";

withDefaults(defineProps<{
  pet: PetProfile;
  showDetails?: boolean;
}>(), {
  showDetails: true,
});
</script>

<template>
  <div class="owner-pet-profile-header">
    <img v-if="pet.photoDataUrl" :src="pet.photoDataUrl" :alt="`Фотография питомца ${pet.name}`" />
    <span v-else class="owner-pet-placeholder" aria-hidden="true">{{ pet.species.slice(0, 1).toLocaleUpperCase('ru') }}</span>
    <div v-if="showDetails" class="owner-pet-profile-details">
      <h2>{{ pet.name }}</h2>
      <p>{{ pet.species }} · {{ pet.breed }}</p>
      <p>{{ petBirthSummary(pet) }}</p>
    </div>
    <div class="row-actions owner-profile-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
