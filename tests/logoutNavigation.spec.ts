import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoleStatusScreen from "../src/screens/RoleStatusScreen.vue";
import WorkspaceScreen from "../src/screens/WorkspaceScreen.vue";
import { logout } from "../src/appStore";

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  return {
    appState: readonly(reactive({
      error: "",
      session: {
        authenticated: true,
        accountId: "account-1",
        device: { deviceId: "current-device", deviceName: "Домашний ноутбук" },
        devices: [{ deviceId: "current-device", deviceName: "Домашний ноутбук", status: "active" }],
        enrollments: [{
          enrollmentId: "pending-enrollment",
          deviceId: "pending-device",
          deviceName: "Телефон Максима",
          status: "pending",
          ephemeralPublicKey: { kty: "EC" },
          createdAt: "2026-07-15T00:00:00.000Z",
        }],
      },
      control: { profile: null, profiles: [], roles: [], pendingQueue: [], notifications: [], events: [] },
      medical: { pets: [], grants: [], records: [], confirmations: [], events: [] },
      conflicts: [],
      keyRecoveryRequired: false,
      devicePending: false,
    })),
    approveDeviceEnrollment: vi.fn(),
    bootstrapApp: vi.fn(),
    cancelRole: vi.fn(),
    decideRole: vi.fn(),
    deleteAccount: vi.fn(),
    getConfig: vi.fn(() => ({ p2p: { bootstrapAccountId: "bootstrap-administrator" } })),
    getRepository: vi.fn(),
    importBootstrapRecovery: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    rejectDeviceEnrollment: vi.fn(),
    requestRole: vi.fn(),
    revokeDevice: vi.fn(),
    switchRole: vi.fn(),
    updateProfile: vi.fn(),
  };
});

async function mountAt(component: object, path: string, props: Record<string, unknown>) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path, component, props },
      { path: "/auth/login", component: { template: "<div>login</div>" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(component, { props, global: { plugins: [router] } });
  return { router, wrapper };
}

beforeEach(() => vi.mocked(logout).mockClear());

describe("logout navigation", () => {
  it("leaves the workspace after logout", async () => {
    const { router, wrapper } = await mountAt(WorkspaceScreen, "/owner/home", { scenarioId: "owner-home", role: "owner" });
    await wrapper.get("header .link-action:last-child").trigger("click");
    await flushPromises();
    expect(logout).toHaveBeenCalledWith();
    expect(router.currentRoute.value.path).toBe("/auth/login");
  });

  it("leaves the role screen after logout on all devices", async () => {
    const { router, wrapper } = await mountAt(RoleStatusScreen, "/roles", { scenarioId: "role-status" });
    const button = wrapper.findAll("button").find((candidate) => candidate.text() === "Выйти на всех устройствах");
    expect(button).toBeDefined();
    await button!.trigger("click");
    await flushPromises();
    expect(logout).toHaveBeenCalledWith(true);
    expect(router.currentRoute.value.path).toBe("/auth/login");
  });

  it("shows recognizable names before device IDs", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/roles", { scenarioId: "role-status" });
    expect(wrapper.text()).toContain("Телефон Максима");
    expect(wrapper.text()).toContain("Домашний ноутбук");
    expect(wrapper.text()).toContain("ID: pending-device");
    expect(wrapper.text()).toContain("Это устройство");
  });
});
