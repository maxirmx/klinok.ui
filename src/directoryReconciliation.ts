import type { DirectoryPetDto, DirectoryProfileDto } from "@klinok/protocol";

export type DirectoryProfileInput = Pick<DirectoryProfileDto, "firstName" | "lastName" | "patronymic">;
export type DirectoryPetInput = Pick<DirectoryPetDto, "petId" | "species" | "name">;

export type DirectoryReconciliationFailure =
  | { kind: "profile"; reason: unknown }
  | { kind: "pet"; petId: string; reason: unknown };

interface DirectoryReconciliationOptions {
  profile: DirectoryProfileInput | null;
  pets: readonly DirectoryPetInput[];
  syncProfile: (profile: DirectoryProfileInput) => Promise<unknown>;
  syncPet: (pet: DirectoryPetInput) => Promise<unknown>;
  onFailure: (failure: DirectoryReconciliationFailure) => void;
  shouldContinue?: () => boolean;
  concurrency?: number;
}

const DEFAULT_CONCURRENCY = 3;

export async function reconcileDirectorySnapshot({
  profile,
  pets,
  syncProfile,
  syncPet,
  onFailure,
  shouldContinue = () => true,
  concurrency = DEFAULT_CONCURRENCY,
}: DirectoryReconciliationOptions): Promise<void> {
  if (!profile || !shouldContinue()) return;

  try {
    await syncProfile(profile);
  } catch (reason) {
    onFailure({ kind: "profile", reason });
    return;
  }

  if (!shouldContinue()) return;
  let nextPetIndex = 0;
  const workerCount = Math.min(pets.length, Math.max(1, Math.floor(concurrency)));
  const worker = async (): Promise<void> => {
    while (shouldContinue()) {
      const pet = pets[nextPetIndex];
      nextPetIndex += 1;
      if (!pet) return;
      try {
        await syncPet(pet);
      } catch (reason) {
        onFailure({ kind: "pet", petId: pet.petId, reason });
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
