// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { createSeedCollections } from "./seeds";
import { normalizeDrugGroupIds } from "./templates";
import type { ComplaintRecord, DappCollections, DrugGroup, DrugRecord, DrugTemplate } from "./types";

const STORAGE_KEY = "klinok.dapp.collections.v1";

export type StorageErrorHandler = (message: string) => void;

export interface DappRepository {
  listComplaintTemplates(): DappCollections["complaintTemplates"];
  listComplaintRecords(): ComplaintRecord[];
  saveComplaintRecord(record: ComplaintRecord): void;
  listDrugGroups(): DappCollections["drugGroups"];
  listDrugTemplates(): DappCollections["drugTemplates"];
  listDrugRecords(): DrugRecord[];
  saveDrugRecord(record: DrugRecord): void;
  deleteDrugRecord(id: string): boolean;
  reset(collections?: DappCollections): void;
}

function cloneCollections(collections: DappCollections): DappCollections {
  return JSON.parse(JSON.stringify(collections)) as DappCollections;
}

function cloneList<T>(items: T[]): T[] {
  return JSON.parse(JSON.stringify(items)) as T[];
}

function normalizeList<T>(items: unknown, fallback: T[]) {
  return Array.isArray(items) ? cloneList(items as T[]) : cloneList(fallback);
}

function normalizeDrugGroups(items: unknown, fallback: DrugGroup[]) {
  if (!Array.isArray(items)) return cloneList(fallback);
  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const group = item as Partial<DrugGroup>;
      if (typeof group.id !== "string" || typeof group.title !== "string") return null;
      return {
        id: group.id,
        title: group.title,
        sortOrder: typeof group.sortOrder === "number" ? group.sortOrder : index,
        ...(typeof group.description === "string" && group.description.trim() ? { description: group.description } : {}),
      };
    })
    .filter((item): item is DrugGroup => Boolean(item));
}

function normalizeDrugRecords(items: unknown, fallback: DrugRecord[]) {
  const records = Array.isArray(items) ? items : fallback;
  return records.map((item) => {
    const record = item as DrugRecord;
    return {
      ...record,
      groupIds: normalizeDrugGroupIds(record.groupIds),
    };
  });
}

function normalizeDrugTemplates(items: unknown, fallback: DrugTemplate[]) {
  if (!Array.isArray(items)) return cloneList(fallback);
  const seedTemplateById = new Map(fallback.map((template) => [template.id, template]));
  return items.map((item) => {
    const template = item as DrugTemplate;
    const seedTemplate = seedTemplateById.get(template.id);
    if (!seedTemplate) return template;
    const seedFieldById = new Map(seedTemplate.fields.map((field) => [field.id, field]));
    return {
      ...seedTemplate,
      ...template,
      fields: template.fields.map((field) => ({
        ...seedFieldById.get(field.id),
        ...field,
      })),
    };
  });
}

export function normalizeDappCollections(collections: Partial<DappCollections> = {}): DappCollections {
  const seed = createSeedCollections();
  const merged = { ...seed, ...collections };
  return {
    complaintTemplates: normalizeList(merged.complaintTemplates, seed.complaintTemplates),
    complaintRecords: normalizeList(merged.complaintRecords, seed.complaintRecords),
    drugGroups: normalizeDrugGroups(merged.drugGroups, seed.drugGroups),
    drugTemplates: normalizeDrugTemplates(merged.drugTemplates, seed.drugTemplates),
    drugRecords: normalizeDrugRecords(merged.drugRecords, seed.drugRecords),
  };
}

export class InMemoryDappRepository implements DappRepository {
  protected collections: DappCollections;

  constructor(collections: DappCollections = createSeedCollections()) {
    this.collections = cloneCollections(normalizeDappCollections(collections));
  }

  listComplaintTemplates() {
    return cloneList(this.collections.complaintTemplates);
  }

  listComplaintRecords() {
    return cloneList(this.collections.complaintRecords);
  }

  saveComplaintRecord(record: ComplaintRecord) {
    this.collections.complaintRecords = upsertById(this.collections.complaintRecords, record);
    this.persist();
  }

  listDrugGroups() {
    return cloneList(this.collections.drugGroups);
  }

  listDrugTemplates() {
    return cloneList(this.collections.drugTemplates);
  }

  listDrugRecords() {
    return cloneList(this.collections.drugRecords);
  }

  saveDrugRecord(record: DrugRecord) {
    this.collections.drugRecords = upsertById(this.collections.drugRecords, record);
    this.persist();
  }

  deleteDrugRecord(id: string) {
    const nextRecords = this.collections.drugRecords.filter((record) => record.id !== id);
    if (nextRecords.length === this.collections.drugRecords.length) return false;
    this.collections.drugRecords = nextRecords;
    this.persist();
    return true;
  }

  reset(collections: DappCollections = createSeedCollections()) {
    this.collections = cloneCollections(normalizeDappCollections(collections));
    this.persist();
  }

  protected persist() {
    // In-memory adapter intentionally has no external side effects.
  }
}

class BrowserStorageDappRepository extends InMemoryDappRepository {
  constructor(
    private readonly storage: Storage,
    private readonly onStorageError: StorageErrorHandler,
  ) {
    super(readCollections(storage, onStorageError));
  }

  protected override persist() {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.collections));
    } catch (e) {
      this.onStorageError(`Не удалось сохранить данные: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) return [item, ...items];
  return items.map((candidate) => (candidate.id === item.id ? item : candidate));
}

function readCollections(storage: Storage, onError?: StorageErrorHandler): DappCollections {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createSeedCollections();
    return normalizeDappCollections(JSON.parse(raw) as Partial<DappCollections>);
  } catch (e) {
    onError?.(`Не удалось загрузить данные: ${e instanceof Error ? e.message : String(e)}`);
    return createSeedCollections();
  }
}

export function createDefaultDappRepository(onStorageError?: StorageErrorHandler): DappRepository {
  if (typeof window === "undefined" || !window.localStorage) {
    return new InMemoryDappRepository();
  }

  return new BrowserStorageDappRepository(window.localStorage, onStorageError ?? console.error);
}
