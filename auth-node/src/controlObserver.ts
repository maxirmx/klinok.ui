// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import {
  applyAcceptedEvent,
  ACCESS_CONTROLLER_TYPES,
  createProtocolState,
  extractSignedEvent,
  KlinokIdentityProvider,
  roleProjectionKey,
  shouldDeferEventVerification,
  verifySignedEvent,
  type ProtocolState,
  type Role,
  type RoleStatus,
  type SignedEvent,
} from "@klinok/protocol";
import type { AuthConfig } from "./config.js";
import type { Mailer } from "./mailer.js";
import type { AuthStore } from "./store.js";

interface ObserverRuntime {
  dbs: Array<{
    address?: { toString(): string } | string;
    iterator(): AsyncIterable<unknown>;
    close(): Promise<void>;
    events?: { on?(event: string, callback: () => void): void; off?(event: string, callback: () => void): void };
  }>;
  orbitdb: { stop(): Promise<unknown> };
  helia: { stop(): Promise<unknown> };
}

function valueFrom(entry: unknown): SignedEvent | null {
  return extractSignedEvent(entry);
}

async function waitForDatabaseJoin(database: ObserverRuntime["dbs"][number], timeoutMs = 5_000): Promise<boolean> {
  const events = database.events;
  if (!events?.on || !events.off) return false;
  return new Promise((resolve) => {
    const joined = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = (replicated: boolean) => {
      clearTimeout(timer);
      events.off?.("join", joined);
      resolve(replicated);
    };
    events.on?.("join", joined);
  });
}

export function roleStatusMailText(role: unknown, status: unknown): string {
  const roleLabels: Record<Role, string> = {
    administrator: "Администратор",
    doctor: "Врач",
    owner: "Владелец",
  };
  const roleLabel = roleLabels[role as Role] ?? String(role);
  const messages: Record<RoleStatus, string> = {
    not_requested: `Роль «${roleLabel}» не запрошена.`,
    pending: `Ваша заявка на роль «${roleLabel}» ожидает подтверждения.`,
    approved: `Ваша роль «${roleLabel}» подтверждена.`,
    rejected: `Ваша заявка на роль «${roleLabel}» отклонена.`,
    suspended: `Ваша роль «${roleLabel}» приостановлена.`,
    revoked: `Ваша роль «${roleLabel}» отозвана.`,
    expired: `Срок действия вашей роли «${roleLabel}» истёк.`,
  };
  return messages[status as RoleStatus] ?? `Статус роли «${roleLabel}» изменён.`;
}

function observerAccessController(
  state: ProtocolState,
  authAttestationPublicKey: JsonWebKey,
  bootstrapSigningPublicKey: JsonWebKey | undefined,
  database: "control" | "medical",
) {
  const type = ACCESS_CONTROLLER_TYPES[database];
  const factory = async () => ({
    type,
    address: `/${type}`,
    async canAppend(entry: { identity?: string; payload?: { value?: unknown }; value?: unknown }) {
      if (!entry.identity) return false;
      const event = extractSignedEvent(entry);
      if (!event) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "auth.control-observer.authorization.rejected",
          code: "EVENT_PAYLOAD_INVALID",
        }));
        return false;
      }
      const result = await verifySignedEvent(event, state, {
        allowUnknownDevice: event.eventType === "device.attested",
        authAttestationPublicKey,
        bootstrapSigningPublicKey,
        requireTrustedAttestation: true,
      });
      if (shouldDeferEventVerification(result)) {
        console.log(JSON.stringify({
          level: "info",
          event: "auth.control-observer.authorization.deferred",
          code: result.code,
          eventId: event.eventId,
          eventType: event.eventType,
        }));
        return true;
      }
      if (!result.accepted) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "auth.control-observer.authorization.rejected",
          code: result.code,
          eventId: event.eventId,
          eventType: event.eventType,
        }));
        return false;
      }
      applyAcceptedEvent(event, state);
      return true;
    },
  });
  return Object.assign(factory, { type });
}

