// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { createSeedCollections } from "./seeds";
import type { ComplaintRecord, DappCollections, DrugRecord } from "./types";

const STORAGE_KEY = "klinok.dapp.collections.v1";

export type StorageErrorHandler = (message: string) => void;

export interface DappRepository {
  listComplaintTemplates(): DappCollections["complaintTemplates"];
  listComplaintRecords(): ComplaintRecord[];
  saveComplaintRecord(record: ComplaintRecord): void;
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

export class InMemoryDappRepository implements DappRepository {
  protected collections: DappCollections;

  constructor(collections: DappCollections = createSeedCollections()) {
    this.collections = cloneCollections(collections);
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
    this.collections = cloneCollections(collections);
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
    return { ...createSeedCollections(), ...JSON.parse(raw) } as DappCollections;
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
