// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { CaseEvent } from "../cases/types";
import { createSeedCollections } from "./seeds";
import type {
  DappCollections,
  DappEvent,
  DappEventInput,
} from "./types";

interface DappReducerInput {
  caseEvents?: CaseEvent[];
  dappEvents?: DappEvent[];
  seed?: DappCollections;
}

function createId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function cloneCollections(collections: DappCollections): DappCollections {
  return JSON.parse(JSON.stringify(collections)) as DappCollections;
}

export function createDappEvent(
  input: DappEventInput,
  defaults: { actorId: string; createdAt?: string } = { actorId: "system" },
): DappEvent {
  return {
    id: input.id ?? createId("dapp-event"),
    actorId: input.actorId ?? defaults.actorId,
    createdAt: input.createdAt ?? defaults.createdAt ?? new Date().toISOString(),
    type: input.type,
    payload: { ...input.payload },
  } as DappEvent;
}

export function isDappEvent(event: unknown): event is DappEvent {
  if (!event || typeof event !== "object") return false;
  const type = (event as { type?: unknown }).type;
  return type === "drug.record.saved" || type === "drug.record.deleted";
}

export function sortDappEvents(events: DappEvent[]) {
  const unique = new Map<string, DappEvent>();

  for (const event of events) {
    if (!unique.has(event.id)) {
      unique.set(event.id, event);
    }
  }

  return [...unique.values()].sort((left, right) => {
    const created = left.createdAt.localeCompare(right.createdAt);
    if (created !== 0) return created;
    return left.id.localeCompare(right.id);
  });
}

function listComplaintRecordsFromCases(events: CaseEvent[]) {
  return events
    .flatMap((event) => {
      if (event.type !== "owner.request.created" || !event.payload.complaintRecord) {
        return [];
      }
      return [event.payload.complaintRecord];
    })
    .sort((left, right) => {
      const created = right.createdAt.localeCompare(left.createdAt);
      if (created !== 0) return created;
      return right.id.localeCompare(left.id);
    });
}

export function reduceDappCollections(input: DappReducerInput = {}): DappCollections {
  const seed = cloneCollections(input.seed ?? createSeedCollections());
  const drugRecordsById = new Map(seed.drugRecords.map((record) => [record.id, record]));

  for (const event of sortDappEvents(input.dappEvents ?? [])) {
    if (event.type === "drug.record.saved") {
      drugRecordsById.set(event.payload.record.id, event.payload.record);
    }

    if (event.type === "drug.record.deleted") {
      drugRecordsById.delete(event.payload.id);
    }
  }

  return cloneCollections({
    ...seed,
    complaintRecords: listComplaintRecordsFromCases(input.caseEvents ?? []),
    drugRecords: [...drugRecordsById.values()],
  });
}
