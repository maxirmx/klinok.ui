// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { createOrbitDB, IPFSAccessController } from "@orbitdb/core";
import { bootstrap } from "@libp2p/bootstrap";
import { identify } from "@libp2p/identify";
import { mdns } from "@libp2p/mdns";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { LevelBlockstore } from "blockstore-level";
import { createHelia } from "helia";
import { createLibp2p } from "libp2p";
import {
  getTlsFilePaths,
  getWebSocketListenMultiaddr,
  loadOrCreateLibp2pPrivateKey,
  loadWebSocketTransportOptions,
  optionalEnv,
  splitEnvList,
} from "./config.js";

const dataDir = process.env.KLINOK_P2P_DATA_DIR ?? ".klinok-p2p";
const databaseName = process.env.KLINOK_P2P_DB ?? "klinok-cases";
const databaseAddress = optionalEnv("KLINOK_P2P_DB_ADDRESS");
const tcpPort = process.env.KLINOK_P2P_TCP_PORT ?? "51240";
const wsPort = process.env.KLINOK_P2P_WS_PORT ?? "8089";
const identityId = process.env.KLINOK_P2P_IDENTITY ?? "klinok-trusted-node";
const announceList = splitEnvList("KLINOK_P2P_ANNOUNCE");
const bootstrapList = splitEnvList("KLINOK_P2P_BOOTSTRAP");
const writeIdentityIds = splitEnvList("KLINOK_P2P_WRITE_IDENTITIES", ["*"]);
const tlsFilePaths = getTlsFilePaths();
const webSocketTransportOptions = loadWebSocketTransportOptions(tlsFilePaths);
const webSocketListenMultiaddr = getWebSocketListenMultiaddr(wsPort, Boolean(tlsFilePaths));
const privateKey = await loadOrCreateLibp2pPrivateKey({ dataDir });

if (writeIdentityIds.includes("*")) {
  console.warn("KLINOK_P2P_WRITE_IDENTITIES allows '*'. Use explicit OrbitDB identity ids outside the spike.");
}

const peerDiscovery = [mdns({ interval: 20_000 })];
if (bootstrapList.length > 0) {
  peerDiscovery.push(bootstrap({ list: bootstrapList }));
}

const blockstore = new LevelBlockstore(`${dataDir}/helia-blocks`);
const libp2p = await createLibp2p({
  privateKey,
  addresses: {
    listen: [`/ip4/0.0.0.0/tcp/${tcpPort}`, webSocketListenMultiaddr],
    ...(announceList.length > 0 ? { announce: announceList } : {}),
  },
  transports: [tcp(), webSockets(webSocketTransportOptions)],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  peerDiscovery,
  services: {
    identify: identify(),
    pubsub: gossipsub({ allowPublishToZeroTopicPeers: true }),
  },
});

const helia = await createHelia({ libp2p, blockstore });
const orbitdb = await createOrbitDB({
  ipfs: helia,
  id: identityId,
  directory: `${dataDir}/orbitdb`,
});
const db = await orbitdb.open(databaseAddress ?? databaseName, {
  type: "events",
  AccessController: IPFSAccessController({ write: writeIdentityIds }),
});

console.log("Klinok trusted P2P node started");
console.log("OrbitDB identity:", orbitdb.identity.id);
console.log("OrbitDB database:", db.address);
console.log("libp2p peer:", libp2p.peerId.toString());
console.log("WebSocket transport:", tlsFilePaths ? "tls/ws" : "ws");
console.log("libp2p multiaddrs:");
for (const address of libp2p.getMultiaddrs()) {
  console.log(`  ${address.toString()}`);
}

db.events.on("update", async () => {
  console.log("records:", (await db.all()).length);
});

async function shutdown() {
  await db.close();
  await orbitdb.stop();
  await helia.stop();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
