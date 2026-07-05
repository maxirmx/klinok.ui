// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import type { AppointmentDraft } from "../data";
import type { P2PClientConfig } from "../runtimeConfig";
import { KlinokAccessController } from "./accessController";
import {
  createParticipantKeyPair,
  decryptReplicatedEventRecord,
  encryptReplicatedEvent,
  encryptReplicatedEventWithKeyring,
  exportParticipantKeyPair,
  generateCaseKey,
  importParticipantKeyPair,
  importParticipantPublicKey,
  unwrapCaseKeyFromRecord,
  wrapCaseKeyForParticipants,
  type EncryptedEventRecord,
  type ParticipantKeyPair,
  type ParticipantPublicKey,
} from "./crypto";
import { createCaseEvent, createOwnerRequestEvent, isCaseEvent, reduceCaseEvents, reduceSingleCase } from "./events";
import { createDappEvent, isDappEvent, reduceDappCollections } from "../dapp/repository";
import type { DappEvent, DappWatchCallback, DrugRecord } from "../dapp/types";
import type { CaseEventInput, CaseRepository, CaseWatchCallback, CreateCaseOptions, ReplicatedEvent } from "./types";

interface OrbitRuntime {
  libp2p: unknown;
  helia: { stop?: () => Promise<void> };
  orbitdb: { stop?: () => Promise<void>; open: (name: string, options?: unknown) => Promise<OrbitEventsDb> };
  db: OrbitEventsDb;
}

interface OrbitEventsDb {
  address: string;
  add: (record: EncryptedEventRecord) => Promise<unknown>;
  iterator: () => AsyncIterable<unknown>;
  close?: () => Promise<void>;
  events?: {
    on?: (event: "update", callback: () => void) => void;
    off?: (event: "update", callback: () => void) => void;
  };
}

const KEY_STORAGE_PREFIX = "klinok:p2p:participant:";

function extractOrbitValue(entry: unknown): EncryptedEventRecord | null {
  if (!entry || typeof entry !== "object") return null;
  const candidate = entry as {
    payload?: { value?: EncryptedEventRecord };
    value?: EncryptedEventRecord;
    schemaVersion?: number;
  };

  const value = candidate.payload?.value ?? candidate.value ?? candidate;
  if (
    value &&
    typeof value === "object" &&
    (value as EncryptedEventRecord).schemaVersion === 2
  ) {
    return value as EncryptedEventRecord;
  }

  return null;
}

async function loadOrCreateParticipantKeyPair(config: P2PClientConfig): Promise<ParticipantKeyPair> {
  if (config.participantPrivateKey && config.participantPublicKeys[config.participantId]) {
    return importParticipantKeyPair(
      config.participantId,
      config.participantPublicKeys[config.participantId],
      config.participantPrivateKey,
    );
  }

  const storageKey = `${KEY_STORAGE_PREFIX}${config.participantId}`;
  const stored = typeof localStorage === "undefined" ? null : localStorage.getItem(storageKey);
  if (stored) {
    const parsed = JSON.parse(stored) as { publicKey: JsonWebKey; privateKey: JsonWebKey };
    return importParticipantKeyPair(config.participantId, parsed.publicKey, parsed.privateKey);
  }

  const pair = await createParticipantKeyPair(config.participantId);
  if (typeof localStorage !== "undefined") {
    const exported = await exportParticipantKeyPair(pair);
    localStorage.setItem(
      storageKey,
      JSON.stringify({ publicKey: exported.publicKey, privateKey: exported.privateKey }),
    );
  }

  return pair;
}

async function loadRecipients(config: P2PClientConfig, self: ParticipantKeyPair): Promise<ParticipantPublicKey[]> {
  const configured = await Promise.all(
    Object.entries(config.participantPublicKeys).map(([participantId, key]) =>
      importParticipantPublicKey(participantId, key),
    ),
  );

  if (configured.some((recipient) => recipient.participantId === self.participantId)) {
    return configured;
  }

  return [...configured, { participantId: self.participantId, publicKey: self.publicKey }];
}

