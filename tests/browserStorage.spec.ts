// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  blockstores: [] as string[],
  datastores: [] as string[],
  openedBlockstores: [] as string[],
  openedDatastores: [] as string[],
  closedBlockstores: [] as string[],
  closedDatastores: [] as string[],
}));

vi.mock("blockstore-idb", () => ({
  IDBBlockstore: class {
    readonly name: string;

    constructor(name: string) {
      this.name = name;
      storageMocks.blockstores.push(name);
    }

    async open() {
      storageMocks.openedBlockstores.push(this.name);
    }

    async close() {
      storageMocks.closedBlockstores.push(this.name);
    }
  },
}));

vi.mock("datastore-idb", () => ({
  IDBDatastore: class {
    readonly name: string;

    constructor(name: string) {
      this.name = name;
      storageMocks.datastores.push(name);
    }

    async open() {
      storageMocks.openedDatastores.push(this.name);
    }

    async close() {
      storageMocks.closedDatastores.push(this.name);
    }
  },
}));

import {
  BROWSER_HELIA_BLOCKSTORE_NAME,
  BROWSER_HELIA_DATASTORE_NAME,
  BROWSER_ORBITDB_DIRECTORY,
  createBrowserHeliaInit,
  createBrowserHeliaStorage,
} from "../src/cases/browserStorage";

describe("browser Helia storage", () => {
  function resetStorageMocks() {
    storageMocks.blockstores.length = 0;
    storageMocks.datastores.length = 0;
    storageMocks.openedBlockstores.length = 0;
    storageMocks.openedDatastores.length = 0;
    storageMocks.closedBlockstores.length = 0;
    storageMocks.closedDatastores.length = 0;
  }

  it("uses stable v2 IndexedDB storage names", async () => {
    resetStorageMocks();

    const storage = await createBrowserHeliaStorage();

    expect(BROWSER_HELIA_BLOCKSTORE_NAME).toBe("klinok-p2p-v2-helia-blocks");
    expect(BROWSER_HELIA_DATASTORE_NAME).toBe("klinok-p2p-v2-helia-datastore");
    expect(BROWSER_ORBITDB_DIRECTORY).toBe("klinok-p2p-v2-orbitdb");
    expect(storageMocks.blockstores).toEqual([BROWSER_HELIA_BLOCKSTORE_NAME]);
    expect(storageMocks.datastores).toEqual([BROWSER_HELIA_DATASTORE_NAME]);
    expect(storageMocks.openedBlockstores).toEqual([BROWSER_HELIA_BLOCKSTORE_NAME]);
    expect(storageMocks.openedDatastores).toEqual([BROWSER_HELIA_DATASTORE_NAME]);
    expect(storage).toHaveProperty("blockstore");
    expect(storage).toHaveProperty("datastore");
  });

  it("includes persistent stores in Helia init", async () => {
    resetStorageMocks();

    const init = await createBrowserHeliaInit({ marker: "kept" });

    expect(init.marker).toBe("kept");
    expect(init).toHaveProperty("blockstore");
    expect(init).toHaveProperty("datastore");
    expect(storageMocks.blockstores).toEqual([BROWSER_HELIA_BLOCKSTORE_NAME]);
    expect(storageMocks.datastores).toEqual([BROWSER_HELIA_DATASTORE_NAME]);
    expect(storageMocks.openedBlockstores).toEqual([BROWSER_HELIA_BLOCKSTORE_NAME]);
    expect(storageMocks.openedDatastores).toEqual([BROWSER_HELIA_DATASTORE_NAME]);
  });

  it("adds stop lifecycle hooks that close IndexedDB stores", async () => {
    resetStorageMocks();

    const storage = await createBrowserHeliaStorage();

    await (storage.blockstore as { stop: () => Promise<void> }).stop();
    await (storage.datastore as { stop: () => Promise<void> }).stop();

    expect(storageMocks.closedBlockstores).toEqual([BROWSER_HELIA_BLOCKSTORE_NAME]);
    expect(storageMocks.closedDatastores).toEqual([BROWSER_HELIA_DATASTORE_NAME]);
  });
});
