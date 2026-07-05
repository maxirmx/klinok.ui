// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { visits, type Visit } from "../data";
import type { AppRuntimeConfig } from "../runtimeConfig";
import { createMockCaseRepository } from "./mockRepository";
import type { CaseRepository } from "./types";

export async function createCaseRepository(config: AppRuntimeConfig, seedVisits: Visit[] = visits): Promise<CaseRepository> {
  if (config.backendMode === "p2p") {
    const { createOrbitCaseRepository } = await import("./orbitRepository");
    return createOrbitCaseRepository(config.p2p);
  }

  return createMockCaseRepository({ seedVisits });
}

export type {
  CaseActorRole,
  CaseEvent,
  CaseEventInput,
  CaseEventType,
  CaseRepository,
  CaseView,
  CaseWatchCallback,
  CreateCaseOptions,
  ReplicatedEvent,
} from "./types";
