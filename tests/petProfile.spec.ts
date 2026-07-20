import { describe, expect, it } from "vitest";
import {
  formatCompletedYears,
  formatCompletedYearsInterval,
  normalizePetProfile,
  petBirthSummary,
  petCompletedYears,
  preparePetPhoto,
} from "../src/petProfile";

describe("pet profile normalization", () => {
  it("keeps only supported fields and clears legacy sex values", () => {
    const normalized = normalizePetProfile({
      petId: "pet-1",
      ownerAccountId: "owner-1",
      name: "Шарик",
      species: "Собака",
      breed: "Бигль",
      sex: "Кобель",
      birthYear: 2022,
      color: "трёхцветный",
      weightKg: 12.4,
      notes: "Заметка",
      legacyOptionalField: "drop-me",
      keyVersion: 1,
      tombstoned: false,
      updatedAt: "2026-07-17T10:00:00.000Z",
    });

    expect(normalized.sex).toBeUndefined();
    expect(normalized.notes).toBe("Заметка");
    expect(normalized).not.toHaveProperty("legacyOptionalField");
  });

  it("renders exact completed age or a year-only age interval", () => {
    expect(petCompletedYears({ birthDate: "2022-07-18" }, new Date("2026-07-17T12:00:00Z"))).toBe(3);
    expect(petCompletedYears({}, new Date("2026-07-17T12:00:00Z"))).toBeNull();
    expect(petBirthSummary({ birthDate: "2022-07-18" }, new Date("2026-07-17T12:00:00Z")))
      .toBe("3 полных года · дата рождения 18.07.2022");
    expect(petBirthSummary({ birthYear: 2022 }, new Date("2026-07-17T12:00:00Z")))
      .toBe("3-4 полных года · год рождения 2022");
    expect(petBirthSummary({ birthYear: 2021 }, new Date("2026-07-17T12:00:00Z")))
      .toBe("4-5 полных лет · год рождения 2021");
    expect(petBirthSummary({ birthYear: 2025 }, new Date("2026-07-17T12:00:00Z")))
      .toBe("0-1 полный год · год рождения 2025");
  });

  it.each([
    [0, "0 полных лет"],
    [1, "1 полный год"],
    [2, "2 полных года"],
    [4, "4 полных года"],
    [5, "5 полных лет"],
    [11, "11 полных лет"],
    [14, "14 полных лет"],
    [21, "21 полный год"],
    [22, "22 полных года"],
    [25, "25 полных лет"],
  ])("formats %i completed years with Russian plural rules", (years, expected) => {
    expect(formatCompletedYears(years)).toBe(expected);
  });

  it.each([
    [0, 1, "0-1 полный год"],
    [1, 2, "1-2 полных года"],
    [2, 3, "2-3 полных года"],
    [3, 4, "3-4 полных года"],
    [4, 5, "4-5 полных лет"],
    [10, 11, "10-11 полных лет"],
    [20, 21, "20-21 полный год"],
  ])("uses the upper value to pluralize a %i-%i age interval", (youngerYears, olderYears, expected) => {
    expect(formatCompletedYearsInterval(youngerYears, olderYears)).toBe(expected);
  });

  it("rejects unsupported photo formats before decoding", async () => {
    const file = new File(["not-an-image"], "pet.gif", { type: "image/gif" });
    await expect(preparePetPhoto(file)).rejects.toThrow("JPEG, PNG или WebP");
  });
});
