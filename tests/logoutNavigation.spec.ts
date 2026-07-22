import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RoleStatusScreen from "../src/screens/RoleStatusScreen.vue";
import { deleteAccount, logout, replaceLostBootstrapDevice, revokeDevice, switchRole, updateCredentials, updateProfile } from "../src/appStore";

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    feedback: null as { kind: "success" | "error"; text: string } | null,
    busy: false,
    activeRole: "owner" as "owner" | "doctor" | "administrator" | null,
    session: {
      authenticated: true,
      accountId: "account-1",
      email: "owner@example.ru",
      device: { deviceId: "current-device", deviceName: "Домашний ноутбук" },
      devices: [
        { deviceId: "current-device", deviceName: "Домашний ноутбук", status: "active" },
        { deviceId: "revoked-device", deviceName: "Старый телефон", status: "revoked" },
      ],
      enrollments: [{
        enrollmentId: "pending-enrollment",
        deviceId: "pending-device",
        deviceName: "Телефон Максима",
        status: "pending",
        ephemeralPublicKey: { kty: "EC" },
        createdAt: "2026-07-15T00:00:00.000Z",
      }],
      serverKeySetAvailable: false,
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
    medical: { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [], events: [] },
    conflicts: [],
    sync: { pendingCount: 0, failedCount: 0, syncing: false, lastError: "" },
    repositoryConnected: true,
    keyRecoveryRequired: false,
    devicePending: false,
  });
  return {
    appState: readonly(state),
    setMockAccountId: (accountId: string) => { state.session.accountId = accountId; },
    setMockActiveRole: (role: "owner" | "doctor" | "administrator" | null) => { state.activeRole = role; },
    setMockDevices: (devices: typeof state.session.devices) => { state.session.devices = devices; },
    setMockDevicePending: (pending: boolean) => { state.devicePending = pending; },
    setMockServerKeySetAvailable: (available: boolean) => { state.session.serverKeySetAvailable = available; },
    setMockProfile: (profile: typeof state.control.profile) => { state.control.profile = profile; },
    setMockSync: (sync: typeof state.sync) => { state.sync = sync; },
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
    replaceLostBootstrapDevice: vi.fn(),
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

beforeEach(async () => {
  const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
    setMockAccountId: (accountId: string) => void;
    setMockActiveRole: (role: "owner" | "doctor" | "administrator" | null) => void;
    setMockDevices: (devices: Array<{ deviceId: string; deviceName: string; status: string }>) => void;
    setMockDevicePending: (pending: boolean) => void;
    setMockServerKeySetAvailable: (available: boolean) => void;
    setMockProfile: (profile: {
      accountId: string;
      revision: number;
      firstName: string;
      patronymic: string;
      lastName: string;
      updatedAt: string;
    }) => void;
    setMockSync: (sync: { pendingCount: number; failedCount: number; syncing: boolean; lastError: string }) => void;
  };
  mockedStore.setMockAccountId("account-1");
  mockedStore.setMockActiveRole("owner");
  mockedStore.setMockDevices([
    { deviceId: "current-device", deviceName: "Домашний ноутбук", status: "active" },
    { deviceId: "revoked-device", deviceName: "Старый телефон", status: "revoked" },
  ]);
  mockedStore.setMockDevicePending(false);
  mockedStore.setMockServerKeySetAvailable(false);
  mockedStore.setMockProfile({
    accountId: "account-1",
    revision: 1,
    firstName: "Максим",
    patronymic: "Сергеевич",
    lastName: "Иванов",
    updatedAt: "2026-07-15T00:00:00.000Z",
  });
  mockedStore.setMockSync({ pendingCount: 0, failedCount: 0, syncing: false, lastError: "" });
  vi.mocked(deleteAccount).mockClear();
  vi.mocked(logout).mockClear();
  vi.mocked(revokeDevice).mockClear();
  vi.mocked(replaceLostBootstrapDevice).mockClear();
  vi.mocked(updateCredentials).mockClear();
  vi.mocked(updateProfile).mockClear();
  vi.mocked(switchRole).mockClear();
});

