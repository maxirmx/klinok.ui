// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { AppointmentDraft, Visit } from "../data";
import {
  caseViewToVisit,
  createCaseEvent,
  createOwnerRequestEvent,
  reduceCaseEvents,
  reduceSingleCase,
  visitToCaseView,
} from "./events";
import type { CaseEvent, CaseEventInput, CaseRepository, CaseView, CaseWatchCallback } from "./types";

type NetworkListener = () => void;

export class InMemoryCaseEventNetwork {
  private readonly events: CaseEvent[] = [];

  private readonly listeners = new Set<NetworkListener>();

  constructor(initialEvents: CaseEvent[] = []) {
    this.events = [...initialEvents];
  }

  listEvents() {
    return [...this.events];
  }

  append(event: CaseEvent) {
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

export function createInMemoryCaseEventNetwork(initialEvents: CaseEvent[] = []) {
  return new InMemoryCaseEventNetwork(initialEvents);
}

export function createMockCaseRepository(options: MockCaseRepositoryOptions = {}): CaseRepository {
  const seedViews = (options.seedVisits ?? []).map(visitToCaseView);
  const actorId = options.actorId ?? "mock-owner";
  const network = options.network ?? createInMemoryCaseEventNetwork();
  const listeners = new Set<CaseWatchCallback>();
  let unsubscribeNetwork: (() => void) | null = null;

  function listCaseViews() {
    const dynamicCases = reduceCaseEvents(network.listEvents());
    const dynamicCaseIds = new Set(dynamicCases.map((view) => view.caseId));
    const seededCases = seedViews.filter((view) => !dynamicCaseIds.has(view.caseId));
    return [...dynamicCases, ...seededCases];
  }

  function emit() {
    const cases = listCaseViews();
    for (const listener of listeners) {
      listener(cases);
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
        if (listeners.size === 0) {
          unsubscribeNetwork?.();
          unsubscribeNetwork = null;
        }
      };
    },

    async createCaseFromAppointment(draft: AppointmentDraft) {
      const event = createOwnerRequestEvent(draft, { actorId });
      network.append(event);
      const view = reduceSingleCase(event.caseId, network.listEvents());
      if (!view) {
        throw new Error("Failed to create case view from appointment event.");
      }
      return view;
    },

    async appendCaseEvent(caseId: string, event: CaseEventInput) {
      const nextEvent = createCaseEvent(caseId, event, { actorId, actorRole: "vet" });
      network.append(nextEvent);
      return reduceSingleCase(caseId, network.listEvents());
    },
  };
}

export function caseViewsToVisits(cases: CaseView[]) {
  return cases.map(caseViewToVisit);
}
