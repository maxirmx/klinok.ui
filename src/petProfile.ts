import { PET_SEXES, type PetSex } from "@klinok/protocol";
import type { PetProfile, PetProfileInput } from "./repositories/types";

export const MAX_PET_PHOTO_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_PET_PHOTO_DATA_URL_LENGTH = 200 * 1024;
export const MAX_PET_PHOTO_DIMENSION = 1024;

const petSexes = new Set<string>(PET_SEXES);
const russianCardinalPluralRules = new Intl.PluralRules("ru-RU", { type: "cardinal" });

function optionalText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function finitePositive(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

export function supportedPetSex(value: unknown): PetSex | undefined {
  return typeof value === "string" && petSexes.has(value) ? value as PetSex : undefined;
}

export function normalizePetProfile(value: PetProfile | Record<string, unknown>): PetProfile {
  const latest = value.latestVaccination && typeof value.latestVaccination === "object"
    ? value.latestVaccination as { date?: unknown; name?: unknown }
    : undefined;
  const birthDate = optionalText(value.birthDate);
  const birthYear = Number(value.birthYear);
  const weightKg = finitePositive(value.weightKg);
  const sex = supportedPetSex(value.sex);
  const latestDate = optionalText(latest?.date);
  const latestName = optionalText(latest?.name);

  return {
    petId: String(value.petId ?? ""),
    ownerAccountId: String(value.ownerAccountId ?? ""),
    name: String(value.name ?? ""),
    species: String(value.species ?? ""),
    breed: String(value.breed ?? ""),
    ...(sex ? { sex } : {}),
    ...(optionalText(value.photoDataUrl) ? { photoDataUrl: optionalText(value.photoDataUrl) } : {}),
    ...(birthDate ? { birthDate } : Number.isInteger(birthYear) ? { birthYear } : {}),
    ...(optionalText(value.color) ? { color: optionalText(value.color) } : {}),
    ...(optionalText(value.chip) ? { chip: optionalText(value.chip) } : {}),
    ...(optionalText(value.brandMark) ? { brandMark: optionalText(value.brandMark) } : {}),
    ...(latestDate && latestName ? { latestVaccination: { date: latestDate, name: latestName } } : {}),
    ...(weightKg ? { weightKg } : {}),
    ...(optionalText(value.notes) ? { notes: optionalText(value.notes) } : {}),
    keyVersion: Number(value.keyVersion) || 1,
    tombstoned: Boolean(value.tombstoned),
    updatedAt: String(value.updatedAt ?? new Date(0).toISOString()),
  };
}

export function normalizePetInput(input: PetProfileInput): PetProfileInput {
  const birthDate = optionalText(input.birthDate);
  return {
    name: input.name.trim(),
    species: input.species.trim(),
    breed: input.breed.trim(),
    sex: input.sex,
    ...(optionalText(input.photoDataUrl) ? { photoDataUrl: optionalText(input.photoDataUrl) } : {}),
    ...(birthDate ? { birthDate } : Number.isInteger(input.birthYear) ? { birthYear: input.birthYear } : {}),
    color: input.color.trim(),
    ...(optionalText(input.chip) ? { chip: optionalText(input.chip) } : {}),
    ...(optionalText(input.brandMark) ? { brandMark: optionalText(input.brandMark) } : {}),
    ...(input.latestVaccination?.date && input.latestVaccination.name.trim()
      ? { latestVaccination: { date: input.latestVaccination.date, name: input.latestVaccination.name.trim() } }
      : {}),
    weightKg: input.weightKg,
    ...(optionalText(input.notes) ? { notes: optionalText(input.notes) } : {}),
  };
}

export function petCompletedYears(pet: Pick<PetProfile, "birthDate">, now = new Date()): number | null {
  if (pet.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(pet.birthDate)) {
    const [year, month, day] = pet.birthDate.split("-").map(Number);
    let age = now.getFullYear() - year!;
    if (now.getMonth() + 1 < month! || (now.getMonth() + 1 === month && now.getDate() < day!)) age -= 1;
    return Math.max(0, age);
  }
  return null;
}

export function formatCompletedYears(years: number): string {
  switch (russianCardinalPluralRules.select(years)) {
    case "one":
      return `${years} полный год`;
    case "few":
      return `${years} полных года`;
    default:
      return `${years} полных лет`;
  }
}

export function formatCompletedYearsInterval(youngerYears: number, olderYears: number): string {
  const interval = `${youngerYears}-${olderYears}`;
  switch (russianCardinalPluralRules.select(olderYears)) {
    case "one":
      return `${interval} полный год`;
    case "few":
      return `${interval} полных года`;
    default:
      return `${interval} полных лет`;
  }
}

export function petBirthSummary(pet: Pick<PetProfile, "birthDate" | "birthYear">, now = new Date()): string {
  const completedYears = petCompletedYears(pet, now);
  if (completedYears !== null && pet.birthDate) {
    const [year, month, day] = pet.birthDate.split("-");
    return `${formatCompletedYears(completedYears)} · дата рождения ${day}.${month}.${year}`;
  }
  if (pet.birthYear) {
    const olderYears = Math.max(0, now.getFullYear() - pet.birthYear);
    const youngerYears = Math.max(0, olderYears - 1);
    const age = youngerYears === olderYears
      ? formatCompletedYears(olderYears)
      : formatCompletedYearsInterval(youngerYears, olderYears);
    return `${age} · год рождения ${pet.birthYear}`;
  }
  return "Дата рождения не указана";
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать фотографию."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось открыть фотографию."));
    image.src = source;
  });
}

export async function preparePetPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Выберите фотографию в формате JPEG, PNG или WebP.");
  }
  if (file.size > MAX_PET_PHOTO_SOURCE_BYTES) throw new Error("Исходная фотография должна быть не больше 10 МБ.");
  const image = await loadImage(await readFile(file));
  let scale = Math.min(1, MAX_PET_PHOTO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Обработка фотографий недоступна в этом браузере.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const quality = Math.max(0.48, 0.84 - attempt * 0.06);
    const result = canvas.toDataURL("image/webp", quality);
    if (result.length <= MAX_PET_PHOTO_DATA_URL_LENGTH) return result;
    scale *= 0.82;
  }
  throw new Error("Не удалось уменьшить фотографию до допустимого размера.");
}
