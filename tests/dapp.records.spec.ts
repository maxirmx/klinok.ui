// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { createOwnerRequestEvent } from "../src/cases/events";
import { defaultAppointment } from "../src/data";
import { createDappEvent, reduceDappCollections } from "../src/dapp/repository";
import { seedComplaintTemplates, seedDrugTemplates } from "../src/dapp/seeds";
import {
  createComplaintRecordFromTemplate,
  createDrugRecordFromTemplate,
  getComplaintOptionPath,
  getDrugDraftValidationError,
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

  it("derives complaint and drug records from replicated events", () => {
    const complaint = createComplaintRecordFromTemplate(
      seedComplaintTemplates[0],
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
    const caseEvent = createOwnerRequestEvent(defaultAppointment, {
      actorId: "owner",
      caseId: "case-template",
      eventId: "event-template",
      visitId: 8801,
      complaintRecord: complaint,
      createdAt: "2026-06-22T20:59:18.000Z",
    });
    const drug = createDrugRecordFromTemplate(
      seedDrugTemplates[0],
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
    const saveEvent = createDappEvent({
      id: "drug-save",
      type: "drug.record.saved",
      payload: { record: drug },
      createdAt: "2026-06-22T21:03:28.000Z",
    });
    const deleteEvent = createDappEvent({
      id: "drug-delete",
      type: "drug.record.deleted",
      payload: { id: "drug-repo" },
      createdAt: "2026-06-22T21:04:28.000Z",
    });

    const saved = reduceDappCollections({ caseEvents: [caseEvent], dappEvents: [saveEvent] });
    expect(saved.complaintRecords.map((item) => item.id)).toEqual(["complaint-repo"]);
    expect(saved.drugRecords.map((item) => item.id)).toContain("drug-repo");

    const deleted = reduceDappCollections({ caseEvents: [caseEvent], dappEvents: [saveEvent, deleteEvent] });
    expect(deleted.drugRecords.map((item) => item.id)).not.toContain("drug-repo");
  });

});
