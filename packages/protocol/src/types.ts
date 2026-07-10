export const ROLES = ["administrator", "doctor", "owner"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_STATUSES = [
  "not_requested",
  "pending",
  "approved",
  "rejected",
  "suspended",
  "revoked",
  "expired",
] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

export type AccountStatus = "active" | "deleted";
export type CredentialStatus = "pending_verification" | "active" | "locked" | "deleted";
export type DeviceStatus = "pending" | "active" | "revoked";
export type DatabaseKind = "control" | "medical";
export const ACCESS_CONTROLLER_TYPES: Record<DatabaseKind, string> = {
  control: "klinok-control-access-v1",
  medical: "klinok-medical-access-v1",
};

export interface AccountProfile {
  accountId: string;
  revision: number;
  firstName: string;
  lastName: string;
  patronymic?: string;
  updatedAt: string;
}

export interface ConsentReceipt {
  accountId: string;
  acceptedAt: string;
  ageConfirmed: true;
  personalDataConsentVersion: string;
  userAgreementVersion: string;
  signature: string;
}

export interface RoleRequest {
  requestId: string;
  accountId: string;
  role: Role;
  status: RoleStatus;
  profileRevision: number;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
  parentEventId?: string;
}

export interface ActiveRoleContext {
  accountId: string;
  deviceId: string;
  orbitIdentityId: string;
  role: Role;
  roleProofId: string;
  userKeyVersion: number;
}

export interface DeviceCertificate {
  deviceId: string;
  accountId: string;
  orbitIdentityId: string;
  status: DeviceStatus;
  userKeyVersion: number;
  signingPublicKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
  issuedAt: string;
  attestation: string;
}

export type PetGrantAction = "read" | "write_unconfirmed" | "delegate";

export interface PetAccessGrant {
  grantId: string;
  petId: string;
  grantorAccountId: string;
  granteeAccountId: string;
  actions: PetGrantAction[];
  parentGrantId?: string;
  petKeyVersion: number;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt?: string;
}

export interface MedicalRecordConfirmation {
  confirmationId: string;
  petId: string;
  recordId: string;
  recordRevision: number;
  ownerAccountId: string;
  confirmedAt: string;
}

export interface TemplateVersion {
  templateId: string;
  version: number;
  title: string;
  status: "draft" | "published" | "retired";
  updatedAt: string;
}

export interface KeyEnvelope {
  recipientId: string;
  keyVersion: number;
  algorithm: "RSA-OAEP-256";
  wrappedKey: string;
}

export interface EncryptedPayload {
  algorithm: "AES-GCM-256";
  iv: string;
  ciphertext: string;
}

export interface EventSignature {
  algorithm: "ECDSA-P256-SHA256";
  value: string;
}

export interface SignedEvent<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  schemaVersion: 1;
  database: DatabaseKind;
  eventId: string;
  operationId: string;
  eventType: string;
  aggregateId: string;
  resourceId: string;
  createdAt: string;
  actorAccountId: string;
  actorDeviceId: string;
  orbitIdentityId: string;
  activeRole: Role;
  parents: string[];
  keyVersion: number;
  proofIds: string[];
  metadata: TMetadata;
  keyring: KeyEnvelope[];
  payload: EncryptedPayload;
  signature: EventSignature;
}

export interface UserKeySet {
  version: number;
  signingPublicKey: CryptoKey;
  signingPrivateKey: CryptoKey;
  encryptionPublicKey: CryptoKey;
  encryptionPrivateKey: CryptoKey;
}

export interface ExportedUserKeySet {
  version: number;
  signingPublicKey: JsonWebKey;
  signingPrivateKey: JsonWebKey;
  encryptionPublicKey: JsonWebKey;
  encryptionPrivateKey: JsonWebKey;
}

export interface RoleProjection {
  request: RoleRequest;
  eventId: string;
  parents: string[];
}

export interface ProtocolState {
  bootstrapAccountId: string;
  knownEvents: Set<string>;
  events: Map<string, SignedEvent>;
  devices: Map<string, DeviceCertificate>;
  accounts: Map<string, AccountStatus>;
  roles: Map<string, RoleProjection>;
  grants: Map<string, PetAccessGrant>;
  petOwners: Map<string, string>;
  confirmedRecords: Set<string>;
  roleConflicts: Array<{ roleKey: string; losingEventId: string; winningEventId: string }>;
  invalidatedEvents: Map<string, string>;
}

export interface VerificationResult {
  accepted: boolean;
  code?: string;
  message?: string;
}

export interface VerificationOptions {
  allowUnknownDevice?: boolean;
  authAttestationPublicKey?: JsonWebKey;
  bootstrapSigningPublicKey?: JsonWebKey;
  requireTrustedAttestation?: boolean;
}

export interface AuthErrorBody {
  error: { code: string; message: string };
}

export interface AuthSessionDto {
  authenticated: boolean;
  credentialStatus?: CredentialStatus;
  accountId?: string;
  csrfToken?: string;
  device?: DeviceCertificate;
  devices?: DeviceCertificate[];
  enrollments?: DeviceEnrollmentDto[];
  pendingOperations?: PendingOperationDto[];
  setup?: RegistrationSetupDto;
}

export interface RegistrationSetupDto {
  profile: Omit<AccountProfile, "accountId" | "revision" | "updatedAt">;
  requestedRoles: Role[];
  ageConfirmed: boolean;
  personalDataConsentVersion: string;
  userAgreementVersion: string;
}

export interface PendingOperationDto {
  operationId: string;
  kind: "profile" | "account_delete" | "device";
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface DeviceEnrollmentDto {
  enrollmentId: string;
  operationId: string;
  accountId: string;
  deviceId: string;
  orbitIdentityId: string;
  status: DeviceStatus;
  signingPublicKey?: JsonWebKey;
  encryptionPublicKey?: JsonWebKey;
  ephemeralPublicKey?: JsonWebKey;
  encryptedKeyBundle?: string;
  userKeyVersion?: number;
  createdAt: string;
}