describe("logout navigation", () => {
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
      "Питомцы", "Добавить питомца",
    ]);
    expect(wrapper.find(".workspace-sidebar-footer .workspace-nav-item.active").text()).toContain("Настройки пользователя");
    expect(wrapper.text()).toContain("Телефон Максима");
    expect(wrapper.text()).toContain("Домашний ноутбук");
    expect(wrapper.text()).toContain("Управляйте подтверждёнными устройствами и сеансами.");
    expect(wrapper.text()).not.toContain("новое устройство подтверждается автоматически");
    expect(wrapper.text()).toContain("ID: pending-device");
    expect(wrapper.text()).toContain("Это устройство");
    expect(wrapper.text()).not.toContain("Старый телефон");
    expect(wrapper.text()).not.toContain("revoked-device");
    expect(wrapper.find(".workspace-account-actions").exists()).toBe(false);
    expect(wrapper.get(".workspace-bottom-nav").text()).toContain("Настройки пользователя");
    expect(wrapper.get(".workspace-bottom-nav").text()).toContain("Выйти");
    const revokeButton = wrapper.findAll<HTMLButtonElement>("button")
      .find((button) => button.text() === "Отозвать устройство");
    expect(revokeButton?.element.disabled).toBe(true);
    expect(revokeButton?.attributes("title")).toBe("Нельзя отозвать последнее действующее устройство.");
  });

  it("shows current-session sync status immediately above account and device management", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockSync: (sync: { pendingCount: number; failedCount: number; syncing: boolean; lastError: string }) => void;
    };
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const sections = wrapper.findAll(".profile-layout > .profile-section");
    const syncSectionIndex = sections.findIndex((section) => section.classes().includes("profile-sync-status"));
    const accountSectionIndex = sections.findIndex((section) => section.classes().includes("account-security"));

    expect(syncSectionIndex).toBeGreaterThanOrEqual(0);
    expect(accountSectionIndex).toBe(syncSectionIndex + 1);
    expect(sections[syncSectionIndex]!.text()).toContain("Синхронизация данных");
    expect(sections[syncSectionIndex]!.text()).toContain("текущего сеанса");
    expect(sections[syncSectionIndex]!.get(".sync-status").text()).toBe("Сохранено");

    mockedStore.setMockSync({ pendingCount: 0, failedCount: 1, syncing: false, lastError: "" });
    await flushPromises();
    expect(sections[syncSectionIndex]!.get(".sync-status").text()).toBe("Конфликты: 1");
  });

  it("confirms account deletion in a modal before executing it", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const deleteButton = wrapper.findAll("button").find((button) => button.text() === "Удалить аккаунт");
    await deleteButton!.trigger("click");

    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.attributes("aria-modal")).toBe("true");
    expect(dialog.text()).toContain("Удалить аккаунт?");
    expect(deleteAccount).not.toHaveBeenCalled();

    await dialog.findAll("button").find((button) => button.text() === "Отмена")!.trigger("click");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(deleteAccount).not.toHaveBeenCalled();

    await deleteButton!.trigger("click");
    await wrapper.get('[role="alertdialog"]').findAll("button")
      .find((button) => button.text() === "Удалить аккаунт")!
      .trigger("click");
    await flushPromises();
    expect(deleteAccount).toHaveBeenCalledOnce();
  });

  it("disables account deletion for the bootstrap Administrator", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockAccountId: (accountId: string) => void;
    };
    mockedStore.setMockAccountId("bootstrap-administrator");
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const deleteButton = wrapper.findAll<HTMLButtonElement>("button")
      .find((button) => button.text() === "Удалить аккаунт")!;

    expect(deleteButton.element.disabled).toBe(true);
    expect(deleteButton.attributes("title")).toBe("Начальный аккаунт администратора нельзя удалить.");
    await deleteButton.trigger("click");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("offers offline replacement when a bootstrap device is pending", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockAccountId: (accountId: string) => void;
      setMockDevicePending: (pending: boolean) => void;
    };
    mockedStore.setMockAccountId("bootstrap-administrator");
    mockedStore.setMockDevicePending(true);
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });

    expect(wrapper.text()).toContain("Все действующие устройства утрачены?");
    expect(wrapper.text()).toContain("Все прежние устройства и сеансы будут отозваны.");
    const fileInput = wrapper.get<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(fileInput.element, "files", {
      configurable: true,
      value: [new File(["recovery"], "bootstrap-recovery.bundle.json", { type: "application/json" })],
    });
    await fileInput.trigger("change");
    await flushPromises();
    await wrapper.get<HTMLInputElement>('input[aria-label="Пароль пакета"], input[type="password"]').setValue("offline recovery passphrase");
    const replaceButton = wrapper.get<HTMLButtonElement>("button.primary-action");
    expect(replaceButton.element.disabled).toBe(false);
    await wrapper.get(".profile-gate form").trigger("submit");
    await flushPromises();

    expect(replaceLostBootstrapDevice).toHaveBeenCalledWith("recovery", "offline recovery passphrase");
    expect(wrapper.text()).toContain("Утраченное устройство заменено.");
  });

  it("hides legacy approval and recovery controls after server key migration", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockAccountId: (accountId: string) => void;
      setMockDevicePending: (pending: boolean) => void;
      setMockServerKeySetAvailable: (available: boolean) => void;
    };
    mockedStore.setMockAccountId("bootstrap-administrator");
    mockedStore.setMockDevicePending(true);
    mockedStore.setMockServerKeySetAvailable(true);
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });

    expect(wrapper.text()).not.toContain("Все действующие устройства утрачены?");
    expect(wrapper.text()).not.toContain("Подтвердить и передать ключи");
  });

  it("confirms device revocation before executing it", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockDevices: (devices: Array<{ deviceId: string; deviceName: string; status: string }>) => void;
    };
    mockedStore.setMockDevices([
      { deviceId: "current-device", deviceName: "Домашний ноутбук", status: "active" },
      { deviceId: "second-device", deviceName: "Рабочий ноутбук", status: "active" },
    ]);
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const revokeButton = wrapper.findAll("button").find((button) => button.text() === "Отозвать устройство");
    expect((revokeButton!.element as HTMLButtonElement).disabled).toBe(false);
    await revokeButton!.trigger("click");

    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.text()).toContain("Отозвать устройство «Домашний ноутбук»?");
    expect(revokeDevice).not.toHaveBeenCalled();
    await dialog.findAll("button").find((button) => button.text() === "Отозвать устройство")!.trigger("click");
    await flushPromises();
    expect(revokeDevice).toHaveBeenCalledWith("current-device");
  });

  it("shows role navigation when an active role becomes available on the profile page", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockActiveRole: (role: "owner" | "doctor" | "administrator" | null) => void;
    };
    mockedStore.setMockActiveRole(null);
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Питомцы", "Добавить питомца",
    ]);

    mockedStore.setMockActiveRole("administrator");
    await flushPromises();
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Пользователи", "Журнал",
    ]);
    mockedStore.setMockActiveRole("owner");
  });

  it("shows clear success feedback after profile and credential changes", async () => {
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const profileSave = wrapper.get<HTMLButtonElement>('button[form="profile-form"]');
    const credentialsSave = wrapper.get<HTMLButtonElement>('button[form="credentials-form"]');
    const profileRestore = wrapper.get<HTMLButtonElement>('button[title="Восстановить личные данные"]');
    const credentialsRestore = wrapper.get<HTMLButtonElement>('button[title="Восстановить электронную почту и пароль"]');

    expect(wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]').element.value).toBe("Максим");
    expect(wrapper.get<HTMLInputElement>('input[autocomplete="additional-name"]').element.value).toBe("Сергеевич");
    expect(wrapper.get<HTMLInputElement>('input[autocomplete="family-name"]').element.value).toBe("Иванов");
    expect(wrapper.get<HTMLInputElement>('.credentials-form input[type="email"]').element.value).toBe("owner@example.ru");
    expect(wrapper.findAll<HTMLInputElement>('.credentials-form input[type="password"]').every((input) => input.element.value === "")).toBe(true);
    expect(wrapper.get(".workspace-topbar p").text()).toBe("Максим Сергеевич Иванов");
    expect(profileSave.element.disabled).toBe(true);
    expect(credentialsSave.element.disabled).toBe(true);
    expect(profileRestore.element.disabled).toBe(true);
    expect(credentialsRestore.element.disabled).toBe(true);

    await wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]').setValue("Мария");
    expect(profileSave.element.disabled).toBe(false);
    expect(profileRestore.element.disabled).toBe(false);
    await profileRestore.trigger("click");
    expect(wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]').element.value).toBe("Максим");
    expect(profileRestore.element.disabled).toBe(true);
    await wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]').setValue("Мария");
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
    expect(credentialsRestore.element.disabled).toBe(false);
    await credentialsRestore.trigger("click");
    expect(emailFields[0]!.element.value).toBe("owner@example.ru");
    expect(credentialsRestore.element.disabled).toBe(true);
    await emailFields[0]!.setValue("new-owner@example.ru");
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

  it("allows repeated profile edits while background snapshots are received", async () => {
    const mockedStore = await import("../src/appStore") as typeof import("../src/appStore") & {
      setMockProfile: (profile: {
        accountId: string;
        revision: number;
        firstName: string;
        patronymic: string;
        lastName: string;
        updatedAt: string;
      }) => void;
    };
    const { wrapper } = await mountAt(RoleStatusScreen, "/profile", { scenarioId: "user-profile" });
    const firstName = wrapper.get<HTMLInputElement>('input[autocomplete="given-name"]');
    const profileSave = wrapper.get<HTMLButtonElement>('button[form="profile-form"]');

    await firstName.setValue("Мария");
    await wrapper.get(".profile-form").trigger("submit");
    await flushPromises();
    expect(updateProfile).toHaveBeenLastCalledWith({ firstName: "Мария", patronymic: "Сергеевич", lastName: "Иванов" });

    await firstName.setValue("Анна");
    mockedStore.setMockProfile({
      accountId: "account-1",
      revision: 2,
      firstName: "Мария",
      patronymic: "Сергеевич",
      lastName: "Иванов",
      updatedAt: "2026-07-21T00:00:00.000Z",
    });
    await flushPromises();

    expect(firstName.element.value).toBe("Анна");
    expect(profileSave.element.disabled).toBe(false);
    await wrapper.get(".profile-form").trigger("submit");
    await flushPromises();
    expect(updateProfile).toHaveBeenCalledTimes(2);
    expect(updateProfile).toHaveBeenLastCalledWith({ firstName: "Анна", patronymic: "Сергеевич", lastName: "Иванов" });
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
