import { describe, expect, it } from "vitest";
import { WHAT_HAPPENED_TAXONOMY, encounterSummary, whatHappenedPath } from "../src/medicalEncounter";

describe("medical encounter templates", () => {
  it("contains stable, arbitrary-depth taxonomy identifiers including laboratory groups", () => {
    const laboratory = WHAT_HAPPENED_TAXONOMY.find((node) => node.id === "problem")?.children
      ?.find((node) => node.id === "problem.laboratory");
    expect(laboratory?.children?.map((node) => node.id)).toEqual([
      "problem.laboratory.cbc",
      "problem.laboratory.biochemistry",
      "problem.laboratory.urine",
    ]);
    expect(whatHappenedPath("problem.laboratory.urine.10")).toContain("Есть кристаллы");
  });

  it("derives a readable summary while persisting stable IDs", () => {
    const summary = encounterSummary({
      text: "",
      sections: {
        "what-happened": {
          kind: "what-happened",
          templateVersion: "what-happened-v1",
          value: { selectedIds: ["problem.respiratory.2"], comment: "Три дня" },
          authorAccountId: "doctor-1",
          authorDisplayName: "Доктор",
          updatedAt: "2026-07-21T10:00:00.000Z",
        },
      },
    });
    expect(summary).toContain("Кашляет");
    expect(summary).toContain("Три дня");
  });
});
