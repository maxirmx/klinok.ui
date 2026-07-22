<script setup lang="ts">
import { petBirthSummary } from "../petProfile";
import type { PetProfile } from "../repositories/types";

defineProps<{
  pet: PetProfile;
  ownerDisplayName?: string;
}>();

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}
</script>

<template>
  <dl class="owner-profile-fields">
    <div><dt>Вид</dt><dd>{{ pet.species }}</dd></div>
    <div><dt>Кличка</dt><dd>{{ pet.name }}</dd></div>
    <div><dt>Порода</dt><dd>{{ pet.breed }}</dd></div>
    <div><dt>Пол</dt><dd>{{ pet.sex || 'Не указан' }}</dd></div>
    <div><dt>Возраст</dt><dd>{{ petBirthSummary(pet) }}</dd></div>
    <div><dt>Окрас</dt><dd>{{ pet.color || 'Не указан' }}</dd></div>
    <div><dt>Номер чипа</dt><dd>{{ pet.chip || 'Нет' }}</dd></div>
    <div><dt>Клеймо</dt><dd>{{ pet.brandMark || 'Нет' }}</dd></div>
    <div><dt>Последняя вакцинация</dt><dd>{{ pet.latestVaccination ? `${formatDate(pet.latestVaccination.date)} · ${pet.latestVaccination.name}` : 'Не указана' }}</dd></div>
    <div><dt>Вес</dt><dd>{{ pet.weightKg ? `${pet.weightKg} кг` : 'Не указан' }}</dd></div>
    <div v-if="ownerDisplayName"><dt>ФИО владельца</dt><dd>{{ ownerDisplayName }}</dd></div>
  </dl>
  <div v-if="pet.notes" class="owner-pet-notes">
    <h3>Заметки</h3>
    <p>{{ pet.notes }}</p>
  </div>
</template>
