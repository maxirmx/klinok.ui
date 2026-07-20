import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppIcon from "../src/components/AppIcon.vue";
import OwnerScreen from "../src/screens/OwnerScreen.vue";
import type { MedicalSnapshot, PetProfile } from "../src/repositories/types";

const repositoryMocks = vi.hoisted(() => ({
  createPet: vi.fn().mockResolvedValue("pet-new"),
  updatePet: vi.fn().mockResolvedValue(undefined),
  deletePet: vi.fn().mockResolvedValue(undefined),
  grantDoctor: vi.fn().mockResolvedValue("grant-new"),
  revokeGrant: vi.fn().mockResolvedValue(undefined),
  disableGrantDelegation: vi.fn().mockResolvedValue(undefined),
  approveAccessRequest: vi.fn().mockResolvedValue("grant-approved"),
  rejectAccessRequest: vi.fn().mockResolvedValue(undefined),
  confirmRecord: vi.fn().mockResolvedValue(undefined),
}));
const clipboardWriteText = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/appStore", async () => {
  const { reactive, readonly } = await import("vue");
  const emptyMedical: MedicalSnapshot = {
    pets: [],
    grants: [],
    accessRequests: [],
    records: [],
    confirmations: [],
    events: [],
  };
  const state = reactive({
    error: "",
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
    logout: vi.fn().mockResolvedValue(undefined),
    requireRepository: () => ({ medical: repositoryMocks }),
    setOwnerMedicalState: (medical: MedicalSnapshot) => { state.medical = medical; },
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

function snapshot(overrides: Partial<MedicalSnapshot> = {}): MedicalSnapshot {
  return {
    pets: [],
    grants: [],
    accessRequests: [],
    records: [],
    confirmations: [],
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
  await setMedical(snapshot());
});

describe("Owner pages", () => {
  it("renders the pet ribbon and nested route navigation", async () => {
    await setMedical(snapshot({ pets: [pet] }));
    const wrapper = await mountAt("/owner/home", "owner-home");

    expect(wrapper.findAll(".workspace-nav-tree .workspace-nav-item span").map((node) => node.text())).toEqual([
      "Главная страница",
      "Добавить питомца",
      "Шарик",
    ]);
    expect(wrapper.findAll(".workspace-bottom-nav :is(a, button) span").map((node) => node.text())).toEqual([
      "Главная страница",
      "Настройки пользователя",
      "Выйти",
    ]);
    expect(wrapper.get(".owner-pet-card").text()).toContain("Шарик");
    expect(wrapper.get(".owner-pet-card").text()).toContain("Бигль");
    expect(wrapper.get(".owner-pet-card").text()).toMatch(/\d+ полн(?:ый|ых) (?:год|года|лет)/);
    expect(wrapper.text()).not.toContain("Любит длительные прогулки");
  });

  it("offers exactly four sex values and creates a complete profile with notes", async () => {
    const wrapper = await mountAt("/owner/pets/new", "owner-pet-create");
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
      legacyOptionalField: "drop-me",
    } as unknown as PetProfile;
    await setMedical(snapshot({ pets: [legacyPet] }));
    const wrapper = await mountAt("/owner/pets/pet-1/edit", "owner-pet-edit");

    expect(wrapper.get<HTMLSelectElement>("select").element.value).toBe("");
    expect(wrapper.get(".owner-birth-row").find(".segmented").exists()).toBe(true);
    expect(wrapper.get(".owner-birth-row").find('input[type="date"]').exists()).toBe(true);
    expect(wrapper.find(".owner-birth-row label").exists()).toBe(false);
    expect(wrapper.find(".owner-birth-row span").exists()).toBe(false);
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
      ],
      records: [{
        recordId: "record-1",
        petId: pet.petId,
        revision: 1,
        authorAccountId: "doctor-2",
        title: "Осмотр",
        text: "Состояние стабильное",
        createdAt: "2026-07-17T10:00:00.000Z",
        updatedAt: "2026-07-17T10:00:00.000Z",
      }],
    }));
    const detail = await mountAt("/owner/pets/pet-1", "owner-pet-detail");

    expect(detail.text()).toContain("Любит длительные прогулки");
    expect(detail.text()).toContain("Состояние стабильное");
    expect(detail.text()).not.toContain("Анна Врач");
    expect(detail.find(".owner-access-panel").exists()).toBe(false);
    expect(detail.find(".owner-pet-profile-details").exists()).toBe(false);

    const wrapper = await mountAt("/owner/pets/pet-1/access", "owner-pet-access");
    expect(wrapper.get(".workspace-topbar h1").text()).toBe("Доступ врачей");
    expect(wrapper.get(".owner-pet-profile-details").text()).toContain("Шарик");
    expect(wrapper.get('.owner-profile-actions a[title="Назад к информации о питомце"]').attributes("href"))
      .toBe("/owner/pets/pet-1");
    expect(wrapper.findAll(".owner-access-table th").map((header) => header.text())).toEqual([
      "Действия", "Фио врача", "Доступ", "Делегирование",
    ]);

    const rows = wrapper.findAll(".owner-access-table tbody tr");
    expect(rows).toHaveLength(3);
    const requestedRow = rows.find((row) => row.text().includes("Анна Врач"))!;
    const grantedRow = rows.find((row) => row.text().includes("Борис Врач"))!;
    const revokedRow = rows.find((row) => row.text().includes("Виктор Врач"))!;
    expect(requestedRow.text()).toContain("doctor-1");
    expect(requestedRow.text()).toContain("Запрошен");
    expect(requestedRow.get('td[data-label="Делегирование"]').text()).toBe("");
    expect(grantedRow.text()).toContain("Предоставлен");
    expect(grantedRow.get('td[data-label="Делегирование"]').text()).toBe("Да");
    expect(revokedRow.text()).toContain("Отозван");
    expect(revokedRow.get('td[data-label="Делегирование"]').text()).toBe("");

    await requestedRow.get('button[title="Предоставить доступ"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.approveAccessRequest).toHaveBeenCalledWith("request-1");

    await grantedRow.get('button[title="Отключить делегирование"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.disableGrantDelegation).toHaveBeenCalledWith("grant-1");

    await revokedRow.get('button[title="Предоставить доступ повторно"]').trigger("click");
    await flushPromises();
    expect(repositoryMocks.grantDoctor).toHaveBeenCalledWith(
      "pet-1",
      "doctor-3",
      ["read", "write_unconfirmed"],
      { granteeDisplayName: "Виктор Врач" },
    );
  });

  it("grants access with a persisted doctor name from an accessible modal", async () => {
    await setMedical(snapshot({ pets: [pet] }));
    const wrapper = await mountAt("/owner/pets/pet-1/access", "owner-pet-access");

    const opener = wrapper.get('.owner-access-heading button[title="Предоставить доступ"]');
    await opener.trigger("click");
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes("aria-modal")).toBe("true");

    await labelled(wrapper, "ФИО врача").get("input").setValue("Мария Ветеринар");
    await labelled(wrapper, "Идентификатор аккаунта врача").get("input").setValue("doctor-4");
    await labelled(wrapper, "Разрешить врачу делегирование").get("input").setValue(true);
    await dialog.get("form").trigger("submit");
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
