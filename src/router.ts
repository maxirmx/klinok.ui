import type { Component } from "vue";
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import type { Role } from "@klinok/protocol";
import AuthScreen from "./screens/AuthScreen.vue";
import RoleStatusScreen from "./screens/RoleStatusScreen.vue";
import WorkspaceScreen from "./screens/WorkspaceScreen.vue";
import { appState, bootstrapApp } from "./appStore";
import { roleHomePath } from "./roleNavigation";
import { scenarioRegistry, type ScenarioComponentName } from "./scenarios";

const components: Record<ScenarioComponentName, Component> = { AuthScreen, RoleStatusScreen, WorkspaceScreen };
const roleByScenario: Partial<Record<string, Role>> = {
  "owner-home": "owner",
  "doctor-home": "doctor",
  "administrator-home": "administrator",
};

export const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/auth/login" },
  { path: "/roles", redirect: "/profile" },
  ...scenarioRegistry.map((scenario) => ({
    path: scenario.path,
    name: scenario.id,
    component: components[scenario.component],
    props: { scenarioId: scenario.id, role: roleByScenario[scenario.id] },
    meta: {
      public: scenario.role === "auth",
      role: roleByScenario[scenario.id],
      title: scenario.title,
    },
  })),
  { path: "/:pathMatch(.*)*", redirect: "/profile" },
];

export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: (to) => to.hash ? { el: to.hash } : { top: 0 },
  });
  router.beforeEach(async (to) => {
    await bootstrapApp();
    if (to.meta.public) {
      if (appState.session.authenticated && to.path === "/auth/login") {
        if (appState.keyRecoveryRequired || appState.devicePending) return "/profile";
        return roleHomePath(appState.activeRole);
      }
      return true;
    }
    if (!appState.session.authenticated) return { path: "/auth/login", query: { continue: to.fullPath } };
    if (appState.keyRecoveryRequired || appState.devicePending) return to.path === "/profile" ? true : "/profile";
    const role = to.meta.role as Role | undefined;
    if (!role) return true;
    const approved = appState.control.roles.find((request) => request.role === role && request.status === "approved");
    if (!approved) return "/profile";
    if (appState.activeRole !== role) return { path: "/profile", query: { switch: role, continue: to.fullPath } };
    return true;
  });
  return router;
}
