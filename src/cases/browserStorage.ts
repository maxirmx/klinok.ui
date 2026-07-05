// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

export const BROWSER_HELIA_BLOCKSTORE_NAME = "klinok-p2p-v2-helia-blocks";
export const BROWSER_HELIA_DATASTORE_NAME = "klinok-p2p-v2-helia-datastore";
export const BROWSER_ORBITDB_DIRECTORY = "klinok-p2p-v2-orbitdb";

export interface BrowserHeliaStorage {
  blockstore: unknown;
  datastore: unknown;
}

interface OpenableBrowserStore {
  open: () => Promise<void>;
  close?: () => Promise<void> | void;
  stop?: () => Promise<void> | void;
}

async function openBrowserStore<T extends OpenableBrowserStore>(store: T): Promise<T> {
  await store.open();
  store.stop ??= async () => {
    await store.close?.();
  };
  return store;
}

export async function createBrowserHeliaStorage(): Promise<BrowserHeliaStorage> {
  const [{ IDBBlockstore }, { IDBDatastore }] = await Promise.all([
    import("blockstore-idb"),
    import("datastore-idb"),
  ]);

  const blockstore = new IDBBlockstore(BROWSER_HELIA_BLOCKSTORE_NAME);
  const datastore = new IDBDatastore(BROWSER_HELIA_DATASTORE_NAME);
  const openedStores: OpenableBrowserStore[] = [];

  try {
    openedStores.push(await openBrowserStore(blockstore));
    openedStores.push(await openBrowserStore(datastore));
  } catch (error) {
    await Promise.allSettled(openedStores.map((store) => store.stop?.()));
    throw error;
  }

  return {
    blockstore,
    datastore,
  };
}

export async function createBrowserHeliaInit<T extends Record<string, unknown>>(
  init: T,
): Promise<T & BrowserHeliaStorage> {
  return {
    ...init,
    ...(await createBrowserHeliaStorage()),
  };
}
