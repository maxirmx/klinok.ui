// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { defaultAppointment } from "../src/data";
import { defaultRuntimeConfig } from "../src/runtimeConfig";
import { createInMemoryCaseEventNetwork, createMockCaseRepository } from "../src/cases/mockRepository";
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
});
