import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppIcon from "../src/components/AppIcon.vue";
import DoctorScreen from "../src/screens/DoctorScreen.vue";
import type { MedicalRecordDraft, MedicalSnapshot, PetProfile } from "../src/repositories/types";

const repositoryMocks = vi.hoisted(() => ({
  requestAccess: vi.fn().mockResolvedValue("request-1"),
  cancelAccessRequest: vi.fn().mockResolvedValue(undefined),
  saveEncounter: vi.fn().mockResolvedValue("record-1"),
  delegateGrant: vi.fn().mockResolvedValue("grant-delegated"),
  relinquishAccess: vi.fn().mockResolvedValue(undefined),
}));
const directoryMocks = vi.hoisted(() => ({
  loadDoctorPets: vi.fn(),
  lookupPetDirectory: vi.fn(),
  searchDoctorDirectory: vi.fn(),
  searchPetDirectory: vi.fn(),
}));

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const state = reactive({
    activeRole: "doctor" as const,
    feedback: null,
    session: { authenticated: true, accountId: "doctor-1" },
    control: {
      profile: { firstName: "Вера", lastName: "Врач" },
      profiles: [], roles: [], allRoles: [], devices: [], pendingQueue: [], notifications: [], events: [],
    },
    medical: { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [], events: [] } as MedicalSnapshot,
  });
  return {
    appState: readonly(state),
    loadDoctorPets: directoryMocks.loadDoctorPets,
    lookupPetDirectory: directoryMocks.lookupPetDirectory,
    logout: vi.fn().mockResolvedValue(undefined),
    requireRepository: () => ({ medical: repositoryMocks }),
    searchDoctorDirectory: directoryMocks.searchDoctorDirectory,
    searchPetDirectory: directoryMocks.searchPetDirectory,
    setDoctorMedicalState: (medical: MedicalSnapshot) => { state.medical = medical; },
  };
});

const pet: PetProfile = {
  petId: "pet-1",
  ownerAccountId: "owner-1",
  name: "Буся",
  species: "Собака",
  breed: "Бигль",
  sex: "Интактная самка",
  birthDate: "2022-06-17",
  color: "трёхцветный",
  chip: "643094100000001",
  brandMark: "ABC-123",
  latestVaccination: { date: "2026-04-15", name: "Рабикан" },
  weightKg: 11.8,
  notes: "Боится громких звуков",
  keyVersion: 1,
  tombstoned: false,
  updatedAt: "2026-07-21T10:00:00.000Z",
};

const medicalRecord: MedicalRecordDraft = {
  recordId: "record-1",
  petId: pet.petId,
  revision: 1,
  authorAccountId: "doctor-1",
  authorDisplayName: "Вера Врач",
  encounterDate: "2026-07-21",
  title: "Осмотр",
  text: "Не ест",
  sections: {
    "what-happened": {
      kind: "what-happened",
      templateVersion: "what-happened-v1",
      value: { selectedIds: ["problem.digestive.1"], comment: "Не ест" },
      authorAccountId: "doctor-1",
      authorDisplayName: "Вера Врач",
      updatedAt: "2026-07-21T10:00:00.000Z",
    },
    outcome: {
      kind: "outcome",
      templateVersion: "free-text-v0",
      value: { text: "Назначено лечение" },
      authorAccountId: "doctor-1",
      authorDisplayName: "Вера Врач",
      updatedAt: "2026-07-21T10:00:00.000Z",
    },
  },
  createdAt: "2026-07-21T10:00:00.000Z",
  updatedAt: "2026-07-21T10:00:00.000Z",
};

function snapshot(
  actions: Array<"read" | "write_unconfirmed" | "delegate"> = ["read", "write_unconfirmed", "delegate"],
  overrides: Partial<MedicalSnapshot> = {},
): MedicalSnapshot {
  return {
    pets: [pet],
    grants: [{
      grantId: "grant-1",
      petId: pet.petId,
      grantorAccountId: pet.ownerAccountId,
      granteeAccountId: "doctor-1",
      actions,
      petKeyVersion: 1,
      status: "active",
      createdAt: "2026-07-21T10:00:00.000Z",
    }],
    accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [], events: [],
    ...overrides,
  };
}

async function setMedical(medical: MedicalSnapshot) {
  const store = await import("../src/appStore") as typeof import("../src/appStore") & {
    setDoctorMedicalState: (value: MedicalSnapshot) => void;
  };
  store.setDoctorMedicalState(medical);
}

