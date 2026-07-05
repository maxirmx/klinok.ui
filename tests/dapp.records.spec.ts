// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { pets } from "../src/data";
import {
  buildMedicalLabComparison,
  createEmptyMedicalHistoryDraft,
  createMedicalHistoryEntryFromDraft,
  getMedicalHistorySummary,
} from "../src/dapp/medical";
import { InMemoryDappRepository } from "../src/dapp/repository";
import { createSeedCollections, seedComplaintTemplates, seedDrugTemplates, seedMedicalSectionTemplates } from "../src/dapp/seeds";
import {
  createComplaintRecordFromTemplate,
  createDrugRecordFromTemplate,
  getDrugDraftValidationError,
  getComplaintOptionPath,
  splitTradeNames,
  updateDrugRecordFromTemplate,
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
        groupIds: ["drug-group-analgesics", "drug-group-analgesics", ""],
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
      groupIds: ["drug-group-analgesics"],
      tradeNames: ["Название 1", "Название 2", "Название 3"],
      dogDose: { text: "", source: "" },
      catDose: { text: "", source: "" },
    });
  });

  it("validates required drug fields and dosage sources", () => {
    const validDraft = {
      activeSubstanceRu: "Вещество",
      activeSubstanceLatin: "",
      pharmacyType: "vet" as const,
      groupIds: [],
      tradeNames: "",
      pharmacokinetics: "",
      pharmacodynamics: "",
      dogDoseText: "",
      dogDoseSource: "",
      catDoseText: "",
      catDoseSource: "",
    };

    expect(getDrugDraftValidationError({ ...validDraft, activeSubstanceRu: " " })).toBe("Укажите действующее вещество");
    expect(getDrugDraftValidationError({ ...validDraft, dogDoseText: "5 мг/кг" })).toBe("Укажите источник дозировки для собак");
    expect(getDrugDraftValidationError({ ...validDraft, catDoseText: "2 мг/кг" })).toBe("Укажите источник дозировки для кошек");
    expect(getDrugDraftValidationError({ ...validDraft, dogDoseText: "5 мг/кг", dogDoseSource: "Справочник" })).toBe("");
  });

  it("updates drug records while preserving identity and creation time", () => {
    const template = seedDrugTemplates[0];
    const record = createDrugRecordFromTemplate(
      template,
      {
        activeSubstanceRu: "Вещество",
        activeSubstanceLatin: "Substantia",
        pharmacyType: "vet",
        groupIds: ["drug-group-analgesics"],
        tradeNames: "Старое",
        pharmacokinetics: "",
        pharmacodynamics: "",
        dogDoseText: "",
        dogDoseSource: "",
        catDoseText: "",
        catDoseSource: "",
      },
      { id: "drug-update", now: new Date("2026-06-22T21:03:28.000Z") },
    );

    const updated = updateDrugRecordFromTemplate(
      template,
      record,
      {
        activeSubstanceRu: "Обновленное вещество",
        activeSubstanceLatin: "Substantia renovata",
        pharmacyType: "human",
        groupIds: [],
        tradeNames: "Новое, Дополнительное",
        pharmacokinetics: "Кратко",
        pharmacodynamics: "Кратко",
        dogDoseText: "5 мг/кг",
        dogDoseSource: "Справочник",
        catDoseText: "",
        catDoseSource: "",
      },
      { now: new Date("2026-06-23T10:00:00.000Z") },
    );

    expect(updated).toMatchObject({
      id: "drug-update",
      activeSubstanceRu: "Обновленное вещество",
      pharmacyType: "human",
      groupIds: [],
      tradeNames: ["Новое", "Дополнительное"],
      dogDose: { text: "5 мг/кг", source: "Справочник" },
      createdAt: "2026-06-22T21:03:28.000Z",
      updatedAt: "2026-06-23T10:00:00.000Z",
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
        groupIds: [],
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
    expect(repository.deleteDrugRecord("drug-repo")).toBe(true);
    expect(repository.listDrugRecords().map((item) => item.id)).not.toContain("drug-repo");
    expect(repository.deleteDrugRecord("drug-repo")).toBe(false);
  });

  it("normalizes older persisted drug data without groups", () => {
    const collections = createSeedCollections();
    const legacyDrugRecord: Partial<(typeof collections.drugRecords)[number]> = { ...collections.drugRecords[0] };
    delete legacyDrugRecord.groupIds;
    const legacyDrugTemplates = collections.drugTemplates.map((template) => ({
      ...template,
      fields: template.fields.map((field) => {
        if (field.id !== "dogDoseSource" && field.id !== "catDoseSource") return field;
        const legacyField: Partial<typeof field> = { ...field };
        delete legacyField.multiline;
        return legacyField;
      }),
    }));
    const repository = new InMemoryDappRepository({
      ...collections,
      drugGroups: undefined,
      drugTemplates: legacyDrugTemplates,
      drugRecords: [legacyDrugRecord],
    } as unknown as ReturnType<typeof createSeedCollections>);

    expect(repository.listDrugGroups().map((group) => group.id)).toContain("drug-group-analgesics");
    expect(repository.listDrugRecords()[0].groupIds).toEqual([]);
    expect(repository.listDrugTemplates()[0].fields.find((field) => field.id === "dogDoseSource")?.multiline).toBe(true);
    expect(repository.listDrugTemplates()[0].fields.find((field) => field.id === "catDoseSource")?.multiline).toBe(true);
  });

  it("creates medical history entries and drops empty sections", () => {
    const draft = createEmptyMedicalHistoryDraft(2, "20.06.25");
    draft.whatHappenedOptionIds = ["problem", "support", "limp"];
    draft.whatHappenedText = "  снова хромает  ";
    draft.habitus.weight = " 11.2 кг ";
    draft.outcome = "Улучшение";
    draft.labStudies[0].date = "20.06.25";
    draft.labStudies[0].studyName = "Общий анализ крови";
    draft.labStudies[0].indicators[0].name = "Лейкоциты";
    draft.labStudies[0].indicators[0].result = "8.4";
    draft.labStudies[0].indicators[0].unit = "10^9/л";

    const record = createMedicalHistoryEntryFromDraft(seedMedicalSectionTemplates, seedComplaintTemplates[0], draft, {
      id: "medical-test",
      now: new Date("2026-06-22T20:58:47.000Z"),
      author: "Тестовый врач",
    });

    expect(record.sections.map((section) => section.id)).toEqual(["what-happened", "habitus", "labs", "outcome"]);
    expect(record.sections[0]).toMatchObject({
      selectedOptionLabels: ["Есть проблемы", "С опороспособностью", "Хромота"],
      values: { description: "снова хромает" },
      author: "Тестовый врач",
    });
    expect(record.sections.find((section) => section.id === "habitus")?.values.weight).toBe("11.2 кг");
    expect(record.sections.find((section) => section.id === "labs")?.labStudies?.[0].indicators[0]).toMatchObject({
      name: "Лейкоциты",
      result: "8.4",
    });
  });

  it("normalizes older persisted data without medical history collections", () => {
    const collections = createSeedCollections();
    const repository = new InMemoryDappRepository({
      complaintTemplates: collections.complaintTemplates,
      complaintRecords: collections.complaintRecords,
      drugGroups: collections.drugGroups,
      drugTemplates: collections.drugTemplates,
      drugRecords: collections.drugRecords,
    } as unknown as ReturnType<typeof createSeedCollections>);

    expect(repository.listMedicalSectionTemplates().map((template) => template.id)).toContain("what-happened");
    expect(repository.listMedicalHistoryEntries().map((entry) => entry.id)).toContain("medical-charlie-20250618");
  });

  it("rolls up medical header data from latest history entries", () => {
    const collections = createSeedCollections();
    const charlie = pets.find((pet) => pet.id === 2)!;
    const summary = getMedicalHistorySummary(
      charlie,
      collections.medicalHistoryEntries.filter((entry) => entry.petId === 2),
    );

    expect(summary).toEqual({
      chipNumber: "643094100002",
      latestVaccination: "Nobivac Rabies, 18.06.25",
      weight: "10.8 кг",
    });
  });

  it("builds comparative lab rows for repeated indicators", () => {
    const collections = createSeedCollections();
    const comparison = buildMedicalLabComparison(collections.medicalHistoryEntries.filter((entry) => entry.petId === 2));

    expect(comparison).toHaveLength(1);
    expect(comparison[0].name).toBe("Лейкоциты");
    expect(comparison[0].items.map((item) => item.result)).toEqual(["8.2", "7.9"]);
  });
});
