// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { defaultAppointment, visits } from "../src/data";
import { defaultRuntimeConfig } from "../src/runtimeConfig";
import { createInMemoryCaseEventNetwork, createMockCaseRepository } from "../src/cases/mockRepository";
import type { ClinicalSection } from "../src/cases/types";
import { seedDrugRecords } from "../src/dapp/seeds";

describe("case repository sync spike", () => {
  it("syncs cases between two clients through a trusted in-memory node", async () => {
    const network = createInMemoryCaseEventNetwork();
    const ownerRepo = createMockCaseRepository({ seedVisits: [], actorId: "owner", network });
    const vetRepo = createMockCaseRepository({ seedVisits: [], actorId: "vet", network });
    const vetSnapshots: string[][] = [];

    await ownerRepo.initialize(defaultRuntimeConfig);
    await vetRepo.initialize(defaultRuntimeConfig);
    vetRepo.watchCases((cases) => {
      vetSnapshots.push(cases.map((item) => item.caseId));
    });

    const created = await ownerRepo.createCaseFromAppointment(defaultAppointment);

    expect(vetSnapshots.at(-1)).toEqual([created.caseId]);
    expect((await vetRepo.listCases())[0]).toMatchObject({
      caseId: created.caseId,
      complaint: defaultAppointment.reason,
      pet: defaultAppointment.pet,
    });
  });

  it("keeps concurrent owner and vet notes instead of overwriting one side", async () => {
    const network = createInMemoryCaseEventNetwork();
    const ownerRepo = createMockCaseRepository({ seedVisits: [], actorId: "owner", network });
    const vetRepo = createMockCaseRepository({ seedVisits: [], actorId: "vet", network });

    await ownerRepo.initialize(defaultRuntimeConfig);
    await vetRepo.initialize(defaultRuntimeConfig);

    const created = await ownerRepo.createCaseFromAppointment(defaultAppointment);
    const firstNoteAt = new Date(new Date(created.updatedAt).getTime() + 1000).toISOString();
    const secondNoteAt = new Date(new Date(created.updatedAt).getTime() + 2000).toISOString();
    await Promise.all([
      ownerRepo.appendCaseEvent(created.caseId, {
        id: "owner-note",
        type: "vet.note.added",
        payload: { note: "Владелец уточнил симптомы." },
        actorId: "owner",
        actorRole: "owner",
        createdAt: firstNoteAt,
      }),
      vetRepo.appendCaseEvent(created.caseId, {
        id: "vet-note",
        type: "vet.note.added",
        payload: { note: "Врач добавил план осмотра." },
        actorId: "vet",
        actorRole: "vet",
        createdAt: secondNoteAt,
      }),
    ]);

    const [ownerView] = await ownerRepo.listCases();
    const [vetView] = await vetRepo.listCases();

    expect(ownerView.notes).toEqual(expect.arrayContaining(["Владелец уточнил симптомы.", "Врач добавил план осмотра."]));
    expect(vetView.notes).toEqual(ownerView.notes);
  });

  it("syncs drug save and delete events between clients", async () => {
    const network = createInMemoryCaseEventNetwork();
    const ownerRepo = createMockCaseRepository({ seedVisits: [], actorId: "owner", network });
    const vetRepo = createMockCaseRepository({ seedVisits: [], actorId: "vet", network });
    const vetSnapshots: string[][] = [];

    await ownerRepo.initialize(defaultRuntimeConfig);
    await vetRepo.initialize(defaultRuntimeConfig);
    vetRepo.watchDappCollections((collections) => {
      vetSnapshots.push(collections.drugRecords.map((record) => record.id));
    });

    const record = {
      ...seedDrugRecords[0],
      id: "drug-synced",
      activeSubstanceRu: "Синхронизированное вещество",
      updatedAt: "2026-06-24T11:00:00.000Z",
    };

    await ownerRepo.saveDrugRecord(record);

    expect(vetSnapshots.at(-1)).toContain("drug-synced");
    expect((await vetRepo.listDappCollections()).drugRecords.find((item) => item.id === "drug-synced")).toMatchObject({
      activeSubstanceRu: "Синхронизированное вещество",
    });

    await ownerRepo.deleteDrugRecord("drug-synced");

    expect(vetSnapshots.at(-1)).not.toContain("drug-synced");
    expect((await vetRepo.listDappCollections()).drugRecords.map((item) => item.id)).not.toContain("drug-synced");
  });

  it("keeps seeded case identity while applying dynamic diagnosis and recommendation", async () => {
    const seedVisit = visits[0];
    const repository = createMockCaseRepository({ seedVisits: [seedVisit], actorId: "vet" });
    const caseId = `seed-${seedVisit.id}`;

    await repository.initialize(defaultRuntimeConfig);
    await repository.appendCaseEvent(caseId, {
      id: "seed-diagnosis-updated",
      type: "vet.diagnosis.updated",
      payload: { diagnosis: "Динамический диагноз" },
      actorId: "vet",
      actorRole: "vet",
      createdAt: "2026-06-25T10:00:00.000Z",
    });
    await repository.appendCaseEvent(caseId, {
      id: "seed-recommendation-updated",
      type: "vet.recommendation.updated",
      payload: { recommendation: "Динамическая рекомендация" },
      actorId: "vet",
      actorRole: "vet",
      createdAt: "2026-06-25T10:01:00.000Z",
    });

    const [view] = await repository.listCases();

    expect(view).toMatchObject({
      id: seedVisit.id,
      caseId,
      title: seedVisit.title,
      complaint: seedVisit.complaint,
      pet: seedVisit.pet,
      diagnosis: "Динамический диагноз",
      recommendation: "Динамическая рекомендация",
    });
  });

  it("syncs mocked clinical entries between clients", async () => {
    const network = createInMemoryCaseEventNetwork();
    const ownerRepo = createMockCaseRepository({ seedVisits: [], actorId: "owner", network });
    const vetRepo = createMockCaseRepository({ seedVisits: [], actorId: "vet", network });
    const vetSnapshots: string[][] = [];
    const habitus: ClinicalSection = {
      id: "habitus",
      title: "Общие данные / Габитус",
      templateStatus: "mocked",
      authorName: "Алексей Прохоров",
      filledAt: "2026-06-25T10:00:00.000Z",
      payload: { weightKg: "12.1", temperatureC: "38.3" },
    };
    const outcome: ClinicalSection = {
      id: "outcome",
      title: "Исход",
      templateStatus: "mocked",
      authorName: "Алексей Прохоров",
      filledAt: "2026-06-25T10:01:00.000Z",
      payload: { status: "Улучшение" },
    };

    await ownerRepo.initialize(defaultRuntimeConfig);
    await vetRepo.initialize(defaultRuntimeConfig);
    vetRepo.watchCases((cases) => {
      vetSnapshots.push(cases.map((item) => item.clinicalEntries.map((entry) => entry.id).join(",")));
    });

    const created = await ownerRepo.createCaseFromAppointment(defaultAppointment);
    await ownerRepo.appendCaseEvent(created.caseId, {
      id: "event-clinical-sync",
      type: "clinical.entry.saved",
      actorId: "vet",
      actorRole: "vet",
      createdAt: "2026-06-25T10:02:00.000Z",
      payload: { entryId: "clinical-synced", entryDate: "2026-06-25", sections: [habitus, outcome] },
    });

    expect(vetSnapshots.at(-1)?.[0]).toBe("clinical-synced");
    expect((await vetRepo.listCases())[0].clinicalEntries[0]).toMatchObject({
      id: "clinical-synced",
      sections: [
        { id: "habitus", payload: { weightKg: "12.1" } },
        { id: "outcome", payload: { status: "Улучшение" } },
      ],
    });
  });
});
