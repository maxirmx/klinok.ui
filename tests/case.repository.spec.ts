// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { describe, expect, it } from "vitest";
import { defaultAppointment } from "../src/data";
import { defaultRuntimeConfig } from "../src/runtimeConfig";
import { createInMemoryCaseEventNetwork, createMockCaseRepository } from "../src/cases/mockRepository";

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
    await Promise.all([
      ownerRepo.appendCaseEvent(created.caseId, {
        id: "owner-note",
        type: "vet.note.added",
        payload: { note: "Владелец уточнил симптомы." },
        actorId: "owner",
        actorRole: "owner",
        createdAt: "2026-06-24T10:01:00.000Z",
      }),
      vetRepo.appendCaseEvent(created.caseId, {
        id: "vet-note",
        type: "vet.note.added",
        payload: { note: "Врач добавил план осмотра." },
        actorId: "vet",
        actorRole: "vet",
        createdAt: "2026-06-24T10:02:00.000Z",
      }),
    ]);

    const [ownerView] = await ownerRepo.listCases();
    const [vetView] = await vetRepo.listCases();

    expect(ownerView.notes).toEqual(expect.arrayContaining(["Владелец уточнил симптомы.", "Врач добавил план осмотра."]));
    expect(vetView.notes).toEqual(ownerView.notes);
  });
});
