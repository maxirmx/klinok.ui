<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import type { Role } from "@klinok/protocol";
import packageJson from "../../package.json";
import AppIcon from "./AppIcon.vue";
import BrandLogo from "./BrandLogo.vue";

type WorkspaceIcon = "home" | "pets" | "plus" | "user" | "book" | "bell" | "eye" | "medical-tools";
type WorkspaceNavItem = { id: string; label: string; icon: WorkspaceIcon };

const props = defineProps<{
  role: Role;
  title: string;
  profileName: string;
}>();

const emit = defineEmits<{ signOut: [] }>();
const router = useRouter();
const activeSection = ref("workspace-top");

const navigationByRole: Record<Role, WorkspaceNavItem[]> = {
  administrator: [
    { id: "workspace-top", label: "Главная", icon: "home" },
    { id: "administrator-requests", label: "Заявки", icon: "bell" },
    { id: "administrator-accounts", label: "Аккаунты", icon: "user" },
    { id: "administrator-conflicts", label: "Конфликты", icon: "eye" },
    { id: "administrator-journal", label: "Журнал", icon: "book" },
  ],
  owner: [
    { id: "workspace-top", label: "Главная", icon: "home" },
    { id: "owner-add-pet", label: "Добавить", icon: "plus" },
    { id: "owner-pets", label: "Питомцы", icon: "pets" },
    { id: "owner-grant-access", label: "Дать доступ", icon: "user" },
    { id: "owner-active-access", label: "Доступы", icon: "eye" },
    { id: "owner-records", label: "Медкарта", icon: "book" },
  ],
  doctor: [
    { id: "workspace-top", label: "Главная", icon: "home" },
    { id: "doctor-pets", label: "Питомцы", icon: "pets" },
    { id: "doctor-new-record", label: "Новая запись", icon: "plus" },
    { id: "doctor-delegation", label: "Делегирование", icon: "user" },
    { id: "doctor-records", label: "Медкарта", icon: "medical-tools" },
  ],
};

const navigation = computed(() => navigationByRole[props.role]);

watch(() => props.role, () => { activeSection.value = "workspace-top"; });

function selectSection(id: string) {
  activeSection.value = id;
}
</script>

<template>
  <section class="workspace-shell">
    <aside class="workspace-sidebar" aria-label="Основная навигация">
      <a class="workspace-brand" href="#workspace-top" @click="selectSection('workspace-top')">
        <BrandLogo variant="full" size="compact" />
        <span>Здоровье питомца под контролем</span>
      </a>

      <nav class="workspace-sidebar-nav">
        <a
          v-for="item in navigation"
          :key="item.id"
          class="workspace-nav-item"
          :class="{ active: activeSection === item.id }"
          :href="`#${item.id}`"
          @click="selectSection(item.id)"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </a>
      </nav>

      <div class="workspace-sidebar-footer">
        <button class="workspace-nav-item" type="button" @click="router.push('/roles')">
          <AppIcon name="more" />
          <span>Сменить роль</span>
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
        <nav class="workspace-account-actions" aria-label="Действия аккаунта">
          <button class="link-action" type="button" @click="router.push('/roles')">Сменить роль</button>
          <button class="link-action" type="button" @click="emit('signOut')">Выйти</button>
        </nav>
      </header>

      <div class="workspace-content">
        <slot />
      </div>

      <nav class="workspace-bottom-nav" aria-label="Нижняя навигация">
        <a
          v-for="item in navigation"
          :key="item.id"
          :class="{ active: activeSection === item.id }"
          :href="`#${item.id}`"
          @click="selectSection(item.id)"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </a>
      </nav>
    </main>
  </section>
</template>
