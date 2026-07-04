// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { InMemoryDappRepository } from "../src/dapp/repository";
import { seedComplaintTemplates, seedDrugTemplates } from "../src/dapp/seeds";
import {
  createComplaintRecordFromTemplate,
  createDrugRecordFromTemplate,
  getComplaintOptionPath,
  splitTradeNames,
} from "../src/dapp/templates";

describe("dApp template records", () => {
  it("creates complaint records from a hierarchical template", () => {
    const template = seedComplaintTemplates[0];
    const optionIds = ["problem", "behavior", "low-activity"];

    const record = createComplaintRecordFromTemplate(
      template,
      {
        pet: "Чарли",
        urgency: "Сегодня",
        date: "18.06.25",
        time: "13:30",
        selectedOptionIds: optionIds,
        freeText: "стал тише",
        details: "после прогулки меньше играет",
      },
      { id: "complaint-test", now: new Date("2026-06-22T20:59:18.000Z") },
    );

    expect(getComplaintOptionPath(template, optionIds).map((option) => option.label)).toEqual([
      "Есть проблемы",
      "С поведением",
      "Снижение активности",
    ]);
    expect(record).toMatchObject({
      id: "complaint-test",
      templateId: "what-happened-tree",
      pet: "Чарли",
      selectedOptionLabels: ["Есть проблемы", "С поведением", "Снижение активности"],
      freeText: "стал тише",
    });
  });

  it("creates drug records from the drug template without inventing dosages", () => {
    const record = createDrugRecordFromTemplate(
      seedDrugTemplates[0],
      {
        activeSubstanceRu: "  Тестовое вещество  ",
        activeSubstanceLatin: "Substantia test",
        pharmacyType: "vet",
        tradeNames: "Название 1, Название 2\nНазвание 3",
        pharmacokinetics: "",
        pharmacodynamics: "",
        dogDoseText: "",
        dogDoseSource: "",
        catDoseText: "",
        catDoseSource: "",
      },
      { id: "drug-test", now: new Date("2026-06-22T21:03:28.000Z") },
    );

    expect(splitTradeNames("A, B\nC")).toEqual(["A", "B", "C"]);
    expect(record).toMatchObject({
      id: "drug-test",
      activeSubstanceRu: "Тестовое вещество",
      tradeNames: ["Название 1", "Название 2", "Название 3"],
      dogDose: { text: "", source: "" },
      catDose: { text: "", source: "" },
    });
  });

  it("persists complaint and drug records through the repository boundary", () => {
    const repository = new InMemoryDappRepository();
    const complaint = createComplaintRecordFromTemplate(
      repository.listComplaintTemplates()[0],
      {
        pet: "Боня",
        urgency: "Планово",
        date: "20.06.25",
        time: "09:00",
        selectedOptionIds: ["problem", "digestion", "vomiting"],
        freeText: "",
        details: "",
      },
      { id: "complaint-repo", now: new Date("2026-06-22T20:59:18.000Z") },
    );
    const drug = createDrugRecordFromTemplate(
      repository.listDrugTemplates()[0],
      {
        activeSubstanceRu: "Вещество",
        activeSubstanceLatin: "",
        pharmacyType: "human",
        tradeNames: "",
        pharmacokinetics: "",
        pharmacodynamics: "",
        dogDoseText: "",
        dogDoseSource: "",
        catDoseText: "",
        catDoseSource: "",
      },
      { id: "drug-repo", now: new Date("2026-06-22T21:03:28.000Z") },
    );

    repository.saveComplaintRecord(complaint);
    repository.saveDrugRecord(drug);

    expect(repository.listComplaintRecords().map((item) => item.id)).toContain("complaint-repo");
    expect(repository.listDrugRecords().map((item) => item.id)).toContain("drug-repo");
  });
});
