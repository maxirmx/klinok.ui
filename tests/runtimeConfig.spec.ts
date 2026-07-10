import { describe, expect, it } from "vitest";
import {
  createDefaultRuntimeConfig,
  DEVELOPMENT_TRUSTED_NODE_MULTIADDR,
  normalizeRuntimeConfig,
  PRODUCTION_TRUSTED_NODE_MULTIADDR,
  RUNTIME_CONFIG_PATHS,
} from "../src/runtimeConfig";

describe("operational runtime config", () => {
  it("uses only the public config overlay", () => {
    expect(RUNTIME_CONFIG_PATHS).toEqual(["/config.json"]);
  });

  it("pins the versioned control and medical databases without writer overrides", () => {
    const config = createDefaultRuntimeConfig(true);
    expect(config.p2p.controlDatabaseName).toBe("klinok-control-v1");
    expect(config.p2p.medicalDatabaseName).toBe("klinok-medical-v3");
    expect(config.p2p.trustedNodeMultiaddrs).toEqual([DEVELOPMENT_TRUSTED_NODE_MULTIADDR]);
    expect(Object.keys(config.p2p)).not.toContain("writeIdentityIds");
    expect(Object.keys(config.p2p)).not.toContain("participantPrivateKey");
  });

  it("uses the production trusted node and normalizes public legal metadata", () => {
    const defaults = createDefaultRuntimeConfig(false);
    const config = normalizeRuntimeConfig({ legal: { personalDataConsent: { version: "v2", href: "/consent-v2" } } }, defaults);
    expect(config.p2p.trustedNodeMultiaddrs).toEqual([PRODUCTION_TRUSTED_NODE_MULTIADDR]);
    expect(config.legal.personalDataConsent).toEqual({ version: "v2", href: "/consent-v2" });
  });
});
