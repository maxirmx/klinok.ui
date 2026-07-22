import { describe, expect, it, vi } from "vitest";
import { reconcileDirectorySnapshot, type DirectoryPetInput } from "../src/directoryReconciliation";

const profile = { firstName: "Иван", lastName: "Иванов" };
const pets: DirectoryPetInput[] = [
  { petId: "pet-1", species: "Собака", name: "Бобик" },
  { petId: "pet-2", species: "Кошка", name: "Мурка" },
  { petId: "pet-3", species: "Собака", name: "Шарик" },
];

describe("directory snapshot reconciliation", () => {
  it("waits for the profile before starting pet synchronization", async () => {
    let resolveProfile!: () => void;
    const syncProfile = vi.fn(() => new Promise<void>((resolve) => { resolveProfile = resolve; }));
    const syncPet = vi.fn().mockResolvedValue(undefined);

    const reconciliation = reconcileDirectorySnapshot({
      profile,
      pets,
      syncProfile,
      syncPet,
      onFailure: vi.fn(),
    });

    expect(syncProfile).toHaveBeenCalledWith(profile);
    expect(syncPet).not.toHaveBeenCalled();
    resolveProfile();
    await reconciliation;
    expect(syncPet).toHaveBeenCalledTimes(3);
  });

  it("stops before pets when profile synchronization fails", async () => {
    const reason = new Error("profile unavailable");
    const syncPet = vi.fn().mockResolvedValue(undefined);
    const onFailure = vi.fn();

    await reconcileDirectorySnapshot({
      profile,
      pets,
      syncProfile: vi.fn().mockRejectedValue(reason),
      syncPet,
      onFailure,
    });

    expect(syncPet).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith({ kind: "profile", reason });
  });

  it("isolates pet failures and continues reconciling the remaining pets", async () => {
    const reason = new Error("pet unavailable");
    const syncPet = vi.fn(async (pet: DirectoryPetInput) => {
      if (pet.petId === "pet-2") throw reason;
    });
    const onFailure = vi.fn();

    await reconcileDirectorySnapshot({
      profile,
      pets,
      syncProfile: vi.fn().mockResolvedValue(undefined),
      syncPet,
      onFailure,
      concurrency: 2,
    });

    expect(syncPet).toHaveBeenCalledTimes(3);
    expect(onFailure).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledWith({ kind: "pet", petId: "pet-2", reason });
  });

  it("stops queued work when the originating repository is no longer current", async () => {
    let current = true;
    const syncPet = vi.fn(async () => { current = false; });

    await reconcileDirectorySnapshot({
      profile,
      pets,
      syncProfile: vi.fn().mockResolvedValue(undefined),
      syncPet,
      onFailure: vi.fn(),
      shouldContinue: () => current,
      concurrency: 1,
    });

    expect(syncPet).toHaveBeenCalledOnce();
  });
});