async function createOrbitRuntime(config: P2PClientConfig): Promise<OrbitRuntime> {
  const [
    { createLibp2p },
    { createHelia },
    { createOrbitDB, useAccessController },
    { webSockets },
    { bootstrap },
    { identify },
    { gossipsub },
    { noise },
    { yamux },
    { multiaddr },
  ] = await Promise.all([
    import("libp2p"),
    import("helia"),
    import("@orbitdb/core"),
    import("@libp2p/websockets"),
    import("@libp2p/bootstrap"),
    import("@libp2p/identify"),
    import("@chainsafe/libp2p-gossipsub"),
    import("@chainsafe/libp2p-noise"),
    import("@chainsafe/libp2p-yamux"),
    import("@multiformats/multiaddr"),
  ]);

  const bootstrapMultiaddrs: string[] = [];
  const directDialMultiaddrs: ReturnType<typeof multiaddr>[] = [];

  for (const address of config.trustedNodeMultiaddrs) {
    try {
      const trustedNode = multiaddr(address);
      if (trustedNode.getPeerId()) {
        bootstrapMultiaddrs.push(address);
      } else {
        directDialMultiaddrs.push(trustedNode);
      }
    } catch {
      // Invalid runtime config entries are ignored; other trusted nodes may still be usable.
    }
  }

  const peerDiscovery = bootstrapMultiaddrs.length
    ? [bootstrap({ list: bootstrapMultiaddrs, tagTTL: Infinity })]
    : [];

  const libp2p = await createLibp2p({
    addresses: { listen: [] },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery,
    services: {
      identify: identify(),
      pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }),
    },
  });

  for (const address of directDialMultiaddrs) {
    try {
      await libp2p.dial(address);
    } catch {
      // Bootstrap discovery may still connect later; explicit dial is best-effort for the spike.
    }
  }

  const createHeliaAny = createHelia as unknown as (init: unknown) => Promise<OrbitRuntime["helia"]>;
  const createOrbitDBAny = createOrbitDB as unknown as (init: unknown) => Promise<OrbitRuntime["orbitdb"]>;
  useAccessController(KlinokAccessController);
  const helia = await createHeliaAny({ libp2p });
  const orbitdb = await createOrbitDBAny({ ipfs: helia, id: config.identityId });
  const write = config.writeIdentityIds.length ? config.writeIdentityIds : ["*"];
  const dbName = config.databaseAddress || config.databaseName;
  const db = await orbitdb.open(dbName, {
    type: "events",
    AccessController: KlinokAccessController({ write }),
  });

  return { libp2p, helia, orbitdb, db };
}

export async function createOrbitCaseRepository(config: P2PClientConfig): Promise<CaseRepository> {
  const participant = await loadOrCreateParticipantKeyPair(config);
  const recipients = await loadRecipients(config, participant);
  return new OrbitCaseRepository(config, participant, recipients);
}

class OrbitCaseRepository implements CaseRepository {
  private runtime: OrbitRuntime | null = null;

  private readonly listeners = new Set<CaseWatchCallback>();

  private readonly dappListeners = new Set<DappWatchCallback>();

  private readonly caseKeys = new Map<string, CryptoKey>();

  private updateHandler: (() => void) | null = null;

  constructor(
    private readonly config: P2PClientConfig,
    private readonly participant: ParticipantKeyPair,
    private readonly recipients: ParticipantPublicKey[],
  ) {}

  async initialize() {
    if (this.runtime) return;
    this.runtime = await createOrbitRuntime(this.config);
    this.updateHandler = () => {
      void this.emit();
    };
    this.runtime.db.events?.on?.("update", this.updateHandler);
    await this.emit();
  }

  async listCases() {
    const events = (await this.listDecryptedEvents()).filter(isCaseEvent);
    return reduceCaseEvents(events);
  }

  watchCases(callback: CaseWatchCallback) {
    this.listeners.add(callback);
    void this.listCases().then(callback);

    return () => {
      this.listeners.delete(callback);
    };
  }

  async createCaseFromAppointment(draft: AppointmentDraft, options: CreateCaseOptions = {}) {
    const db = this.requireDb();
    const event = createOwnerRequestEvent(draft, {
      actorId: this.participant.participantId,
      complaintRecord: options.complaintRecord,
    });
    const caseKey = await generateCaseKey();
    const keyring = await wrapCaseKeyForParticipants(caseKey, this.recipients);
    const record = await encryptReplicatedEventWithKeyring(event, caseKey, keyring);
    this.caseKeys.set(event.caseId, caseKey);
    await db.add(record);
    await this.emit();

    const view = reduceSingleCase(event.caseId, [event]);
    if (!view) {
      throw new Error("Failed to create case view from OrbitDB event.");
    }
    return view;
  }

