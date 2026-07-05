// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { AppointmentDraft, Visit } from "../data";
import type { ComplaintRecord, DappCollections, DappEvent, DappWatchCallback, DrugRecord } from "../dapp/types";
import type { AppRuntimeConfig } from "../runtimeConfig";

export type CaseActorRole = "owner" | "vet" | "company" | "system";

export type CaseEventType =
  | "owner.request.created"
  | "vet.note.added"
  | "vet.diagnosis.updated"
  | "vet.recommendation.updated";

export interface CaseEventBase {
  id: string;
  caseId: string;
  actorId: string;
  actorRole: CaseActorRole;
  createdAt: string;
  type: CaseEventType;
}

export interface OwnerRequestCreatedPayload {
  visitId: number;
  appointment: AppointmentDraft;
  complaintRecord?: ComplaintRecord;
}

export interface VetNoteAddedPayload {
  note: string;
}

export interface VetDiagnosisUpdatedPayload {
  diagnosis: string;
}

export interface VetRecommendationUpdatedPayload {
  recommendation: string;
}

export type CaseEvent =
  | (CaseEventBase & { type: "owner.request.created"; payload: OwnerRequestCreatedPayload })
  | (CaseEventBase & { type: "vet.note.added"; payload: VetNoteAddedPayload })
  | (CaseEventBase & { type: "vet.diagnosis.updated"; payload: VetDiagnosisUpdatedPayload })
  | (CaseEventBase & { type: "vet.recommendation.updated"; payload: VetRecommendationUpdatedPayload });

export type ReplicatedEvent = CaseEvent | DappEvent;

export type CaseEventInput =
  | { type: "vet.note.added"; payload: VetNoteAddedPayload; actorId?: string; actorRole?: CaseActorRole; createdAt?: string; id?: string }
  | {
      type: "vet.diagnosis.updated";
      payload: VetDiagnosisUpdatedPayload;
      actorId?: string;
      actorRole?: CaseActorRole;
      createdAt?: string;
      id?: string;
    }
  | {
      type: "vet.recommendation.updated";
      payload: VetRecommendationUpdatedPayload;
      actorId?: string;
      actorRole?: CaseActorRole;
      createdAt?: string;
      id?: string;
    };

export interface CaseView extends Visit {
  caseId: string;
  notes: string[];
  updatedAt: string;
  events: CaseEvent[];
}

export type CaseWatchCallback = (cases: CaseView[]) => void;

export interface CreateCaseOptions {
  complaintRecord?: ComplaintRecord;
}

export interface CaseRepository {
  initialize(config: AppRuntimeConfig): Promise<void>;
  listCases(): Promise<CaseView[]>;
  watchCases(callback: CaseWatchCallback): () => void;
  createCaseFromAppointment(draft: AppointmentDraft, options?: CreateCaseOptions): Promise<CaseView>;
  appendCaseEvent(caseId: string, event: CaseEventInput): Promise<CaseView | null>;
  listDappCollections(): Promise<DappCollections>;
  watchDappCollections(callback: DappWatchCallback): () => void;
  saveDrugRecord(record: DrugRecord): Promise<DrugRecord>;
  deleteDrugRecord(id: string): Promise<boolean>;
  dispose?(): Promise<void>;
}
