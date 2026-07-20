// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { describe, expect, it } from "vitest";
import { DEFAULT_AUTH_RATE_LIMITS, loadAuthConfig } from "./config.js";

describe("auth configuration", () => {
  it("disables proxy trust and uses secure rate-limit defaults", () => {
    const config = loadAuthConfig({});
    expect(config.trustProxy).toBe(false);
    expect(config.publicOrigin).toBe("http://localhost:8080");
    expect(config.rateLimit).toEqual(DEFAULT_AUTH_RATE_LIMITS);
  });

  it("parses a trusted hop count and custom thresholds", () => {
    const config = loadAuthConfig({
      KLINOK_AUTH_TRUST_PROXY: "2",
      KLINOK_RATE_LIMIT_LOGIN_IP_PER_15_MINUTES: "40",
      KLINOK_RATE_LIMIT_SENSITIVE_MUTATION_ACCOUNT_PER_MINUTE: "7",
    });
    expect(config.trustProxy).toBe(2);
    expect(config.rateLimit.loginIpPer15Minutes).toBe(40);
    expect(config.rateLimit.sensitiveMutationAccountPerMinute).toBe(7);
  });

  it("rejects non-positive thresholds", () => {
    expect(() => loadAuthConfig({ KLINOK_RATE_LIMIT_LOGIN_IP_PER_15_MINUTES: "0" })).toThrow(/positive integer/);
  });
});
