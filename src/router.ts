// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { Component } from "vue";
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import AuthScreen from "./screens/AuthScreen.vue";
import OwnerHomeScreen from "./screens/OwnerHomeScreen.vue";
import PetsScreen from "./screens/PetsScreen.vue";
import MedicalHistoryScreen from "./screens/MedicalHistoryScreen.vue";
import VisitsScreen from "./screens/VisitsScreen.vue";
import BookingScreen from "./screens/BookingScreen.vue";
import DoctorsScreen from "./screens/DoctorsScreen.vue";
import AnalysisScreen from "./screens/AnalysisScreen.vue";
import MaterialsScreen from "./screens/MaterialsScreen.vue";
import ProfileScreen from "./screens/ProfileScreen.vue";
import RoleLandingScreen from "./screens/RoleLandingScreen.vue";
import { scenarioRegistry, type ScenarioComponentName } from "./scenarios";

const componentMap: Record<ScenarioComponentName, Component> = {
  AuthScreen,
  OwnerHomeScreen,
  PetsScreen,
  MedicalHistoryScreen,
  VisitsScreen,
  BookingScreen,
  DoctorsScreen,
  AnalysisScreen,
  MaterialsScreen,
  ProfileScreen,
  RoleLandingScreen,
};

const scenarioRoutes: RouteRecordRaw[] = scenarioRegistry
  .filter((scenario) => scenario.implemented)
  .map((scenario) => ({
    path: scenario.path,
    name: scenario.id,
    component: componentMap[scenario.component],
    props: { scenarioId: scenario.id },
    meta: {
      title: scenario.title,
      role: scenario.role,
      figmaNodeId: scenario.figmaNodeId,
      exportName: scenario.exportName,
    },
  }));

export const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/auth/role" },
  ...scenarioRoutes,
  { path: "/:pathMatch(.*)*", redirect: "/auth/role" },
];

export function createAppRouter() {
  return createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior() {
      return { top: 0 };
    },
  });
}
