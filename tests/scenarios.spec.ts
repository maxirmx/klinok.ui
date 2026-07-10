import { describe, expect, it } from "vitest";
import { scenarioRegistry } from "../src/scenarios";

describe("operational routes", () => {
  it("exposes auth, role status, and final role workspaces", () => {
    const paths = scenarioRegistry.map((scenario) => scenario.path);
    expect(paths).toEqual(expect.arrayContaining([
      "/auth/login", "/auth/register", "/auth/register/consent", "/auth/verify-email",
      "/roles", "/owner/home", "/doctor/home", "/admin/home",
    ]));
  });

  it("contains no legacy role-first, phone-code, or removed-role routes", () => {
    const text = JSON.stringify(scenarioRegistry);
    expect(text).not.toContain("/auth/role");
    expect(text).not.toContain("/auth/code");
    expect(text).not.toContain("/company/");
    expect(text).not.toContain("/vet/");
    expect(scenarioRegistry.every((scenario) => scenario.figmaNodeId === "issue:25")).toBe(true);
  });
});
