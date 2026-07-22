<script setup lang="ts">
// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { AccountProfile, Role, RoleRequest, RoleStatus } from "@klinok/protocol";
import AppIcon from "../components/AppIcon.vue";
import AppPaginator from "../components/AppPaginator.vue";
import ModalDialog from "../components/ModalDialog.vue";
import WorkspaceShell from "../components/WorkspaceShell.vue";
import { appState, decideRole, getConfig, logout } from "../appStore";
import { useAlertStore } from "../stores/alert";

type AdvancedRole = Extract<Role, "doctor" | "administrator">;
type SortField = "name" | AdvancedRole;
type SortDirection = "asc" | "desc";
type DecisionAction = "approve" | "reject" | "revoke" | "restore";
type AuditCategory = "request" | "approve" | "restore" | "reject" | "revoke" | "bootstrap";

type AdministratorRow = {
  accountId: string;
  displayName: string;
  doctor?: RoleRequest;
  administrator?: RoleRequest;
};

type AuditRow = {
  eventId: string;
  createdAt: string;
  category: AuditCategory;
  action: string;
  role: AdvancedRole;
  targetAccountId: string;
  actorAccountId: string;
  reason: string;
};

const props = defineProps<{ role: "administrator"; scenarioId: string }>();
const router = useRouter();
const alertStore = useAlertStore();
const advancedRoles: AdvancedRole[] = ["doctor", "administrator"];
const pageSizes = [10, 20, 50] as const;
const cabinetPageSizeKey = "klinok:admin-role-table-page-size";
const auditPageSizeKey = "klinok:admin-audit-page-size";
const isAudit = computed(() => props.scenarioId === "administrator-audit");

const search = ref("");
const sortField = ref<SortField>("name");
const sortDirection = ref<SortDirection>("asc");
const page = ref(1);
const pageSize = ref(readPageSize(cabinetPageSizeKey));
const decision = ref<{ request: RoleRequest; action: DecisionAction } | null>(null);
const decisionReason = ref("");
const decisionBusy = ref(false);

const auditSearch = ref("");
const auditRole = ref<AdvancedRole | "">("");
const auditAction = ref<AuditCategory | "">("");
const auditPage = ref(1);
const auditPageSize = ref(readPageSize(auditPageSizeKey));

const roleLabels: Record<AdvancedRole, string> = {
  doctor: "Ветеринар",
  administrator: "Администратор",
};

const statusLabels: Record<RoleStatus, string> = {
  not_requested: "Отозвана",
  pending: "Запрошена",
  approved: "Одобрена",
  rejected: "Отказ",
  suspended: "Отозвана",
  revoked: "Отозвана",
  expired: "Отозвана",
};

const statusClasses: Record<RoleStatus, string> = {
  not_requested: "revoked",
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  suspended: "revoked",
  revoked: "revoked",
  expired: "revoked",
};

function readPageSize(key: string): (typeof pageSizes)[number] {
  const stored = Number(localStorage.getItem(key));
  return pageSizes.includes(stored as (typeof pageSizes)[number])
    ? stored as (typeof pageSizes)[number]
    : 20;
}

function formatProfileName(profile?: Pick<AccountProfile, "firstName" | "patronymic" | "lastName"> | null): string {
  return [profile?.firstName, profile?.patronymic, profile?.lastName].filter(Boolean).join(" ");
}

function profileName(accountId: string): string {
  return formatProfileName(appState.control.profiles.find((profile) => profile.accountId === accountId)) || "ФИО не указано";
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru");
}

const administratorRows = computed<AdministratorRow[]>(() => {
  const grouped = new Map<string, AdministratorRow>();
  for (const request of appState.control.allRoles) {
    if (request.role !== "doctor" && request.role !== "administrator") continue;
    const row = grouped.get(request.accountId) ?? {
      accountId: request.accountId,
      displayName: profileName(request.accountId),
    };
    row[request.role] = request;
    grouped.set(request.accountId, row);
  }
  return [...grouped.values()];
});

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "ru", { sensitivity: "base" });
}

