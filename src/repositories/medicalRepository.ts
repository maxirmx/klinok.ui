import {
  decryptPayload,
  generateDataKey,
  isGrantEffectivelyActive,
  unwrapDataKey,
  type ActiveRoleContext,
  type DeviceCertificate,
  type MedicalRecordConfirmation,
  type PetAccessRequest,
  type PetAccessGrant,
  type PetGrantAction,
  type SignedEvent,
  type UserKeySet,
} from "@klinok/protocol";
import type { EventTransport } from "./eventTransport";
import { EventFactory } from "./eventFactory";
import { deletePetKey, getPetKey, putPetKey } from "./petKeyVault";
import { loadUserKeys } from "./deviceVault";
import { normalizePetInput, normalizePetProfile } from "../petProfile";
import { encounterSummary, isFreeTextValue, isWhatHappenedValue } from "../medicalEncounter";
import type {
  MedicalEncounterInput,
  MedicalEncounterSection,
  MedicalRecordDraft,
  MedicalSnapshot,
  PetProfile,
  PetProfileInput,
} from "./types";
import type { ControlRepository } from "./controlRepository";

type Listener = (snapshot: MedicalSnapshot) => void;
type GrantDoctorOptions = {
  requestId?: string;
  granteeDisplayName?: string;
};

