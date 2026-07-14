import { importSigningPublicKey, verifyEventSignature } from "./crypto.js";
import { stableSerialize } from "./stable.js";
import {
  ROLE_STATUSES,
  ROLES,
  type PetAccessGrant,
  type PetGrantAction,
  type ProtocolState,
  type Role,
  type RoleStatus,
  type SignedEvent,
  type VerificationOptions,
  type VerificationResult,
} from "./types.js";

const RESTRICTIVENESS: Record<Exclude<RoleStatus, "expired">, number> = {
  not_requested: 0,
  approved: 1,
  pending: 2,
  rejected: 3,
  suspended: 4,
  revoked: 5,
};

export function createProtocolState(bootstrapAccountId = "bootstrap-administrator"): ProtocolState {
  return {
    bootstrapAccountId,
    knownEvents: new Set(),
    events: new Map(),
    devices: new Map(),
    accounts: new Map(),
    roles: new Map(),
    grants: new Map(),
    petOwners: new Map(),
    confirmedRecords: new Set(),
    roleConflicts: [],
    invalidatedEvents: new Map(),
  };
}

export function roleProjectionKey(accountId: string, role: Role): string {
  return `${accountId}:${role}`;
}

export function chooseConcurrentRoleStatus(left: RoleStatus, right: RoleStatus): RoleStatus {
  if (left === "expired") return right === "expired" ? left : right;
  if (right === "expired") return left;
  return RESTRICTIVENESS[left] >= RESTRICTIVENESS[right] ? left : right;
}

export function isLegalRoleTransition(from: RoleStatus, to: RoleStatus): boolean {
  if (to === "expired") return false;
  if (from === to) return true;
  const transitions: Record<RoleStatus, RoleStatus[]> = {
    not_requested: ["pending", "approved"],
    pending: ["approved", "rejected", "not_requested"],
    approved: ["suspended", "revoked"],
    rejected: ["pending"],
    suspended: ["approved", "pending", "revoked"],
    revoked: ["pending"],
    expired: [],
  };
  return transitions[from].includes(to);
}

const IMMEDIATE_VERIFICATION_FAILURES = new Set([
  "EVENT_SCHEMA_INVALID",
  "EVENT_TYPE_UNSUPPORTED",
  "DEVICE_REVOKED",
  "DEVICE_BINDING_INVALID",
  "KEY_VERSION_STALE",
  "SIGNATURE_INVALID",
  "DEVICE_ATTESTATION_INVALID",
  "BOOTSTRAP_ANCHOR_MISMATCH",
  "BOOTSTRAP_IDENTITY_INVALID",
  "AUTH_ANCHOR_MISSING",
]);

/**
 * OrbitDB replays entries independently of the protocol's causal order. Only
 * failures that can be established from the envelope and already-known trust
 * material are safe to reject during transport admission. State-dependent
 * failures are retried and decided by the deterministic reducer.
 */
export function shouldDeferEventVerification(result: VerificationResult): boolean {
  return !result.accepted && Boolean(result.code) && !IMMEDIATE_VERIFICATION_FAILURES.has(result.code!);
}

function validShape(event: SignedEvent): boolean {
  return Boolean(event && typeof event === "object") && event.schemaVersion === 1 &&
    (event.database === "control" || event.database === "medical") &&
    [event.eventId, event.operationId, event.eventType, event.aggregateId, event.resourceId, event.createdAt,
      event.actorAccountId, event.actorDeviceId, event.orbitIdentityId].every((value) => typeof value === "string" && value.length > 0) &&
    ROLES.includes(event.activeRole) &&
    Array.isArray(event.parents) &&
    event.parents.every((parent) => typeof parent === "string") &&
    Array.isArray(event.proofIds) &&
    event.proofIds.every((proof) => typeof proof === "string") &&
    Array.isArray(event.keyring) &&
    event.keyring.every((envelope) => envelope && envelope.algorithm === "RSA-OAEP-256" &&
      typeof envelope.recipientId === "string" && Number.isInteger(envelope.keyVersion) && typeof envelope.wrappedKey === "string") &&
    Number.isInteger(event.keyVersion) && event.keyVersion > 0 &&
    Boolean(event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)) &&
    event.payload?.algorithm === "AES-GCM-256" && typeof event.payload.iv === "string" && typeof event.payload.ciphertext === "string" &&
    event.signature?.algorithm === "ECDSA-P256-SHA256" && typeof event.signature.value === "string";
}

