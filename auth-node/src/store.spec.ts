// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStore } from "./store.js";

const stores: Array<{ dataDir: string; store: AuthStore }> = [];

afterEach(async () => {
  for (const { dataDir, store } of stores.splice(0)) {
    await store.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

describe("AuthStore markers", () => {
  it("distinguishes missing markers from persisted markers", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "klinok-auth-store-test-"));
    const store = new AuthStore(dataDir);
    stores.push({ dataDir, store });
    await store.open();

    expect(await store.hasMarker("mail:event-1")).toBe(false);
    await store.putMarker("mail:event-1");
    expect(await store.hasMarker("mail:event-1")).toBe(true);
    expect(await store.hasMarker("mail:event-2")).toBe(false);
  });
});
