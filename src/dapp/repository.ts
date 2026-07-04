// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { createSeedCollections } from "./seeds";
import type { ComplaintRecord, DappCollections, DrugRecord } from "./types";

const STORAGE_KEY = "klinok.dapp.collections.v1";

export interface DappRepository {
  listComplaintTemplates(): DappCollections["complaintTemplates"];
  listComplaintRecords(): ComplaintRecord[];
  saveComplaintRecord(record: ComplaintRecord): void;
  listDrugTemplates(): DappCollections["drugTemplates"];
  listDrugRecords(): DrugRecord[];
  saveDrugRecord(record: DrugRecord): void;
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

  reset(collections: DappCollections = createSeedCollections()) {
    this.collections = cloneCollections(collections);
    this.persist();
  }

  protected persist() {
    // In-memory adapter intentionally has no external side effects.
  }
}

class BrowserStorageDappRepository extends InMemoryDappRepository {
  constructor(private readonly storage: Storage) {
    super(readCollections(storage));
  }

  protected override persist() {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.collections));
  }
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) return [item, ...items];
  return items.map((candidate) => (candidate.id === item.id ? item : candidate));
}

function readCollections(storage: Storage): DappCollections {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return createSeedCollections();

  try {
    return { ...createSeedCollections(), ...JSON.parse(raw) } as DappCollections;
  } catch {
    return createSeedCollections();
  }
}

export function createDefaultDappRepository(): DappRepository {
  if (typeof window === "undefined" || !window.localStorage) {
    return new InMemoryDappRepository();
  }

  return new BrowserStorageDappRepository(window.localStorage);
}