async function mountAt(path: string, scenarioId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/doctor/home", component: { template: "<div />" } },
      { path: "/doctor/pets/request-access", component: { template: "<div />" } },
      { path: "/doctor/pets/:petId", component: { template: "<div />" } },
      { path: "/doctor/pets/:petId/delegate", component: { template: "<div />" } },
      { path: "/doctor/pets/:petId/cancel-access", component: { template: "<div />" } },
      { path: "/profile", component: { template: "<div />" } },
      { path: "/auth/login", component: { template: "<div />" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  return mount(DoctorScreen, { props: { role: "doctor", scenarioId }, global: { plugins: [router] } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await setMedical(snapshot());
  directoryMocks.loadDoctorPets.mockResolvedValue({
    items: [{
      petId: pet.petId,
      ownerAccountId: pet.ownerAccountId,
      ownerDisplayName: "Ольга Владелец",
      species: pet.species,
      name: pet.name,
      permissions: ["read", "write_unconfirmed", "delegate"],
      grantId: "grant-1",
      updatedAt: pet.updatedAt,
    }],
    page: 1, pageSize: 20, total: 1, pageCount: 1,
  });
  directoryMocks.lookupPetDirectory.mockResolvedValue({
    petId: pet.petId,
    ownerAccountId: pet.ownerAccountId,
    ownerDisplayName: "Ольга Петровна Владелец",
    species: pet.species,
    name: pet.name,
    updatedAt: pet.updatedAt,
  });
  directoryMocks.searchDoctorDirectory.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, pageCount: 1 });
  directoryMocks.searchPetDirectory.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0, pageCount: 1 });
});

