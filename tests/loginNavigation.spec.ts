import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it, vi } from "vitest";
import AuthScreen from "../src/screens/AuthScreen.vue";
import { login } from "../src/appStore";
import { routes } from "../src/router";

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  return {
    appState: readonly(reactive({
      activeRole: "doctor",
      busy: false,
      devicePending: false,
      error: "",
      keyRecoveryRequired: false,
      message: "",
    })),
    forgotPassword: vi.fn(),
    getConfig: vi.fn(() => ({ legal: { personalDataConsent: {}, userAgreement: {} } })),
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
  };
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
});
