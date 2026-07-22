// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { gossipsub } from "@libp2p/gossipsub";
import { withBitswap } from "@helia/bitswap";
import { withHTTP } from "@helia/http";
import { withLibp2p } from "@helia/libp2p";
import * as dagCbor from "@ipld/dag-cbor";
import * as dagJson from "@ipld/dag-json";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { createOrbitDB, useAccessController, useIdentityProvider } from "@orbitdb/core";
import { bootstrap } from "@libp2p/bootstrap";
import { identify } from "@libp2p/identify";
import { mdns } from "@libp2p/mdns";
import { webSockets } from "@libp2p/websockets";
import { LevelBlockstore } from "blockstore-level";
import { createHeliaLight } from "helia";
import { createLibp2p } from "libp2p";
import * as json from "multiformats/codecs/json";
import { sha512 } from "multiformats/hashes/sha2";
import { createProtocolState, extractSignedEvent, KlinokIdentityProvider, reduceSignedEvents, type SignedEvent } from "@klinok/protocol";
import { createDynamicAccessController } from "./accessController.js";
import { getTlsFilePaths, loadOrCreateLibp2pPrivateKey, loadWebSocketTransportOptions, optionalEnv, splitEnvList } from "./config.js";
import {
  createP2pOperationalCounters,
  logOperationalCounters,
  recordAuthorizationRejection,
  registerOrbitDbEventHandlers,
  registerRecoverableProcessErrorHandlers,
} from "./events.js";
import { EventIngestService, startEventIngestServer } from "./eventIngest.js";

const unregisterProcessErrors = registerRecoverableProcessErrorHandlers();
useIdentityProvider(KlinokIdentityProvider);
const dataDir = process.env.KLINOK_P2P_DATA_DIR ?? ".klinok-p2p";
const controlDatabase = process.env.KLINOK_CONTROL_DB ?? "klinok-control-v1";
const medicalDatabase = process.env.KLINOK_MEDICAL_DB ?? "klinok-medical-v3";
const controlAddress = optionalEnv("KLINOK_CONTROL_DB_ADDRESS");
const medicalAddress = optionalEnv("KLINOK_MEDICAL_DB_ADDRESS");
const wsPort = process.env.KLINOK_P2P_WS_PORT ?? "8089";
const apiPort = Number(process.env.KLINOK_P2P_API_PORT ?? "8091");
const identityId = process.env.KLINOK_P2P_IDENTITY ?? "klinok-trusted-node";
const tlsFiles = getTlsFilePaths();
const privateKey = await loadOrCreateLibp2pPrivateKey({ dataDir });
const bootstrapList = splitEnvList("KLINOK_P2P_BOOTSTRAP");
const announce = splitEnvList("KLINOK_P2P_ANNOUNCE");
const state = createProtocolState(process.env.KLINOK_BOOTSTRAP_ACCOUNT_ID);
const authAttestationPublicKey = optionalEnv("KLINOK_AUTH_ATTESTATION_PUBLIC_KEY")
  ? JSON.parse(optionalEnv("KLINOK_AUTH_ATTESTATION_PUBLIC_KEY")!) as JsonWebKey
  : undefined;
const bootstrapSigningPublicKey = optionalEnv("KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY")
  ? JSON.parse(optionalEnv("KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY")!) as JsonWebKey
  : undefined;
const counters = createP2pOperationalCounters();
const authEventUrl = optionalEnv("KLINOK_AUTH_EVENT_URL");
const internalEventToken = optionalEnv("KLINOK_INTERNAL_EVENT_TOKEN");

