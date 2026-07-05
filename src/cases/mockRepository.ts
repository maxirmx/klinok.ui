// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { AppointmentDraft, Visit } from "../data";
import {
  caseViewToVisit,
  createCaseEvent,
  createOwnerRequestEvent,
  isCaseEvent,
  reduceCaseEvents,
  reduceSingleCase,
  visitToCaseView,
} from "./events";
import { createDappEvent, isDappEvent, reduceDappCollections } from "../dapp/repository";
import type { DappEvent, DappWatchCallback, DrugRecord } from "../dapp/types";
import type { CaseEventInput, CaseRepository, CaseView, CaseWatchCallback, CreateCaseOptions, ReplicatedEvent } from "./types";

type NetworkListener = () => void;

export class InMemoryCaseEventNetwork {
  private readonly events: ReplicatedEvent[] = [];

  private readonly listeners = new Set<NetworkListener>();

  constructor(initialEvents: ReplicatedEvent[] = []) {
    this.events = [...initialEvents];
  }

  listEvents() {
    return [...this.events];
  }

  append(event: ReplicatedEvent) {
    if (!this.events.some((item) => item.id === event.id)) {
      this.events.push(event);
      this.notify();
    }
  }

  subscribe(listener: NetworkListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export interface MockCaseRepositoryOptions {
  seedVisits?: Visit[];
  actorId?: string;
  network?: InMemoryCaseEventNetwork;
}

export function createInMemoryCaseEventNetwork(initialEvents: ReplicatedEvent[] = []) {
  return new InMemoryCaseEventNetwork(initialEvents);
}

export function createMockCaseRepository(options: MockCaseRepositoryOptions = {}): CaseRepository {
  const seedViews = (options.seedVisits ?? []).map(visitToCaseView);
  const actorId = options.actorId ?? "mock-owner";
  const network = options.network ?? createInMemoryCaseEventNetwork();
  const listeners = new Set<CaseWatchCallback>();
  const dappListeners = new Set<DappWatchCallback>();
  let unsubscribeNetwork: (() => void) | null = null;

  function listCaseEvents() {
    return network.listEvents().filter(isCaseEvent);
  }

  function listDappEvents() {
    return network.listEvents().filter(isDappEvent);
  }

  function listCaseViews() {
    const dynamicCases = reduceCaseEvents(listCaseEvents());
    const dynamicCaseIds = new Set(dynamicCases.map((view) => view.caseId));
    const seededCases = seedViews.filter((view) => !dynamicCaseIds.has(view.caseId));
    return [...dynamicCases, ...seededCases];
  }

  function listCollections() {
    return reduceDappCollections({
      caseEvents: listCaseEvents(),
      dappEvents: listDappEvents(),
    });
  }

  function emit() {
    const cases = listCaseViews();
    for (const listener of listeners) {
      listener(cases);
    }

    const collections = listCollections();
    for (const listener of dappListeners) {
      listener(collections);
    }
  }

  return {
    async initialize() {
      unsubscribeNetwork ??= network.subscribe(emit);
      emit();
    },

    async listCases() {
      return listCaseViews();
    },

    watchCases(callback: CaseWatchCallback) {
      listeners.add(callback);
      callback(listCaseViews());

      unsubscribeNetwork ??= network.subscribe(emit);

      return () => {
        listeners.delete(callback);
        if (listeners.size === 0 && dappListeners.size === 0) {
          unsubscribeNetwork?.();
          unsubscribeNetwork = null;
        }
      };
    },

    async createCaseFromAppointment(draft: AppointmentDraft, options: CreateCaseOptions = {}) {
      const event = createOwnerRequestEvent(draft, { actorId, complaintRecord: options.complaintRecord });
      network.append(event);
      const view = reduceSingleCase(event.caseId, listCaseEvents());
      if (!view) {
        throw new Error("Failed to create case view from appointment event.");
      }
      return view;
    },

    async appendCaseEvent(caseId: string, event: CaseEventInput) {
      const nextEvent = createCaseEvent(caseId, event, { actorId, actorRole: "vet" });
      network.append(nextEvent);
      return reduceSingleCase(caseId, listCaseEvents());
    },

    async listDappCollections() {
      return listCollections();
    },

    watchDappCollections(callback: DappWatchCallback) {
      dappListeners.add(callback);
      callback(listCollections());

      unsubscribeNetwork ??= network.subscribe(emit);

      return () => {
        dappListeners.delete(callback);
        if (listeners.size === 0 && dappListeners.size === 0) {
          unsubscribeNetwork?.();
          unsubscribeNetwork = null;
        }
      };
    },

    async saveDrugRecord(record: DrugRecord) {
      const event: DappEvent = createDappEvent({
        type: "drug.record.saved",
        payload: { record },
        actorId,
        createdAt: record.updatedAt,
      });
      network.append(event);
      return record;
    },

    async deleteDrugRecord(id: string) {
      const exists = listCollections().drugRecords.some((record) => record.id === id);
      if (!exists) return false;
      network.append(createDappEvent({ type: "drug.record.deleted", payload: { id }, actorId }));
      return true;
    },
  };
}

export function caseViewsToVisits(cases: CaseView[]) {
  return cases.map(caseViewToVisit);
}