export function isRoleApproved(state: ProtocolState, accountId: string, role: Role): boolean {
  return state.roles.get(roleProjectionKey(accountId, role))?.request.status === "approved";
}

function hasActiveRoleProof(state: ProtocolState, event: SignedEvent, role: Role): boolean {
  const projection = state.roles.get(roleProjectionKey(event.actorAccountId, role));
  return projection?.request.status === "approved" &&
    event.activeRole === role &&
    (event.proofIds.includes(projection.eventId) || event.proofIds.includes(projection.request.requestId));
}

export function grantAllows(grant: PetAccessGrant | undefined, action: PetGrantAction): boolean {
  return grant?.status === "active" && grant.actions.includes(action);
}

export function isGrantEffectivelyActive(state: ProtocolState, grant: PetAccessGrant | undefined, visited = new Set<string>()): boolean {
  if (!grant || grant.status !== "active" || visited.has(grant.grantId)) return false;
  if (!grant.parentGrantId) return true;
  visited.add(grant.grantId);
  return isGrantEffectivelyActive(state, state.grants.get(grant.parentGrantId), visited);
}

function roleEventResult(event: SignedEvent, state: ProtocolState): VerificationResult {
  const targetAccountId = String(event.metadata.accountId ?? event.aggregateId);
  const role = event.metadata.role as Role;
  const nextStatus = event.metadata.status as RoleStatus;
  if (!ROLES.includes(role) || !ROLE_STATUSES.includes(nextStatus) || nextStatus === "expired") {
    return { accepted: false, code: "ROLE_EVENT_INVALID", message: "Invalid role transition metadata." };
  }
  const current = state.roles.get(roleProjectionKey(targetAccountId, role));
  const parentRoleEvent = event.parents.map((parent) => state.events.get(parent)).find((parent) =>
    parent?.eventType.startsWith("role.") && String(parent.metadata.accountId ?? parent.aggregateId) === targetAccountId && parent.metadata.role === role,
  );
  const from = parentRoleEvent ? parentRoleEvent.metadata.status as RoleStatus : current?.request.status ?? "not_requested";
  const concurrentSibling = current && current.parents.length === event.parents.length && current.parents.every((parent) => event.parents.includes(parent));
  const immediateOwnerReactivation = role === "owner" && event.actorAccountId === targetAccountId && nextStatus === "approved" &&
    ["not_requested", "rejected", "suspended", "revoked"].includes(from);
  if (!concurrentSibling && !isLegalRoleTransition(from, nextStatus) && !immediateOwnerReactivation) {
    return { accepted: false, code: "ROLE_TRANSITION_INVALID", message: `${from} cannot transition to ${nextStatus}.` };
  }
  if (targetAccountId === state.bootstrapAccountId && role === "administrator" && nextStatus !== "approved") {
    return { accepted: false, code: "BOOTSTRAP_PROTECTED", message: "Bootstrap Administrator is immutable." };
  }
  const selfService = event.actorAccountId === targetAccountId && ["pending", "not_requested"].includes(nextStatus);
  const immediateOwner = role === "owner" && nextStatus === "approved" && event.actorAccountId === targetAccountId;
  const administratorDecision = hasActiveRoleProof(state, event, "administrator");
  if (!selfService && !immediateOwner && !administratorDecision) {
    return { accepted: false, code: "ROLE_DECISION_FORBIDDEN", message: "An approved Administrator must decide this transition." };
  }
  if (event.actorAccountId === targetAccountId && role === "administrator" && nextStatus === "approved" && !administratorDecision) {
    return { accepted: false, code: "ADMIN_SELF_APPROVAL_FORBIDDEN", message: "Administrator requests require another active Administrator." };
  }
  return { accepted: true };
}

