import {
  decryptPayload,
  InMemorySignedEventRepository,
  unwrapDataKey,
  type AccountProfile,
  type ActiveRoleContext,
  type ConsentReceipt,
  type DeviceCertificate,
  type RegistrationSetupDto,
  type Role,
  type RoleStatus,
  type SignedEvent,
  type UserKeySet,
} from "@klinok/protocol";
import { EventFactory } from "./eventFactory";
import type { AuthorizationConflict, EventTransport } from "./eventTransport";
import type { ControlSnapshot, RoleDecisionInput } from "./types";
import { loadUserKeys } from "./deviceVault";

type Listener = (snapshot: ControlSnapshot) => void;

function roleKey(accountId: string, role: Role) { return `${accountId}:${role}`; }

export class ControlRepository {
  readonly signed: InMemorySignedEventRepository;
  private readonly factory: EventFactory;
  private readonly listeners = new Set<Listener>();
  private events: SignedEvent[] = [];
  private unsubscribe: (() => void) | null = null;
  private reloadQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly transport: EventTransport,
    private context: ActiveRoleContext,
    private readonly keys: UserKeySet,
    private readonly certificate: DeviceCertificate,
    bootstrapAccountId: string,
    signed?: InMemorySignedEventRepository,
  ) {
    this.signed = signed ?? new InMemorySignedEventRepository(bootstrapAccountId);
    this.factory = new EventFactory({ context, keys });
  }

  setActiveRole(role: Role, roleProofId: string) {
    this.context = { ...this.context, role, roleProofId };
    this.factory.setContext(this.context);
  }

  async initialize(setup?: RegistrationSetupDto, deviceOperationId?: string): Promise<void> {
    await this.reloadNow();
    this.unsubscribe = this.transport.subscribe("control", () => { void this.queueReload(); });
    if (!this.signed.state.devices.has(this.context.deviceId)) {
      await this.append(await this.factory.create({
        database: "control",
        eventType: "device.attested",
        aggregateId: this.context.accountId,
        resourceId: this.context.deviceId,
        ...(deviceOperationId ? { operationId: deviceOperationId } : {}),
        metadata: { certificate: this.certificate as unknown as Record<string, unknown> },
        cleartext: { certificate: this.certificate },
        recipients: [this.certificate],
      }));
    }
    if (setup && this.context.accountId === this.signed.state.bootstrapAccountId && !this.signed.state.roles.has(roleKey(this.context.accountId, "administrator"))) {
      await this.append(await this.factory.create({
        database: "control",
        eventType: "account.bootstrap",
        aggregateId: this.context.accountId,
        resourceId: "bootstrap-administrator-role",
        parents: [this.latestDeviceEventId()],
        metadata: { role: "administrator", status: "approved" },
        cleartext: setup,
        recipients: [this.certificate],
      }));
    }
    if (setup && !this.events.some((event) => event.eventType === "profile.updated" && event.aggregateId === this.context.accountId)) {
      await this.updateProfile({ accountId: this.context.accountId, revision: 1, ...setup.profile, updatedAt: new Date().toISOString() });
    }
    if (setup && !this.events.some((event) => event.eventType === "consent.accepted" && event.aggregateId === this.context.accountId)) {
      const consent: ConsentReceipt = {
        accountId: this.context.accountId,
        acceptedAt: new Date().toISOString(),
        ageConfirmed: true,
        personalDataConsentVersion: setup.personalDataConsentVersion,
        userAgreementVersion: setup.userAgreementVersion,
        signature: `signed-event:${this.context.deviceId}`,
      };
      await this.append(await this.factory.create({
        database: "control", eventType: "consent.accepted", aggregateId: this.context.accountId,
        metadata: {
          accountId: this.context.accountId,
          personalDataConsentVersion: setup.personalDataConsentVersion,
          userAgreementVersion: setup.userAgreementVersion,
        },
        cleartext: consent, parents: [this.latestDeviceEventId()].filter(Boolean),
        recipients: this.profileRecipients().length ? this.profileRecipients() : [this.certificate],
      }));
    }
    if (setup) {
      for (const role of setup.requestedRoles) {
        if (this.context.accountId === this.signed.state.bootstrapAccountId && role === "administrator") continue;
        if (!this.signed.state.roles.has(roleKey(this.context.accountId, role))) await this.requestRole(role, 1);
      }
    }
    const active = this.signed.state.roles.get(roleKey(this.context.accountId, this.context.role));
    if (active?.request.status === "approved") this.setActiveRole(this.context.role, active.request.requestId);
    await this.emit();
  }

  private latestDeviceEventId(): string {
    return this.events.findLast((event) => event.eventType === "device.attested" && event.resourceId === this.context.deviceId)?.eventId ?? "";
  }

  private queueReload(): Promise<void> {
    this.reloadQueue = this.reloadQueue.then(() => this.reloadNow());
    return this.reloadQueue;
  }

  private async reloadNow() {
    const remote = await this.transport.list("control");
    await this.signed.import(remote);
    this.events = this.signed.list().filter((event) => event.database === "control");
    for (const conflict of this.signed.conflicts.splice(0)) {
      await this.transport.recordConflict({
        eventId: conflict.event.eventId,
        database: conflict.event.database,
        code: conflict.result.code ?? "EVENT_REJECTED",
        message: conflict.result.message ?? "Событие отклонено.",
        createdAt: conflict.event.createdAt,
      });
    }
    await this.emit();
  }

  private async append(event: SignedEvent) {
    try {
      await this.signed.append(event);
      await this.transport.append(event);
      this.events = this.signed.list().filter((candidate) => candidate.database === "control");
      await this.emit();
    } catch (reason) {
      const conflict: AuthorizationConflict = {
        eventId: event.eventId,
        database: event.database,
        code: reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "EVENT_REJECTED",
        message: reason instanceof Error ? reason.message : "Событие отклонено.",
        createdAt: event.createdAt,
      };
      await this.transport.recordConflict(conflict);
      throw reason;
    }
  }

  private ownRecipients(): DeviceCertificate[] {
    return [...this.signed.state.devices.values()].filter((device) => device.accountId === this.context.accountId && device.status === "active");
  }

  private profileRecipients(accountId = this.context.accountId, extraAccountIds: string[] = []): DeviceCertificate[] {
    const accountIds = new Set([accountId, ...extraAccountIds]);
    for (const projection of this.signed.state.roles.values()) {
      if (projection.request.role === "administrator" && projection.request.status === "approved") accountIds.add(projection.request.accountId);
    }
    return [...this.signed.state.devices.values()].filter((device) => device.status === "active" && accountIds.has(device.accountId));
  }

  private async decrypt<T>(event: SignedEvent): Promise<T | null> {
    const envelope = event.keyring.find((item) => item.recipientId === this.context.accountId);
    if (!envelope) return null;
    try {
      const keys = envelope.keyVersion === this.keys.version ? this.keys : await loadUserKeys(this.context.accountId, envelope.keyVersion);
      if (!keys) return null;
      return decryptPayload<T>(event.payload, await unwrapDataKey(envelope, keys.encryptionPrivateKey));
    } catch {
      return null;
    }
  }

  async updateProfile(profile: AccountProfile, operationId?: string): Promise<void> {
    if (operationId && this.events.some((event) => event.eventType === "profile.updated" && event.operationId === operationId)) return;
    const parent = this.events.findLast((event) => event.eventType === "profile.updated" && event.aggregateId === profile.accountId)?.eventId;
    await this.append(await this.factory.create({
      database: "control", eventType: "profile.updated", aggregateId: profile.accountId,
      ...(operationId ? { operationId } : {}),
      metadata: { accountId: profile.accountId, revision: profile.revision }, cleartext: profile,
      parents: parent ? [parent] : [this.latestDeviceEventId()].filter(Boolean), recipients: this.profileRecipients().length ? this.profileRecipients() : [this.certificate],
    }));
  }

  async requestRole(role: Role, profileRevision: number): Promise<void> {
    const current = this.signed.state.roles.get(roleKey(this.context.accountId, role));
    const status: RoleStatus = role === "owner" ? "approved" : "pending";
    const eventType = current ? "role.resubmitted" : status === "approved" ? "role.approved" : "role.requested";
    const requestId = current?.request.requestId ?? crypto.randomUUID();
    const operationId = crypto.randomUUID();
    const transition = await this.factory.create({
      database: "control", eventType, aggregateId: this.context.accountId,
      resourceId: requestId, operationId,
      parents: current ? [current.eventId] : [],
      metadata: {
        requestId, accountId: this.context.accountId, role, status,
        profileRevision, requestedAt: new Date().toISOString(),
      },
      cleartext: { role, status, profileRevision }, recipients: this.ownRecipients().length ? this.ownRecipients() : [this.certificate],
    });
    await this.append(transition);
    await this.appendRoleCompanions(transition, this.ownRecipients(), { role, status, profileRevision });
  }

  async cancelRole(role: Role): Promise<void> {
    const current = this.signed.state.roles.get(roleKey(this.context.accountId, role));
    if (!current) return;
    const operationId = crypto.randomUUID();
    const transition = await this.factory.create({
      database: "control", eventType: "role.cancelled", aggregateId: this.context.accountId,
      resourceId: current.request.requestId, operationId, parents: [current.eventId],
      metadata: { requestId: current.request.requestId, accountId: this.context.accountId, role, status: "not_requested", profileRevision: current.request.profileRevision },
      cleartext: { role }, recipients: this.ownRecipients(),
    });
    await this.append(transition);
    await this.appendRoleCompanions(transition, this.ownRecipients(), { role, status: "not_requested" });
  }

  async decideRole(input: RoleDecisionInput): Promise<void> {
    const current = this.signed.state.roles.get(roleKey(input.accountId, input.role));
    if (!current) throw new Error("Заявка роли не найдена.");
    const operationId = crypto.randomUUID();
    const recipients = [...this.signed.state.devices.values()].filter((device) =>
      device.status === "active" && (device.accountId === input.accountId || device.accountId === this.context.accountId),
    );
    const decision = await this.factory.create({
      database: "control", eventType: `role.${input.status}`, aggregateId: input.accountId,
      resourceId: current.request.requestId, operationId, parents: [current.eventId],
      metadata: {
        requestId: current.request.requestId,
        accountId: input.accountId,
        role: input.role,
        status: input.status,
        profileRevision: current.request.profileRevision,
        ...(["suspended", "revoked"].includes(input.status) ? {
          priorAuthorizedEventIds: this.signed.list()
            .filter((event) => event.database === "medical" && event.actorAccountId === input.accountId)
            .map((event) => event.eventId),
        } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      },
      cleartext: input, recipients,
    });
    await this.append(decision);
    await this.appendRoleCompanions(decision, recipients, input);
    if (input.role === "administrator" && input.status === "approved") await this.rewrapProfilesForAdministrator(input.accountId, operationId);
  }

  private async appendRoleCompanions(transition: SignedEvent, recipients: DeviceCertificate[], cleartext: unknown): Promise<void> {
    for (const companion of [
      { eventType: "audit.role-transition", resourceId: `audit-${transition.eventId}` },
      { eventType: "notification.role-transition", resourceId: `notification-${transition.eventId}` },
      { eventType: "email.role-transition", resourceId: `email-${transition.eventId}` },
    ]) {
      await this.append(await this.factory.create({
        database: "control", ...companion, aggregateId: transition.aggregateId, operationId: transition.operationId,
        parents: [transition.eventId], metadata: {
          accountId: transition.aggregateId,
          role: transition.metadata.role,
          status: transition.metadata.status,
        },
        cleartext, recipients,
      }));
    }
  }

  private async rewrapProfilesForAdministrator(accountId: string, operationId: string): Promise<void> {
    const latest = new Map<string, SignedEvent>();
    for (const event of this.events) {
      if (event.eventType === "profile.updated" || event.eventType === "profile.key.rewrapped") latest.set(event.aggregateId, event);
    }
    for (const source of latest.values()) {
      const profile = await this.decrypt<AccountProfile>(source);
      if (!profile) continue;
      await this.append(await this.factory.create({
        database: "control", eventType: "profile.key.rewrapped", aggregateId: profile.accountId,
        resourceId: source.eventId, operationId, parents: [source.eventId],
        metadata: { accountId: profile.accountId, revision: profile.revision, sourceEventId: source.eventId, newAdministratorAccountId: accountId },
        cleartext: profile, recipients: this.profileRecipients(profile.accountId, [accountId]),
      }));
    }
  }

  async deleteAccount(operationId: string): Promise<void> {
    if (this.events.some((event) => event.eventType === "account.deleted" && event.operationId === operationId)) return;
    const parent = this.events.findLast((event) => event.eventType === "profile.updated" && event.aggregateId === this.context.accountId)?.eventId;
    await this.append(await this.factory.create({
      database: "control", eventType: "account.deleted", aggregateId: this.context.accountId,
      operationId, metadata: { accountId: this.context.accountId }, cleartext: { deletedAt: new Date().toISOString() },
      parents: parent ? [parent] : [], recipients: this.ownRecipients(),
    }));
  }

  async revokeDevice(deviceId: string): Promise<void> {
    const parent = this.events.findLast((event) => event.eventType.startsWith("device.") && event.resourceId === deviceId)?.eventId;
    await this.append(await this.factory.create({
      database: "control", eventType: "device.revoked", aggregateId: this.context.accountId, resourceId: deviceId,
      metadata: { accountId: this.context.accountId, deviceId }, cleartext: { revokedAt: new Date().toISOString() },
      parents: parent ? [parent] : [], recipients: this.ownRecipients(),
    }));
  }

  async rotateCurrentDevice(certificate: DeviceCertificate): Promise<void> {
    const parent = this.events.findLast((event) => event.eventType.startsWith("device.") && event.resourceId === certificate.deviceId)?.eventId;
    await this.append(await this.factory.create({
      database: "control", eventType: "device.rotated", aggregateId: this.context.accountId, resourceId: certificate.deviceId,
      metadata: { accountId: this.context.accountId, certificate: certificate as unknown as Record<string, unknown> },
      cleartext: { certificate }, parents: parent ? [parent] : [], recipients: this.ownRecipients(),
    }));
  }

  async snapshot(): Promise<ControlSnapshot> {
    await this.reloadQueue;
    return this.buildSnapshot();
  }

  private async buildSnapshot(): Promise<ControlSnapshot> {
    let profile: AccountProfile | null = null;
    const profiles = new Map<string, AccountProfile>();
    const notifications: ControlSnapshot["notifications"] = [];
    for (const event of this.events) {
      if (event.eventType === "profile.updated" || event.eventType === "profile.key.rewrapped") {
        const value = await this.decrypt<AccountProfile>(event);
        if (value) {
          profiles.set(value.accountId, value);
          if (event.aggregateId === this.context.accountId) profile = value;
        }
      }
      if (event.eventType === "notification.role-transition" && event.aggregateId === this.context.accountId) {
        notifications.push({ id: event.eventId, title: "Статус роли изменён", message: String(event.metadata.status ?? ""), createdAt: event.createdAt });
      }
    }
    const roles = [...this.signed.state.roles.values()].map((value) => value.request);
    return {
      profile,
      profiles: [...profiles.values()],
      roles: roles.filter((role) => role.accountId === this.context.accountId),
      allRoles: roles,
      devices: [...this.signed.state.devices.values()].filter((device) => device.accountId === this.context.accountId),
      pendingQueue: roles.filter((role) => role.status === "pending"),
      notifications,
      events: [...this.events],
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    void this.snapshot().then(listener);
    return () => this.listeners.delete(listener);
  }

  private async emit() {
    if (!this.listeners.size) return;
    const snapshot = await this.buildSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  async dispose() { this.unsubscribe?.(); }
}
