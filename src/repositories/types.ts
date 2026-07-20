import type {
  AccountProfile,
  DeviceCertificate,
  MedicalRecordConfirmation,
  PetAccessRequest,
  PetAccessGrant,
  PetSex,
  Role,
  RoleRequest,
  SignedEvent,
} from "@klinok/protocol";

export interface PetProfile {
  petId: string;
  ownerAccountId: string;
  name: string;
  species: string;
  breed: string;
  sex?: PetSex;
  photoDataUrl?: string;
  birthDate?: string;
  birthYear?: number;
  color?: string;
  chip?: string;
  brandMark?: string;
  latestVaccination?: { date: string; name: string };
  weightKg?: number;
  notes?: string;
  keyVersion: number;
  tombstoned: boolean;
  updatedAt: string;
}

export interface PetProfileInput {
  name: string;
  species: string;
  breed: string;
  sex: PetSex;
  photoDataUrl?: string;
  birthDate?: string;
  birthYear?: number;
  color: string;
  chip?: string;
  brandMark?: string;
  latestVaccination?: { date: string; name: string };
  weightKg: number;
  notes?: string;
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
  pendingQueue: RoleRequest[];
  notifications: Array<{ id: string; title: string; message: string; createdAt: string }>;
  events: SignedEvent[];
}

export interface MedicalSnapshot {
  pets: PetProfile[];
  grants: PetAccessGrant[];
  accessRequests: PetAccessRequest[];
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
