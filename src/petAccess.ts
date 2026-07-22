// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

export type PetAccessRowStatus = "granted" | "requested" | "revoked";

export interface PetAccessRow {
  accountId: string;
  displayName: string;
  status: PetAccessRowStatus;
  delegationAllowed?: boolean;
  grantId?: string;
  requestId?: string;
}
