import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  exportUserKeySet,
  generateUserKeySet,
  InMemorySignedEventRepository,
  type ActiveRoleContext,
  type DeviceCertificate,
  type Role,
} from "@klinok/protocol";
import { ControlRepository } from "../src/repositories/controlRepository";
import { MemoryEventTransport } from "../src/repositories/eventTransport";
import { MedicalRepository } from "../src/repositories/medicalRepository";
import type { MedicalSnapshot, PetProfileInput } from "../src/repositories/types";

async function client(transport: MemoryEventTransport, accountId: string, role: Role) {
  const keys = await generateUserKeySet();
  const exported = await exportUserKeySet(keys);
  const context: ActiveRoleContext = {
    accountId, deviceId: `${accountId}-device`, orbitIdentityId: `${accountId}-orbit`, role,
    roleProofId: `setup-${role}`, userKeyVersion: 1,
  };
  const certificate: DeviceCertificate = {
    deviceId: context.deviceId, accountId, orbitIdentityId: context.orbitIdentityId, status: "active", userKeyVersion: 1,
    signingPublicKey: exported.signingPublicKey, encryptionPublicKey: exported.encryptionPublicKey,
    issuedAt: "2026-07-10T10:00:00.000Z", attestation: "auth-attestation",
  };
  const control = new ControlRepository(transport, context, keys, certificate, "bootstrap-administrator");
  const medical = new MedicalRepository(transport, context, keys, certificate, control);
  return { control, medical };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function waitFor(condition: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await condition()) return;
    await tick();
  }
  throw new Error("Timed out waiting for repository synchronization.");
}
const petInput = (name = "Шарик"): PetProfileInput => ({
  name,
  species: "Собака",
  breed: "Бигль",
  sex: "Интактный самец",
  birthDate: "2022-06-17",
  color: "трёхцветный",
  weightKg: 12.4,
  notes: "Спокойно переносит осмотры",
});

