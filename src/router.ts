// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import type { Component } from "vue";
import type { Pinia } from "pinia";
import { createRouter, createWebHistory, type RouteRecordRaw, type Router } from "vue-router";
import type { Role } from "@klinok/protocol";
import AuthScreen from "./screens/AuthScreen.vue";
import RoleStatusScreen from "./screens/RoleStatusScreen.vue";
import OwnerScreen from "./screens/OwnerScreen.vue";
import DoctorScreen from "./screens/DoctorScreen.vue";
import AdministratorScreen from "./screens/AdministratorScreen.vue";
import { appState, bootstrapApp } from "./appStore";
import { roleHomePath } from "./roleNavigation";
import { scenarioRegistry, type ScenarioComponentName } from "./scenarios";
import { useAlertStore } from "./stores/alert";

const components: Record<ScenarioComponentName, Component> = {
  AuthScreen,
  RoleStatusScreen,
  OwnerScreen,
  DoctorScreen,
  AdministratorScreen,
};
const roleByScenario: Partial<Record<string, Role>> = {
  "owner-home": "owner",
  "owner-pet-create": "owner",
  "owner-pet-detail": "owner",
  "owner-pet-edit": "owner",
  "owner-pet-access": "owner",
  "doctor-home": "doctor",
  "doctor-pet-request-access": "doctor",
  "doctor-pet-detail": "doctor",
  "doctor-pet-delegate": "doctor",
  "administrator-home": "administrator",
  "administrator-audit": "administrator",
};

export const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/auth/login" },
  { path: "/roles", redirect: "/profile" },
  { path: "/owner/pets", redirect: "/owner/home" },
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

export function installAlertNavigationGuard(router: Router, pinia: Pinia): void {
  router.beforeEach((to, from) => {
    if (to.path !== from.path) useAlertStore(pinia).clear();
  });
}

export function createAppRouter(pinia: Pinia) {
  const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: (to) => to.hash ? { el: to.hash } : { top: 0 },
  });
  installAlertNavigationGuard(router, pinia);
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
