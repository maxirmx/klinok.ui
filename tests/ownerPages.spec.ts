import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppIcon from "../src/components/AppIcon.vue";
import OwnerScreen from "../src/screens/OwnerScreen.vue";
import type { MedicalRecordDraft, MedicalSnapshot, PetProfile } from "../src/repositories/types";

const repositoryMocks = vi.hoisted(() => ({
  createPet: vi.fn().mockResolvedValue("pet-new"),
  updatePet: vi.fn().mockResolvedValue(undefined),
  deletePet: vi.fn().mockResolvedValue(undefined),
  grantDoctor: vi.fn().mockResolvedValue("grant-new"),
  revokeGrant: vi.fn().mockResolvedValue(undefined),
  disableGrantDelegation: vi.fn().mockResolvedValue(undefined),
  enableGrantDelegation: vi.fn().mockResolvedValue(undefined),
  approveAccessRequest: vi.fn().mockResolvedValue("grant-approved"),
  rejectAccessRequest: vi.fn().mockResolvedValue(undefined),
  confirmRecord: vi.fn().mockResolvedValue(undefined),
}));
const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
const searchDoctorDirectory = vi.hoisted(() => vi.fn());

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const emptyMedical: MedicalSnapshot = {
    pets: [],
    grants: [],
    accessRequests: [],
    records: [],
    confirmations: [],
    confirmedRecordIds: [],
    events: [],
  };
  const state = reactive({
    feedback: null as { kind: "success" | "error"; text: string } | null,
    control: {
      profile: { firstName: "Ольга", patronymic: "", lastName: "Владелец" },
      profiles: [],
      roles: [],
      allRoles: [],
      devices: [],
      pendingQueue: [],
      notifications: [],
      events: [],
    },
    medical: emptyMedical,
  });
  return {
    appState: readonly(state),
    deleteDirectoryPet: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    requireRepository: () => ({ medical: repositoryMocks }),
    searchDoctorDirectory,
    setOwnerMedicalState: (medical: MedicalSnapshot) => { state.medical = medical; },
    syncDirectoryPet: vi.fn().mockResolvedValue(undefined),
  };
});

const pet: PetProfile = {
  petId: "pet-1",
  ownerAccountId: "owner-1",
  name: "Шарик",
  species: "Собака",
  breed: "Бигль",
  sex: "Интактный самец",
  birthDate: "2022-06-17",
  color: "трёхцветный",
  weightKg: 12.4,
  notes: "Любит длительные прогулки",
  keyVersion: 1,
  tombstoned: false,
  updatedAt: "2026-07-17T10:00:00.000Z",
};

const medicalRecord: MedicalRecordDraft = {
  recordId: "record-1",
  petId: pet.petId,
  revision: 1,
  authorAccountId: "doctor-1",
  authorDisplayName: "Анна Врач",
  encounterDate: "2026-07-17",
  title: "Осмотр",
  text: "Контрольный осмотр",
  sections: {
    "what-happened": {
      kind: "what-happened",
      templateVersion: "what-happened-v1",
      value: { selectedIds: ["well.1"], comment: "Без жалоб" },
      authorAccountId: "doctor-1",
      authorDisplayName: "Анна Врач",
      updatedAt: "2026-07-17T10:00:00.000Z",
    },
  },
  createdAt: "2026-07-17T10:00:00.000Z",
  updatedAt: "2026-07-17T10:00:00.000Z",
};

function snapshot(overrides: Partial<MedicalSnapshot> = {}): MedicalSnapshot {
  return {
    pets: [],
    grants: [],
    accessRequests: [],
    records: [],
    confirmations: [],
    confirmedRecordIds: [],
    events: [],
    ...overrides,
  };
}

async function setMedical(medical: MedicalSnapshot) {
  const store = await import("../src/appStore") as typeof import("../src/appStore") & {
    setOwnerMedicalState: (value: MedicalSnapshot) => void;
  };
  store.setOwnerMedicalState(medical);
}