function capabilityResult(event: SignedEvent, state: ProtocolState): VerificationResult {
  if (state.accounts.get(event.actorAccountId) === "deleted") {
    return { accepted: false, code: "ACCOUNT_DELETED", message: "Deleted accounts cannot write events." };
  }
  if (event.eventType.startsWith("role.")) return roleEventResult(event, state);
  if (event.eventType === "account.bootstrap") {
    return event.actorAccountId === state.bootstrapAccountId && event.aggregateId === state.bootstrapAccountId
      ? { accepted: true }
      : { accepted: false, code: "BOOTSTRAP_IDENTITY_INVALID", message: "Only the pinned bootstrap account may initialize the trust root." };
  }
  if (event.eventType === "device.attested") return { accepted: true };
  if (event.eventType === "account.deleted" && event.actorAccountId === state.bootstrapAccountId) {
    return { accepted: false, code: "BOOTSTRAP_PROTECTED", message: "Bootstrap account cannot be deleted." };
  }
  if (["profile.updated", "consent.accepted", "account.deleted", "device.enrollment.requested", "device.revoked", "device.rotated"].includes(event.eventType)) {
    return event.actorAccountId === event.aggregateId
      ? { accepted: true }
      : { accepted: false, code: "ACCOUNT_SCOPE_FORBIDDEN", message: "Account commands are self-service." };
  }
  if (event.eventType === "profile.key.rewrapped") {
    return hasActiveRoleProof(state, event, "administrator")
      ? { accepted: true }
      : { accepted: false, code: "PROFILE_REWRAP_FORBIDDEN", message: "Only Administrators may rewrap profile keys." };
  }
  if (["audit.", "notification.", "email."].some((prefix) => event.eventType.startsWith(prefix))) {
    const transition = event.parents.map((parent) => state.events.get(parent)).find((parent) => parent?.eventType.startsWith("role."));
    return transition && transition.operationId === event.operationId && transition.actorAccountId === event.actorAccountId && transition.aggregateId === event.aggregateId
      ? { accepted: true }
      : { accepted: false, code: "COMPANION_PROOF_INVALID", message: "Administrative companion events must reference their role transition." };
  }
  const petId = String(event.metadata.petId ?? event.aggregateId);
  const ownerId = state.petOwners.get(petId);
  if (event.eventType === "pet.created") {
    return hasActiveRoleProof(state, event, "owner")
      ? { accepted: true }
      : { accepted: false, code: "PET_CREATE_FORBIDDEN", message: "An approved Owner role is required." };
  }
  if (event.eventType === "pet.shared") {
    if (hasActiveRoleProof(state, event, "owner") && ownerId === event.actorAccountId) return { accepted: true };
    const parent = state.grants.get(String(event.metadata.parentGrantId ?? ""));
    return hasActiveRoleProof(state, event, "doctor") && parent?.granteeAccountId === event.actorAccountId &&
      isGrantEffectivelyActive(state, parent) && grantAllows(parent, "delegate") && event.proofIds.includes(parent!.grantId)
      ? { accepted: true }
      : { accepted: false, code: "PET_SHARE_FORBIDDEN", message: "A pet may be shared only by its Owner or an authorized delegating Doctor." };
  }
  if (["pet.updated", "pet.tombstoned", "pet.key.rotated", "grant.created", "grant.revoked", "medical.record.confirmed"].includes(event.eventType)) {
    if (event.eventType === "medical.record.confirmed" && state.confirmedRecords.has(event.resourceId)) {
      return { accepted: false, code: "RECORD_ALREADY_CONFIRMED", message: "A record revision can be confirmed only once." };
    }
    return hasActiveRoleProof(state, event, "owner") && ownerId === event.actorAccountId
      ? { accepted: true }
      : { accepted: false, code: "OWNER_SCOPE_FORBIDDEN", message: "Only the pet Owner may perform this command." };
  }
  if (["medical.record.created", "medical.record.updated", "medical.addendum.created"].includes(event.eventType)) {
    if (!hasActiveRoleProof(state, event, "doctor")) {
      return { accepted: false, code: "DOCTOR_ROLE_REQUIRED", message: "An approved Doctor role is required." };
    }
    const grant = [...state.grants.values()].find((candidate) =>
      candidate.petId === petId && candidate.granteeAccountId === event.actorAccountId && isGrantEffectivelyActive(state, candidate),
    );
    if (!grantAllows(grant, "write_unconfirmed") || !event.proofIds.includes(grant!.grantId)) {
      return { accepted: false, code: "PET_GRANT_REQUIRED", message: "An active pet write grant is required." };
    }
    if (event.eventType === "medical.record.updated" && state.confirmedRecords.has(event.resourceId)) {
      return { accepted: false, code: "CONFIRMED_RECORD_IMMUTABLE", message: "Confirmed records cannot be changed." };
    }
    return { accepted: true };
  }
  if (event.eventType === "grant.delegated") {
    const parent = state.grants.get(String(event.metadata.parentGrantId ?? ""));
    const actions = (event.metadata.actions ?? []) as PetGrantAction[];
    const isSubset = actions.every((action) => parent?.actions.includes(action));
    return hasActiveRoleProof(state, event, "doctor") && parent?.granteeAccountId === event.actorAccountId &&
      isGrantEffectivelyActive(state, parent) && grantAllows(parent, "delegate") && event.proofIds.includes(parent!.grantId) && isSubset
      ? { accepted: true }
      : { accepted: false, code: "GRANT_DELEGATION_FORBIDDEN", message: "Delegation must be a subset of an active parent grant." };
  }
  return { accepted: false, code: "EVENT_TYPE_UNSUPPORTED", message: "The event type is not part of the public protocol." };
}

