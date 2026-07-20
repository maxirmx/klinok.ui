<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { Role } from "@klinok/protocol";
import packageJson from "../../package.json";
import AppIcon from "./AppIcon.vue";
import BrandLogo from "./BrandLogo.vue";
import { appState } from "../appStore";
import { roleHomePath } from "../roleNavigation";

type WorkspaceIcon = "home" | "pets" | "plus" | "user" | "book" | "bell" | "eye" | "medical-tools";
type WorkspaceNavItem = { id: string; label: string; icon: WorkspaceIcon };
type WorkspacePathNavItem = WorkspaceNavItem & { path: string; exact: boolean };

const props = defineProps<{
  role: Role | null;
  title: string;
  profileName: string;
  settings?: boolean;
}>();

const emit = defineEmits<{ signOut: [] }>();
const route = useRoute();
const router = useRouter();
const activeSection = ref(route.hash.slice(1) || "workspace-top");

const navigationByRole: Record<Role, WorkspaceNavItem[]> = {
  administrator: [
    { id: "workspace-top", label: "Главная страница", icon: "home" },
    { id: "administrator-requests", label: "Заявки", icon: "bell" },
    { id: "administrator-accounts", label: "Аккаунты", icon: "user" },
    { id: "administrator-conflicts", label: "Конфликты", icon: "eye" },
    { id: "administrator-journal", label: "Журнал", icon: "book" },
  ],
  owner: [
    { id: "workspace-top", label: "Главная страница", icon: "home" },
    { id: "owner-add-pet", label: "Добавить", icon: "plus" },
    { id: "owner-pets", label: "Питомцы", icon: "pets" },
    { id: "owner-grant-access", label: "Дать доступ", icon: "user" },
    { id: "owner-active-access", label: "Доступы", icon: "eye" },
    { id: "owner-records", label: "Медкарта", icon: "book" },
  ],
  doctor: [
    { id: "workspace-top", label: "Главная страница", icon: "home" },
    { id: "doctor-request-access", label: "Запросить доступ", icon: "plus" },
    { id: "doctor-pets", label: "Питомцы", icon: "pets" },
    { id: "doctor-new-record", label: "Новая запись", icon: "plus" },
    { id: "doctor-delegation", label: "Делегирование", icon: "user" },
    { id: "doctor-records", label: "Медкарта", icon: "medical-tools" },
  ],
};
const ownerRootNavigation: WorkspacePathNavItem = {
  id: "owner-home",
  label: "Главная страница",
  icon: "home",
  path: "/owner/home",
  exact: true,
};
const ownerChildNavigation = computed<WorkspacePathNavItem[]>(() => [
  { id: "owner-add-pet", label: "Добавить питомца", icon: "plus", path: "/owner/pets/new", exact: true },
  ...appState.medical.pets.map((pet) => ({
    id: `owner-pet-${pet.petId}`,
    label: pet.name,
    icon: "pets" as const,
    path: `/owner/pets/${pet.petId}`,
    exact: false,
  })),
]);
const effectiveRole = computed<Role | null>(() => props.role
  ?? (props.settings
    ? appState.activeRole ?? appState.control.roles.find((request) => request.status === "approved")?.role ?? null
    : null));
const navigation = computed(() => effectiveRole.value ? navigationByRole[effectiveRole.value] : []);

watch(
  [effectiveRole, () => route.hash],
  ([, hash]) => { activeSection.value = hash.slice(1) || "workspace-top"; },
);

function selectSection(id: string) {
  activeSection.value = id;
  void router.push({
    ...(props.settings && effectiveRole.value ? { path: roleHomePath(effectiveRole.value) } : {}),
    hash: `#${id}`,
  });
}

function ownerPathActive(path: string, exact = false) {
  if (props.settings) return false;
  return exact ? route.path === path : route.path === path || route.path.startsWith(`${path}/`);
}

function selectOwnerPath(path: string) {
  void router.push(path);
}
</script>

