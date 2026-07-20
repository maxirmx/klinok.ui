import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountProfile, Role, RoleRequest, SignedEvent } from "@klinok/protocol";
import AppIcon from "../src/components/AppIcon.vue";
import AdministratorScreen from "../src/screens/AdministratorScreen.vue";

const appMocks = vi.hoisted(() => ({
  decideRole: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    error: "",
    session: { authenticated: true, accountId: "bootstrap-administrator" },
    activeRole: "administrator",
    control: {
      profile: {
        accountId: "bootstrap-administrator",
        revision: 1,
        firstName: "Начальный",
        lastName: "Администратор",
        updatedAt: "2026-07-10T10:00:00.000Z",
      },
      profiles: [] as AccountProfile[],
      roles: [] as RoleRequest[],
      allRoles: [] as RoleRequest[],
      devices: [],
      pendingQueue: [],
      notifications: [],
      events: [] as SignedEvent[],
    },
  });
  return {
    appState: readonly(state),
    decideRole: appMocks.decideRole,
    logout: appMocks.logout,
    getConfig: () => ({ p2p: { bootstrapAccountId: "bootstrap-administrator" } }),
    setAdministratorState: (value: {
      profiles?: AccountProfile[];
      roles?: RoleRequest[];
      events?: SignedEvent[];
    }) => {
      state.control.profiles = value.profiles ?? [];
      state.control.allRoles = value.roles ?? [];
      state.control.events = value.events ?? [];
    },
  };
});

function role(
  accountId: string,
  roleName: Role,
  status: RoleRequest["status"],
  requestId = `${accountId}-${roleName}`,
): RoleRequest {
  return {
    requestId,
    accountId,
    role: roleName,
    status,
    profileRevision: 1,
    requestedAt: "2026-07-10T10:00:00.000Z",
  };
}

function profile(accountId: string, firstName: string, lastName: string): AccountProfile {
  return {
    accountId,
    revision: 1,
    firstName,
    lastName,
    updatedAt: "2026-07-10T10:00:00.000Z",
  };
}

function event(overrides: Partial<SignedEvent> & Pick<SignedEvent, "eventId" | "eventType">): SignedEvent {
  return {
    schemaVersion: 1,
    database: "control",
    operationId: `operation-${overrides.eventId}`,
    aggregateId: "doctor-1",
    resourceId: "doctor-role",
    createdAt: "2026-07-10T10:00:00.000Z",
    actorAccountId: "bootstrap-administrator",
    actorDeviceId: "bootstrap-device",
    orbitIdentityId: "bootstrap-orbit",
    activeRole: "administrator",
    parents: [],
    keyVersion: 1,
    proofIds: ["administrator-role"],
    metadata: {},
    keyring: [],
    payload: { algorithm: "AES-GCM-256", iv: "iv", ciphertext: "ciphertext" },
    signature: { algorithm: "ECDSA-P256-SHA256", value: "signature" },
    ...overrides,
  };
}

async function setState(value: { profiles?: AccountProfile[]; roles?: RoleRequest[]; events?: SignedEvent[] }) {
  const store = await import("../src/appStore") as typeof import("../src/appStore") & {
    setAdministratorState: (input: typeof value) => void;
  };
  store.setAdministratorState(value);
}

async function mountAt(path: "/admin/home" | "/admin/audit", scenarioId: "administrator-home" | "administrator-audit") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/admin/home", component: { template: "<div />" } },
      { path: "/admin/audit", component: { template: "<div />" } },
      { path: "/profile", component: { template: "<div />" } },
      { path: "/auth/login", component: { template: "<div />" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  return mount(AdministratorScreen, {
    props: { role: "administrator", scenarioId },
    global: { plugins: [router] },
  });
}

function rowFor(wrapper: VueWrapper, text: string) {
  return wrapper.findAll(".administrator-table tbody tr").find((row) => row.text().includes(text))!;
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await setState({});
});

