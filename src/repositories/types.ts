import type {
  AccountProfile,
  DeviceCertificate,
  MedicalRecordConfirmation,
  PetAccessGrant,
  Role,
  RoleRequest,
  SignedEvent,
  TemplateVersion,
} from "@klinok/protocol";

export interface PetProfile {
  petId: string;
  ownerAccountId: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  birthDate?: string;
  chip?: string;
  keyVersion: number;
  tombstoned: boolean;
  updatedAt: string;
}

export interface MedicalRecordDraft {
  recordId: string;
  petId: string;
  revision: number;
  authorAccountId: string;
  title: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  addendumTo?: string;
}

export interface ControlSnapshot {
  profile: AccountProfile | null;
  profiles: AccountProfile[];
  roles: RoleRequest[];
  allRoles: RoleRequest[];
  devices: DeviceCertificate[];
  templates: TemplateVersion[];
  pendingQueue: RoleRequest[];
  notifications: Array<{ id: string; title: string; message: string; createdAt: string }>;
  events: SignedEvent[];
}

export interface MedicalSnapshot {
  pets: PetProfile[];
  grants: PetAccessGrant[];
  records: MedicalRecordDraft[];
  confirmations: MedicalRecordConfirmation[];
  events: SignedEvent[];
}

export interface RoleDecisionInput {
  accountId: string;
  role: Role;
  status: "approved" | "rejected" | "suspended" | "revoked";
  reason?: string;
}
