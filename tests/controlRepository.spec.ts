import { describe, expect, it } from "vitest";
import {
  exportUserKeySet,
  generateUserKeySet,
  type ActiveRoleContext,
  type DeviceCertificate,
} from "@klinok/protocol";
import { ControlRepository } from "../src/repositories/controlRepository";
import { MemoryEventTransport } from "../src/repositories/eventTransport";

async function fixture() {
  const keys = await generateUserKeySet();
  const exported = await exportUserKeySet(keys);
  const context: ActiveRoleContext = {
    accountId: "owner-account", deviceId: "owner-device", orbitIdentityId: "owner-orbit",
    role: "owner", roleProofId: "setup-owner", userKeyVersion: 1,
  };
  const certificate: DeviceCertificate = {
    deviceId: context.deviceId, accountId: context.accountId, orbitIdentityId: context.orbitIdentityId,
    status: "active", userKeyVersion: 1, signingPublicKey: exported.signingPublicKey,
    encryptionPublicKey: exported.encryptionPublicKey, issuedAt: "2026-07-10T10:00:00.000Z", attestation: "auth-attestation",
  };
  const transport = new MemoryEventTransport();
  await transport.initialize();
  const repository = new ControlRepository(transport, context, keys, certificate, "bootstrap-administrator");
  return { repository, transport };
}

async function repositoryFor(
  transport: MemoryEventTransport,
  accountId: string,
  role: ActiveRoleContext["role"],
  bootstrapAccountId = "bootstrap-administrator",
  deviceId = `${accountId}-device`,
) {
  const keys = await generateUserKeySet();
  const exported = await exportUserKeySet(keys);
  const context: ActiveRoleContext = {
    accountId, deviceId, orbitIdentityId: `klinok-device-${deviceId}`, role,
    roleProofId: `setup-${role}`, userKeyVersion: 1,
  };
  const certificate: DeviceCertificate = {
    deviceId: context.deviceId, accountId, orbitIdentityId: context.orbitIdentityId, status: "active", userKeyVersion: 1,
    signingPublicKey: exported.signingPublicKey, encryptionPublicKey: exported.encryptionPublicKey,
    issuedAt: "2026-07-10T10:00:00.000Z", attestation: "auth-attestation",
  };
  return new ControlRepository(transport, context, keys, certificate, bootstrapAccountId);
}