describe("medical authorization repository", () => {
  it("refreshes the pet projection when switching back from administrator to owner", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const administrator = await client(transport, "bootstrap-administrator", "administrator");
    await administrator.control.initialize({
      profile: { firstName: "Начальный", lastName: "Администратор" },
      requestedRoles: ["administrator"],
    });
    const owner = await client(transport, "owner-account", "owner");
    await owner.control.initialize({
      profile: { firstName: "Ольга", lastName: "Владелец" },
      requestedRoles: ["owner"],
    });
    await tick();
    const ownerRole = (await owner.control.snapshot()).roles.find((item) => item.role === "owner")!;
    owner.control.setActiveRole("owner", ownerRole.requestId);
    await owner.medical.setActiveRole("owner", ownerRole.requestId);
    await owner.medical.initialize();

    const petId = await owner.medical.createPet(petInput());
    let latest: MedicalSnapshot | undefined;
    const unsubscribe = owner.medical.subscribe((snapshot) => { latest = snapshot; });
    await waitFor(() => latest?.pets.some((pet) => pet.petId === petId) ?? false);

    await owner.medical.setActiveRole("administrator", "administrator-role");
    expect(latest?.pets).toEqual([]);

    await owner.medical.setActiveRole("owner", "owner-role");
    expect(latest?.pets).toEqual([expect.objectContaining({ petId, name: "Шарик" })]);
    unsubscribe();
  });

  it("stores structured encounters and relinquishes a delegated branch with key rotation", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const administrator = await client(transport, "bootstrap-administrator", "administrator");
    await administrator.control.initialize({ profile: { firstName: "Анна", lastName: "Администратор" }, requestedRoles: ["administrator"] });
    const owner = await client(transport, "encounter-owner", "owner");
    await owner.control.initialize({ profile: { firstName: "Ольга", lastName: "Владелец" }, requestedRoles: ["owner"] });
    const doctor = await client(transport, "encounter-doctor", "doctor");
    await doctor.control.initialize({ profile: { firstName: "Вера", lastName: "Врач" }, requestedRoles: ["doctor"] });
    const delegate = await client(transport, "encounter-delegate", "doctor");
    await delegate.control.initialize({ profile: { firstName: "Дина", lastName: "Врач" }, requestedRoles: ["doctor"] });
    await tick();
    for (const accountId of ["encounter-doctor", "encounter-delegate"]) {
      const pending = (await administrator.control.snapshot()).pendingQueue.find((request) => request.accountId === accountId)!;
      await administrator.control.decideRole({ accountId, role: "doctor", status: "approved" });
      expect(pending).toBeDefined();
    }
    await tick();
    const ownerRole = (await owner.control.snapshot()).roles.find((item) => item.role === "owner")!;
    const doctorRole = (await doctor.control.snapshot()).roles.find((item) => item.role === "doctor")!;
    const delegateRole = (await delegate.control.snapshot()).roles.find((item) => item.role === "doctor")!;
    owner.control.setActiveRole("owner", ownerRole.requestId);
    doctor.control.setActiveRole("doctor", doctorRole.requestId);
    delegate.control.setActiveRole("doctor", delegateRole.requestId);
    await owner.medical.setActiveRole("owner", ownerRole.requestId);
    await doctor.medical.setActiveRole("doctor", doctorRole.requestId);
    await delegate.medical.setActiveRole("doctor", delegateRole.requestId);
    await owner.medical.initialize();
    await doctor.medical.initialize();
    await delegate.medical.initialize();

    const petId = await owner.medical.createPet(petInput("Буся"));
    const grantId = await owner.medical.grantDoctor(petId, "encounter-doctor", ["read", "write_unconfirmed", "delegate"]);
    await waitFor(async () => (await doctor.medical.snapshot()).pets.some((pet) => pet.petId === petId));
    const delegatedGrantId = await doctor.medical.delegateGrant(grantId, "encounter-delegate", ["read"]);
    await tick();
    const recordId = await doctor.medical.saveEncounter({
      petId,
      encounterDate: "2026-07-21",
      sections: {
        "what-happened": { selectedIds: ["problem.digestive.1"], comment: "Не ест со вчерашнего дня" },
        diagnosis: { text: "Предварительный диагноз" },
      },
    });
    await tick();
    const record = (await owner.medical.snapshot()).records.find((item) => item.recordId === recordId)!;
    expect(record.sections["what-happened"]).toMatchObject({
      templateVersion: "what-happened-v1",
      authorAccountId: "encounter-doctor",
      authorDisplayName: "Вера Врач",
      value: { selectedIds: ["problem.digestive.1"], comment: "Не ест со вчерашнего дня" },
    });
    expect(record.sections.diagnosis).toMatchObject({ templateVersion: "free-text-v0", value: { text: "Предварительный диагноз" } });
    await owner.medical.confirmRecord(petId, recordId, record.revision);
    await waitFor(async () => (await doctor.medical.snapshot()).confirmedRecordIds.includes(recordId));
    const ownerConfirmed = await owner.medical.snapshot();
    const doctorConfirmed = await doctor.medical.snapshot();
    const delegateConfirmed = await delegate.medical.snapshot();
    expect(ownerConfirmed.confirmedRecordIds).toContain(recordId);
    expect(doctorConfirmed.confirmedRecordIds).toContain(recordId);
    expect(delegateConfirmed.confirmedRecordIds).toContain(recordId);
    expect(doctorConfirmed.confirmations).toEqual([]);
    expect(delegateConfirmed.confirmations).toEqual([]);
    expect((await administrator.medical.snapshot()).confirmedRecordIds).toEqual([]);
    await expect(doctor.medical.saveEncounter({
      petId,
      encounterDate: "2026-07-21",
      sections: { "what-happened": { selectedIds: [], comment: "Позднее дополнение" } },
      addendumTo: recordId,
    } as Parameters<typeof doctor.medical.saveEncounter>[0])).rejects.toThrow("Дополнения к медицинским записям не поддерживаются.");
    await expect(doctor.medical.saveEncounter({
      petId,
      recordId,
      encounterDate: "2026-07-21",
      sections: { "what-happened": { selectedIds: [], comment: "Изменение" } },
    })).rejects.toMatchObject({ code: "CONFIRMED_RECORD_IMMUTABLE" });

    await doctor.medical.relinquishAccess(grantId);
    await waitFor(async () => (await owner.medical.snapshot()).grants.find((grant) => grant.grantId === grantId)?.status === "relinquished");
    const ownerSnapshot = await owner.medical.snapshot();
    expect(ownerSnapshot.grants.find((grant) => grant.grantId === grantId)?.status).toBe("relinquished");
    expect(ownerSnapshot.grants.find((grant) => grant.grantId === delegatedGrantId)?.status).toBe("revoked");
    const doctorAfterRelinquishment = await doctor.medical.snapshot();
    const delegateAfterRelinquishment = await delegate.medical.snapshot();
    expect(doctorAfterRelinquishment.pets).toHaveLength(0);
    expect(delegateAfterRelinquishment.pets).toHaveLength(0);
    expect(doctorAfterRelinquishment.confirmedRecordIds).toEqual([]);
    expect(delegateAfterRelinquishment.confirmedRecordIds).toEqual([]);
  });

  it("shares a pet by grant, lets the Doctor draft, confirms immutably, and rotates on revocation", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const administrator = await client(transport, "bootstrap-administrator", "administrator");
    await administrator.control.initialize({ profile: { firstName: "Начальный", lastName: "Администратор" }, requestedRoles: ["administrator"] });
    const owner = await client(transport, "owner-account", "owner");
    await owner.control.initialize({ profile: { firstName: "Ольга", lastName: "Владелец" }, requestedRoles: ["owner"] });
    const doctor = await client(transport, "doctor-account", "doctor");
    await doctor.control.initialize({ profile: { firstName: "Анна", lastName: "Врач" }, requestedRoles: ["doctor"] });
    const delegatedDoctor = await client(transport, "delegated-doctor-account", "doctor");
    await delegatedDoctor.control.initialize({ profile: { firstName: "Мария", lastName: "Врач" }, requestedRoles: ["doctor"] });
    await tick();
    const pending = (await administrator.control.snapshot()).pendingQueue.find((request) => request.accountId === "doctor-account")!;
    await administrator.control.decideRole({ accountId: pending.accountId, role: "doctor", status: "approved" });
    const delegatedPending = (await administrator.control.snapshot()).pendingQueue.find((request) => request.accountId === "delegated-doctor-account")!;
    await administrator.control.decideRole({ accountId: delegatedPending.accountId, role: "doctor", status: "approved" });
    await tick();
    owner.control.setActiveRole("owner", (await owner.control.snapshot()).roles.find((item) => item.role === "owner")!.requestId);
    doctor.control.setActiveRole("doctor", (await doctor.control.snapshot()).roles.find((item) => item.role === "doctor")!.requestId);
    delegatedDoctor.control.setActiveRole("doctor", (await delegatedDoctor.control.snapshot()).roles.find((item) => item.role === "doctor")!.requestId);
    await owner.medical.setActiveRole("owner", (await owner.control.snapshot()).roles.find((item) => item.role === "owner")!.requestId);
    await doctor.medical.setActiveRole("doctor", (await doctor.control.snapshot()).roles.find((item) => item.role === "doctor")!.requestId);
    await delegatedDoctor.medical.setActiveRole("doctor", (await delegatedDoctor.control.snapshot()).roles.find((item) => item.role === "doctor")!.requestId);
    await owner.medical.initialize();
    await doctor.medical.initialize();
    await delegatedDoctor.medical.initialize();

    const petId = await owner.medical.createPet(petInput());
    await tick();
    expect((await doctor.medical.snapshot()).pets).toHaveLength(0);
    const grantId = await owner.medical.grantDoctor(
      petId,
      "doctor-account",
      ["read", "write_unconfirmed", "delegate"],
      { granteeDisplayName: "Анна Врач" },
    );
    await tick();
    expect((await doctor.medical.snapshot()).pets).toEqual([expect.objectContaining({ petId, name: "Шарик" })]);
    await doctor.medical.delegateGrant(grantId, "delegated-doctor-account", ["read"]);
    expect((await delegatedDoctor.medical.snapshot()).pets).toEqual([expect.objectContaining({ petId, name: "Шарик" })]);

    await owner.medical.disableGrantDelegation(grantId);
    await tick();
    expect((await owner.medical.snapshot()).grants).toEqual(expect.arrayContaining([
      expect.objectContaining({
        grantId,
        granteeDisplayName: "Анна Врач",
        actions: ["read", "write_unconfirmed"],
      }),
    ]));
    const publicGrant = owner.control.signed.list()
      .find((event) => event.eventType === "grant.created" && event.resourceId === grantId)
      ?.metadata.grant as Record<string, unknown>;
    expect(publicGrant).not.toHaveProperty("granteeDisplayName");
    expect((await delegatedDoctor.medical.snapshot()).pets).toEqual([expect.objectContaining({ petId, name: "Шарик" })]);
    await expect(doctor.medical.delegateGrant(grantId, "delegated-doctor-account", ["read"]))
      .rejects.toMatchObject({ code: "GRANT_DELEGATION_FORBIDDEN" });

    await owner.medical.enableGrantDelegation(grantId);
    await tick();
    expect((await owner.medical.snapshot()).grants).toEqual(expect.arrayContaining([
      expect.objectContaining({ grantId, actions: ["read", "write_unconfirmed", "delegate"] }),
    ]));

    const recordId = await doctor.medical.saveRecord({ petId, title: "Осмотр", text: "Состояние стабильное" });
    await tick();
    const ownerRecord = (await owner.medical.snapshot()).records.find((record) => record.recordId === recordId)!;
    expect(ownerRecord.text).toBe("Состояние стабильное");
    await owner.medical.confirmRecord(petId, recordId, ownerRecord.revision);
    await tick();
    await expect(doctor.medical.saveRecord({ petId, recordId, title: "Изменено", text: "Нельзя изменить" })).rejects.toMatchObject({ code: "CONFIRMED_RECORD_IMMUTABLE" });

    await owner.medical.revokeGrant(grantId);
    await tick();
    expect((await owner.medical.snapshot()).pets[0]?.keyVersion).toBe(2);
    expect((await doctor.medical.snapshot()).pets).toHaveLength(0);
    expect((await delegatedDoctor.medical.snapshot()).pets).toHaveLength(0);
    await expect(doctor.medical.saveRecord({ petId, title: "После отзыва", text: "Запрещено" })).rejects.toMatchObject({ code: "PET_GRANT_REQUIRED" });

    const replay = new InMemorySignedEventRepository("bootstrap-administrator");
    const replayEvents = owner.control.signed.list();
    const recordEvent = replayEvents.find((event) => event.resourceId === recordId)!;
    await replay.import([...replayEvents].reverse());
    expect(replay.conflicts).toEqual([]);
    expect(replay.state.knownEvents.has(recordEvent.eventId)).toBe(true);
    expect(replay.state.grants.get(grantId)?.status).toBe("revoked");
    expect(replay.state.invalidatedEvents.has(recordEvent.eventId)).toBe(false);
  });

  it("synchronizes access requests, normalizes edits, and cleans access up when a pet is deleted", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const administrator = await client(transport, "bootstrap-administrator", "administrator");
    await administrator.control.initialize({ profile: { firstName: "Начальный", lastName: "Администратор" }, requestedRoles: ["administrator"] });
    const owner = await client(transport, "owner-account", "owner");
    await owner.control.initialize({ profile: { firstName: "Ольга", lastName: "Владелец" }, requestedRoles: ["owner"] });
    const doctor = await client(transport, "doctor-account", "doctor");
    await doctor.control.initialize({ profile: { firstName: "Анна", lastName: "Врач" }, requestedRoles: ["doctor"] });
    await tick();
    const roleRequest = (await administrator.control.snapshot()).pendingQueue.find((request) => request.accountId === "doctor-account")!;
    await administrator.control.decideRole({ accountId: roleRequest.accountId, role: "doctor", status: "approved" });
    await tick();
    owner.control.setActiveRole("owner", (await owner.control.snapshot()).roles.find((item) => item.role === "owner")!.requestId);
    doctor.control.setActiveRole("doctor", (await doctor.control.snapshot()).roles.find((item) => item.role === "doctor")!.requestId);
    await owner.medical.setActiveRole("owner", (await owner.control.snapshot()).roles.find((item) => item.role === "owner")!.requestId);
    await doctor.medical.setActiveRole("doctor", (await doctor.control.snapshot()).roles.find((item) => item.role === "doctor")!.requestId);
    await owner.medical.initialize();
    await doctor.medical.initialize();

    const petId = await owner.medical.createPet({ ...petInput("Боня"), birthDate: undefined, birthYear: 2021 });
    await waitFor(() => doctor.control.signed.state.petOwners.get(petId) === "owner-account");
    const requestId = await doctor.medical.requestAccess(petId);
    await tick();
    expect((await owner.medical.snapshot()).accessRequests).toEqual([
      expect.objectContaining({
        requestId,
        petId,
        requesterDisplayName: "Анна Врач",
        status: "pending",
      }),
    ]);

    const grantId = await owner.medical.approveAccessRequest(requestId);
    await tick();
    expect((await doctor.medical.snapshot()).pets).toEqual([
      expect.objectContaining({ petId, name: "Боня", notes: "Спокойно переносит осмотры" }),
    ]);
    expect((await owner.medical.snapshot()).accessRequests[0]?.status).toBe("approved");
    expect((await owner.medical.snapshot()).grants.find((grant) => grant.grantId === grantId)?.granteeDisplayName)
      .toBe("Анна Врач");

    const pet = (await owner.medical.snapshot()).pets[0]!;
    await owner.medical.updatePet({
      ...pet,
      notes: "Новая заметка",
      sex: undefined,
      legacyOptionalField: "drop-me",
    } as typeof pet & { legacyOptionalField: string });
    await tick();
    const updated = (await owner.medical.snapshot()).pets[0]!;
    expect(updated.notes).toBe("Новая заметка");
    expect(updated.sex).toBeUndefined();
    expect(updated).not.toHaveProperty("legacyOptionalField");

    await owner.medical.revokeGrant(grantId);
    await tick();
    const rejectedRequest = await doctor.medical.requestAccess(petId);
    await waitFor(() =>
      owner.control.signed.state.grantRequests.get(rejectedRequest)?.request.status === "pending",
    );
    await owner.medical.rejectAccessRequest(rejectedRequest);
    await tick();
    expect((await doctor.medical.snapshot()).accessRequests.find((request) => request.requestId === rejectedRequest)?.status).toBe("rejected");

    const cancelledRequest = await doctor.medical.requestAccess(petId);
    await tick();
    await doctor.medical.cancelAccessRequest(cancelledRequest);
    await tick();
    expect((await owner.medical.snapshot()).accessRequests.find((request) => request.requestId === cancelledRequest)?.status).toBe("cancelled");

    await owner.medical.grantDoctor(petId, "doctor-account", ["read", "write_unconfirmed"]);
    await tick();
    await owner.medical.deletePet(petId);
    await tick();

    const unsharedPetId = await owner.medical.createPet(petInput("Рыжик"));
    await owner.medical.deletePet(unsharedPetId);
    const unsharedRotation = owner.control.signed.list().findLast((event) =>
      event.aggregateId === unsharedPetId && event.eventType === "pet.key.rotated",
    );
    expect(unsharedRotation?.metadata.keyVersion).toBe(2);
    expect((await owner.medical.snapshot()).pets).toHaveLength(0);
    expect((await doctor.medical.snapshot()).pets).toHaveLength(0);
  });
});
