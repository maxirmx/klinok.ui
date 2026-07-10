import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  exportUserKeySet,
  generateUserKeySet,
  type ActiveRoleContext,
  type DeviceCertificate,
  type Role,
} from "@klinok/protocol";
import { ControlRepository } from "../src/repositories/controlRepository";
import { MemoryEventTransport } from "../src/repositories/eventTransport";
import { MedicalRepository } from "../src/repositories/medicalRepository";

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

describe("medical authorization repository", () => {
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
    owner.medical.setActiveRole("owner", (await owner.control.snapshot()).roles.find((item) => item.role === "owner")!.requestId);
    doctor.medical.setActiveRole("doctor", (await doctor.control.snapshot()).roles.find((item) => item.role === "doctor")!.requestId);
    delegatedDoctor.medical.setActiveRole("doctor", (await delegatedDoctor.control.snapshot()).roles.find((item) => item.role === "doctor")!.requestId);
    await owner.medical.initialize();
    await doctor.medical.initialize();
    await delegatedDoctor.medical.initialize();

    const petId = await owner.medical.createPet({ name: "Шарик", species: "Собака", breed: "Бигль", sex: "Кобель" });
    await tick();
    expect((await doctor.medical.snapshot()).pets).toHaveLength(0);
    const grantId = await owner.medical.grantDoctor(petId, "doctor-account", ["read", "write_unconfirmed", "delegate"]);
    await tick();
    expect((await doctor.medical.snapshot()).pets).toEqual([expect.objectContaining({ petId, name: "Шарик" })]);
    await doctor.medical.delegateGrant(grantId, "delegated-doctor-account", ["read"]);
    expect((await delegatedDoctor.medical.snapshot()).pets).toEqual([expect.objectContaining({ petId, name: "Шарик" })]);

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
  });
});
