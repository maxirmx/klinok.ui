// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { AppRuntimeConfig } from "../runtimeConfig";
import type { CaseRepository } from "./types";

export async function createCaseRepository(config: AppRuntimeConfig): Promise<CaseRepository> {
  const { createOrbitCaseRepository } = await import("./orbitRepository");
  return createOrbitCaseRepository(config.p2p);
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