describe("control repository", () => {
  it("isolates certificates for two accounts that share one installation ID", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const sharedDeviceId = "shared-browser-device";
    const first = await repositoryFor(transport, "first-account", "owner", "bootstrap-administrator", sharedDeviceId);
    const second = await repositoryFor(transport, "second-account", "owner", "bootstrap-administrator", sharedDeviceId);

    await first.initialize({ profile: { firstName: "Первый", lastName: "Владелец" }, requestedRoles: ["owner"] });
    await second.initialize({ profile: { firstName: "Второй", lastName: "Владелец" }, requestedRoles: ["owner"] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const attestations = (await transport.list("control")).filter((event) => event.eventType === "device.attested");
    expect(attestations).toEqual(expect.arrayContaining([
      expect.objectContaining({ aggregateId: "first-account", resourceId: sharedDeviceId }),
      expect.objectContaining({ aggregateId: "second-account", resourceId: sharedDeviceId }),
    ]));
    expect((await first.snapshot()).devices).toEqual([
      expect.objectContaining({ accountId: "first-account", deviceId: sharedDeviceId, status: "active" }),
    ]);
    expect((await second.snapshot()).devices).toEqual([
      expect.objectContaining({ accountId: "second-account", deviceId: sharedDeviceId, status: "active" }),
    ]);

    await first.revokeDevice(sharedDeviceId);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await first.snapshot()).devices[0]?.status).toBe("revoked");
    expect((await second.snapshot()).devices[0]?.status).toBe("active");
  });

  it("rotates only the matching account certificate when installation IDs are shared", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const sharedDeviceId = "shared-browser-device";
    const first = await repositoryFor(transport, "first-account", "owner", "bootstrap-administrator", sharedDeviceId);
    const second = await repositoryFor(transport, "second-account", "owner", "bootstrap-administrator", sharedDeviceId);
    await first.initialize({ profile: { firstName: "Первый", lastName: "Владелец" }, requestedRoles: ["owner"] });
    await second.initialize({ profile: { firstName: "Второй", lastName: "Владелец" }, requestedRoles: ["owner"] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const firstCertificate = (await first.snapshot()).devices[0]!;
    await first.rotateCurrentDevice({ ...firstCertificate, userKeyVersion: 2, issuedAt: "2026-07-20T10:00:00.000Z" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((await first.snapshot()).devices[0]?.userKeyVersion).toBe(2);
    expect((await second.snapshot()).devices[0]?.userKeyVersion).toBe(1);
  });

  it("attests the device, encrypts the profile, and immediately approves Owner", async () => {
    const { repository, transport } = await fixture();
    await repository.initialize({
      profile: { firstName: "Иван", lastName: "Иванов" },
      requestedRoles: ["owner", "doctor"],
    });
    const snapshot = await repository.snapshot();
    expect(snapshot.profile).toMatchObject({ firstName: "Иван", lastName: "Иванов", revision: 1 });
    expect(snapshot.roles).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "owner", status: "approved" }),
      expect.objectContaining({ role: "doctor", status: "pending" }),
    ]));
    const cleartext = JSON.stringify(await transport.list("control"));
    expect(cleartext).not.toContain("Иванов");
  });

  it("lets the bootstrap Administrator approve a pending Doctor and emits companions", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const administrator = await repositoryFor(transport, "bootstrap-administrator", "administrator");
    await administrator.initialize({ profile: { firstName: "Начальный", lastName: "Администратор" }, requestedRoles: ["administrator"] });
    const doctor = await repositoryFor(transport, "doctor-account", "doctor");
    await doctor.initialize({ profile: { firstName: "Анна", lastName: "Врач" }, requestedRoles: ["doctor"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = (await administrator.snapshot()).pendingQueue.find((request) => request.accountId === "doctor-account")!;
    expect(pending).toMatchObject({ role: "doctor", status: "pending" });
    await administrator.decideRole({ accountId: pending.accountId, role: pending.role, status: "approved" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await doctor.snapshot()).roles).toEqual(expect.arrayContaining([expect.objectContaining({ role: "doctor", status: "approved" })]));
    const decision = (await transport.list("control")).find((event) =>
      event.eventType === "role.approved" && event.aggregateId === "doctor-account",
    )!;
    const operationEvents = (await transport.list("control")).filter((event) => event.operationId === decision.operationId);
    expect(operationEvents.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "role.approved", "audit.role-transition", "notification.role-transition", "email.role-transition",
    ]));
    expect(new Set(operationEvents.map((event) => event.operationId)).size).toBe(1);
  });

  it("records a direct restoration and its audit companion", async () => {
    const transport = new MemoryEventTransport();
    await transport.initialize();
    const administrator = await repositoryFor(transport, "bootstrap-administrator", "administrator");
    await administrator.initialize({ profile: { firstName: "Начальный", lastName: "Администратор" }, requestedRoles: ["administrator"] });
    const doctor = await repositoryFor(transport, "doctor-account", "doctor");
    await doctor.initialize({ profile: { firstName: "Анна", lastName: "Врач" }, requestedRoles: ["doctor"] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const pending = (await administrator.snapshot()).pendingQueue.find((request) => request.accountId === "doctor-account")!;
    await administrator.decideRole({ accountId: pending.accountId, role: pending.role, status: "rejected", reason: "Проверка не пройдена" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const rejected = (await administrator.snapshot()).allRoles.find((request) =>
      request.accountId === "doctor-account" && request.role === "doctor",
    )!;

    await administrator.decideRole({ accountId: rejected.accountId, role: rejected.role, status: "approved" });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const events = await transport.list("control");
    const restoration = events.find((event) =>
      event.eventType === "role.restored" && event.aggregateId === "doctor-account",
    )!;
    expect(restoration).toBeDefined();
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: "audit.role-transition",
        operationId: restoration.operationId,
        parents: [restoration.eventId],
      }),
    ]));
    expect((await doctor.snapshot()).roles).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "doctor", status: "approved" }),
    ]));
  });
});