const filteredRows = computed(() => {
  const query = normalize(search.value);
  return administratorRows.value
    .filter((row) => !query || [row.displayName, row.accountId].some((value) => normalize(value).includes(query)))
    .sort((left, right) => {
      if (sortField.value !== "name") {
        const leftStatus = left[sortField.value];
        const rightStatus = right[sortField.value];
        if (!leftStatus && !rightStatus) return compareText(left.displayName, right.displayName);
        if (!leftStatus) return 1;
        if (!rightStatus) return -1;
      }
      const result = sortField.value === "name"
        ? compareText(left.displayName, right.displayName)
        : compareText(statusLabels[left[sortField.value]!.status], statusLabels[right[sortField.value]!.status]);
      const directed = sortDirection.value === "asc" ? result : -result;
      return directed || compareText(left.displayName, right.displayName);
    });
});

const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)));
const pagedRows = computed(() => filteredRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));

function changeSort(field: SortField) {
  if (sortField.value === field) sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
  else {
    sortField.value = field;
    sortDirection.value = "asc";
  }
}

function sortAria(field: SortField): "ascending" | "descending" | "none" {
  if (sortField.value !== field) return "none";
  return sortDirection.value === "asc" ? "ascending" : "descending";
}

function isBootstrapAdministrator(request: RoleRequest): boolean {
  return request.role === "administrator" && request.accountId === getConfig()?.p2p.bootstrapAccountId;
}

function openDecision(request: RoleRequest, action: DecisionAction) {
  decisionReason.value = "";
  decision.value = { request, action };
}

const decisionTitle = computed(() => {
  if (!decision.value) return "";
  const role = roleLabels[decision.value.request.role as AdvancedRole];
  if (decision.value.action === "approve") return `Одобрить роль «${role}»?`;
  if (decision.value.action === "restore") return `Восстановить роль «${role}»?`;
  if (decision.value.action === "reject") return `Отклонить запрос роли «${role}»?`;
  return `Отозвать роль «${role}»?`;
});

const decisionDescription = computed(() => {
  if (!decision.value) return "";
  return `${profileName(decision.value.request.accountId)} · ${decision.value.request.accountId}`;
});

const decisionConfirmLabel = computed(() => {
  if (decision.value?.action === "approve") return "Одобрить";
  if (decision.value?.action === "restore") return "Восстановить";
  if (decision.value?.action === "reject") return "Отклонить";
  return "Отозвать";
});

const destructiveDecision = computed(() => decision.value?.action === "reject" || decision.value?.action === "revoke");

async function submitDecision() {
  if (!decision.value || decisionBusy.value) return;
  decisionBusy.value = true;
  alertStore.clear();
  const current = decision.value;
  try {
    const status = current.action === "reject"
      ? "rejected"
      : current.action === "revoke"
        ? "revoked"
        : "approved";
    await decideRole(
      current.request,
      status,
      destructiveDecision.value && decisionReason.value.trim() ? decisionReason.value.trim() : undefined,
    );
    alertStore.success(current.action === "approve"
      ? "Роль одобрена."
      : current.action === "restore"
        ? "Роль восстановлена."
        : current.action === "reject"
          ? "Запрос отклонён."
          : "Роль отозвана.");
    decision.value = null;
    decisionReason.value = "";
  } catch (reason) {
    alertStore.error(reason, "Операция не выполнена.");
  } finally {
    decisionBusy.value = false;
  }
}

function transitionAction(event: (typeof appState.control.events)[number]): Pick<AuditRow, "category" | "action"> | null {
  if (event.eventType === "role.requested") return { category: "request", action: "Роль запрошена" };
  if (event.eventType === "role.resubmitted") return { category: "request", action: "Роль запрошена повторно" };
  if (event.eventType === "role.approved") return { category: "approve", action: "Роль одобрена" };
  if (event.eventType === "role.restored") return { category: "restore", action: "Роль восстановлена" };
  if (event.eventType === "role.rejected") return { category: "reject", action: "В запросе отказано" };
  if (event.eventType === "role.cancelled") return { category: "revoke", action: "Запрос отозван пользователем" };
  if (event.eventType === "role.suspended") return { category: "revoke", action: "Роль приостановлена" };
  if (event.eventType === "role.revoked") return { category: "revoke", action: "Роль отозвана" };
  if (event.eventType === "role.expired") return { category: "revoke", action: "Срок роли истёк" };
  return null;
}