async function mountAt(path: string, scenarioId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/owner/home", component: { template: "<div />" } },
      { path: "/owner/pets/new", component: { template: "<div />" } },
      { path: "/owner/pets/:petId", component: { template: "<div />" } },
      { path: "/owner/pets/:petId/edit", component: { template: "<div />" } },
      { path: "/owner/pets/:petId/access", component: { template: "<div />" } },
      { path: "/profile", component: { template: "<div />" } },
      { path: "/auth/login", component: { template: "<div />" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  return mount(OwnerScreen, {
    props: { role: "owner", scenarioId },
    global: { plugins: [router] },
  });
}

function labelled(wrapper: VueWrapper, text: string) {
  const label = wrapper.findAll("label").find((candidate) => {
    const caption = candidate.find("span");
    return caption.exists() && caption.text() === text;
  });
  if (!label) throw new Error(`Label ${text} not found`);
  return label;
}

beforeEach(async () => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
  repositoryMocks.createPet.mockResolvedValue("pet-new");
  repositoryMocks.grantDoctor.mockResolvedValue("grant-new");
  repositoryMocks.approveAccessRequest.mockResolvedValue("grant-approved");
  searchDoctorDirectory.mockResolvedValue({ items: [], page: 1, pageSize: 50, total: 0, pageCount: 1 });
  await setMedical(snapshot());
});

describe("Owner pages", () => {
  it("renders the pet ribbon and nested route navigation", async () => {
    await setMedical(snapshot({ pets: [pet] }));
    const wrapper = await mountAt("/owner/home", "owner-home");

    expect(wrapper.get(".workspace-topbar h1").text()).toBe("Кабинет владельца");
    expect(wrapper.get(".owner-section-heading h2").text()).toBe("Мои питомцы");
    const addPetLink = wrapper.get('.owner-page-heading a[title="Добавить питомца"]');
    expect(addPetLink.attributes("aria-label")).toBe("Добавить питомца");
    expect(addPetLink.text()).toBe("");
    expect(addPetLink.getComponent(AppIcon).props("name")).toBe("plus");
    expect(wrapper.findAll(".workspace-nav-tree .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Питомцы",
      "Добавить питомца",
      "Шарик",
    ]);
    expect(wrapper.findAll(".workspace-bottom-nav :is(a, button) span").map((node) => node.text())).toEqual([
      "Питомцы",
      "Настройки пользователя",
      "Выйти",
    ]);
    expect(wrapper.get(".owner-pet-card").text()).toContain("Шарик");
    expect(wrapper.get(".owner-pet-card").text()).toContain("Бигль");
    expect(wrapper.get(".owner-pet-card").text()).toMatch(/\d+ полн(?:ый|ых) (?:год|года|лет)/);
    expect(wrapper.text()).not.toContain("Любит длительные прогулки");
  });

  it("uses both record modes and refreshes confirmation status from the verified projection", async () => {
    await setMedical(snapshot({ pets: [pet], records: [medicalRecord] }));
    const wrapper = await mountAt("/owner/pets/pet-1", "owner-pet-detail");

    expect(wrapper.findAll(".medical-record-entry-epicrisis")).toHaveLength(1);
    expect(wrapper.findAll(".medical-record-entry-details")).toHaveLength(1);
    expect(wrapper.get(".medical-record-entry-epicrisis").text()).toContain("Ожидает подтверждения");
    await wrapper.get(".owner-encounter-confirm").trigger("click");
    await flushPromises();
    expect(repositoryMocks.confirmRecord).toHaveBeenCalledWith("pet-1", "record-1", 1);

    await setMedical(snapshot({
      pets: [pet],
      records: [medicalRecord],
      confirmedRecordIds: [medicalRecord.recordId],
    }));
    await flushPromises();
    expect(wrapper.get(".medical-record-entry-epicrisis").text()).toContain("Подтверждён");
    expect(wrapper.get(".medical-record-entry-details").text()).toContain("Подтверждён");
    expect(wrapper.find(".owner-encounter-confirm").exists()).toBe(false);
  });

  it("offers exactly four sex values and creates a complete profile with notes", async () => {
    const wrapper = await mountAt("/owner/pets/new", "owner-pet-create");
    expect(wrapper.get(".workspace-topbar h1").text()).toBe("Кабинет владельца");
    expect(wrapper.get(".owner-section-heading h2").text()).toBe("Добавить питомца");
    expect(wrapper.findAll<HTMLSelectElement>('select option').slice(1).map((option) => option.text())).toEqual([
      "Интактный самец",
      "Интактная самка",
      "Кастрированный самец",
      "Кастрированная самка",
    ]);

    await labelled(wrapper, "Кличка").get("input").setValue("Боня");
    await labelled(wrapper, "Вид").get("input").setValue("Кошка");
    await labelled(wrapper, "Порода").get("input").setValue("Сибирская");
    await labelled(wrapper, "Пол").get("select").setValue("Кастрированная самка");
    await wrapper.get('input[aria-label="Точная дата рождения"]').setValue("2021-05-10");
    await labelled(wrapper, "Окрас").get("input").setValue("серый");
    await labelled(wrapper, "Вес, кг").get("input").setValue("4.8");
    await labelled(wrapper, "Заметки").get("textarea").setValue("Не любит переноску");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(repositoryMocks.createPet).toHaveBeenCalledWith(expect.objectContaining({
      name: "Боня",
      species: "Кошка",
      sex: "Кастрированная самка",
      birthDate: "2021-05-10",
      color: "серый",
      weightKg: 4.8,
      notes: "Не любит переноску",
    }));
  });

  it("shows supported-field validation and photo errors in the form", async () => {
    const wrapper = await mountAt("/owner/pets/new", "owner-pet-create");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get('[role="alert"]').text()).toContain("Заполните кличку, вид, породу и окрас.");
    expect(repositoryMocks.createPet).not.toHaveBeenCalled();

    const photo = wrapper.get<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(photo.element, "files", {
      configurable: true,
      value: [new File(["gif"], "pet.gif", { type: "image/gif" })],
    });
    await photo.trigger("change");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("JPEG, PNG или WebP");
  });

  it("treats a legacy sex as empty and drops unsupported fields on edit", async () => {
    const legacyPet = {
      ...pet,
      sex: "Кобель",
      color: undefined,
      weightKg: undefined,
      photoDataUrl: "data:image/png;base64,AA==",
      legacyOptionalField: "drop-me",
    } as unknown as PetProfile;
    await setMedical(snapshot({ pets: [legacyPet] }));
    const wrapper = await mountAt("/owner/pets/pet-1/edit", "owner-pet-edit");

    expect(wrapper.get(".workspace-topbar h1").text()).toBe("Кабинет владельца");
    expect(wrapper.get(".owner-section-heading h2").text()).toBe("Редактировать: Шарик");
    expect(wrapper.get<HTMLSelectElement>("select").element.value).toBe("");
    const birthModeRadios = wrapper.findAll<HTMLInputElement>('.owner-birth-selector input[type="radio"]');
    expect(birthModeRadios).toHaveLength(2);
    expect(birthModeRadios[0]!.element.checked).toBe(true);
    expect(wrapper.get(".owner-birth-row").find('input[type="date"]').exists()).toBe(true);
    expect(wrapper.find(".owner-birth-row button").exists()).toBe(false);
    expect(wrapper.get(".owner-photo-actions").findAll("[title]").map((node) => node.attributes("title")))
      .toEqual(["Выбрать фотографию", "Удалить фотографию"]);
    expect(wrapper.get('.owner-photo-actions [title="Выбрать фотографию"]').getComponent(AppIcon).props("name")).toBe("edit");
    expect(wrapper.get('.owner-photo-actions [title="Удалить фотографию"]').getComponent(AppIcon).props("name")).toBe("trash");
    const formActions = wrapper.get(".owner-pet-form-actions");
    expect(formActions.get('button[title="Сохранить изменения"]').getComponent(AppIcon).props("name")).toBe("check");
    expect(formActions.get('a[title="Отмена"]').getComponent(AppIcon).props("name")).toBe("close");
    expect(formActions.get('a[title="Отмена"]').attributes("href")).toBe("/owner/pets/pet-1");
    await labelled(wrapper, "Пол").get("select").setValue("Интактный самец");
    await labelled(wrapper, "Окрас").get("input").setValue("трёхцветный");
    await labelled(wrapper, "Вес, кг").get("input").setValue("12.4");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    const saved = repositoryMocks.updatePet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(saved.sex).toBe("Интактный самец");
    expect(saved).not.toHaveProperty("legacyOptionalField");
  });

  it("moves all current access states into one doctor table", async () => {
    await setMedical(snapshot({
      pets: [pet],
      accessRequests: [{
        requestId: "request-1",
        petId: pet.petId,
        ownerAccountId: pet.ownerAccountId,
        requesterAccountId: "doctor-1",
        requesterDisplayName: "Анна Врач",
        status: "pending",
        requestedAt: "2026-07-17T10:00:00.000Z",
      }],
      grants: [
        {
          grantId: "grant-1",
          requestId: "request-approved",
          petId: pet.petId,
          grantorAccountId: pet.ownerAccountId,
          granteeAccountId: "doctor-2",
          granteeDisplayName: "Борис Врач",
          actions: ["read", "write_unconfirmed", "delegate"],
          petKeyVersion: 1,
          status: "active",
          createdAt: "2026-07-17T10:00:00.000Z",
        },
        {
          grantId: "grant-2",
          petId: pet.petId,
          grantorAccountId: pet.ownerAccountId,
          granteeAccountId: "doctor-3",
          granteeDisplayName: "Виктор Врач",
          actions: ["read"],
          petKeyVersion: 1,
          status: "revoked",
          createdAt: "2026-07-16T10:00:00.000Z",
          revokedAt: "2026-07-17T10:00:00.000Z",
        },
        {
          grantId: "grant-old-doctor-2",
          petId: pet.petId,
          grantorAccountId: pet.ownerAccountId,
          granteeAccountId: "doctor-2",
          granteeDisplayName: "Борис Врач",
          actions: ["read"],
          petKeyVersion: 1,
          status: "revoked",
          createdAt: "2026-07-15T10:00:00.000Z",
          revokedAt: "2026-07-16T10:00:00.000Z",
        },
        {
          grantId: "grant-3",
          petId: pet.petId,
          grantorAccountId: pet.ownerAccountId,
          granteeAccountId: "doctor-4",
          granteeDisplayName: "Галина Врач",
          actions: ["read", "write_unconfirmed"],
          petKeyVersion: 1,
          status: "active",
          createdAt: "2026-07-17T11:00:00.000Z",
        },
      ],
      records: Array.from({ length: 11 }, (_, index) => {
        const recordNumber = index + 1;
        const day = String(recordNumber).padStart(2, "0");
        const timestamp = `2026-07-${day}T10:00:00.000Z`;
        return {
          recordId: `record-${recordNumber}`,
          petId: pet.petId,
          revision: 1,
          authorAccountId: "doctor-2",
          authorDisplayName: "Борис Врач",
          encounterDate: `2026-07-${day}`,
          title: "Осмотр",
          text: "Состояние стабильное",
          sections: {
            outcome: {
              kind: "outcome" as const,
              templateVersion: "free-text-v0" as const,
              value: { text: "Состояние стабильное" },
              authorAccountId: "doctor-2",
              authorDisplayName: "Борис Врач",
              updatedAt: timestamp,
            },
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      }),
    }));
    const detail = await mountAt("/owner/pets/pet-1", "owner-pet-detail");

    expect(detail.get(".workspace-topbar h1").text()).toBe("Кабинет владельца");
    expect(detail.get(".owner-page-heading h2").text()).toBe("Шарик");
    expect(detail.text()).toContain("Любит длительные прогулки");
    expect(detail.text()).toContain("Состояние стабильное");
    expect(detail.text()).not.toContain("Анна Врач");
    expect(detail.find(".owner-access-panel").exists()).toBe(false);
    expect(detail.find(".owner-pet-profile-details").exists()).toBe(false);
    expect(detail.findAll(".medical-record-entry-epicrisis")).toHaveLength(10);
    expect(detail.findAll("details.owner-encounter-record")).toHaveLength(10);
    await detail.get(".medical-record-entry-epicrisis").trigger("click");
    const encounterRecord = detail.get("details.owner-encounter-record");
    expect(encounterRecord.attributes()).toHaveProperty("open");
    expect(encounterRecord.get("summary").text()).toContain("Борис Врач");
    expect(encounterRecord.text()).not.toContain("doctor-2");
    expect(encounterRecord.get(".encounter-history-section").text()).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    const medicalPagination = detail.get(".owner-medical-pagination");
    expect(medicalPagination.text()).toContain("Показаны 1–10 из 11");
    await medicalPagination.get('button[title="Следующая страница"]').trigger("click");
    expect(detail.findAll(".medical-record-entry-epicrisis")).toHaveLength(1);
    expect(detail.findAll("details.owner-encounter-record")).toHaveLength(1);
    expect(medicalPagination.text()).toContain("Показаны 11–11 из 11");

    const wrapper = await mountAt("/owner/pets/pet-1/access", "owner-pet-access");
    expect(wrapper.get(".workspace-topbar h1").text()).toBe("Кабинет владельца");
    expect(wrapper.get(".owner-page-heading h2").text()).toBe("Доступ врачей");
    expect(wrapper.get(".owner-pet-profile-details").text()).toContain("Шарик");
    expect(wrapper.get(".owner-pet-id").text()).toBe("pet-1");
    expect(wrapper.get('.owner-profile-actions a[title="Назад к информации о питомце"]').attributes("href"))
    expect(wrapper.findAll(".owner-access-table th").map((header) => header.text())).toEqual([
      "Действия", "ФИО врача", "Доступ", "Делегирование",
    ]);
    expect(wrapper.find('.owner-page-heading button[title="Предоставить доступ"]').exists()).toBe(false);
    expect(wrapper.get('.owner-access-actions-header button[title="Предоставить доступ"]')
      .getComponent(AppIcon).props("name")).toBe("plus");
    expect(wrapper.get(".owner-access-panel .app-paginator").text()).toContain("Показаны 1–4 из 4");
    const rows = wrapper.findAll(".owner-access-table tbody tr");
    expect(rows).toHaveLength(4);
    const requestedRow = rows.find((row) => row.text().includes("Анна Врач"))!;
    const grantedRow = rows.find((row) => row.text().includes("Борис Врач"))!;
    const grantedWithoutDelegationRow = rows.find((row) => row.text().includes("Галина Врач"))!;
    const revokedRow = rows.find((row) => row.text().includes("Виктор Врач"))!;
    expect(requestedRow.text()).toContain("doctor-1");
    expect(requestedRow.text()).toContain("Запрошен");
    expect(requestedRow.get('td[data-label="Делегирование"]').text()).toBe("");
    expect(grantedRow.text()).toContain("Предоставлен");
    expect(grantedRow.get('td[data-label="Делегирование"]').text()).toBe("Да");
    expect(grantedRow.get('button[title="Отключить делегирование"]').classes()).toContain("danger-outline");
    expect(grantedRow.get('button[title="Отключить делегирование"]').getComponent(AppIcon).props("name")).toBe("share");
    expect(grantedWithoutDelegationRow.text()).toContain("Предоставлен");
    expect(grantedWithoutDelegationRow.get('td[data-label="Делегирование"]').text()).toBe("Нет");
    expect(grantedWithoutDelegationRow.get('button[title="Разрешить делегирование"]')
      .getComponent(AppIcon).props("name")).toBe("share");
    expect(grantedWithoutDelegationRow.findAll("button").map((button) => button.attributes("title")))
      .toEqual(["Разрешить делегирование", "Отозвать доступ"]);
    expect(revokedRow.text()).toContain("Отозван");
    expect(revokedRow.get('td[data-label="Делегирование"]').text()).toBe("");

    await requestedRow.get('button[title="Предоставить доступ"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.approveAccessRequest).toHaveBeenCalledWith("request-1");

    await grantedRow.get('button[title="Отключить делегирование"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.disableGrantDelegation).toHaveBeenCalledWith("grant-1");

    await grantedWithoutDelegationRow.get('button[title="Разрешить делегирование"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.enableGrantDelegation).toHaveBeenCalledWith("grant-3");

    await revokedRow.get('button[title="Предоставить доступ повторно"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.grantDoctor).toHaveBeenCalledWith(
      "pet-1",
      "doctor-3",
      ["read", "write_unconfirmed"],
      { granteeDisplayName: "Виктор Врач" },
    );
  });

  it("paginates doctor access rows with the shared paginator", async () => {
    await setMedical(snapshot({
      pets: [pet],
      grants: Array.from({ length: 11 }, (_, index) => ({
        grantId: `grant-${index}`,
        petId: pet.petId,
        grantorAccountId: pet.ownerAccountId,
        granteeAccountId: `doctor-${index}`,
        granteeDisplayName: `Врач ${String(index).padStart(2, "0")}`,
        actions: ["read" as const],
        petKeyVersion: 1,
        status: "active" as const,
        createdAt: "2026-07-17T10:00:00.000Z",
      })),
    }));
    const wrapper = await mountAt("/owner/pets/pet-1/access", "owner-pet-access");

    expect(wrapper.findAll(".owner-access-table tbody tr")).toHaveLength(10);
    const paginator = wrapper.get(".owner-access-panel .app-paginator");
    expect(paginator.text()).toContain("Показаны 1–10 из 11");
    await paginator.get('button[title="Следующая страница"]').trigger("click");
    expect(wrapper.findAll(".owner-access-table tbody tr")).toHaveLength(1);
    expect(paginator.text()).toContain("Показаны 11–11 из 11");
  });

  it("finds a doctor by partial ФИО and grants access from an accessible modal", async () => {
    await setMedical(snapshot({ pets: [pet] }));
    searchDoctorDirectory.mockResolvedValue({
      items: [{
        accountId: "doctor-4",
        firstName: "Мария",
        lastName: "Ветеринар",
        displayName: "Мария Ветеринар",
        updatedAt: "2026-07-21T10:00:00.000Z",
      }],
      page: 1, pageSize: 50, total: 1, pageCount: 1,
    });
    const wrapper = await mountAt("/owner/pets/pet-1/access", "owner-pet-access");

    const opener = wrapper.get('.owner-access-actions-header button[title="Предоставить доступ"]');
    await opener.trigger("click");
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes("aria-modal")).toBe("true");
    const searchButton = dialog.get('button[title="Найти врача"]');
    expect(searchButton.attributes("aria-label")).toBe("Найти врача");
    expect(searchButton.getComponent(AppIcon).props("name")).toBe("search");

    await labelled(wrapper, "ФИО врача, его часть или полный ID").get("input").setValue("Ветер");
    await dialog.get("form").trigger("submit");
    await flushPromises();
    expect(searchDoctorDirectory).toHaveBeenCalledWith("Ветер", 1, 50);
    expect(dialog.get(".list-row").text()).toContain("Мария Ветеринар");
    const selectButton = dialog.get('.list-row button[title="Выбрать врача"]');
    expect(selectButton.getComponent(AppIcon).props("name")).toBe("check");
    await selectButton.trigger("click");
    expect(dialog.get('button[title="Отмена"]').getComponent(AppIcon).props("name")).toBe("close");
    expect(dialog.get('button[title="Предоставить доступ"]').getComponent(AppIcon).props("name")).toBe("check");
    await labelled(wrapper, "Разрешить врачу делегирование").get("input").setValue(true);
    await dialog.findAll("form")[1]!.trigger("submit");
    await flushPromises();

    expect(repositoryMocks.grantDoctor).toHaveBeenCalledWith(
      "pet-1",
      "doctor-4",
      ["read", "write_unconfirmed", "delegate"],
      { granteeDisplayName: "Мария Ветеринар" },
    );
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toContain("Доступ предоставлен.");
  });

  it("renders a missing-pet state and confirms deletion before returning home", async () => {
    const missing = await mountAt("/owner/pets/missing", "owner-pet-detail");
    expect(missing.text()).toContain("Питомец не найден");
    expect(missing.get('.owner-empty-state a[href="/owner/home"]').text()).toBe("На главную страницу");

    await setMedical(snapshot({ pets: [pet] }));
    const detail = await mountAt("/owner/pets/pet-1", "owner-pet-detail");
    const ageField = detail.findAll(".owner-profile-fields > div")
      .find((field) => field.get("dt").text() === "Возраст")!;
    expect(ageField.get("dd").text()).toMatch(/\d+ полн(?:ый|ых) (?:год|года|лет) · дата рождения 17\.06\.2022/);
    expect(detail.findAll(".owner-profile-fields dt").map((node) => node.text())).not.toContain("Дата рождения");
    expect(detail.findAll(".owner-profile-fields dt").map((node) => node.text())).not.toContain("ID питомца");

    const actions = detail.get(".owner-profile-actions");
    const editLink = actions.get('[title="Редактировать"]');
    const accessLink = actions.get('[title="Доступ врачей"]');
    const copyLinkButton = actions.get('button[title="Копировать ссылку"]');
    const deleteButton = actions.get('button[title="Удалить"]');
    expect(editLink.text()).toBe("");
    expect(accessLink.text()).toBe("");
    expect(copyLinkButton.text()).toBe("");
    expect(deleteButton.text()).toBe("");
    expect(editLink.getComponent(AppIcon).props("name")).toBe("edit");
    expect(accessLink.getComponent(AppIcon).props("name")).toBe("user");
    expect(accessLink.attributes("href")).toBe("/owner/pets/pet-1/access");
    expect(copyLinkButton.getComponent(AppIcon).props("name")).toBe("link");
    expect(deleteButton.getComponent(AppIcon).props("name")).toBe("trash");

    await copyLinkButton.trigger("click");
    await flushPromises();
    expect(clipboardWriteText).toHaveBeenCalledWith(new URL("/owner/pets/pet-1", window.location.origin).href);

    await deleteButton.trigger("click");
    expect(detail.get('[role="alertdialog"]').text()).toContain("Удалить профиль Шарик?");
    await detail.get('[role="alertdialog"]').findAll("button")
      .find((button) => button.text() === "Удалить питомца")!
      .trigger("click");
    await flushPromises();

    expect(repositoryMocks.deletePet).toHaveBeenCalledWith("pet-1");
    expect(detail.vm.$route.path).toBe("/owner/home");
  });

  it("shows an age interval and birth year in one age field when no exact birth date is stored", async () => {
    await setMedical(snapshot({ pets: [{ ...pet, birthDate: undefined, birthYear: 2022 }] }));
    const detail = await mountAt("/owner/pets/pet-1", "owner-pet-detail");
    const labels = detail.findAll(".owner-profile-fields dt").map((node) => node.text());

    expect(labels).toContain("Возраст");
    expect(labels).not.toContain("Год рождения");
    expect(labels).not.toContain("Дата рождения");
    expect(detail.get(".owner-profile-fields").text())
      .toMatch(/\d+-\d+ полн(?:ый|ых) (?:год|года|лет) · год рождения 2022/);
  });
});