export class ControlPlaneObserver {
  private runtime: ObserverRuntime | null = null;
  private updateHandler: (() => void) | null = null;
  private readonly state = createProtocolState(process.env.KLINOK_BOOTSTRAP_ACCOUNT_ID);
  private readonly accessState = createProtocolState(process.env.KLINOK_BOOTSTRAP_ACCOUNT_ID);
  private processing: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: AuthConfig,
    private readonly store: AuthStore,
    private readonly mailer: Mailer,
    private readonly authAttestationPublicKey: JsonWebKey,
  ) {}

  async start(): Promise<void> {
    if (!this.config.controlObserver.enabled) return;
    const [
      { createLibp2p }, { createHeliaLight }, { withBitswap }, { withHTTP }, { withLibp2p }, dagCbor, dagJson, json,
      { sha512 }, { createOrbitDB, useAccessController, useIdentityProvider }, { webSockets }, { bootstrap }, { identify }, { gossipsub }, { noise }, { yamux }, { multiaddr }, { LevelBlockstore },
    ] = await Promise.all([
      import("libp2p"), import("helia"), import("@helia/bitswap"), import("@helia/http"), import("@helia/libp2p"),
      import("@ipld/dag-cbor"), import("@ipld/dag-json"), import("multiformats/codecs/json"), import("multiformats/hashes/sha2"),
      import("@orbitdb/core"), import("@libp2p/websockets"), import("@libp2p/bootstrap"), import("@libp2p/identify"),
      import("@libp2p/gossipsub"), import("@chainsafe/libp2p-noise"), import("@chainsafe/libp2p-yamux"), import("@multiformats/multiaddr"), import("blockstore-level"),
    ]);
    const controlAccess = observerAccessController(this.accessState, this.authAttestationPublicKey, this.config.bootstrapSigningPublicKey, "control");
    const medicalAccess = observerAccessController(this.accessState, this.authAttestationPublicKey, this.config.bootstrapSigningPublicKey, "medical");
    useIdentityProvider(KlinokIdentityProvider);
    useAccessController(controlAccess);
    useAccessController(medicalAccess);
    const peerAddresses = this.config.controlObserver.trustedNodeMultiaddrs;
    console.log(JSON.stringify({ level: "info", event: "auth.control-observer.starting", trustedNodeMultiaddrs: peerAddresses }));
    const discovery = peerAddresses.filter((item) => item.includes("/p2p/"));
    const configuredAddresses = peerAddresses.map((item) => multiaddr(item));
    const libp2p = await createLibp2p({
      addresses: { listen: [] }, transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
      peerDiscovery: discovery.length ? [bootstrap({ list: discovery, tagTTL: Infinity })] : [],
      services: { identify: identify(), pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }) },
    });
    for (const address of configuredAddresses) {
      try {
        const connection = await libp2p.dial(address);
        console.log(JSON.stringify({ level: "info", event: "auth.control-observer.dial.succeeded", multiaddr: address.toString(), peerId: connection.remotePeer.toString() }));
      } catch (error) {
        console.error(JSON.stringify({ level: "error", event: "auth.control-observer.dial.failed", multiaddr: address.toString(), error: error instanceof Error ? error.message : String(error) }));
      }
    }
    const blockstore = new LevelBlockstore(`${this.config.dataDir}/observer-blocks`);
    const helia = withBitswap(withLibp2p(withHTTP(createHeliaLight({ blockstore, codecs: [dagCbor, dagJson, json], hashers: [sha512] })), libp2p));
    await helia.start();
    const orbitdb = await createOrbitDB({ ipfs: helia, id: "klinok-auth-observer", directory: `${this.config.dataDir}/observer-orbitdb` });
    const controlDb = await orbitdb.open(this.config.controlObserver.databaseAddress ?? this.config.controlObserver.databaseName, { type: "events", AccessController: controlAccess });
    const controlReplicated = await waitForDatabaseJoin(controlDb);
    console.log(JSON.stringify({
      level: controlReplicated ? "info" : "warn",
      event: "auth.control-observer.database.opened",
      database: "control",
      address: controlDb.address?.toString(),
      replicated: controlReplicated,
    }));
    const medicalDb = await orbitdb.open(this.config.controlObserver.medicalDatabaseAddress ?? this.config.controlObserver.medicalDatabaseName ?? "klinok-medical-v3", { type: "events", AccessController: medicalAccess });
    const medicalReplicated = await waitForDatabaseJoin(medicalDb);
    console.log(JSON.stringify({
      level: medicalReplicated ? "info" : "warn",
      event: "auth.control-observer.database.opened",
      database: "medical",
      address: medicalDb.address?.toString(),
      replicated: medicalReplicated,
    }));
    this.runtime = { dbs: [controlDb, medicalDb], orbitdb, helia };
    this.updateHandler = () => void this.process();
    for (const db of this.runtime.dbs) db.events?.on?.("update", this.updateHandler);
    await this.process();
  }

  ingest(value: unknown): Promise<boolean> {
    const event = valueFrom(value);
    if (!event) return Promise.resolve(false);
    let accepted = false;
    this.processing = this.processing.catch(() => undefined).then(async () => {
      if (this.state.knownEvents.has(event.eventId)) {
        await this.handleAcceptedEvent(event);
        accepted = true;
        return;
      }
      const result = await verifySignedEvent(event, this.state, {
        allowUnknownDevice: event.eventType === "device.attested",
        authAttestationPublicKey: this.authAttestationPublicKey,
        bootstrapSigningPublicKey: this.config.bootstrapSigningPublicKey,
        requireTrustedAttestation: true,
      });
      if (!result.accepted) {
        console.warn(JSON.stringify({
          level: "warn",
          event: "auth.control-observer.event.rejected",
          code: result.code,
          eventId: event.eventId,
          eventType: event.eventType,
        }));
        return;
      }
      applyAcceptedEvent(event, this.state);
      await this.handleAcceptedEvent(event);
      accepted = true;
    });
    return this.processing.then(() => accepted);
  }

  private process(): Promise<void> {
    this.processing = this.processing.catch(() => undefined).then(() => this.processNow());
    return this.processing;
  }

  private async processNow(): Promise<void> {
    if (!this.runtime) return;
    const events: SignedEvent[] = [];
    for (const db of this.runtime.dbs) {
      for await (const entry of db.iterator()) {
        const event = valueFrom(entry);
        if (event) events.push(event);
      }
    }
    events.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.eventId.localeCompare(right.eventId));
    const remaining = new Map(events.filter((event) => !this.state.knownEvents.has(event.eventId)).map((event) => [event.eventId, event]));
    let progressed = true;
    while (remaining.size && progressed) {
      progressed = false;
      for (const [eventId, event] of remaining) {
        const result = await verifySignedEvent(event, this.state, {
          allowUnknownDevice: event.eventType === "device.attested",
          authAttestationPublicKey: this.authAttestationPublicKey,
          bootstrapSigningPublicKey: this.config.bootstrapSigningPublicKey,
          requireTrustedAttestation: true,
        });
        if (!result.accepted && result.code === "EVENT_PARENT_MISSING") continue;
        remaining.delete(eventId);
        progressed = true;
        if (!result.accepted) {
          console.warn(JSON.stringify({
            level: "warn",
            event: "auth.control-observer.event.rejected",
            code: result.code,
            eventId: event.eventId,
            eventType: event.eventType,
          }));
          continue;
        }
        applyAcceptedEvent(event, this.state);
        await this.handleAcceptedEvent(event);
      }
    }
  }

  private async handleAcceptedEvent(event: SignedEvent): Promise<void> {
    if (event.eventType.startsWith("role.")) {
      await this.store.putObservedRole(
        String(event.metadata.accountId ?? event.aggregateId),
        event.metadata.role as "administrator" | "doctor" | "owner",
        event.metadata.status as "not_requested" | "pending" | "approved" | "rejected" | "suspended" | "revoked" | "expired",
      );
    }
    if (event.eventType.startsWith("pet.") && event.metadata.ownerAccountId) {
      await this.store.putObservedPetOwner(String(event.metadata.petId ?? event.aggregateId), String(event.metadata.ownerAccountId));
    }
    if (["grant.created", "grant.delegated"].includes(event.eventType) && event.metadata.grant) {
      await this.store.putObservedGrant(event.metadata.grant as never);
    }
    if (["grant.revoked", "grant.relinquished", "grant.actions.updated"].includes(event.eventType)) {
      const grant = this.state.grants.get(event.resourceId);
      if (grant) await this.store.putObservedGrant(grant);
    }
    const accountId = String(event.metadata.accountId ?? event.aggregateId);
    let account = await this.store.getAccount(accountId);
    if (account) {
      const pendingOperations = account.pendingOperations.filter((operation) => operation.operationId !== event.operationId);
      const setupComplete = Boolean(account.setup &&
        account.setup.requestedRoles.every((role) => this.state.roles.has(roleProjectionKey(account!.accountId, role))) &&
        [...this.state.events.values()].some((candidate) => candidate.eventType === "profile.updated" && candidate.aggregateId === account!.accountId) &&
        [...this.state.events.values()].some((candidate) => candidate.eventType === "consent.accepted" && candidate.aggregateId === account!.accountId));
      if (event.eventType === "account.deleted") {
        await this.store.deleteCredentialAccount({ ...account, pendingOperations });
        account = null;
      } else if (pendingOperations.length !== account.pendingOperations.length || setupComplete) {
        account = {
          ...account,
          pendingOperations,
          ...(setupComplete ? { setup: undefined } : {}),
          updatedAt: new Date().toISOString(),
        };
        await this.store.putAccount(account);
      }
    }
    if (event.eventType !== "email.role-transition") return;
    const eventMailHandled = await this.store.hasMarker(`mail:${event.eventId}`);
    const transitionEventId = event.parents[0];
    const legacyMailHandled = Boolean(transitionEventId && await this.store.hasMarker(`mail:${transitionEventId}`));
    if (eventMailHandled) return;
    if (legacyMailHandled) {
      await this.store.putMarker(`mail:${event.eventId}`);
      return;
    }
    if (account) {
      await this.mailer.send({
        to: account.email,
        subject: "Статус роли в Клинок изменён",
        text: roleStatusMailText(event.metadata.role, event.metadata.status),
      });
      console.log(JSON.stringify({
        level: "info",
        event: "auth.control-observer.role-mail.sent",
        eventId: event.eventId,
        accountId,
        role: event.metadata.role,
        status: event.metadata.status,
      }));
    } else {
      console.warn(JSON.stringify({
        level: "warn",
        event: "auth.control-observer.role-mail.recipient-missing",
        eventId: event.eventId,
        accountId,
        role: event.metadata.role,
        status: event.metadata.status,
      }));
    }
    if (event.metadata.status === "pending") {
      for (const projection of this.state.roles.values()) {
        if (projection.request.role !== "administrator" || projection.request.status !== "approved") continue;
        const administrator = await this.store.getAccount(projection.request.accountId);
        if (administrator) await this.mailer.send({ to: administrator.email, subject: "Новая заявка на роль", text: `Аккаунт ${accountId} запросил роль ${String(event.metadata.role)}.` });
      }
    }
    await this.store.putMarker(`mail:${event.eventId}`);
  }

  async stop(): Promise<void> {
    if (!this.runtime) return;
    if (this.updateHandler) for (const db of this.runtime.dbs) db.events?.off?.("update", this.updateHandler);
    for (const db of this.runtime.dbs) await db.close();
    await this.runtime.orbitdb.stop();
    await this.runtime.helia.stop();
    this.runtime = null;
  }
}