  async appendCaseEvent(caseId: string, input: CaseEventInput) {
    const db = this.requireDb();
    const existingRecord = await this.findFirstRecord(caseId);
    if (!existingRecord) {
      return null;
    }

    const caseKey = this.caseKeys.get(caseId) ?? (await unwrapCaseKeyFromRecord(existingRecord, this.participant));
    this.caseKeys.set(caseId, caseKey);

    const event = createCaseEvent(caseId, input, {
      actorId: this.participant.participantId,
      actorRole: input.actorRole ?? "vet",
    });
    const record = await encryptReplicatedEventWithKeyring(event, caseKey, existingRecord.keyring);
    await db.add(record);
    await this.emit();

    return reduceSingleCase(caseId, [...(await this.listDecryptedEvents()).filter(isCaseEvent).filter((item) => item.caseId === caseId)]);
  }

  async listDappCollections() {
    const events = await this.listDecryptedEvents();
    return reduceDappCollections({
      caseEvents: events.filter(isCaseEvent),
      dappEvents: events.filter(isDappEvent),
    });
  }

  watchDappCollections(callback: DappWatchCallback) {
    this.dappListeners.add(callback);
    void this.listDappCollections().then(callback);

    return () => {
      this.dappListeners.delete(callback);
    };
  }

  async saveDrugRecord(record: DrugRecord) {
    const event: DappEvent = createDappEvent({
      type: "drug.record.saved",
      payload: { record },
      actorId: this.participant.participantId,
      createdAt: record.updatedAt,
    });
    await this.addDappEvent(event);
    await this.emit();
    return record;
  }

  async deleteDrugRecord(id: string) {
    const exists = (await this.listDappCollections()).drugRecords.some((record) => record.id === id);
    if (!exists) return false;
    await this.addDappEvent(createDappEvent({
      type: "drug.record.deleted",
      payload: { id },
      actorId: this.participant.participantId,
    }));
    await this.emit();
    return true;
  }

  async dispose() {
    if (!this.runtime) return;
    if (this.updateHandler) {
      this.runtime.db.events?.off?.("update", this.updateHandler);
    }
    await this.runtime.db.close?.();
    await this.runtime.orbitdb.stop?.();
    await this.runtime.helia.stop?.();
    this.runtime = null;
  }

  private requireDb() {
    if (!this.runtime) {
      throw new Error("Orbit case repository is not initialized.");
    }
    return this.runtime.db;
  }

  private async emit() {
    const events = await this.listDecryptedEvents();
    const cases = reduceCaseEvents(events.filter(isCaseEvent));
    for (const listener of this.listeners) {
      listener(cases);
    }

    const collections = reduceDappCollections({
      caseEvents: events.filter(isCaseEvent),
      dappEvents: events.filter(isDappEvent),
    });
    for (const listener of this.dappListeners) {
      listener(collections);
    }
  }

  private async listRecords() {
    const db = this.requireDb();
    const records: EncryptedEventRecord[] = [];
    for await (const entry of db.iterator()) {
      const record = extractOrbitValue(entry);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  private async listDecryptedEvents(): Promise<ReplicatedEvent[]> {
    const events: ReplicatedEvent[] = [];
    for (const record of await this.listRecords()) {
      try {
        const event = await decryptReplicatedEventRecord(record, this.participant);
        if (isCaseEvent(event) && !this.caseKeys.has(event.caseId)) {
          const caseKey = await unwrapCaseKeyFromRecord(record, this.participant);
          this.caseKeys.set(event.caseId, caseKey);
        }
        events.push(event);
      } catch {
        // Records for other participant sets remain opaque by design.
      }
    }
    return events;
  }

  private async findFirstRecord(caseId: string) {
    return (await this.listRecords()).find((record) => record.caseId === caseId) ?? null;
  }

  private async addDappEvent(event: DappEvent) {
    const eventKey = await generateCaseKey();
    const record = await encryptReplicatedEvent(event, eventKey, this.recipients);
    await this.requireDb().add(record);
  }
}
