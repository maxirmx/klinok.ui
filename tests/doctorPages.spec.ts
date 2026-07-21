import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DoctorScreen from "../src/screens/DoctorScreen.vue";
import type { MedicalSnapshot, PetProfile } from "../src/repositories/types";

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
    medical: { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], events: [] } as MedicalSnapshot,
  });
  return {
    appState: readonly(state),
    loadDoctorPets: directoryMocks.loadDoctorPets,
    lookupPetDirectory: directoryMocks.lookupPetDirectory,
    logout: vi.fn().mockResolvedValue(undefined),
    requireRepository: () => ({ medical: repositoryMocks }),
    searchDoctorDirectory: directoryMocks.searchDoctorDirectory,
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
  weightKg: 11.8,
  notes: "",
  keyVersion: 1,
  tombstoned: false,
  updatedAt: "2026-07-21T10:00:00.000Z",
};

function snapshot(actions: Array<"read" | "write_unconfirmed" | "delegate"> = ["read", "write_unconfirmed", "delegate"]): MedicalSnapshot {
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
    accessRequests: [], records: [], confirmations: [], events: [],
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
  directoryMocks.searchDoctorDirectory.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, pageCount: 1 });
});

describe("Doctor pages", () => {
  it("renders the paged access directory and dedicated route navigation", async () => {
    const wrapper = await mountAt("/doctor/home", "doctor-home");
    await flushPromises();
    expect(wrapper.findAll(".workspace-sidebar-nav .workspace-nav-item span").map((node) => node.text()))
      .toEqual(["Питомцы", "Запросить доступ"]);
    expect(wrapper.get(".doctor-table").text()).toContain("Ольга Владелец · Собака Буся");
    expect(wrapper.get(".doctor-table").text()).toContain("Чтение, Запись, Делегирование");
    expect(directoryMocks.loadDoctorPets).toHaveBeenCalledWith("", 1, 20, "owner");
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

  it("keeps the encounter editor read-only without write permission", async () => {
    await setMedical(snapshot(["read"]));
    const wrapper = await mountAt("/doctor/pets/pet-1", "doctor-pet-detail");
    await flushPromises();
    expect(wrapper.find(".encounter-editor").exists()).toBe(false);
    expect(wrapper.text()).toContain("Доступ только для чтения");
  });
});