const auditRows = computed<AuditRow[]>(() => {
  const events = appState.control.events;
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const rows: AuditRow[] = [];
  for (const audit of events.filter((event) => event.eventType === "audit.role-transition")) {
    const transition = audit.parents.map((parent) => byId.get(parent)).find((event) => event?.eventType.startsWith("role."));
    if (!transition) continue;
    const role = String(transition.metadata.role);
    if (role !== "doctor" && role !== "administrator") continue;
    const action = transitionAction(transition);
    if (!action) continue;
    rows.push({
      eventId: audit.eventId,
      createdAt: transition.createdAt,
      ...action,
      role,
      targetAccountId: transition.aggregateId,
      actorAccountId: transition.actorAccountId,
      reason: String(transition.metadata.reason ?? ""),
    });
  }
  for (const event of events.filter((candidate) => candidate.eventType === "account.bootstrap")) {
    rows.push({
      eventId: `bootstrap-${event.eventId}`,
      createdAt: event.createdAt,
      category: "bootstrap",
      action: "Роль назначена при инициализации",
      role: "administrator",
      targetAccountId: event.aggregateId,
      actorAccountId: event.actorAccountId,
      reason: "",
    });
  }
  return rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.eventId.localeCompare(left.eventId));
});

const filteredAuditRows = computed(() => {
  const query = normalize(auditSearch.value);
  return auditRows.value.filter((row) => {
    if (auditRole.value && row.role !== auditRole.value) return false;
    if (auditAction.value && row.category !== auditAction.value) return false;
    if (!query) return true;
    return [
      profileName(row.targetAccountId),
      row.targetAccountId,
      profileName(row.actorAccountId),
      row.actorAccountId,
    ].some((value) => normalize(value).includes(query));
  });
});

const auditPageCount = computed(() => Math.max(1, Math.ceil(filteredAuditRows.value.length / auditPageSize.value)));
const pagedAuditRows = computed(() =>
  filteredAuditRows.value.slice((auditPage.value - 1) * auditPageSize.value, auditPage.value * auditPageSize.value),
);

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function signOut() {
  await logout();
  await router.replace("/auth/login");
}

watch([search, sortField, sortDirection, pageSize], () => { page.value = 1; });
watch([auditSearch, auditRole, auditAction, auditPageSize], () => { auditPage.value = 1; });
watch(pageSize, (value) => localStorage.setItem(cabinetPageSizeKey, String(value)));
watch(auditPageSize, (value) => localStorage.setItem(auditPageSizeKey, String(value)));
watch(pageCount, (count) => { if (page.value > count) page.value = count; });
watch(auditPageCount, (count) => { if (auditPage.value > count) auditPage.value = count; });
</script>