async function notifyAuthObserver(event: SignedEvent): Promise<void> {
  if (!authEventUrl || !internalEventToken) return;
  try {
    const response = await fetch(authEventUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${internalEventToken}`, "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    if (!response.ok) throw new Error(`Auth observer responded with HTTP ${response.status}.`);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "p2p.auth-observer.notification.failed",
      eventId: event.eventId,
      eventType: event.eventType,
      error: error instanceof Error ? error.message : String(error),
    }));
    throw error;
  }
}

function valueFrom(entry: unknown): SignedEvent | null {
  return extractSignedEvent(entry);
}

async function replayDatabase(db: { iterator(): AsyncIterable<unknown> }, database: "control" | "medical"): Promise<void> {
  const events: SignedEvent[] = [];
  for await (const entry of db.iterator()) {
    const event = valueFrom(entry);
    if (event?.database === database) events.push(event);
  }
  const result = await reduceSignedEvents(events.filter((event) => !state.knownEvents.has(event.eventId)), state, {
    authAttestationPublicKey,
    bootstrapSigningPublicKey,
    requireTrustedAttestation: true,
  });
  counters.conflicts += result.conflicts.length;
  if (events.length || result.conflicts.length) {
    console.log(JSON.stringify({
      level: "info",
      event: "p2p.replay.complete",
      database,
      events: events.length,
      accepted: result.accepted.length,
      conflicts: result.conflicts.length,
    }));
    logOperationalCounters(counters, state.roleConflicts.length);
  }
}

const controlAccess = createDynamicAccessController({ state, database: "control", authAttestationPublicKey, bootstrapSigningPublicKey, requireTrustedAttestation: true, onRejected: (event, code, details) => {
  recordAuthorizationRejection(counters, code);
  console.warn(JSON.stringify({ level: "warn", event: "authorization.rejected", database: "control", eventId: event?.eventId, eventType: event?.eventType, code, ...details }));
  logOperationalCounters(counters, state.roleConflicts.length);
}, onDeferred: (event, code, details) => {
  console.log(JSON.stringify({ level: "info", event: "authorization.deferred", database: "control", eventId: event.eventId, eventType: event.eventType, code, ...details }));
} });
const medicalAccess = createDynamicAccessController({ state, database: "medical", authAttestationPublicKey, bootstrapSigningPublicKey, requireTrustedAttestation: true, onRejected: (event, code, details) => {
  recordAuthorizationRejection(counters, code);
  console.warn(JSON.stringify({ level: "warn", event: "authorization.rejected", database: "medical", eventId: event?.eventId, eventType: event?.eventType, code, ...details }));
  logOperationalCounters(counters, state.roleConflicts.length);
}, onDeferred: (event, code, details) => {
  console.log(JSON.stringify({ level: "info", event: "authorization.deferred", database: "medical", eventId: event.eventId, eventType: event.eventType, code, ...details }));
} });
useAccessController(controlAccess);
useAccessController(medicalAccess);

const peerDiscovery: unknown[] = [mdns({ interval: 20_000 })];
if (bootstrapList.length) peerDiscovery.push(bootstrap({ list: bootstrapList }));
const libp2p = await createLibp2p({
  privateKey,
  addresses: {
    listen: [`/ip4/0.0.0.0/tcp/${wsPort}/${tlsFiles ? "tls/ws" : "ws"}`],
    ...(announce.length ? { announce } : {}),
  },
  transports: [webSockets(loadWebSocketTransportOptions(tlsFiles))],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  peerDiscovery: peerDiscovery as never[],
  services: { identify: identify(), pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }) },
});
libp2p.addEventListener("peer:connect", (event) => {
  console.log(JSON.stringify({ level: "info", event: "p2p.peer.connected", peerId: String(event.detail) }));
});
libp2p.addEventListener("peer:disconnect", (event) => {
  console.warn(JSON.stringify({ level: "warn", event: "p2p.peer.disconnected", peerId: String(event.detail) }));
});
const blockstore = new LevelBlockstore(`${dataDir}/helia-blocks`);
const helia = withBitswap(withLibp2p(withHTTP(createHeliaLight({ blockstore, codecs: [dagCbor, dagJson, json], hashers: [sha512] })), libp2p));
await helia.start();
const orbitdb = await createOrbitDB({ ipfs: helia, id: identityId, directory: `${dataDir}/orbitdb` });
const controlDb = await orbitdb.open(controlAddress ?? controlDatabase, { type: "events", AccessController: controlAccess });
await replayDatabase(controlDb, "control");
const medicalDb = await orbitdb.open(medicalAddress ?? medicalDatabase, { type: "events", AccessController: medicalAccess });
await replayDatabase(medicalDb, "medical");
const ingestServer = await startEventIngestServer({
  port: apiPort,
  service: new EventIngestService({
    state,
    databases: { control: controlDb, medical: medicalDb },
    verification: { authAttestationPublicKey, bootstrapSigningPublicKey, requireTrustedAttestation: true },
    onPersisted: notifyAuthObserver,
  }),
});
const unregisterControl = registerOrbitDbEventHandlers(controlDb, "control", counters, () => state.roleConflicts.length);
const unregisterMedical = registerOrbitDbEventHandlers(medicalDb, "medical", counters, () => state.roleConflicts.length);

console.log(JSON.stringify({
  level: "info",
  event: "p2p.started",
  controlDatabase: controlDb.address,
  medicalDatabase: medicalDb.address,
  orbitIdentity: orbitdb.identity.id,
  peerId: libp2p.peerId.toString(),
  apiPort,
  multiaddrs: libp2p.getMultiaddrs().map((value) => value.toString()),
}));

async function shutdown() {
  unregisterProcessErrors();
  unregisterControl();
  unregisterMedical();
  await new Promise<void>((resolve, reject) => ingestServer.close((error) => error ? reject(error) : resolve()));
  await controlDb.close();
  await medicalDb.close();
  await orbitdb.stop();
  await helia.stop();
}

process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