describe("Administrator pages", () => {
  it("groups advanced roles, maps statuses, excludes owner-only users, and protects bootstrap", async () => {
    await setState({
      profiles: [
        profile("bootstrap-administrator", "Начальный", "Администратор"),
        profile("doctor-1", "Анна", "Врач"),
        profile("doctor-2", "Борис", "Врач"),
        profile("owner-1", "Ольга", "Владелец"),
      ],
      roles: [
        role("bootstrap-administrator", "administrator", "approved"),
        role("doctor-1", "doctor", "pending"),
        role("doctor-1", "administrator", "rejected"),
        role("doctor-2", "doctor", "revoked"),
        role("owner-1", "owner", "approved"),
      ],
    });
    const wrapper = await mountAt("/admin/home", "administrator-home");

    const auditLink = wrapper.get(".administrator-audit-link");
    expect(auditLink.attributes("title")).toBe("Открыть журнал действий");
    expect(auditLink.attributes("aria-label")).toBe("Открыть журнал действий");
    expect(auditLink.text()).toBe("");
    expect(auditLink.getComponent(AppIcon).props("name")).toBe("book");
    expect(wrapper.findAll(".administrator-table th").map((header) => header.text())).toEqual([
      "Действия", "ФИО", "Ветеринар", "Администратор",
    ]);
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(3);
    expect(wrapper.text()).not.toContain("Ольга Владелец");
    expect(rowFor(wrapper, "Анна Врач").text()).toContain("Запрошена");
    expect(rowFor(wrapper, "Анна Врач").text()).toContain("Отказ");
    expect(rowFor(wrapper, "Борис Врач").text()).toContain("Отозвана");
    expect(rowFor(wrapper, "Начальный Администратор").findAll(".administrator-actions button")).toHaveLength(0);
    expect(rowFor(wrapper, "Анна Врач").findAll("button").map((button) => button.attributes("title"))).toEqual([
      "Одобрить роль «Ветеринар»",
      "Отклонить запрос роли «Ветеринар»",
      "Восстановить роль «Администратор»",
    ]);
  });

  it("confirms rejection with an optional reason and restoration without one", async () => {
    const pending = role("doctor-1", "doctor", "pending");
    const rejected = role("doctor-1", "administrator", "rejected");
    await setState({
      profiles: [profile("doctor-1", "Анна", "Врач")],
      roles: [pending, rejected],
    });
    const wrapper = await mountAt("/admin/home", "administrator-home");

    await wrapper.get('button[title="Отклонить запрос роли «Ветеринар»"]').trigger("click");
    const rejectDialog = wrapper.get('[role="alertdialog"]');
    await rejectDialog.get("textarea").setValue("Документы не подтверждены");
    await rejectDialog.get("form").trigger("submit");
    await flushPromises();
    expect(appMocks.decideRole).toHaveBeenCalledWith(pending, "rejected", "Документы не подтверждены");
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);

    await wrapper.get('button[title="Восстановить роль «Администратор»"]').trigger("click");
    const restoreDialog = wrapper.get('[role="dialog"]');
    expect(restoreDialog.find("textarea").exists()).toBe(false);
    await restoreDialog.get("form").trigger("submit");
    await flushPromises();
    expect(appMocks.decideRole).toHaveBeenCalledWith(rejected, "approved", undefined);
  });

  it("searches, paginates, and remembers the selected page size", async () => {
    const profiles = Array.from({ length: 22 }, (_, index) =>
      profile(`doctor-${index}`, `Имя${String(index).padStart(2, "0")}`, "Врач"),
    );
    await setState({
      profiles,
      roles: profiles.map((item) => role(item.accountId, "doctor", "pending")),
    });
    const wrapper = await mountAt("/admin/home", "administrator-home");

    const searchLabel = wrapper.get(".administrator-search");
    expect(searchLabel.get(":scope > span").text()).toBe("ФИО или идентификатор");
    expect(searchLabel.get("input").attributes("placeholder")).toBe("Поиск");
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(20);
    expect(wrapper.get(".administrator-pagination").text()).toContain("Показаны 1–20 из 22");
    await wrapper.get('.administrator-pagination select').setValue("50");
    expect(localStorage.getItem("klinok:admin-role-table-page-size")).toBe("50");
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(22);

    await wrapper.get<HTMLInputElement>('.administrator-search input').setValue("Имя21");
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(1);
    expect(wrapper.get(".administrator-table tbody tr").text()).toContain("Имя21");

    await wrapper.get<HTMLInputElement>('.administrator-search input').setValue("doctor-20");
    expect(wrapper.findAll(".administrator-table tbody tr")).toHaveLength(1);
    expect(wrapper.get(".administrator-table tbody tr").text()).toContain("doctor-20");
  });

  it("renders, filters, and paginates signed role audit actions with their actors", async () => {
    const requested = event({
      eventId: "requested",
      eventType: "role.requested",
      aggregateId: "doctor-1",
      actorAccountId: "doctor-1",
      metadata: { role: "doctor", status: "pending" },
      createdAt: "2026-07-10T10:00:00.000Z",
    });
    const requestedAudit = event({
      eventId: "requested-audit",
      eventType: "audit.role-transition",
      aggregateId: "doctor-1",
      actorAccountId: "doctor-1",
      parents: ["requested"],
      createdAt: "2026-07-10T10:00:01.000Z",
    });
    const restored = event({
      eventId: "restored",
      eventType: "role.restored",
      aggregateId: "doctor-1",
      actorAccountId: "bootstrap-administrator",
      metadata: { role: "doctor", status: "approved" },
      createdAt: "2026-07-11T10:00:00.000Z",
    });
    const restoredAudit = event({
      eventId: "restored-audit",
      eventType: "audit.role-transition",
      aggregateId: "doctor-1",
      actorAccountId: "bootstrap-administrator",
      parents: ["restored"],
      createdAt: "2026-07-11T10:00:01.000Z",
    });
    const bootstrap = event({
      eventId: "bootstrap",
      eventType: "account.bootstrap",
      aggregateId: "bootstrap-administrator",
      actorAccountId: "bootstrap-administrator",
      createdAt: "2026-07-09T10:00:00.000Z",
    });
    await setState({
      profiles: [
        profile("doctor-1", "Анна", "Врач"),
        profile("bootstrap-administrator", "Начальный", "Администратор"),
      ],
      events: [requested, requestedAudit, restored, restoredAudit, bootstrap],
    });
    const wrapper = await mountAt("/admin/audit", "administrator-audit");

    const homeLink = wrapper.get(".administrator-audit-link");
    expect(homeLink.attributes("title")).toBe("К управлению ролями");
    expect(homeLink.attributes("aria-label")).toBe("К управлению ролями");
    expect(homeLink.text()).toBe("");
    expect(homeLink.getComponent(AppIcon).props("name")).toBe("chevron-left");
    const searchLabel = wrapper.get(".administrator-audit-filters .administrator-search");
    expect(searchLabel.get(":scope > span").text()).toBe("ФИО или идентификатор");
    expect(searchLabel.get("input").attributes("placeholder")).toBe("Поиск");
    const rows = wrapper.findAll(".administrator-audit-table tbody tr");
    expect(rows).toHaveLength(3);
    expect(rows[0]!.text()).toContain("Роль восстановлена");
    expect(rows[0]!.text()).toContain("Начальный Администратор");
    expect(rows[2]!.text()).toContain("Роль назначена при инициализации");

    await wrapper.findAll<HTMLSelectElement>(".administrator-audit-filters select")[1]!.setValue("restore");
    expect(wrapper.findAll(".administrator-audit-table tbody tr")).toHaveLength(1);
    expect(wrapper.get(".administrator-audit-table tbody tr").text()).toContain("Роль восстановлена");
  });
});
