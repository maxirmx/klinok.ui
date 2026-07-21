import { describe, expect, it } from "vitest";
import { scenarioRegistry } from "../src/scenarios";
import { routes } from "../src/router";

describe("operational routes", () => {
  it("exposes auth, profile, and final role workspaces", () => {
    const paths = scenarioRegistry.map((scenario) => scenario.path);
    expect(paths).toEqual(expect.arrayContaining([
      "/auth/login", "/auth/register", "/auth/register/consent", "/auth/verify-email",
      "/profile", "/owner/home", "/owner/pets/new", "/owner/pets/:petId", "/owner/pets/:petId/edit",
      "/owner/pets/:petId/access",
      "/doctor/home", "/admin/home", "/admin/audit",
    ]));
  });

  it("contains no legacy role-first, phone-code, or removed-role routes", () => {
    const text = JSON.stringify(scenarioRegistry);
    expect(text).not.toContain("/auth/role");
    expect(text).not.toContain("/auth/code");
    expect(text).not.toContain("/company/");
    expect(text).not.toContain("/vet/");
    expect(scenarioRegistry.every((scenario) => ["issue:25", "issue:34", "owner-pages"].includes(scenario.figmaNodeId))).toBe(true);
  });

  it("keeps the prototype pet-list URL as a compatibility redirect", () => {
    expect(routes.find((route) => route.path === "/owner/pets")?.redirect).toBe("/owner/home");
  });
});
