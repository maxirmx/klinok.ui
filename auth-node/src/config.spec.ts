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
    expect(config.escrowKeyPath).toBe(".klinok-auth/user-key-escrow-key.json");
    expect(config.bootstrapAccountId).toBe("bootstrap-administrator");
    expect(config.bootstrapSigningPublicKey).toBeUndefined();
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

  it("parses the bootstrap signing trust anchor", () => {
    const key = { kty: "EC", crv: "P-256", x: "x", y: "y" };
    expect(loadAuthConfig({
      KLINOK_BOOTSTRAP_ACCOUNT_ID: "root-account",
      KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY: JSON.stringify(key),
    })).toMatchObject({ bootstrapAccountId: "root-account", bootstrapSigningPublicKey: key });
    expect(() => loadAuthConfig({ KLINOK_BOOTSTRAP_SIGNING_PUBLIC_KEY: "invalid" })).toThrow(/JSON Web Key/);
  });
});
