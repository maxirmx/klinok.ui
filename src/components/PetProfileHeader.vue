<script setup lang="ts">
import { petBirthSummary } from "../petProfile";
import type { PetProfile } from "../repositories/types";

withDefaults(defineProps<{
  pet: PetProfile;
  showDetails?: boolean;
  ownerDisplayName?: string;
  ownerAccountId?: string;
}>(), {
  showDetails: true,
  ownerDisplayName: "",
  ownerAccountId: "",
});
</script>

<template>
  <div class="owner-pet-profile-header">
    <img v-if="pet.photoDataUrl" :src="pet.photoDataUrl" :alt="`Фотография питомца ${pet.name}`" />
    <span v-else class="owner-pet-placeholder" aria-hidden="true">{{ pet.species.slice(0, 1).toLocaleUpperCase('ru') }}</span>
    <div v-if="showDetails" class="owner-pet-profile-details">
      <h2>{{ pet.name }}</h2>
      <small class="owner-pet-id">{{ pet.petId }}</small>
      <p>{{ pet.species }} · {{ pet.breed }}</p>
      <p>{{ petBirthSummary(pet) }}</p>
      <p v-if="ownerDisplayName" class="owner-pet-owner"><strong>{{ ownerDisplayName }}</strong></p>
      <small v-if="ownerAccountId" class="owner-pet-owner-id">{{ ownerAccountId }}</small>
    </div>
    <div class="row-actions owner-profile-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
