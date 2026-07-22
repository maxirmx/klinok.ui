// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthScreen from "../src/screens/AuthScreen.vue";
import * as appStoreModule from "../src/appStore";
import { installAlertNavigationGuard, routes } from "../src/router";
import { useAlertStore } from "../src/stores/alert";

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    activeRole: "doctor",
    busy: false,
    devicePending: false,
    keyRecoveryRequired: false,
  });
  return {
    AUTH_SUCCESS_MESSAGES: { registration: "Централизованное сообщение о регистрации" },
    appState: readonly(state),
    forgotPassword: vi.fn(),
    getConfig: vi.fn(() => ({ legal: { personalDataConsent: {}, userAgreement: {} } })),
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
  };
});

const { AUTH_SUCCESS_MESSAGES, login, register } = appStoreModule;
let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("login navigation", () => {
  it("opens the active role workspace instead of role selection", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes,
    });
    await router.push("/auth/login");
    await router.isReady();
    const wrapper = mount(AuthScreen, {
      props: { scenarioId: "auth-login" },
      global: { plugins: [pinia, router] },
    });

    await wrapper.get('input[type="email"]').setValue("doctor@example.ru");
    await wrapper.get('input[type="password"]').setValue("correct-password");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(login).toHaveBeenCalledWith("doctor@example.ru", "correct-password", expect.any(String));
    expect(router.currentRoute.value.path).toBe("/doctor/home");
  });

  it("renders and dismisses accessible authentication feedback", async () => {
    useAlertStore().error(new Error("Ошибка входа"));
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push("/auth/login");
    await router.isReady();
    const wrapper = mount(AuthScreen, {
      props: { scenarioId: "auth-login" },
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.get('[role="alert"]').text()).toContain("Ошибка входа");
    const close = wrapper.get('button[aria-label="Закрыть сообщение"]');
    await close.trigger("click");
    expect(useAlertStore().alert).toBeNull();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("clears authentication feedback when the auth route changes", async () => {
    const router = createRouter({ history: createMemoryHistory(), routes });
    installAlertNavigationGuard(router, pinia);
    await router.push("/auth/login");
    await router.isReady();
    useAlertStore().success("Готово");
    const wrapper = mount(AuthScreen, {
      props: { scenarioId: "auth-login" },
      global: { plugins: [pinia, router] },
    });

    expect(wrapper.get('[role="status"]').text()).toContain("Готово");
    await router.push("/auth/forgot-password");
    await flushPromises();
    expect(useAlertStore().alert).toBeNull();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it("replaces the completed consent form with the neutral email-verification screen", async () => {
    sessionStorage.setItem("klinok:registration", JSON.stringify({
      firstName: "Иван",
      lastName: "Иванов",
      patronymic: "",
      email: "user@example.com",
      password: "correct horse battery",
      requestedRoles: ["owner"],
    }));
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push("/auth/register/consent");
    await router.isReady();
    const wrapper = mount(RouterView, { global: { plugins: [pinia, router] } });
    await flushPromises();

    for (const checkbox of wrapper.findAll<HTMLInputElement>('input[type="checkbox"]')) await checkbox.setValue(true);
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(register).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.path).toBe("/auth/verify-email");
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    expect(wrapper.text()).toContain(AUTH_SUCCESS_MESSAGES.registration);
    expect(wrapper.get('a[href="/auth/login"]').text()).toBe("Перейти ко входу");
  });
});