<template>
  <section class="workspace-shell">
    <aside class="workspace-sidebar" aria-label="Основная навигация">
      <a class="workspace-brand" :href="settings && effectiveRole ? roleHomePath(effectiveRole) : '#workspace-top'" @click.prevent="selectSection('workspace-top')">
        <BrandLogo variant="full" size="compact" />
        <span>Здоровье питомца под контролем</span>
      </a>

      <nav v-if="effectiveRole === 'owner'" class="workspace-sidebar-nav owner-navigation">
        <ul class="workspace-nav-tree">
          <li>
            <a
              class="workspace-nav-item"
              :class="{ active: ownerPathActive(ownerRootNavigation.path, ownerRootNavigation.exact) }"
              :href="ownerRootNavigation.path"
              @click.prevent="selectOwnerPath(ownerRootNavigation.path)"
            >
              <AppIcon :name="ownerRootNavigation.icon" />
              <span>{{ ownerRootNavigation.label }}</span>
            </a>
            <ul>
              <li v-for="item in ownerChildNavigation" :key="item.id">
                <a
                  class="workspace-nav-item owner-child"
                  :class="{ active: ownerPathActive(item.path, item.exact) }"
                  :href="item.path"
                  @click.prevent="selectOwnerPath(item.path)"
                >
                  <AppIcon :name="item.icon" />
                  <span>{{ item.label }}</span>
                </a>
              </li>
            </ul>
          </li>
        </ul>
      </nav>

      <nav v-else class="workspace-sidebar-nav">
        <a
          v-for="item in navigation"
          :key="item.id"
          class="workspace-nav-item"
          :class="{ active: !settings && activeSection === item.id }"
          :href="settings && effectiveRole ? `${roleHomePath(effectiveRole)}#${item.id}` : `#${item.id}`"
          @click.prevent="selectSection(item.id)"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </a>
      </nav>

      <div class="workspace-sidebar-footer">
        <button class="workspace-nav-item" :class="{ active: settings }" type="button" @click="router.push('/profile')">
          <AppIcon name="user" />
          <span>Настройки пользователя</span>
        </button>
        <button class="workspace-nav-item danger-link" type="button" @click="emit('signOut')">
          <AppIcon name="close" />
          <span>Выйти</span>
        </button>
        <span class="workspace-version">Версия {{ packageJson.version }}</span>
      </div>
    </aside>

    <main class="workspace-main">
      <header id="workspace-top" class="workspace-topbar" data-workspace-section>
        <div>
          <h1>{{ title }}</h1>
          <p>{{ profileName }}</p>
        </div>
      </header>

      <div class="workspace-content">
        <slot />
      </div>

      <nav class="workspace-bottom-nav" aria-label="Нижняя навигация">
        <template v-if="effectiveRole === 'owner'">
          <a
            :class="{ active: ownerPathActive(ownerRootNavigation.path, ownerRootNavigation.exact) }"
            :href="ownerRootNavigation.path"
            @click.prevent="selectOwnerPath(ownerRootNavigation.path)"
          >
            <AppIcon :name="ownerRootNavigation.icon" />
            <span>{{ ownerRootNavigation.label }}</span>
          </a>
        </template>
        <template v-else>
          <a
            v-for="item in navigation"
            :key="item.id"
            :class="{ active: !settings && activeSection === item.id }"
            :href="settings && effectiveRole ? `${roleHomePath(effectiveRole)}#${item.id}` : `#${item.id}`"
            @click.prevent="selectSection(item.id)"
          >
            <AppIcon :name="item.icon" />
            <span>{{ item.label }}</span>
          </a>
        </template>
        <button :class="{ active: settings }" type="button" @click="router.push('/profile')">
          <AppIcon name="user" />
          <span>Настройки пользователя</span>
        </button>
        <button class="danger-link" type="button" @click="emit('signOut')">
          <AppIcon name="close" />
          <span>Выйти</span>
        </button>
      </nav>
    </main>
  </section>
</template>
