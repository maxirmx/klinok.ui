export type PetAccessRowStatus = "granted" | "requested" | "revoked";

export interface PetAccessRow {
  accountId: string;
  displayName: string;
  status: PetAccessRowStatus;
  delegationAllowed?: boolean;
  grantId?: string;
  requestId?: string;
}
