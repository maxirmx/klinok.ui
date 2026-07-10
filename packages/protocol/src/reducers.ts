import { chooseConcurrentRoleStatus, roleProjectionKey, verifySignedEvent } from "./authorization.js";
import type {
  DeviceCertificate,
  PetAccessGrant,
  ProtocolState,
  Role,
  RoleProjection,
  RoleRequest,
  SignedEvent,
  VerificationOptions,
  VerificationResult,
} from "./types.js";

export interface ProjectionConflict {
  event: SignedEvent;
  result: VerificationResult;
}

export interface ProjectionResult {
  state: ProtocolState;
  accepted: SignedEvent[];
  conflicts: ProjectionConflict[];
}

function applyRoleEvent(event: SignedEvent, state: ProtocolState): void {
  const accountId = String(event.metadata.accountId ?? event.aggregateId);
  const role = event.metadata.role as Role;
  const status = event.metadata.status as RoleRequest["status"];
  const key = roleProjectionKey(accountId, role);
  const current = state.roles.get(key);
  const request: RoleRequest = {
    requestId: String(event.metadata.requestId ?? event.resourceId),
    accountId,
    role,
    status,
    profileRevision: Number(event.metadata.profileRevision ?? 1),
    requestedAt: String(event.metadata.requestedAt ?? event.createdAt),
    ...(event.metadata.reason ? { reason: String(event.metadata.reason) } : {}),
    ...(status !== "pending" && status !== "not_requested" ? { decidedAt: event.createdAt, decidedBy: event.actorAccountId } : {}),
    ...(event.parents[0] ? { parentEventId: event.parents[0] } : {}),
  };
  if (current && current.parents.length === event.parents.length && current.parents.every((parent) => event.parents.includes(parent))) {
    const winner = chooseConcurrentRoleStatus(current.request.status, request.status);
    if (winner === current.request.status) {
      state.roleConflicts.push({ roleKey: key, losingEventId: event.eventId, winningEventId: current.eventId });
      return;
    }
    state.roleConflicts.push({ roleKey: key, losingEventId: current.eventId, winningEventId: event.eventId });
    request.status = winner;
  }
  const projection: RoleProjection = { request, eventId: event.eventId, parents: event.parents };
  state.roles.set(key, projection);
}

export function applyAcceptedEvent(event: SignedEvent, state: ProtocolState): void {
  state.knownEvents.add(event.eventId);
  state.events.set(event.eventId, event);
  if (event.eventType === "account.bootstrap" || event.eventType === "profile.updated") state.accounts.set(event.aggregateId, "active");
  if (event.eventType === "account.deleted") state.accounts.set(event.aggregateId, "deleted");
  if (event.eventType === "device.attested" || event.eventType === "device.rotated") {
    state.devices.set(event.resourceId, event.metadata.certificate as unknown as DeviceCertificate);
  }
  if (event.eventType === "device.revoked") {
    const device = state.devices.get(event.resourceId);
    if (device) state.devices.set(event.resourceId, { ...device, status: "revoked" });
  }
  if (event.eventType.startsWith("role.")) applyRoleEvent(event, state);
  if (event.eventType === "account.bootstrap") {
    state.roles.set(roleProjectionKey(event.actorAccountId, "administrator"), {
      request: {
        requestId: event.resourceId,
        accountId: event.actorAccountId,
        role: "administrator",
        status: "approved",
        profileRevision: 1,
        requestedAt: event.createdAt,
        decidedAt: event.createdAt,
        decidedBy: event.actorAccountId,
      },
      eventId: event.eventId,
      parents: event.parents,
    });
  }
  if (event.eventType === "pet.created") state.petOwners.set(event.aggregateId, event.actorAccountId);
  if (["grant.created", "grant.delegated"].includes(event.eventType)) {
    state.grants.set(event.resourceId, event.metadata.grant as unknown as PetAccessGrant);
  }
  if (event.eventType === "grant.revoked") {
    const grant = state.grants.get(event.resourceId);
    if (grant) state.grants.set(event.resourceId, { ...grant, status: "revoked", revokedAt: event.createdAt });
  }
  if (event.eventType === "medical.record.confirmed") state.confirmedRecords.add(event.resourceId);
}

export async function reduceSignedEvents(events: SignedEvent[], state: ProtocolState, options: VerificationOptions = {}): Promise<ProjectionResult> {
  const accepted: SignedEvent[] = [];
  const conflicts: ProjectionConflict[] = [];
  const remaining = new Map(events.map((event) => [event.eventId, event]));
  let progressed = true;
  while (remaining.size && progressed) {
    progressed = false;
    for (const [eventId, event] of remaining) {
      const result = await verifySignedEvent(event, state, { ...options, allowUnknownDevice: event.eventType === "device.attested" });
      if (!result.accepted && result.code === "EVENT_PARENT_MISSING") continue;
      remaining.delete(eventId);
      progressed = true;
      if (!result.accepted) conflicts.push({ event, result });
      else {
        applyAcceptedEvent(event, state);
        accepted.push(event);
      }
    }
  }
  for (const event of remaining.values()) {
    conflicts.push({ event, result: { accepted: false, code: "EVENT_PARENT_MISSING", message: "A logical parent is missing." } });
  }
  reconcileEffectiveEvents(events, state);
  return { state, accepted, conflicts };
}

export function reconcileEffectiveEvents(events: SignedEvent[], state: ProtocolState): void {
  state.invalidatedEvents.clear();
  const eventById = new Map(events.map((event) => [event.eventId, event]));
  const preservedByDecision = new Map<string, Set<string>>();
  for (const projection of state.roles.values()) {
    if (projection.request.status === "approved") continue;
    const decision = eventById.get(projection.eventId);
    preservedByDecision.set(
      `${projection.request.accountId}:${projection.request.role}`,
      new Set((decision?.metadata.priorAuthorizedEventIds ?? []) as string[]),
    );
  }
  for (const event of events) {
    if (event.database !== "medical") continue;
    const projection = state.roles.get(roleProjectionKey(event.actorAccountId, event.activeRole));
    const preserved = preservedByDecision.get(`${event.actorAccountId}:${event.activeRole}`);
    if (projection && projection.request.status !== "approved" && preserved && !preserved.has(event.eventId)) {
      state.invalidatedEvents.set(event.eventId, "ROLE_REVOKED_OR_SUSPENDED");
    }
  }
  for (const grant of state.grants.values()) {
    if (grant.status !== "revoked") continue;
    const revocation = events.findLast((event) => event.eventType === "grant.revoked" && event.resourceId === grant.grantId);
    const preserved = new Set((revocation?.metadata.priorAuthorizedEventIds ?? []) as string[]);
    for (const event of events) {
      if (event.database !== "medical" || event.actorAccountId !== grant.granteeAccountId ||
        String(event.metadata.petId ?? event.aggregateId) !== grant.petId || preserved.has(event.eventId)) continue;
      if (["medical.record.created", "medical.record.updated", "medical.addendum.created", "grant.delegated"].includes(event.eventType)) {
        state.invalidatedEvents.set(event.eventId, "GRANT_REVOKED");
      }
    }
  }
}
