// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { figmaCoverage, scenarioRegistry } from "../src/scenarios";

describe("scenario registry", () => {
  it("has unique ids and stable paths", () => {
    const ids = scenarioRegistry.map((scenario) => scenario.id);
    const paths = scenarioRegistry.map((scenario) => scenario.path);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/auth/role");
    expect(paths).toContain("/owner/home");
    expect(paths).toContain("/owner/materials/drugs/:id/edit");
    expect(paths).toContain("/owner/profile/delete");
  });

  it("assigns every implemented scenario to a component and Figma reference", () => {
    for (const scenario of scenarioRegistry.filter((item) => item.implemented)) {
      expect(scenario.component).toBeTruthy();
      expect(scenario.figmaNodeId).toBeTruthy();
      expect(scenario.path.startsWith("/")).toBe(true);
    }
  });

  it("marks all Figma coverage entries implemented, duplicate, or reference-only", () => {
    const scenarioIds = new Set(scenarioRegistry.map((scenario) => scenario.id));
    const acceptedStatuses = new Set(["implemented", "duplicate", "reference-only"]);

    for (const entry of figmaCoverage) {
      expect(acceptedStatuses.has(entry.status)).toBe(true);
      if (entry.status !== "reference-only") {
        expect(entry.scenarioId).toBeTruthy();
        expect(scenarioIds.has(entry.scenarioId ?? "")).toBe(true);
      }
    }
  });
});
