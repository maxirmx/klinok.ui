// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import {
  createDefaultRuntimeConfig,
  DEVELOPMENT_TRUSTED_NODE_MULTIADDR,
  normalizeRuntimeConfig,
  PRODUCTION_TRUSTED_NODE_MULTIADDR,
  type AppRuntimeConfig,
} from "../src/runtimeConfig";

describe("runtime config", () => {
  it("does not expose backend mode selection in defaults or normalized config", () => {
    const defaults = createDefaultRuntimeConfig(true);
    const normalized = normalizeRuntimeConfig({ backendMode: "mock" } as Partial<AppRuntimeConfig>, defaults);

    expect(Object.prototype.hasOwnProperty.call(defaults, "backendMode")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(normalized, "backendMode")).toBe(false);
  });

  it("targets the localhost trusted node in development", () => {
    expect(createDefaultRuntimeConfig(true).p2p.trustedNodeMultiaddrs).toEqual([DEVELOPMENT_TRUSTED_NODE_MULTIADDR]);
  });

  it("targets the predefined production trusted node outside development", () => {
    expect(createDefaultRuntimeConfig(false).p2p.trustedNodeMultiaddrs).toEqual([PRODUCTION_TRUSTED_NODE_MULTIADDR]);
  });

  it("falls back to the environment trusted node default when overrides are missing or invalid", () => {
    const defaults = createDefaultRuntimeConfig(true);

    expect(normalizeRuntimeConfig({}, defaults).p2p.trustedNodeMultiaddrs).toEqual([DEVELOPMENT_TRUSTED_NODE_MULTIADDR]);
    expect(
      normalizeRuntimeConfig(
        {
          p2p: {
            trustedNodeMultiaddrs: ["", "   "],
          },
        } as Partial<AppRuntimeConfig>,
        defaults,
      ).p2p.trustedNodeMultiaddrs,
    ).toEqual([DEVELOPMENT_TRUSTED_NODE_MULTIADDR]);
  });
});
