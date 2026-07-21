import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthScreen from "../src/screens/AuthScreen.vue";
import * as appStoreModule from "../src/appStore";
import { routes } from "../src/router";

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    activeRole: "doctor",
    busy: false,
    devicePending: false,
    feedback: null as { kind: "success" | "error"; text: string } | null,
    keyRecoveryRequired: false,
  });
  return {
    appState: readonly(state),
    dismissAuthFeedback: vi.fn(() => { state.feedback = null; }),
    forgotPassword: vi.fn(),
    getConfig: vi.fn(() => ({ legal: { personalDataConsent: {}, userAgreement: {} } })),
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn(),
    resetPassword: vi.fn(),
    setMockFeedback: (feedback: typeof state.feedback) => { state.feedback = feedback; },
    verifyEmail: vi.fn(),
  };
});

const { dismissAuthFeedback, login } = appStoreModule;
const { setMockFeedback } = appStoreModule as unknown as {
  setMockFeedback: (feedback: { kind: "success" | "error"; text: string } | null) => void;
};

beforeEach(() => {
  vi.clearAllMocks();
  setMockFeedback(null);
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
      global: { plugins: [router] },
    });

    await wrapper.get('input[type="email"]').setValue("doctor@example.ru");
    await wrapper.get('input[type="password"]').setValue("correct-password");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(login).toHaveBeenCalledWith("doctor@example.ru", "correct-password", expect.any(String));
    expect(router.currentRoute.value.path).toBe("/doctor/home");
  });

  it("renders and dismisses accessible authentication feedback", async () => {
    setMockFeedback({ kind: "error", text: "Ошибка входа" });
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push("/auth/login");
    await router.isReady();
    const wrapper = mount(AuthScreen, {
      props: { scenarioId: "auth-login" },
      global: { plugins: [router] },
    });

    expect(dismissAuthFeedback).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toContain("Ошибка входа");
    const close = wrapper.get('button[aria-label="Закрыть сообщение"]');
    await close.trigger("click");
    expect(dismissAuthFeedback).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("clears authentication feedback when the auth route changes", async () => {
    setMockFeedback({ kind: "success", text: "Готово" });
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push("/auth/login");
    await router.isReady();
    const wrapper = mount(AuthScreen, {
      props: { scenarioId: "auth-login" },
      global: { plugins: [router] },
    });

    expect(wrapper.get('[role="status"]').text()).toContain("Готово");
    await router.push("/auth/forgot-password");
    await flushPromises();
    expect(dismissAuthFeedback).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });
});
