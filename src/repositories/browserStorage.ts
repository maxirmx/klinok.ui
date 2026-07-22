// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { IDBBlockstore } from "blockstore-idb";
import { IDBDatastore } from "datastore-idb";

export async function createBrowserHeliaInit(base = "klinok-p2p-v1") {
  const blockstore = new IDBBlockstore(`${base}-blocks`);
  const datastore = new IDBDatastore(`${base}-data`);
  await Promise.all([blockstore.open(), datastore.open()]);
  return { blockstore, datastore };
}

export async function closeBrowserHeliaStorage(storage: Awaited<ReturnType<typeof createBrowserHeliaInit>>) {
  await Promise.all([storage.blockstore.close(), storage.datastore.close()]);
}