export class MedicalRepository {
  private readonly factory: EventFactory;
  private events: SignedEvent[] = [];
  private readonly listeners = new Set<Listener>();
  private unsubscribe: (() => void) | null = null;
  private reloadQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly transport: EventTransport,
    private context: ActiveRoleContext,
    private readonly keys: UserKeySet,
    private readonly certificate: DeviceCertificate,
    private readonly control: ControlRepository,
  ) {
    this.factory = new EventFactory({ context, keys });
  }

  async setActiveRole(role: ActiveRoleContext["role"], roleProofId: string): Promise<void> {
    this.context = { ...this.context, role, roleProofId };
    this.factory.setContext(this.context);
    await this.emit();
  }

  async initialize() {
    this.disposed = false;
    await this.reloadNow();
    this.unsubscribe = this.transport.subscribe("medical", () => { void this.queueReload(); });
  }

  private queueReload(): Promise<void> {
    this.reloadQueue = this.reloadQueue
      .then(() => this.disposed ? undefined : this.reloadNow())
      .catch((reason) => {
        if (!this.disposed) throw reason;
      });
    return this.reloadQueue;
  }

  private async reloadNow() {
    const events = await this.transport.list("medical");
    if (this.disposed) return;
    await this.control.signed.import(events);
    if (this.disposed) return;
    this.events = this.control.signed.list().filter((event) => event.database === "medical");
    for (const conflict of this.control.signed.conflicts.splice(0)) {
      if (this.disposed) return;
      await this.transport.recordConflict({
        eventId: conflict.event.eventId,
        database: conflict.event.database,
        code: conflict.result.code ?? "EVENT_REJECTED",
        message: conflict.result.message ?? "Событие отклонено.",
        createdAt: conflict.event.createdAt,
      });
    }
    for (const [eventId, code] of this.control.signed.state.invalidatedEvents) {
      if (this.disposed) return;
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

  async createPet(input: PetProfileInput): Promise<string> {
    const petId = crypto.randomUUID();
    const key = await generateDataKey();
    await putPetKey(this.context.accountId, petId, 1, key);
    const pet: PetProfile = {
      ...normalizePetInput(input),
      petId,
      ownerAccountId: this.context.accountId,
      keyVersion: 1,
      tombstoned: false,
      updatedAt: new Date().toISOString(),
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
    const normalized = normalizePetProfile(pet);
    const parent = this.events.findLast((event) => event.aggregateId === pet.petId && event.eventType.startsWith("pet."))?.eventId;
    const recipientIds = new Set([pet.ownerAccountId]);
    for (const grant of this.control.signed.state.grants.values()) {
      if (grant.petId === pet.petId && isGrantEffectivelyActive(this.control.signed.state, grant)) {
        recipientIds.add(grant.granteeAccountId);
      }
    }
    await this.append(await this.factory.create({
      database: "medical", eventType: pet.tombstoned ? "pet.tombstoned" : "pet.updated", aggregateId: pet.petId,
      metadata: { petId: pet.petId, ownerAccountId: pet.ownerAccountId, keyVersion: stored.version },
      cleartext: { ...normalized, keyVersion: stored.version, updatedAt: new Date().toISOString() },
      parents: parent ? [parent] : [], recipients: this.activeCertificates([...recipientIds]), dataKey: stored.key,
    }));
  }

  async requestAccess(petId: string): Promise<string> {
    const ownerAccountId = this.control.signed.state.petOwners.get(petId);
    if (!ownerAccountId) throw new Error("Питомец с таким идентификатором не найден.");
    const activeGrant = [...this.control.signed.state.grants.values()].some((grant) =>
      grant.petId === petId && grant.granteeAccountId === this.context.accountId &&
      isGrantEffectivelyActive(this.control.signed.state, grant),
    );
    if (activeGrant) throw new Error("У вас уже есть доступ к этому питомцу.");
    const duplicate = [...this.control.signed.state.grantRequests.values()].some(({ request }) =>
      request.petId === petId && request.requesterAccountId === this.context.accountId && request.status === "pending",
    );
    if (duplicate) throw new Error("Запрос этому владельцу уже отправлен.");
    const recipients = this.activeCertificates([ownerAccountId, this.context.accountId]);
    if (!recipients.some((certificate) => certificate.accountId === ownerAccountId)) {
      throw new Error("У владельца нет активного устройства для получения запроса.");
    }
    const profile = await this.control.profile();
    const displayName = [profile?.firstName, profile?.patronymic, profile?.lastName].filter(Boolean).join(" ");
    const request: PetAccessRequest = {
      requestId: crypto.randomUUID(),
      petId,
      ownerAccountId,
      requesterAccountId: this.context.accountId,
      ...(displayName ? { requesterDisplayName: displayName } : {}),
      status: "pending",
      requestedAt: new Date().toISOString(),
    };
    const publicRequest: PetAccessRequest = {
      requestId: request.requestId,
      petId: request.petId,
      ownerAccountId: request.ownerAccountId,
      requesterAccountId: request.requesterAccountId,
      status: request.status,
      requestedAt: request.requestedAt,
    };
    await this.append(await this.factory.create({
      database: "medical",
      eventType: "grant.requested",
      aggregateId: petId,
      resourceId: request.requestId,
      metadata: { petId, request: publicRequest as unknown as Record<string, unknown> },
      cleartext: request,
      recipients,
    }));
    return request.requestId;
  }

  async cancelAccessRequest(requestId: string): Promise<void> {
    const projection = this.control.signed.state.grantRequests.get(requestId);
    if (!projection || projection.request.status !== "pending") throw new Error("Ожидающий запрос не найден.");
    const request = projection.request;
    await this.append(await this.factory.create({
      database: "medical",
      eventType: "grant.request.cancelled",
      aggregateId: request.petId,
      resourceId: requestId,
      metadata: { petId: request.petId, requestId },
      cleartext: { requestId, status: "cancelled" },
      parents: [projection.eventId],
      recipients: this.activeCertificates([request.ownerAccountId, request.requesterAccountId]),
    }));
  }

  async rejectAccessRequest(requestId: string): Promise<void> {
    const projection = this.control.signed.state.grantRequests.get(requestId);
    if (!projection || projection.request.status !== "pending") throw new Error("Ожидающий запрос не найден.");
    const request = projection.request;
    await this.append(await this.factory.create({
      database: "medical",
      eventType: "grant.request.rejected",
      aggregateId: request.petId,
      resourceId: requestId,
      metadata: { petId: request.petId, requestId },
      cleartext: { requestId, status: "rejected" },
      parents: [projection.eventId],
      recipients: this.activeCertificates([request.ownerAccountId, request.requesterAccountId]),
    }));
  }

  async approveAccessRequest(requestId: string): Promise<string> {
    const projection = this.control.signed.state.grantRequests.get(requestId);
    if (!projection || projection.request.status !== "pending") throw new Error("Ожидающий запрос не найден.");
    const request = (await this.buildSnapshot()).accessRequests.find((candidate) => candidate.requestId === requestId);
    return this.grantDoctor(
      projection.request.petId,
      projection.request.requesterAccountId,
      ["read", "write_unconfirmed"],
      {
        requestId,
        ...(request?.requesterDisplayName ? { granteeDisplayName: request.requesterDisplayName } : {}),
      },
    );
  }

  async grantDoctor(
    petId: string,
    doctorAccountId: string,
    actions: PetGrantAction[],
    options: GrantDoctorOptions = {},
  ): Promise<string> {
    doctorAccountId = doctorAccountId.trim();
    if (!doctorAccountId) throw new Error("Идентификатор аккаунта врача не указан.");
    const granteeDisplayName = options.granteeDisplayName?.trim();
    const stored = await getPetKey(this.context.accountId, petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    const existing = [...this.control.signed.state.grants.values()].find((grant) =>
      grant.petId === petId && grant.granteeAccountId === doctorAccountId &&
      isGrantEffectivelyActive(this.control.signed.state, grant),
    );
    if (existing) throw new Error("У этого врача уже есть действующий доступ.");
    const requestProjection = options.requestId
      ? this.control.signed.state.grantRequests.get(options.requestId)
      : undefined;
    const grantId = crypto.randomUUID();
    const grant: PetAccessGrant = {
      grantId, petId, grantorAccountId: this.context.accountId, granteeAccountId: doctorAccountId,
      ...(granteeDisplayName ? { granteeDisplayName } : {}),
      actions: [...new Set(actions)], ...(options.requestId ? { requestId: options.requestId } : {}),
      petKeyVersion: stored.version, status: "active", createdAt: new Date().toISOString(),
    };
    const publicGrant: PetAccessGrant = {
      grantId: grant.grantId,
      petId: grant.petId,
      grantorAccountId: grant.grantorAccountId,
      granteeAccountId: grant.granteeAccountId,
      actions: grant.actions,
      ...(grant.requestId ? { requestId: grant.requestId } : {}),
      petKeyVersion: grant.petKeyVersion,
      status: grant.status,
      createdAt: grant.createdAt,
    };
    await this.append(await this.factory.create({
      database: "medical", eventType: "grant.created", aggregateId: petId, resourceId: grantId,
      metadata: {
        petId,
        grant: publicGrant as unknown as Record<string, unknown>,
        ...(options.requestId ? { requestId: options.requestId } : {}),
      },
      cleartext: grant,
      parents: requestProjection ? [requestProjection.eventId] : [],
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

  async deletePet(petId: string): Promise<void> {
    const snapshot = await this.buildSnapshot();
    const pet = snapshot.pets.find((candidate) => candidate.petId === petId);
    if (!pet) throw new Error("Питомец не найден.");
    for (const request of snapshot.accessRequests.filter((candidate) => candidate.petId === petId && candidate.status === "pending")) {
      await this.rejectAccessRequest(request.requestId);
    }
    const stored = await getPetKey(this.context.accountId, petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    const activeGrants = [...this.control.signed.state.grants.values()].filter((grant) =>
      grant.petId === petId && isGrantEffectivelyActive(this.control.signed.state, grant),
    );
    const revocationEventIds: string[] = [];
    for (const grant of activeGrants) {
      revocationEventIds.push(await this.appendGrantRevocation(grant, stored));
    }
    await this.rotatePetKey(petId, stored, revocationEventIds);
    const refreshed = (await this.buildSnapshot()).pets.find((candidate) => candidate.petId === petId) ?? pet;
    await this.updatePet({ ...refreshed, tombstoned: true });
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
    const revocationEventId = await this.appendGrantRevocation(grant, stored);
    await this.rotatePetKey(grant.petId, stored, [revocationEventId]);
  }

  async relinquishAccess(grantId: string): Promise<void> {
    const grant = this.control.signed.state.grants.get(grantId);
    if (!grant || grant.granteeAccountId !== this.context.accountId || !isGrantEffectivelyActive(this.control.signed.state, grant)) {
      throw new Error("Действующий доступ для отказа не найден.");
    }
    const stored = await getPetKey(this.context.accountId, grant.petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    const event = await this.factory.create({
      database: "medical",
      eventType: "grant.relinquished",
      aggregateId: grant.petId,
      resourceId: grant.grantId,
      metadata: {
        petId: grant.petId,
        grantId: grant.grantId,
        nextKeyVersion: stored.version + 1,
        priorAuthorizedEventIds: this.events
          .filter((candidate) => candidate.actorAccountId === grant.granteeAccountId && String(candidate.metadata.petId ?? candidate.aggregateId) === grant.petId)
          .map((candidate) => candidate.eventId),
      },
      proofIds: [this.context.roleProofId, grant.grantId],
      cleartext: { grantId: grant.grantId },
      parents: this.events.filter((candidate) => candidate.resourceId === grant.grantId).map((candidate) => candidate.eventId).slice(-1),
      recipients: this.activeCertificates([grant.grantorAccountId, grant.granteeAccountId]),
      dataKey: stored.key,
    });
    await this.append(event);
    await this.rotatePetKey(grant.petId, stored, [event.eventId], grant.grantId);
  }

  async disableGrantDelegation(grantId: string): Promise<void> {
    await this.updateGrantDelegation(grantId, false);
  }

  async enableGrantDelegation(grantId: string): Promise<void> {
    await this.updateGrantDelegation(grantId, true);
  }

  private async updateGrantDelegation(grantId: string, enabled: boolean): Promise<void> {
    const grant = this.control.signed.state.grants.get(grantId);
    if (!grant || !isGrantEffectivelyActive(this.control.signed.state, grant)) {
      throw new Error("Действующий доступ не найден.");
    }
    if (grant.actions.includes("delegate") === enabled) {
      throw new Error(enabled ? "Делегирование уже разрешено." : "Делегирование уже отключено.");
    }
    const stored = await getPetKey(this.context.accountId, grant.petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    const actions: PetGrantAction[] = enabled
      ? [...grant.actions, "delegate"]
      : grant.actions.filter((candidate) => candidate !== "delegate");
    await this.append(await this.factory.create({
      database: "medical",
      eventType: "grant.actions.updated",
      aggregateId: grant.petId,
      resourceId: grant.grantId,
      metadata: { petId: grant.petId, grantId: grant.grantId, actions },
      cleartext: { grantId: grant.grantId, actions },
      parents: this.events.filter((event) => event.resourceId === grant.grantId).map((event) => event.eventId).slice(-1),
      recipients: this.activeCertificates([grant.grantorAccountId, grant.granteeAccountId]),
      dataKey: stored.key,
    }));
  }

  private async appendGrantRevocation(
    grant: PetAccessGrant,
    stored: { version: number; key: CryptoKey },
  ): Promise<string> {
    const event = await this.factory.create({
      database: "medical", eventType: "grant.revoked", aggregateId: grant.petId, resourceId: grant.grantId,
      metadata: {
        petId: grant.petId,
        grantId: grant.grantId,
        nextKeyVersion: stored.version + 1,
        priorAuthorizedEventIds: this.events
          .filter((event) => event.actorAccountId === grant.granteeAccountId && String(event.metadata.petId ?? event.aggregateId) === grant.petId)
          .map((event) => event.eventId),
      },
      cleartext: { grantId: grant.grantId },
      parents: this.events.filter((event) => event.resourceId === grant.grantId).map((event) => event.eventId).slice(-1),
      recipients: this.activeCertificates([grant.grantorAccountId, grant.granteeAccountId]), dataKey: stored.key,
    });
    await this.append(event);
    return event.eventId;
  }

  private async rotatePetKey(
    petId: string,
    stored: { version: number; key: CryptoKey },
    revocationEventIds: string[],
    relinquishedGrantId?: string,
  ): Promise<void> {
    const currentPetEvent = this.events.findLast((event) => event.aggregateId === petId && event.eventType.startsWith("pet."));
    const pet = currentPetEvent ? await this.decrypt<PetProfile>(currentPetEvent) : null;
    if (!pet || !currentPetEvent) throw new Error("Профиль питомца недоступен для ротации ключа.");
    const nextKey = await generateDataKey();
    const activeRecipients = new Set([pet.ownerAccountId]);
    for (const candidate of this.control.signed.state.grants.values()) {
      if (candidate.petId === petId && isGrantEffectivelyActive(this.control.signed.state, candidate)) {
        activeRecipients.add(candidate.granteeAccountId);
      }
    }
    if (activeRecipients.has(this.context.accountId)) await putPetKey(this.context.accountId, petId, stored.version + 1, nextKey);
    await this.append(await this.factory.create({
      database: "medical", eventType: "pet.key.rotated", aggregateId: petId, resourceId: petId,
      metadata: {
        petId,
        ownerAccountId: pet.ownerAccountId,
        keyVersion: stored.version + 1,
        ...(relinquishedGrantId ? { relinquishedGrantId } : {}),
      },
      ...(relinquishedGrantId ? { proofIds: [this.context.roleProofId, relinquishedGrantId] } : {}),
      cleartext: { ...pet, keyVersion: stored.version + 1, updatedAt: new Date().toISOString() },
      parents: [...new Set([currentPetEvent.eventId, ...revocationEventIds])],
      recipients: this.activeCertificates([...activeRecipients]), dataKey: nextKey,
    }));
    if (!activeRecipients.has(this.context.accountId)) await deletePetKey(this.context.accountId, petId);
  }

  async saveRecord(input: { petId: string; title: string; text: string; recordId?: string }): Promise<string> {
    return this.saveEncounter({
      petId: input.petId,
      encounterDate: new Date().toISOString().slice(0, 10),
      sections: { "what-happened": { selectedIds: [], comment: input.text } },
      ...(input.recordId ? { recordId: input.recordId } : {}),
    }, input.title);
  }

  async saveEncounter(input: MedicalEncounterInput, legacyTitle = "Что случилось"): Promise<string> {
    if ("addendumTo" in input) throw new Error("Дополнения к медицинским записям не поддерживаются.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.encounterDate) || input.encounterDate > new Date().toISOString().slice(0, 10)) {
      throw new Error("Укажите корректную дату приёма.");
    }
    const whatHappened = input.sections["what-happened"];
    if (!isWhatHappenedValue(whatHappened) || (!whatHappened.selectedIds.length && !whatHappened.comment.trim())) {
      throw new Error("В разделе «Что случилось» выберите хотя бы один вариант или добавьте комментарий.");
    }
    for (const [kind, value] of Object.entries(input.sections)) {
      if (kind !== "what-happened" && (!isFreeTextValue(value) || !value.text.trim())) {
        throw new Error("Заполните или удалите пустой дополнительный раздел.");
      }
    }
    const stored = await getPetKey(this.context.accountId, input.petId);
    if (!stored) throw new Error("Ключ питомца недоступен.");
    const recordId = input.recordId ?? crypto.randomUUID();
    const previous = this.events.findLast((event) => event.resourceId === recordId && event.eventType.startsWith("medical.record."));
    const now = new Date().toISOString();
    const profile = await this.control.profile();
    const authorDisplayName = [profile?.firstName, profile?.patronymic, profile?.lastName].filter(Boolean).join(" ") || this.context.accountId;
    const sections = Object.fromEntries(Object.entries(input.sections).map(([kind, value]) => [kind, {
      kind,
      templateVersion: kind === "what-happened" ? "what-happened-v1" : "free-text-v0",
      value,
      authorAccountId: this.context.accountId,
      authorDisplayName,
      updatedAt: now,
    }])) as MedicalRecordDraft["sections"];
    const record: MedicalRecordDraft = {
      petId: input.petId,
      recordId,
      revision: Number(previous?.metadata.revision ?? 0) + 1,
      authorAccountId: this.context.accountId,
      authorDisplayName,
      encounterDate: input.encounterDate,
      title: legacyTitle,
      text: whatHappened.comment,
      sections,
      createdAt: String(previous?.metadata.createdAt ?? now),
      updatedAt: now,
    };
    const recipientIds = new Set([this.control.signed.state.petOwners.get(input.petId) ?? "", this.context.accountId]);
    for (const grant of this.control.signed.state.grants.values()) {
      if (grant.petId === input.petId && isGrantEffectivelyActive(this.control.signed.state, grant)) recipientIds.add(grant.granteeAccountId);
    }
    await this.append(await this.factory.create({
      database: "medical", eventType: previous ? "medical.record.updated" : "medical.record.created",
      aggregateId: input.petId, resourceId: recordId,
      metadata: { petId: input.petId, recordId, revision: record.revision, createdAt: record.createdAt, encounterDate: record.encounterDate },
      proofIds: [
        this.context.roleProofId,
        ...[...this.control.signed.state.grants.values()]
          .filter((grant) => grant.petId === input.petId && grant.granteeAccountId === this.context.accountId
            && isGrantEffectivelyActive(this.control.signed.state, grant))
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
    const requestDetails = new Map<string, PetAccessRequest>();
    const records = new Map<string, MedicalRecordDraft>();
    const confirmations: MedicalRecordConfirmation[] = [];
    for (const event of this.events) {
      if (this.control.signed.state.invalidatedEvents.has(event.eventId)) continue;
      if (event.eventType.startsWith("pet.")) {
        const decrypted = await this.decryptWithKey<PetProfile>(event);
        if (decrypted) {
          const pet = normalizePetProfile(decrypted.value);
          pets.set(pet.petId, pet);
          await putPetKey(this.context.accountId, pet.petId, Number(event.metadata.keyVersion ?? pet.keyVersion), decrypted.key);
        }
      }
      if (event.eventType === "grant.requested") {
        const request = await this.decrypt<PetAccessRequest>(event);
        if (request) requestDetails.set(request.requestId, request);
      }
      if (["grant.created", "grant.delegated"].includes(event.eventType)) {
        const grant = await this.decrypt<PetAccessGrant>(event);
        if (grant) grants.set(grant.grantId, isGrantEffectivelyActive(this.control.signed.state, grant) ? grant : { ...grant, status: "revoked" });
      }
      if (event.eventType === "grant.revoked" || event.eventType === "grant.relinquished") {
        const grant = grants.get(event.resourceId);
        if (grant) grants.set(grant.grantId, {
          ...grant,
          status: event.eventType === "grant.relinquished" ? "relinquished" : "revoked",
          revokedAt: event.createdAt,
        });
      }
      if (event.eventType === "grant.actions.updated") {
        const grant = grants.get(event.resourceId);
        const actions = event.metadata.actions as PetGrantAction[] | undefined;
        if (grant && Array.isArray(actions)) grants.set(grant.grantId, { ...grant, actions: [...actions] });
      }
      // Legacy addendum events remain readable, but no current command API can create them.
      if (["medical.record.created", "medical.record.updated", "medical.addendum.created"].includes(event.eventType)) {
        const raw = await this.decrypt<Partial<MedicalRecordDraft> & Pick<MedicalRecordDraft, "recordId" | "petId" | "revision" | "authorAccountId" | "createdAt" | "updatedAt">>(event);
        if (raw) {
          const authorDisplayName = raw.authorDisplayName || raw.authorAccountId;
          const sections = raw.sections ?? {
            "what-happened": {
              kind: "what-happened",
              templateVersion: "what-happened-v1",
              value: { selectedIds: [], comment: raw.text ?? "" },
              authorAccountId: raw.authorAccountId,
              authorDisplayName,
              updatedAt: raw.updatedAt,
            } satisfies MedicalEncounterSection,
          };
          const record: MedicalRecordDraft = {
            ...raw,
            authorDisplayName,
            encounterDate: raw.encounterDate ?? raw.createdAt.slice(0, 10),
            title: raw.title ?? "Что случилось",
            text: raw.text ?? "",
            sections,
          } as MedicalRecordDraft;
          if (!record.text) record.text = encounterSummary(record);
          records.set(record.recordId, record);
        }
      }
      if (event.eventType === "medical.record.confirmed") {
        const confirmation = await this.decrypt<MedicalRecordConfirmation>(event);
        if (confirmation) confirmations.push(confirmation);
      }
    }
    if (this.context.role === "administrator") {
      return { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [], events: [...this.events] };
    }
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
    const accessRequests = [...this.control.signed.state.grantRequests.values()]
      .map(({ request }) => ({ ...requestDetails.get(request.requestId), ...request }))
      .filter((request) => this.context.role === "owner"
        ? request.ownerAccountId === this.context.accountId && accessiblePetIds.has(request.petId)
        : request.requesterAccountId === this.context.accountId);
    const accessibleRecords = [...records.values()].filter((record) => accessiblePetIds.has(record.petId));
    return {
      pets: [...pets.values()].filter((pet) => accessiblePetIds.has(pet.petId) && !pet.tombstoned),
      grants: [...grants.values()].filter((grant) => accessiblePetIds.has(grant.petId)),
      accessRequests,
      records: accessibleRecords,
      confirmations: confirmations.filter((confirmation) => accessiblePetIds.has(confirmation.petId)),
      confirmedRecordIds: accessibleRecords
        .filter((record) => this.control.signed.state.confirmedRecords.has(record.recordId))
        .map((record) => record.recordId),
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

  async dispose() {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners.clear();
  }
}
