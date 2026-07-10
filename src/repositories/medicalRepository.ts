import {
  decryptPayload,
  generateDataKey,
  isGrantEffectivelyActive,
  unwrapDataKey,
  type ActiveRoleContext,
  type DeviceCertificate,
  type MedicalRecordConfirmation,
  type PetAccessGrant,
  type PetGrantAction,
  type SignedEvent,
  type UserKeySet,
} from "@klinok/protocol";
import type { EventTransport } from "./eventTransport";
import { EventFactory } from "./eventFactory";
import { getPetKey, putPetKey } from "./petKeyVault";
import { loadUserKeys } from "./deviceVault";
import type { MedicalRecordDraft, MedicalSnapshot, PetProfile } from "./types";
import type { ControlRepository } from "./controlRepository";

type Listener = (snapshot: MedicalSnapshot) => void;

export class MedicalRepository {
  private readonly factory: EventFactory;
  private events: SignedEvent[] = [];
  private readonly listeners = new Set<Listener>();
  private unsubscribe: (() => void) | null = null;
  private reloadQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly transport: EventTransport,
    private context: ActiveRoleContext,
    private readonly keys: UserKeySet,
    private readonly certificate: DeviceCertificate,
    private readonly control: ControlRepository,
  ) {
    this.factory = new EventFactory({ context, keys });
  }

  setActiveRole(role: ActiveRoleContext["role"], roleProofId: string) {
    this.context = { ...this.context, role, roleProofId };
    this.factory.setContext(this.context);
  }

  async initialize() {
    await this.reloadNow();
    this.unsubscribe = this.transport.subscribe("medical", () => { void this.queueReload(); });
  }

  private queueReload(): Promise<void> {
    this.reloadQueue = this.reloadQueue.then(() => this.reloadNow());
    return this.reloadQueue;
  }

  private async reloadNow() {
    const events = await this.transport.list("medical");
    await this.control.signed.import(events);
    this.events = this.control.signed.list().filter((event) => event.database === "medical");
    for (const conflict of this.control.signed.conflicts.splice(0)) {
      await this.transport.recordConflict({
        eventId: conflict.event.eventId,
        database: conflict.event.database,
        code: conflict.result.code ?? "EVENT_REJECTED",
        message: conflict.result.message ?? "Событие отклонено.",
        createdAt: conflict.event.createdAt,
      });
    }
    for (const [eventId, code] of this.control.signed.state.invalidatedEvents) {
      const event = this.events.find((candidate) => candidate.eventId === eventId);
      if (event) await this.transport.recordConflict({
        eventId,
        database: "medical",
        code,
        message: "Офлайн-событие проиграло более строгому состоянию доступа.",
        createdAt: event.createdAt,
      });
      await this.transport.removeOutbox(eventId);
    }
    await this.emit();
  }

  private async append(event: SignedEvent) {
    try {
      await this.control.signed.append(event);
      await this.transport.append(event);
      this.events = this.control.signed.list().filter((candidate) => candidate.database === "medical");
      await this.emit();
    } catch (reason) {
      await this.transport.recordConflict({
        eventId: event.eventId,
        database: event.database,
        code: reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "EVENT_REJECTED",
        message: reason instanceof Error ? reason.message : "Событие отклонено.",
        createdAt: event.createdAt,
      });
      throw reason;
    }
  }

  private activeCertificates(accountIds: string[]): DeviceCertificate[] {
    return [...this.control.signed.state.devices.values()].filter((device) => device.status === "active" && accountIds.includes(device.accountId));
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

  private async decryptWithKey<T>(event: SignedEvent): Promise<{ value: T; key: CryptoKey } | null> {
    const envelope = event.keyring.find((item) => item.recipientId === this.context.accountId);
    if (!envelope) return null;
    try {
      const keys = envelope.keyVersion === this.keys.version ? this.keys : await loadUserKeys(this.context.accountId, envelope.keyVersion);
      if (!keys) return null;
      const key = await unwrapDataKey(envelope, keys.encryptionPrivateKey);
      return { value: await decryptPayload<T>(event.payload, key), key };
    } catch {
      return null;
    }
  }

  async createPet(input: Omit<PetProfile, "petId" | "ownerAccountId" | "keyVersion" | "tombstoned" | "updatedAt">): Promise<string> {
    const petId = crypto.randomUUID();
    const key = await generateDataKey();
    await putPetKey(this.context.accountId, petId, 1, key);
    const pet: PetProfile = {
      ...input, petId, ownerAccountId: this.context.accountId, keyVersion: 1, tombstoned: false, updatedAt: new Date().toISOString(),
    };
    await this.append(await this.factory.create({
      database: "medical", eventType: "pet.created", aggregateId: petId,
      metadata: { petId, ownerAccountId: this.context.accountId, keyVersion: 1 }, cleartext: pet,
      recipients: this.activeCertificates([this.context.accountId]).length
        ? this.activeCertificates([this.context.accountId])
        : [this.certificate],
      dataKey: key,
    }));
    return petId;
  }

  async updatePet(pet: PetProfile): Promise<void> {
    const stored = await getPetKey(this.context.accountId, pet.petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    const parent = this.events.findLast((event) => event.aggregateId === pet.petId && event.eventType.startsWith("pet."))?.eventId;
    await this.append(await this.factory.create({
      database: "medical", eventType: pet.tombstoned ? "pet.tombstoned" : "pet.updated", aggregateId: pet.petId,
      metadata: { petId: pet.petId, ownerAccountId: pet.ownerAccountId, keyVersion: stored.version }, cleartext: { ...pet, updatedAt: new Date().toISOString() },
      parents: parent ? [parent] : [], recipients: this.activeCertificates([pet.ownerAccountId]), dataKey: stored.key,
    }));
  }

  async grantDoctor(petId: string, doctorAccountId: string, actions: PetGrantAction[]): Promise<string> {
    const stored = await getPetKey(this.context.accountId, petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    const grantId = crypto.randomUUID();
    const grant: PetAccessGrant = {
      grantId, petId, grantorAccountId: this.context.accountId, granteeAccountId: doctorAccountId,
      actions: [...new Set(actions)], petKeyVersion: stored.version, status: "active", createdAt: new Date().toISOString(),
    };
    await this.append(await this.factory.create({
      database: "medical", eventType: "grant.created", aggregateId: petId, resourceId: grantId,
      metadata: { petId, grant: grant as unknown as Record<string, unknown> }, cleartext: grant,
      recipients: this.activeCertificates([this.context.accountId, doctorAccountId]), dataKey: stored.key,
    }));
    const petEvent = this.events.findLast((event) => event.aggregateId === petId && event.eventType.startsWith("pet."));
    const pet = petEvent ? await this.decrypt<PetProfile>(petEvent) : null;
    if (pet) {
      const grantEvent = this.events.findLast((event) => event.resourceId === grantId)!;
      await this.append(await this.factory.create({
        database: "medical", eventType: "pet.shared", aggregateId: petId, resourceId: petId,
        metadata: { petId, ownerAccountId: pet.ownerAccountId, keyVersion: stored.version, grantId }, cleartext: pet,
        parents: [grantEvent.eventId], recipients: this.activeCertificates([this.context.accountId, doctorAccountId]), dataKey: stored.key,
      }));
    }
    return grantId;
  }

  async delegateGrant(parentGrantId: string, doctorAccountId: string, actions: PetGrantAction[]): Promise<string> {
    const parent = this.control.signed.state.grants.get(parentGrantId);
    if (!parent) throw new Error("Исходный доступ не найден.");
    const stored = await getPetKey(this.context.accountId, parent.petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    const grantId = crypto.randomUUID();
    const grant: PetAccessGrant = {
      grantId, petId: parent.petId, grantorAccountId: this.context.accountId, granteeAccountId: doctorAccountId,
      actions: [...new Set(actions)], parentGrantId, petKeyVersion: stored.version, status: "active", createdAt: new Date().toISOString(),
    };
    const ownerAccountId = this.control.signed.state.petOwners.get(parent.petId);
    const delegation = await this.factory.create({
      database: "medical", eventType: "grant.delegated", aggregateId: parent.petId, resourceId: grantId,
      metadata: { petId: parent.petId, parentGrantId, actions, grant: grant as unknown as Record<string, unknown> }, cleartext: grant,
      proofIds: [this.context.roleProofId, parentGrantId],
      parents: this.events.filter((event) => event.resourceId === parentGrantId).map((event) => event.eventId).slice(-1),
      recipients: this.activeCertificates([this.context.accountId, doctorAccountId, ...(ownerAccountId ? [ownerAccountId] : [])]), dataKey: stored.key,
    });
    await this.append(delegation);
    const petEvent = this.events.findLast((event) => event.aggregateId === parent.petId && event.eventType.startsWith("pet."));
    const pet = petEvent ? await this.decrypt<PetProfile>(petEvent) : null;
    if (pet) await this.append(await this.factory.create({
      database: "medical", eventType: "pet.shared", aggregateId: parent.petId, resourceId: parent.petId,
      metadata: { petId: parent.petId, ownerAccountId: pet.ownerAccountId, keyVersion: stored.version, grantId, parentGrantId },
      proofIds: [this.context.roleProofId, parentGrantId], cleartext: pet, parents: [delegation.eventId],
      recipients: this.activeCertificates([this.context.accountId, doctorAccountId, ...(ownerAccountId ? [ownerAccountId] : [])]), dataKey: stored.key,
    }));
    return grantId;
  }

  async revokeGrant(grantId: string): Promise<void> {
    const grant = this.control.signed.state.grants.get(grantId);
    if (!grant) throw new Error("Доступ не найден.");
    const stored = await getPetKey(this.context.accountId, grant.petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    await this.append(await this.factory.create({
      database: "medical", eventType: "grant.revoked", aggregateId: grant.petId, resourceId: grantId,
      metadata: {
        petId: grant.petId,
        grantId,
        nextKeyVersion: stored.version + 1,
        priorAuthorizedEventIds: this.events
          .filter((event) => event.actorAccountId === grant.granteeAccountId && String(event.metadata.petId ?? event.aggregateId) === grant.petId)
          .map((event) => event.eventId),
      },
      cleartext: { grantId },
      parents: this.events.filter((event) => event.resourceId === grantId).map((event) => event.eventId).slice(-1),
      recipients: this.activeCertificates([grant.grantorAccountId, grant.granteeAccountId]), dataKey: stored.key,
    }));
    const nextKey = await generateDataKey();
    await putPetKey(this.context.accountId, grant.petId, stored.version + 1, nextKey);
    const currentPetEvent = this.events.findLast((event) => event.aggregateId === grant.petId && event.eventType.startsWith("pet."));
    const pet = currentPetEvent ? await this.decrypt<PetProfile>(currentPetEvent) : null;
    if (pet) {
      const activeRecipients = new Set([grant.grantorAccountId]);
      for (const candidate of this.control.signed.state.grants.values()) {
        if (candidate.petId === grant.petId && candidate.grantId !== grantId && isGrantEffectivelyActive(this.control.signed.state, candidate)) {
          activeRecipients.add(candidate.granteeAccountId);
        }
      }
      await this.append(await this.factory.create({
        database: "medical", eventType: "pet.key.rotated", aggregateId: grant.petId, resourceId: grant.petId,
        metadata: { petId: grant.petId, ownerAccountId: pet.ownerAccountId, keyVersion: stored.version + 1 },
        cleartext: { ...pet, keyVersion: stored.version + 1, updatedAt: new Date().toISOString() },
        parents: this.events.filter((event) => event.aggregateId === grant.petId && event.eventType.startsWith("pet.")).map((event) => event.eventId).slice(-1),
        recipients: this.activeCertificates([...activeRecipients]), dataKey: nextKey,
      }));
    }
  }

  async saveRecord(input: Omit<MedicalRecordDraft, "recordId" | "revision" | "authorAccountId" | "createdAt" | "updatedAt"> & { recordId?: string }): Promise<string> {
    const stored = await getPetKey(this.context.accountId, input.petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    const recordId = input.recordId ?? crypto.randomUUID();
    const previous = this.events.findLast((event) => event.resourceId === recordId && event.eventType.startsWith("medical.record."));
    const record: MedicalRecordDraft = {
      ...input, recordId, revision: Number(previous?.metadata.revision ?? 0) + 1,
      authorAccountId: this.context.accountId,
      createdAt: String(previous?.metadata.createdAt ?? new Date().toISOString()), updatedAt: new Date().toISOString(),
    };
    const recipientIds = new Set([this.control.signed.state.petOwners.get(input.petId) ?? "", this.context.accountId]);
    for (const grant of this.control.signed.state.grants.values()) if (grant.petId === input.petId && grant.status === "active") recipientIds.add(grant.granteeAccountId);
    await this.append(await this.factory.create({
      database: "medical", eventType: previous ? "medical.record.updated" : input.addendumTo ? "medical.addendum.created" : "medical.record.created",
      aggregateId: input.petId, resourceId: recordId,
      metadata: { petId: input.petId, recordId, revision: record.revision, createdAt: record.createdAt, ...(input.addendumTo ? { addendumTo: input.addendumTo } : {}) },
      proofIds: [
        this.context.roleProofId,
        ...[...this.control.signed.state.grants.values()]
          .filter((grant) => grant.petId === input.petId && grant.granteeAccountId === this.context.accountId && grant.status === "active")
          .map((grant) => grant.grantId),
      ],
      cleartext: record, parents: previous ? [previous.eventId] : [], recipients: this.activeCertificates([...recipientIds].filter(Boolean)), dataKey: stored.key,
    }));
    return recordId;
  }

  async confirmRecord(petId: string, recordId: string, revision: number): Promise<void> {
    const stored = await getPetKey(this.context.accountId, petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    const confirmation: MedicalRecordConfirmation = {
      confirmationId: crypto.randomUUID(), petId, recordId, recordRevision: revision,
      ownerAccountId: this.context.accountId, confirmedAt: new Date().toISOString(),
    };
    await this.append(await this.factory.create({
      database: "medical", eventType: "medical.record.confirmed", aggregateId: petId, resourceId: recordId,
      metadata: { petId, recordId, revision }, cleartext: confirmation,
      parents: this.events.filter((event) => event.resourceId === recordId).map((event) => event.eventId).slice(-1),
      recipients: this.activeCertificates([this.context.accountId]), dataKey: stored.key,
    }));
  }

  async snapshot(): Promise<MedicalSnapshot> {
    await this.reloadQueue;
    return this.buildSnapshot();
  }

  private async buildSnapshot(): Promise<MedicalSnapshot> {
    const pets = new Map<string, PetProfile>();
    const grants = new Map<string, PetAccessGrant>();
    const records = new Map<string, MedicalRecordDraft>();
    const confirmations: MedicalRecordConfirmation[] = [];
    for (const event of this.events) {
      if (this.control.signed.state.invalidatedEvents.has(event.eventId)) continue;
      if (event.eventType.startsWith("pet.")) {
        const decrypted = await this.decryptWithKey<PetProfile>(event);
        if (decrypted) {
          pets.set(decrypted.value.petId, decrypted.value);
          await putPetKey(this.context.accountId, decrypted.value.petId, Number(event.metadata.keyVersion ?? decrypted.value.keyVersion), decrypted.key);
        }
      }
      if (["grant.created", "grant.delegated"].includes(event.eventType)) {
        const grant = await this.decrypt<PetAccessGrant>(event);
        if (grant) grants.set(grant.grantId, isGrantEffectivelyActive(this.control.signed.state, grant) ? grant : { ...grant, status: "revoked" });
      }
      if (event.eventType === "grant.revoked") {
        const grant = grants.get(event.resourceId);
        if (grant) grants.set(grant.grantId, { ...grant, status: "revoked", revokedAt: event.createdAt });
      }
      if (["medical.record.created", "medical.record.updated", "medical.addendum.created"].includes(event.eventType)) {
        const record = await this.decrypt<MedicalRecordDraft>(event);
        if (record) records.set(record.recordId, record);
      }
      if (event.eventType === "medical.record.confirmed") {
        const confirmation = await this.decrypt<MedicalRecordConfirmation>(event);
        if (confirmation) confirmations.push(confirmation);
      }
    }
    if (this.context.role === "administrator") return { pets: [], grants: [], records: [], confirmations: [], events: [...this.events] };
    const accessiblePetIds = new Set<string>();
    if (this.context.role === "owner") {
      for (const pet of pets.values()) if (pet.ownerAccountId === this.context.accountId) accessiblePetIds.add(pet.petId);
    } else {
      for (const grant of this.control.signed.state.grants.values()) {
        if (grant.granteeAccountId === this.context.accountId && grant.actions.includes("read") && isGrantEffectivelyActive(this.control.signed.state, grant)) {
          accessiblePetIds.add(grant.petId);
        }
      }
    }
    return {
      pets: [...pets.values()].filter((pet) => accessiblePetIds.has(pet.petId) && !pet.tombstoned),
      grants: [...grants.values()].filter((grant) => accessiblePetIds.has(grant.petId)),
      records: [...records.values()].filter((record) => accessiblePetIds.has(record.petId)),
      confirmations: confirmations.filter((confirmation) => accessiblePetIds.has(confirmation.petId)),
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
