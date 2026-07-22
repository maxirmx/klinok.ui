<script setup lang="ts">
import { computed } from "vue";
import AppIcon from "./AppIcon.vue";
import AppPaginator from "./AppPaginator.vue";
import PetProfileHeader from "./PetProfileHeader.vue";
import type { PetAccessRow } from "../petAccess";
import type { PetProfile } from "../repositories/types";

const props = withDefaults(defineProps<{
  pet: PetProfile;
  rows: PetAccessRow[];
  page: number;
  pageSize: number;
  pageSizes?: readonly number[];
  ownerDisplayName?: string;
  ownerAccountId?: string;
  canAdd?: boolean;
  addLabel?: string;
  emptyMessage?: string;
}>(), {
  pageSizes: () => [10, 20, 50],
  ownerDisplayName: "",
  ownerAccountId: "",
  canAdd: true,
  addLabel: "Предоставить доступ",
  emptyMessage: "Доступы отсутствуют.",
});

const emit = defineEmits<{
  "update:page": [page: number];
  "update:pageSize": [pageSize: number];
  add: [];
}>();

defineSlots<{
  headerActions(): unknown;
  rowActions(props: { row: PetAccessRow }): unknown;
  default(): unknown;
}>();

function statusLabel(status: PetAccessRow["status"]): string {
  if (status === "granted") return "Предоставлен";
  if (status === "requested") return "Запрошен";
  return "Отозван";
}

const pagedRows = computed(() => props.rows.slice(
  (props.page - 1) * props.pageSize,
  props.page * props.pageSize,
));
</script>

<template>
  <section class="owner-pet-detail owner-pet-access-page pet-access-manager">
    <article class="panel owner-pet-profile">
      <PetProfileHeader
        :pet="pet"
        :owner-display-name="ownerDisplayName"
        :owner-account-id="ownerAccountId"
      >
        <template #actions><slot name="headerActions" /></template>
      </PetProfileHeader>
    </article>

    <article class="panel owner-access-panel">
      <div class="owner-access-table-wrap">
        <table class="owner-access-table">
          <thead>
            <tr>
              <th class="owner-access-actions-header">
                <button
                  v-if="canAdd"
                  class="primary-action inline access-icon-action"
                  type="button"
                  :title="addLabel"
                  :aria-label="addLabel"
                  @click="emit('add')"
                >
                  <AppIcon name="plus" />
                </button>
                <span class="visually-hidden">Действия</span>
              </th>
              <th>ФИО врача</th>
              <th>Доступ</th>
              <th>Делегирование</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in pagedRows" :key="row.accountId">
              <td class="owner-access-actions" data-label="Действия">
                <div class="owner-access-action-list"><slot name="rowActions" :row="row" /></div>
              </td>
              <td class="owner-access-doctor" data-label="ФИО врача">
                <strong>{{ row.displayName }}</strong>
                <small>{{ row.accountId }}</small>
              </td>
              <td data-label="Доступ">
                <span class="status-badge" :class="row.status">{{ statusLabel(row.status) }}</span>
              </td>
              <td :class="{ 'is-empty': row.status !== 'granted' }" data-label="Делегирование">
                {{ row.status === 'granted' ? row.delegationAllowed ? 'Да' : 'Нет' : '' }}
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="4" class="owner-access-empty">{{ emptyMessage }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AppPaginator
        v-if="rows.length"
        :page="page"
        :page-size="pageSize"
        :total-items="rows.length"
        :page-sizes="pageSizes"
        page-size-label="Врачей на странице"
        aria-label="Навигация по доступам врачей"
        @update:page="emit('update:page', $event)"
        @update:page-size="emit('update:pageSize', $event)"
      />
    </article>

    <slot />
  </section>
</template>