describe("Doctor pages", () => {
  it("renders the paged access directory and dedicated route navigation", async () => {
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text()))
      .toEqual(["Мед. карты", "Запросить доступ"]);
    expect(wrapper.get(".doctor-heading h2").text()).toBe("Медицинские карты");
    expect(wrapper.text()).not.toContain("Медицинские карты, к которым вам предоставлен доступ.");
    const table = wrapper.get(".doctor-access-table");
    expect(table.findAll("th").map((header) => header.text())).toEqual([
      "Действия", "Питомец", "Владелец", "Делегирование",
    ]);
    const cells = table.get("tbody tr").findAll("td");
    expect(cells[0]!.attributes("data-label")).toBe("Действия");
    expect(cells[1]!.get("strong").text()).toBe("Собака Буся");
    expect(cells[1]!.get("small").text()).toBe("pet-1");
    expect(cells[2]!.get("strong").text()).toBe("Ольга Владелец");
    expect(cells[2]!.get("small").text()).toBe("owner-1");
    expect(cells[3]!.attributes("data-label")).toBe("Делегирование");
    expect(cells[3]!.text()).toBe("Да");
    expect(cells[0]!.findAll("a").map((button) => button.attributes("title"))).toEqual([
      "Открыть медицинскую карту", "Делегировать доступ", "Отказаться от доступа",
    ]);
    expect(cells[0]!.findAll("a").map((button) => button.getComponent(AppIcon).props("name")))
      .toEqual(["eye", "share", "close"]);
    expect(wrapper.get(".doctor-access-pagination").text()).toContain("Показаны 1–1 из 1");
    expect(directoryMocks.loadDoctorPets).toHaveBeenCalledWith("", 1, 10, "owner", "asc");
    const petSortHeader = table.findAll("th")[1]!;
    const ownerSortHeader = table.findAll("th")[2]!;
    expect(petSortHeader.attributes("aria-sort")).toBe("none");
    expect(ownerSortHeader.attributes("aria-sort")).toBe("ascending");
    await ownerSortHeader.get("button").trigger("click");
    await flushPromises();
    expect(ownerSortHeader.attributes("aria-sort")).toBe("descending");
    expect(ownerSortHeader.getComponent(AppIcon).classes()).toContain("descending");
    expect(directoryMocks.loadDoctorPets).toHaveBeenLastCalledWith("", 1, 10, "owner", "desc");
    await petSortHeader.get("button").trigger("click");
    await flushPromises();
    expect(petSortHeader.attributes("aria-sort")).toBe("ascending");
    expect(directoryMocks.loadDoctorPets).toHaveBeenLastCalledWith("", 1, 10, "pet", "asc");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await table.get('button[title="Запросить доступ"]').trigger("click");
    expect(wrapper.get('[role="dialog"]').text()).toContain("Запросить доступ");
  });

  it("finds a pet by partial owner name and pet name before requesting access", async () => {
    directoryMocks.searchPetDirectory.mockResolvedValue({
      items: [{
        petId: "pet-2",
        ownerAccountId: "owner-2",
        ownerDisplayName: "Ольга Петровна Владелец",
        species: "Кошка",
        name: "Буся",
        updatedAt: "2026-07-21T10:00:00.000Z",
      }],
      page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    const wrapper = await mountAt("/doctor/pets/request-access", "doctor-pet-request-access");
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.findAll("label span").map((label) => label.text())).toEqual(expect.arrayContaining([
      "ФИО владельца, его часть или полный ID",
      "Кличка, её часть или полный ID питомца",
    ]));
    expect(wrapper.text()).not.toContain("Предыдущие запросы");
    const requestInputs = dialog.findAll<HTMLInputElement>('input[type="search"]');
    await requestInputs[0]!.setValue("Петровна");
    await requestInputs[1]!.setValue("Буся");
    await dialog.get(".doctor-request-search-form").trigger("submit");
    await flushPromises();

    expect(directoryMocks.searchPetDirectory).toHaveBeenCalledWith("Петровна", "Буся", 1, 50);
    const result = dialog.get(".doctor-request-result");
    expect(result.text()).toContain("Кошка Буся");
    expect(result.text()).toContain("pet-2");
    expect(result.text()).toContain("Ольга Петровна Владелец");
    expect(result.text()).toContain("owner-2");
    expect(result.get('button[title="Отправить запрос"]').getComponent(AppIcon).props("name")).toBe("check");
    await result.get('button[title="Отправить запрос"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.requestAccess).toHaveBeenCalledWith("pet-2");
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it("shows delegation as no and hides the delegate action when it is unavailable", async () => {
    directoryMocks.loadDoctorPets.mockResolvedValue({
      items: [{
        petId: pet.petId,
        ownerAccountId: pet.ownerAccountId,
        ownerDisplayName: "Ольга Владелец",
        species: pet.species,
        name: pet.name,
        permissions: ["read", "write_unconfirmed"],
        grantId: "grant-1",
        updatedAt: pet.updatedAt,
      }],
      page: 1, pageSize: 10, total: 1, pageCount: 1,
    });
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();

    const row = wrapper.get(".doctor-access-table tbody tr");
    expect(row.get('td[data-label="Делегирование"]').text()).toBe("Нет");
    expect(row.find('a[title="Делегировать доступ"]').exists()).toBe(false);
  });

  it("inherits read and write access while only asking about further delegation", async () => {
    const delegatedState = snapshot();
    delegatedState.grants.push({
      grantId: "grant-child",
      parentGrantId: "grant-1",
      petId: pet.petId,
      grantorAccountId: "doctor-1",
      granteeAccountId: "doctor-3",
      granteeDisplayName: "Анна Врач",
      actions: ["read", "write_unconfirmed"],
      petKeyVersion: 1,
      status: "active",
      createdAt: "2026-07-21T11:00:00.000Z",
    });
    await setMedical(delegatedState);
    directoryMocks.searchDoctorDirectory.mockResolvedValue({
      items: [{
        accountId: "doctor-2",
        firstName: "Пётр",
        lastName: "Врач",
        displayName: "Пётр Врач",
        updatedAt: "2026-07-21T10:00:00.000Z",
      }],
      page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    const wrapper = await mountAt("/doctor/pets/pet-1/delegate", "doctor-pet-delegate");
    await flushPromises();
    expect(wrapper.get(".owner-pet-id").text()).toBe("pet-1");
    expect(wrapper.get(".owner-pet-owner").text()).toContain("Ольга Петровна Владелец");
    expect(wrapper.get(".owner-pet-owner-id").text()).toBe("owner-1");
    expect(wrapper.get(".owner-access-table tbody tr").text()).toContain("Анна Врач");
    expect(wrapper.get(".owner-access-table tbody tr").text()).toContain("Предоставлен");
    await wrapper.get('.owner-access-actions-header button[title="Делегировать доступ"]').trigger("click");
    const dialog = wrapper.get('[role="dialog"]');
    await dialog.get('input[required]').setValue("Пётр");
    await dialog.get("form").trigger("submit");
    await flushPromises();
    await dialog.get('.list-row button[title="Выбрать врача"]').trigger("click");

    expect(wrapper.text()).not.toContain("Создание неподтверждённых приёмов");
    expect(dialog.findAll('.check-row input[type="checkbox"]')).toHaveLength(1);
    const delegationCheckbox = dialog.get<HTMLInputElement>('.check-row input[type="checkbox"]');
    expect(delegationCheckbox.element.closest("label")?.textContent).toContain("Разрешить дальнейшее делегирование");
    await delegationCheckbox.setValue(true);
    await dialog.findAll("form")[1]!.trigger("submit");
    await wrapper.get('[role="alertdialog"] .primary-action').trigger("click");
    await flushPromises();

    expect(repositoryMocks.delegateGrant).toHaveBeenCalledWith(
      "grant-1",
      "doctor-2",
      ["read", "write_unconfirmed", "delegate"],
    );
  });

  it("saves a structured encounter with the mandatory taxonomy section", async () => {
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    const notEating = wrapper.findAll(".encounter-taxonomy label").find((label) => label.text() === "Не ест");
    expect(notEating).toBeDefined();
    await notEating!.get("input").trigger("change");
    await wrapper.get(".encounter-editor textarea").setValue("Не ест со вчерашнего дня");
    await wrapper.get(".encounter-editor form").trigger("submit");
    await flushPromises();
    expect(repositoryMocks.saveEncounter).toHaveBeenCalledWith(expect.objectContaining({
      petId: "pet-1",
      sections: {
        "what-happened": {
          selectedIds: ["problem.digestive.1"],
          comment: "Не ест со вчерашнего дня",
        },
      },
    }));
  });

  it("uses verified status in both record modes and does not offer changes to a confirmed record", async () => {
    await setMedical(snapshot(undefined, { records: [medicalRecord], confirmedRecordIds: [medicalRecord.recordId] }));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();

    const epicrisis = wrapper.get(".medical-record-entry-epicrisis");
    const details = wrapper.get(".medical-record-entry-details");
    expect(epicrisis.text()).toContain("Подтверждён");
    expect(details.text()).toContain("Подтверждён");
    expect(details.find(".medical-record-edit").exists()).toBe(false);

    await epicrisis.trigger("click");
    expect(details.attributes()).toHaveProperty("open");
    expect(wrapper.get(".encounter-editor h2").text()).toBe("Сегодняшний приём");

    await wrapper.get('.doctor-history-filters select[aria-label="Статус"]').setValue("unconfirmed");
    expect(wrapper.find(".medical-record-entry-epicrisis").exists()).toBe(false);
    expect(wrapper.find(".medical-record-entry-details").exists()).toBe(false);
    await wrapper.get('.doctor-history-filters select[aria-label="Статус"]').setValue("confirmed");
    expect(wrapper.findAll(".medical-record-entry-epicrisis")).toHaveLength(1);
    expect(wrapper.findAll(".medical-record-entry-details")).toHaveLength(1);
  });

  it("shows the owner pet-profile information plus the owner's full name", async () => {
    directoryMocks.loadDoctorPets.mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0, pageCount: 1 });
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();

    expect(directoryMocks.lookupPetDirectory).toHaveBeenCalledWith("pet-1");
    expect(wrapper.findAll(".owner-profile-fields dt").map((node) => node.text())).toEqual([
      "Вид", "Кличка", "Порода", "Пол", "Возраст", "Окрас", "Номер чипа", "Клеймо",
      "Последняя вакцинация", "Вес", "ФИО владельца",
    ]);
    const profile = wrapper.get(".owner-pet-profile");
    expect(profile.text()).toContain("трёхцветный");
    expect(profile.text()).toContain("643094100000001");
    expect(profile.text()).toContain("ABC-123");
    expect(profile.text()).toContain("15.04.2026 · Рабикан");
    expect(profile.text()).toContain("11.8 кг");
    expect(profile.text()).toContain("Ольга Петровна Владелец");
    expect(profile.text()).toContain("Боится громких звуков");
  });

  it("keeps the encounter editor read-only without write permission", async () => {
    await setMedical(snapshot(["read"]));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    expect(wrapper.find(".encounter-editor").exists()).toBe(false);
    expect(wrapper.text()).toContain("Доступ только для чтения");
  });
});
