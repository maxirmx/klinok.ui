import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoleStatusScreen from "../src/screens/RoleStatusScreen.vue";
import WorkspaceScreen from "../src/screens/WorkspaceScreen.vue";
import { logout, switchRole, updateCredentials, updateProfile } from "../src/appStore";

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    error: "",
    busy: false,
    activeRole: "owner" as "owner" | "doctor" | "administrator" | null,
    session: {
      authenticated: true,
      accountId: "account-1",
      email: "owner@example.ru",
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
    control: {
      profile: { accountId: "account-1", revision: 1, firstName: "Максим", patronymic: "Сергеевич", lastName: "Иванов", updatedAt: "2026-07-15T00:00:00.000Z" },
      profiles: [],
      roles: [
        { requestId: "owner-role", role: "owner", status: "approved" },
        { requestId: "doctor-role", role: "doctor", status: "approved" },
        { requestId: "administrator-role", role: "administrator", status: "pending" },
      ],
      pendingQueue: [], notifications: [], events: [],
    },
    medical: { pets: [], grants: [], records: [], confirmations: [], events: [] },
    conflicts: [],
    keyRecoveryRequired: false,
    devicePending: false,
  });
  return {
    appState: readonly(state),
    setMockActiveRole: (role: "owner" | "doctor" | "administrator" | null) => { state.activeRole = role; },
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
    updateCredentials: vi.fn(),
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

beforeEach(() => {
  vi.mocked(logout).mockClear();
  vi.mocked(updateCredentials).mockClear();
  vi.mocked(updateProfile).mockClear();
  vi.mocked(switchRole).mockClear();
});

describe("logout navigation", () => {
  it("leaves the workspace after logout", async () => {
    const { router, wrapper } = await mountAt(WorkspaceScreen, "/owner/home", { scenarioId: "owner-home", role: "owner" });
    await wrapper.get("header .link-action:last-child").trigger("click");
    await flushPromises();
    expect(logout).toHaveBeenCalledWith();
    expect(router.currentRoute.value.path).toBe("/auth/login");
  });

  it("leaves the role screen after logout on all devices", async () => {
    const { router, wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const button = wrapper.findAll("button").find((candidate) => candidate.text() === "Выйти на всех устройствах");
    expect(button).toBeDefined();
    await button!.trigger("click");
    await flushPromises();
    expect(logout).toHaveBeenCalledWith(true);
    expect(router.currentRoute.value.path).toBe("/auth/login");
  });

  it("shows recognizable names before device IDs", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Главная страница", "Добавить", "Питомцы", "Дать доступ", "Доступы", "Медкарта",
    ]);
    expect(wrapper.find(".workspace-sidebar-footer .workspace-nav-item.active").text()).toContain("Настройки пользователя");
    expect(wrapper.text()).toContain("Телефон Максима");
    expect(wrapper.text()).toContain("Домашний ноутбук");
    expect(wrapper.text()).toContain("ID: pending-device");
    expect(wrapper.text()).toContain("Это устройство");
  });

  it("shows role navigation when an active role becomes available on the profile page", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockActiveRole: (role: "owner" | "doctor" | "administrator" | null) => void;
    };
    mockedStore.setMockActiveRole(null);
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Главная страница", "Добавить", "Питомцы", "Дать доступ", "Доступы", "Медкарта",
    ]);

    mockedStore.setMockActiveRole("administrator");
    await flushPromises();
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Главная страница", "Заявки", "Аккаунты", "Конфликты", "Журнал",
    ]);
    mockedStore.setMockActiveRole("owner");
  });

  it("shows clear success feedback after profile and credential changes", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const profileSave = wrapper.get<HTMLButtonElement>('button[form="profile-form"]');
    const credentialsSave = wrapper.get<HTMLButtonElement>('button[form="credentials-form"]');

    expect(wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]').element.value).toBe("Максим");
    expect(wrapper.get<HTMLInputElement>('input[autocomplete="additional-name"]').element.value).toBe("Сергеевич");
    expect(wrapper.get<HTMLInputElement>('input[autocomplete="family-name"]').element.value).toBe("Иванов");
    expect(wrapper.get<HTMLInputElement>('.credentials-form input[type="email"]').element.value).toBe("owner@example.ru");
    expect(wrapper.findAll<HTMLInputElement>('.credentials-form input[type="password"]').every((input) => input.element.value === "")).toBe(true);
    expect(wrapper.get(".workspace-topbar p").text()).toBe("Максим Сергеевич Иванов");
    expect(profileSave.element.disabled).toBe(true);
    expect(credentialsSave.element.disabled).toBe(true);

    await wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]').setValue("Мария");
    expect(profileSave.element.disabled).toBe(false);
    await wrapper.get(".profile-form").trigger("submit");
    await flushPromises();
    expect(updateProfile).toHaveBeenCalledWith({ firstName: "Мария", patronymic: "Сергеевич", lastName: "Иванов" });
    expect(wrapper.get(".workspace-topbar p").text()).toBe("Мария Сергеевич Иванов");
    expect(profileSave.element.disabled).toBe(true);
    expect(wrapper.get(".profile-form-feedback").text()).toContain("Изменения профиля сохранены.");
    expect(wrapper.findAll(".profile-form-feedback")).toHaveLength(1);

    const emailFields = wrapper.findAll<HTMLInputElement>('.credentials-form input[type="email"]');
    expect(emailFields).toHaveLength(1);
    await emailFields[0]!.setValue("new-owner@example.ru");
    expect(credentialsSave.element.disabled).toBe(false);
    await wrapper.get(".credentials-form").trigger("submit");
    await flushPromises();
    expect(updateCredentials).toHaveBeenCalledWith({ email: "new-owner@example.ru" });
    expect(credentialsSave.element.disabled).toBe(true);
    expect(wrapper.findAll(".profile-form-feedback")).toHaveLength(1);
    expect(wrapper.get(".profile-form-feedback").text()).toContain("Электронная почта сохранена.");
    expect(wrapper.text()).not.toContain("Изменения профиля сохранены.");

    await wrapper.get('button[aria-label="Закрыть сообщение"]').trigger("click");
    expect(wrapper.find(".profile-form-feedback").exists()).toBe(false);
  });

  it("changes approved active roles through real radio controls", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const radios = wrapper.findAll<HTMLInputElement>('.profile-roles input[type="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios[0]!.element.checked).toBe(true);
    expect(radios[1]!.element.disabled).toBe(false);
    expect(radios[2]!.element.disabled).toBe(true);
    expect(wrapper.text()).toContain("Активная");
    expect(wrapper.text()).not.toContain("Сделать активной");

    await radios[1]!.setValue(true);
    await flushPromises();
    expect(switchRole).toHaveBeenCalledWith("doctor");
  });
});