<template>
  <WorkspaceShell
    :role="role"
    title="Кабинет администратора"
    :profile-name="formatProfileName(appState.control.profile)"
    @sign-out="signOut"
  >
    <section v-if="!isAudit" class="administrator-page">
      <article class="panel administrator-panel">
        <div class="administrator-heading">
          <div>
            <h2>Ветеринары и администраторы</h2>
            <p>Управляйте правами ветеринаров и администраторов.</p>
          </div>
          <RouterLink
            class="outline-action inline administrator-audit-link administrator-icon-action"
            to="/admin/audit"
            title="Открыть журнал действий"
            aria-label="Открыть журнал действий"
          >
            <AppIcon name="book" />
          </RouterLink>
        </div>

        <label class="administrator-search">
          <span>ФИО или идентификатор</span>
          <span class="administrator-search-control">
            <AppIcon name="search" />
            <input v-model="search" type="search" placeholder="Поиск" />
          </span>
        </label>

        <p v-if="!administratorRows.length" class="administrator-empty">Запросов расширенных ролей пока нет.</p>
        <p v-else-if="!filteredRows.length" class="administrator-empty">
          Пользователи с таким ФИО или идентификатором не найдены.
        </p>
        <template v-else>
          <div class="administrator-table-wrap">
            <table class="administrator-table">
              <thead>
                <tr>
                  <th><span class="visually-hidden">Действия</span></th>
                  <th :aria-sort="sortAria('name')">
                    <button type="button" @click="changeSort('name')">
                      ФИО
                      <AppIcon name="chevron-down" :class="{ descending: sortField === 'name' && sortDirection === 'desc' }" />
                    </button>
                  </th>
                  <th :aria-sort="sortAria('doctor')">
                    <button type="button" @click="changeSort('doctor')">
                      Ветеринар
                      <AppIcon name="chevron-down" :class="{ descending: sortField === 'doctor' && sortDirection === 'desc' }" />
                    </button>
                  </th>
                  <th :aria-sort="sortAria('administrator')">
                    <button type="button" @click="changeSort('administrator')">
                      Администратор
                      <AppIcon name="chevron-down" :class="{ descending: sortField === 'administrator' && sortDirection === 'desc' }" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pagedRows" :key="row.accountId">
                  <td class="administrator-actions" data-label="Действия">
                    <div v-for="advancedRole in advancedRoles" :key="advancedRole" class="administrator-role-actions">
                      <template v-if="row[advancedRole] && !isBootstrapAdministrator(row[advancedRole]!)">
                        <template v-if="row[advancedRole]?.status === 'pending'">
                          <button
                            class="primary-action inline access-icon-action"
                            type="button"
                            :title="`Одобрить роль «${roleLabels[advancedRole]}»`"
                            :aria-label="`Одобрить роль «${roleLabels[advancedRole]}»`"
                            @click="openDecision(row[advancedRole]!, 'approve')"
                          >
                            <AppIcon name="check" />
                          </button>
                          <button
                            class="outline-action inline danger-outline access-icon-action"
                            type="button"
                            :title="`Отклонить запрос роли «${roleLabels[advancedRole]}»`"
                            :aria-label="`Отклонить запрос роли «${roleLabels[advancedRole]}»`"
                            @click="openDecision(row[advancedRole]!, 'reject')"
                          >
                            <AppIcon name="close" />
                          </button>
                        </template>
                        <button
                          v-else-if="row[advancedRole]?.status === 'approved'"
                          class="outline-action inline danger-outline access-icon-action"
                          type="button"
                          :title="`Отозвать роль «${roleLabels[advancedRole]}»`"
                          :aria-label="`Отозвать роль «${roleLabels[advancedRole]}»`"
                          @click="openDecision(row[advancedRole]!, 'revoke')"
                        >
                          <AppIcon name="close" />
                        </button>
                        <button
                          v-else
                          class="primary-action inline access-icon-action"
                          type="button"
                          :title="`Восстановить роль «${roleLabels[advancedRole]}»`"
                          :aria-label="`Восстановить роль «${roleLabels[advancedRole]}»`"
                          @click="openDecision(row[advancedRole]!, 'restore')"
                        >
                          <AppIcon name="restore" />
                        </button>
                      </template>
                    </div>
                  </td>
                  <td class="administrator-name" data-label="ФИО">
                    <strong>{{ row.displayName }}</strong>
                    <small>{{ row.accountId }}</small>
                  </td>
                  <td v-for="advancedRole in advancedRoles" :key="advancedRole" :data-label="roleLabels[advancedRole]">
                    <span
                      v-if="row[advancedRole]"
                      class="status-badge"
                      :class="statusClasses[row[advancedRole]!.status]"
                    >
                      {{ statusLabels[row[advancedRole]!.status] }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <AppPaginator
            v-model:page="page"
            v-model:page-size="pageSize"
            :total-items="filteredRows.length"
            :page-sizes="pageSizes"
          />
        </template>
      </article>
    </section>

    <section v-else class="administrator-page">
      <article class="panel administrator-panel">
        <div class="administrator-heading">
          <div>
            <h2>Журнал действий с ролями</h2>
            <p>История запросов и решений.</p>
          </div>
          <RouterLink
            class="outline-action inline administrator-audit-link administrator-icon-action"
            to="/admin/home"
            title="К управлению ролями"
            aria-label="К управлению ролями"
          >
            <AppIcon name="chevron-left" />
          </RouterLink>
        </div>

        <div class="administrator-audit-filters">
          <label class="administrator-search">
            <span>ФИО или идентификатор</span>
            <span class="administrator-search-control">
              <AppIcon name="search" />
              <input v-model="auditSearch" type="search" placeholder="Поиск" />
            </span>
          </label>
          <label>
            <span>Роль</span>
            <select v-model="auditRole">
              <option value="">Все роли</option>
              <option value="doctor">Ветеринар</option>
              <option value="administrator">Администратор</option>
            </select>
          </label>
          <label>
            <span>Действие</span>
            <select v-model="auditAction">
              <option value="">Все действия</option>
              <option value="request">Запрос</option>
              <option value="approve">Одобрение</option>
              <option value="restore">Восстановление</option>
              <option value="reject">Отказ</option>
              <option value="revoke">Отзыв или приостановка</option>
              <option value="bootstrap">Инициализация</option>
            </select>
          </label>
        </div>

        <p v-if="!auditRows.length" class="administrator-empty">Действий с расширенными ролями пока нет.</p>
        <p v-else-if="!filteredAuditRows.length" class="administrator-empty">Действия по выбранным условиям не найдены.</p>
        <template v-else>
          <div class="administrator-table-wrap">
            <table class="administrator-table administrator-audit-table">
              <thead>
                <tr>
                  <th>Дата и время</th>
                  <th>Пользователь</th>
                  <th>Действие</th>
                  <th>Роль</th>
                  <th>Администратор</th>
                  <th>Причина</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in pagedAuditRows" :key="row.eventId">
                  <td data-label="Дата и время"><time :datetime="row.createdAt">{{ formatDate(row.createdAt) }}</time></td>
                  <td class="administrator-name" data-label="Пользователь">
                    <strong>{{ profileName(row.targetAccountId) }}</strong>
                    <small>{{ row.targetAccountId }}</small>
                  </td>
                  <td data-label="Действие">{{ row.action }}</td>
                  <td data-label="Роль">{{ roleLabels[row.role] }}</td>
                  <td class="administrator-name" data-label="Администратор">
                    <strong>{{ profileName(row.actorAccountId) }}</strong>
                    <small>{{ row.actorAccountId }}</small>
                  </td>
                  <td :class="{ 'is-empty': !row.reason }" data-label="Причина">{{ row.reason }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <AppPaginator
            v-model:page="auditPage"
            v-model:page-size="auditPageSize"
            :total-items="filteredAuditRows.length"
            :page-sizes="pageSizes"
            aria-label="Навигация по журналу"
          />
        </template>
      </article>
    </section>

    <ModalDialog
      :model-value="Boolean(decision)"
      :title="decisionTitle"
      :description="decisionDescription"
      :busy="decisionBusy"
      :role="destructiveDecision ? 'alertdialog' : 'dialog'"
      @update:model-value="decision = null"
    >
      <form class="form-stack administrator-decision-form" @submit.prevent="submitDecision">
        <label v-if="destructiveDecision">
          <span>Причина, необязательно</span>
          <textarea v-model="decisionReason" rows="3" />
        </label>
        <div class="confirmation-dialog-actions">
          <button class="outline-action inline" type="button" :disabled="decisionBusy" @click="decision = null">
            Отмена
          </button>
          <button
            class="primary-action inline"
            :class="{ danger: destructiveDecision }"
            type="submit"
            :disabled="decisionBusy"
          >
            {{ decisionBusy ? 'Сохранение…' : decisionConfirmLabel }}
          </button>
        </div>
      </form>
    </ModalDialog>
  </WorkspaceShell>
</template>
