import {
  chooseConcurrentRoleStatus,
  deviceProjectionKey,
  isGrantEffectivelyActive,
  roleProjectionKey,
  shouldDeferEventVerification,
  verifySignedEvent,
} from "./authorization.js";
import type {
  DeviceCertificate,
  PetAccessRequest,
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

function replayOrderedEvents(events: SignedEvent[]): SignedEvent[] {
  const ordered: SignedEvent[] = [];
  const remaining = new Map(events.map((event) => [event.eventId, event]));
  while (remaining.size) {
    const candidates = [...remaining.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.eventId.localeCompare(right.eventId));
    let progressed = false;
    for (const event of candidates) {
      const dependencies = [
        ...event.parents,
        ...((event.metadata.priorAuthorizedEventIds as string[] | undefined) ?? []),
      ];
      if (dependencies.some((eventId) => remaining.has(eventId))) continue;
      ordered.push(event);
      remaining.delete(event.eventId);
      progressed = true;
    }
    if (!progressed) {
      ordered.push(...candidates);
      break;
    }
  }
  return ordered;
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
    const certificate = event.metadata.certificate as unknown as DeviceCertificate;
    state.devices.set(deviceProjectionKey(event.actorAccountId, event.actorDeviceId), certificate);
  }
  if (event.eventType === "device.revoked") {
    const key = deviceProjectionKey(event.actorAccountId, event.resourceId);
    const device = state.devices.get(key);
    if (device) state.devices.set(key, { ...device, status: "revoked" });
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
  if (event.eventType === "grant.requested") {
    state.grantRequests.set(event.resourceId, {
      request: event.metadata.request as unknown as PetAccessRequest,
      eventId: event.eventId,
    });
  }
  if (event.eventType === "grant.request.cancelled" || event.eventType === "grant.request.rejected") {
    const projection = state.grantRequests.get(event.resourceId);
    if (projection) {
      state.grantRequests.set(event.resourceId, {
        request: {
          ...projection.request,
          status: event.eventType === "grant.request.cancelled" ? "cancelled" : "rejected",
          decidedAt: event.createdAt,
          decidedBy: event.actorAccountId,
        },
        eventId: event.eventId,
      });
    }
  }
  if (["grant.created", "grant.delegated"].includes(event.eventType)) {
    const grant = event.metadata.grant as unknown as PetAccessGrant;
    state.grants.set(event.resourceId, grant);
    if (event.eventType === "grant.created" && grant.requestId) {
      const projection = state.grantRequests.get(grant.requestId);
      if (projection) {
        state.grantRequests.set(grant.requestId, {
          request: {
            ...projection.request,
            status: "approved",
            decidedAt: event.createdAt,
            decidedBy: event.actorAccountId,
          },
          eventId: event.eventId,
        });
      }
    }
  }
  if (event.eventType === "grant.revoked" || event.eventType === "grant.relinquished") {
    const grant = state.grants.get(event.resourceId);
    if (grant) state.grants.set(event.resourceId, {
      ...grant,
      status: event.eventType === "grant.revoked" ? "revoked" : "relinquished",
      revokedAt: event.createdAt,
    });
  }
  if (event.eventType === "grant.actions.updated") {
    const grant = state.grants.get(event.resourceId);
    if (grant) state.grants.set(event.resourceId, {
      ...grant,
      actions: [...event.metadata.actions as PetAccessGrant["actions"]],
    });
  }
  if (event.eventType === "medical.record.confirmed") state.confirmedRecords.add(event.resourceId);
}

export async function reduceSignedEvents(events: SignedEvent[], state: ProtocolState, options: VerificationOptions = {}): Promise<ProjectionResult> {
  const accepted: SignedEvent[] = [];
  const conflicts: ProjectionConflict[] = [];
  const remaining = new Map(replayOrderedEvents(events).map((event) => [event.eventId, event]));
  const deferredResults = new Map<string, VerificationResult>();
  while (remaining.size) {
    let progressed = false;
    for (const [eventId, event] of remaining) {
      const result = await verifySignedEvent(event, state, { ...options, allowUnknownDevice: event.eventType === "device.attested" });
      if (!result.accepted) {
        if (shouldDeferEventVerification(result)) {
          deferredResults.set(eventId, result);
        } else {
          remaining.delete(eventId);
          deferredResults.delete(eventId);
          conflicts.push({ event, result });
        }
        continue;
      }
      remaining.delete(eventId);
      deferredResults.delete(eventId);
      progressed = true;
      applyAcceptedEvent(event, state);
      accepted.push(event);
    }
    if (!progressed) {
      for (const [eventId, event] of remaining) {
        conflicts.push({
          event,
          result: deferredResults.get(eventId) ?? { accepted: false, code: "EVENT_REJECTED", message: "The event was rejected." },
        });
      }
      break;
    }
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
    if (isGrantEffectivelyActive(state, grant)) continue;
    let inactiveGrant: PetAccessGrant | undefined = grant;
    while (inactiveGrant?.status === "active" && inactiveGrant.parentGrantId) inactiveGrant = state.grants.get(inactiveGrant.parentGrantId);
    const decision = events.findLast((event) => ["grant.revoked", "grant.relinquished"].includes(event.eventType)
      && event.resourceId === inactiveGrant?.grantId);
    const preserved = new Set((decision?.metadata.priorAuthorizedEventIds ?? []) as string[]);
    for (const event of events) {
      if (event.database !== "medical" || event.actorAccountId !== grant.granteeAccountId ||
        String(event.metadata.petId ?? event.aggregateId) !== grant.petId || preserved.has(event.eventId)) continue;
      if (["medical.record.created", "medical.record.updated", "medical.addendum.created", "grant.delegated"].includes(event.eventType)) {
        state.invalidatedEvents.set(event.eventId, "GRANT_REVOKED");
      }
    }
  }
}
