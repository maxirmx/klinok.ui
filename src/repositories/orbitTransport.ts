import {
  applyAcceptedEvent,
  ACCESS_CONTROLLER_TYPES,
  createProtocolState,
  describeOrbitEntryShape,
  extractSignedEvent,
  KlinokIdentityProvider,
  reduceSignedEvents,
  shouldDeferEventVerification,
  verifySignedEvent,
  type DatabaseKind,
  type ProtocolState,
  type SignedEvent,
} from "@klinok/protocol";
import { createBrowserHeliaInit } from "./browserStorage";
import { IndexedDbEventTransport, type AuthorizationConflict } from "./eventTransport";
import type { P2PClientConfig } from "../runtimeConfig";

interface OrbitDb {
  address?: { toString(): string } | string;
  add(value: SignedEvent): Promise<unknown>;
  iterator(): AsyncIterable<unknown>;
  close(): Promise<void>;
  events?: { on?(name: string, listener: (...args: unknown[]) => void): void; off?(name: string, listener: (...args: unknown[]) => void): void };
}

function orbitValue(entry: unknown): SignedEvent | null {
  return extractSignedEvent(entry);
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function logP2p(level: "info" | "warn" | "error", event: string, details: Record<string, unknown> = {}) {
  const message = JSON.stringify({ level, event, ...details });
  if (level === "error") console.error(message);
  else if (level === "warn") console.warn(message);
  else console.info(message);
}

function controller(
  state: ProtocolState,
  database: DatabaseKind,
  reject: (event: SignedEvent | undefined, code: string, details: Record<string, unknown>) => void,
  trust: Pick<P2PClientConfig, "authAttestationPublicKey" | "bootstrapSigningPublicKey">,
) {
  const type = ACCESS_CONTROLLER_TYPES[database];
  const factory = async () => ({
    type,
    address: `/${type}`,
    async canAppend(entry: { identity?: string; payload?: { value?: unknown }; value?: unknown }) {
      const baseDetails = { entryShape: describeOrbitEntryShape(entry), ...(entry.identity ? { entryIdentity: entry.identity } : {}) };
      if (!entry.identity) {
        reject(undefined, "ENTRY_IDENTITY_MISSING", baseDetails);
        return false;
      }
      const event = extractSignedEvent(entry);
      if (!event) {
        reject(undefined, "EVENT_PAYLOAD_INVALID", baseDetails);
        return false;
      }
      const details = { ...baseDetails, eventOrbitIdentity: event.orbitIdentityId };
      if (event.database !== database) {
        reject(event, "DATABASE_MISMATCH", details);
        return false;
      }
      const result = await verifySignedEvent(event, state, {
        allowUnknownDevice: event.eventType === "device.attested",
        authAttestationPublicKey: trust.authAttestationPublicKey,
        bootstrapSigningPublicKey: trust.bootstrapSigningPublicKey,
        requireTrustedAttestation: true,
      });
      if (shouldDeferEventVerification(result)) {
        logP2p("info", "p2p.authorization.deferred", {
          code: result.code,
          eventId: event.eventId,
          eventType: event.eventType,
          database: event.database,
          ...details,
        });
        return true;
      }
      if (!result.accepted) {
        reject(event, result.code ?? "EVENT_REJECTED", details);
        return false;
      }
      applyAcceptedEvent(event, state);
      return true;
    },
  });
  return Object.assign(factory, { type });
}

export class OrbitEventTransport extends IndexedDbEventTransport {
  private runtime: { helia: { stop(): Promise<unknown> }; orbitdb: { stop(): Promise<unknown> }; dbs: Record<DatabaseKind, OrbitDb> } | null = null;
  private disposing = false;
  private readonly remoteListeners = new Map<DatabaseKind, Set<() => void>>([["control", new Set()], ["medical", new Set()]]);
  private readonly updateHandlers = new Map<DatabaseKind, () => void>();
  private readonly accessState: ProtocolState;

  constructor(
    private readonly config: P2PClientConfig,
    private readonly identityId: string,
  ) {
    super();
    this.accessState = createProtocolState(config.bootstrapAccountId);
  }

  override async initialize() {
    await super.initialize();
    this.disposing = false;
    logP2p("info", "p2p.client.initialize.started", {
      configuredOrbitIdentity: this.identityId,
      trustedNodeMultiaddrs: this.config.trustedNodeMultiaddrs,
    });
    const [
      { createLibp2p }, { createHeliaLight }, { withBitswap }, { withHTTP }, { withLibp2p }, dagCbor, dagJson, json,
      { sha512 }, { createOrbitDB, useAccessController, useIdentityProvider }, { webSockets }, { bootstrap }, { identify }, { gossipsub }, { noise }, { yamux }, { multiaddr },
    ] = await Promise.all([
      import("libp2p"), import("helia"), import("@helia/bitswap"), import("@helia/http"), import("@helia/libp2p"),
      import("@ipld/dag-cbor"), import("@ipld/dag-json"), import("multiformats/codecs/json"), import("multiformats/hashes/sha2"),
      import("@orbitdb/core"), import("@libp2p/websockets"), import("@libp2p/bootstrap"), import("@libp2p/identify"),
      import("@libp2p/gossipsub"), import("@chainsafe/libp2p-noise"), import("@chainsafe/libp2p-yamux"), import("@multiformats/multiaddr"),
    ]);
    const rejected = (event: SignedEvent | undefined, code: string, details: Record<string, unknown>) => {
      logP2p("warn", "p2p.authorization.rejected", {
        code,
        eventId: event?.eventId,
        eventType: event?.eventType,
        database: event?.database,
        ...details,
      });
      if (event) void this.recordConflict({ eventId: event.eventId, database: event.database, code, message: "Событие отклонено проверкой P2P.", createdAt: event.createdAt });
    };
    const controlAccess = controller(this.accessState, "control", rejected, this.config);
    const medicalAccess = controller(this.accessState, "medical", rejected, this.config);
    useIdentityProvider(KlinokIdentityProvider);
    useAccessController(controlAccess);
    useAccessController(medicalAccess);
    const bootstrapAddresses = this.config.trustedNodeMultiaddrs.filter((address) => address.includes("/p2p/"));
    const configuredAddresses = this.config.trustedNodeMultiaddrs.map((address) => multiaddr(address));
    const isTrustedAddress = (candidate: string) => this.config.trustedNodeMultiaddrs.some((configured) =>
      configured === candidate || configured.startsWith(`${candidate}/p2p/`) || candidate.startsWith(`${configured}/p2p/`));
    const libp2p = await createLibp2p({
      addresses: { listen: [] }, transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
      connectionGater: { denyDialMultiaddr: (address) => !isTrustedAddress(address.toString()) },
      peerDiscovery: bootstrapAddresses.length ? [bootstrap({ list: bootstrapAddresses, tagTTL: Infinity })] : [],
      services: { identify: identify(), pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }) },
    });
    libp2p.addEventListener("peer:connect", (connectionEvent) => {
      logP2p("info", "p2p.peer.connected", { peerId: String(connectionEvent.detail) });
    });
    libp2p.addEventListener("peer:disconnect", (connectionEvent) => {
      logP2p(this.disposing ? "info" : "warn", "p2p.peer.disconnected", {
        peerId: String(connectionEvent.detail),
        ...(this.disposing ? { reason: "client_dispose" } : {}),
      });
    });
    for (const address of configuredAddresses) {
      const multiaddrText = address.toString();
      logP2p("info", "p2p.dial.started", { multiaddr: multiaddrText });
      try {
        const connection = await libp2p.dial(address);
        logP2p("info", "p2p.dial.succeeded", { multiaddr: multiaddrText, peerId: connection.remotePeer.toString() });
      } catch (error) {
        logP2p("error", "p2p.dial.failed", { multiaddr: multiaddrText, error: errorMessage(error) });
      }
    }
    const storage = await createBrowserHeliaInit(`klinok-${this.identityId}`);
    const helia = withBitswap(withLibp2p(withHTTP(createHeliaLight({ ...storage, codecs: [dagCbor, dagJson, json], hashers: [sha512] })), libp2p));
    await helia.start();
    const orbitdb = await createOrbitDB({
      ipfs: helia,
      identity: { id: this.identityId, provider: KlinokIdentityProvider },
      directory: `klinok-orbit-${this.identityId}`,
    });
    logP2p("info", "p2p.client.started", {
      configuredOrbitIdentity: this.identityId,
      actualOrbitIdentity: orbitdb.identity.id,
      peerId: libp2p.peerId.toString(),
    });
    const control = await orbitdb.open(this.config.controlDatabaseAddress ?? this.config.controlDatabaseName, { type: "events", AccessController: controlAccess }) as OrbitDb;
    logP2p("info", "p2p.database.opened", { database: "control", address: control.address?.toString() });
    const controlEvents = await this.remoteList(control);
    await reduceSignedEvents(controlEvents.filter((event) => !this.accessState.knownEvents.has(event.eventId)), this.accessState, {
      authAttestationPublicKey: this.config.authAttestationPublicKey,
      bootstrapSigningPublicKey: this.config.bootstrapSigningPublicKey,
      requireTrustedAttestation: true,
    });
    const medical = await orbitdb.open(this.config.medicalDatabaseAddress ?? this.config.medicalDatabaseName, { type: "events", AccessController: medicalAccess }) as OrbitDb;
    logP2p("info", "p2p.database.opened", { database: "medical", address: medical.address?.toString() });
    const medicalEvents = await this.remoteList(medical);
    await reduceSignedEvents(medicalEvents.filter((event) => !this.accessState.knownEvents.has(event.eventId)), this.accessState, {
      authAttestationPublicKey: this.config.authAttestationPublicKey,
      bootstrapSigningPublicKey: this.config.bootstrapSigningPublicKey,
      requireTrustedAttestation: true,
    });
    const runtime = { helia, orbitdb, dbs: { control, medical } };
    this.runtime = runtime;
    for (const database of ["control", "medical"] as const) {
      const handler = (...args: unknown[]) => {
        logP2p("info", "p2p.sync.update", { database, entryShape: describeOrbitEntryShape(args[0]) });
        void this.flushOutbox();
        for (const listener of this.remoteListeners.get(database) ?? []) listener();
      };
      this.updateHandlers.set(database, handler);
      runtime.dbs[database].events?.on?.("update", handler);
    }
    await this.flushOutbox();
  }

  private async remoteList(db: OrbitDb): Promise<SignedEvent[]> {
    const result: SignedEvent[] = [];
    for await (const entry of db.iterator()) {
      const value = orbitValue(entry);
      if (value) result.push(value);
    }
    return result;
  }

  override async list(database: DatabaseKind): Promise<SignedEvent[]> {
    const local = await super.list(database);
    const remote = this.runtime ? await this.remoteList(this.runtime.dbs[database]) : [];
    const merged = new Map([...local, ...remote].map((event) => [event.eventId, event]));
    for (const event of remote) await super.append(event);
    return [...merged.values()];
  }

  override async append(event: SignedEvent): Promise<void> {
    await super.append(event);
    try {
      if (!this.runtime) throw new Error("P2P transport is offline.");
      await this.runtime.dbs[event.database].add(event);
      await this.removeOutbox(event.eventId);
      logP2p("info", "p2p.append.succeeded", { eventId: event.eventId, eventType: event.eventType, database: event.database });
    } catch (error) {
      await this.queueOutbox(event);
      logP2p("warn", "p2p.append.queued", { eventId: event.eventId, eventType: event.eventType, database: event.database, error: errorMessage(error) });
    }
  }

  private async flushOutbox(): Promise<void> {
    if (!this.runtime) return;
    const pending = await this.pendingOutbox();
    if (pending.length) logP2p("info", "p2p.outbox.flush.started", { count: pending.length });
    for (const event of pending) {
      try {
        await this.runtime.dbs[event.database].add(event);
        await this.removeOutbox(event.eventId);
        logP2p("info", "p2p.outbox.flush.succeeded", { eventId: event.eventId, eventType: event.eventType, database: event.database });
      } catch (error) {
        logP2p("warn", "p2p.outbox.flush.failed", { eventId: event.eventId, eventType: event.eventType, database: event.database, error: errorMessage(error) });
      }
    }
  }

  override subscribe(database: DatabaseKind, listener: () => void): () => void {
    const localUnsubscribe = super.subscribe(database, listener);
    this.remoteListeners.get(database)!.add(listener);
    return () => { localUnsubscribe(); this.remoteListeners.get(database)!.delete(listener); };
  }

  override async recordConflict(conflict: AuthorizationConflict) { await super.recordConflict(conflict); }

  override async dispose() {
    this.disposing = true;
    logP2p("info", "p2p.client.dispose.started", { configuredOrbitIdentity: this.identityId });
    if (this.runtime) {
      for (const database of ["control", "medical"] as const) {
        const handler = this.updateHandlers.get(database);
        if (handler) this.runtime.dbs[database].events?.off?.("update", handler);
        await this.runtime.dbs[database].close();
      }
      await this.runtime.orbitdb.stop();
      await this.runtime.helia.stop();
      this.runtime = null;
    }
    await super.dispose();
    logP2p("info", "p2p.client.disposed", { configuredOrbitIdentity: this.identityId });
  }
}