export async function verifySignedEvent(
  event: SignedEvent,
  state: ProtocolState,
  options: VerificationOptions = {},
): Promise<VerificationResult> {
  if (!validShape(event)) return { accepted: false, code: "EVENT_SCHEMA_INVALID", message: "Signed event schema is invalid." };
  if (state.knownEvents.has(event.eventId)) return { accepted: true, code: "EVENT_DUPLICATE" };
  if (event.parents.some((parent) => !state.knownEvents.has(parent))) {
    return { accepted: false, code: "EVENT_PARENT_MISSING", message: "A logical parent is missing." };
  }
  const device = state.devices.get(event.actorDeviceId);
  if (!device) {
    if (!options.allowUnknownDevice && event.eventType !== "device.attested") {
      return { accepted: false, code: "DEVICE_UNKNOWN", message: "Device certificate is not known." };
    }
  } else {
    if (device.status !== "active") return { accepted: false, code: "DEVICE_REVOKED", message: "Device is not active." };
    if (device.accountId !== event.actorAccountId || device.orbitIdentityId !== event.orbitIdentityId) {
      return { accepted: false, code: "DEVICE_BINDING_INVALID", message: "Actor and transport identity do not match the certificate." };
    }
    if (device.userKeyVersion !== event.keyVersion) {
      return { accepted: false, code: "KEY_VERSION_STALE", message: "The user key version is stale." };
    }
    const publicKey = await importSigningPublicKey(device.signingPublicKey);
    if (!(await verifyEventSignature(event, publicKey))) {
      return { accepted: false, code: "SIGNATURE_INVALID", message: "The event signature is invalid." };
    }
  }
  if (!device && event.eventType === "device.attested") {
    const certificate = event.metadata.certificate as unknown as import("./types.js").DeviceCertificate | undefined;
    if (!certificate || certificate.deviceId !== event.actorDeviceId || certificate.accountId !== event.actorAccountId ||
      certificate.orbitIdentityId !== event.orbitIdentityId || certificate.userKeyVersion !== event.keyVersion || !certificate.attestation) {
      return { accepted: false, code: "DEVICE_ATTESTATION_INVALID", message: "Device attestation does not match the event actor." };
    }
    const publicKey = await importSigningPublicKey(certificate.signingPublicKey);
    if (!(await verifyEventSignature(event, publicKey))) {
      return { accepted: false, code: "SIGNATURE_INVALID", message: "The enrollment event signature is invalid." };
    }
    if (event.actorAccountId === state.bootstrapAccountId && options.bootstrapSigningPublicKey &&
      stableSerialize(certificate.signingPublicKey) !== stableSerialize(options.bootstrapSigningPublicKey)) {
      return { accepted: false, code: "BOOTSTRAP_ANCHOR_MISMATCH", message: "Bootstrap device does not match the pinned trust anchor." };
    }
    if (options.authAttestationPublicKey) {
      try {
        const { attestation, ...unsigned } = certificate;
        const authKey = await importSigningPublicKey(options.authAttestationPublicKey);
        const binary = atob(attestation.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(attestation.length / 4) * 4, "="));
        const signature = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        const valid = await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" }, authKey, signature,
          new TextEncoder().encode(stableSerialize(unsigned)),
        );
        if (!valid) return { accepted: false, code: "DEVICE_ATTESTATION_INVALID", message: "Auth-service device attestation is invalid." };
      } catch {
        return { accepted: false, code: "DEVICE_ATTESTATION_INVALID", message: "Auth-service device attestation is invalid." };
      }
    } else if (options.requireTrustedAttestation) {
      return { accepted: false, code: "AUTH_ANCHOR_MISSING", message: "The auth-service trust anchor is not configured." };
    }
  }
  if (!device && event.eventType !== "device.attested") {
    return { accepted: false, code: "SIGNATURE_UNVERIFIABLE", message: "No signing certificate is available." };
  }
  return capabilityResult(event, state);
}
