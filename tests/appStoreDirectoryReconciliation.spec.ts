import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  session: vi.fn(),
  syncDirectoryProfile: vi.fn(),
  syncDirectoryPet: vi.fn(),
}));

const repositoryMocks = vi.hoisted(() => ({
  create: vi.fn(),
  dispose: vi.fn().mockResolvedValue(undefined),
  setActiveRole: vi.fn().mockResolvedValue(undefined),
  controlSnapshot: vi.fn(),
  medicalSnapshot: vi.fn(),
}));

vi.mock("../src/runtimeConfig", () => ({
  loadRuntimeConfig: vi.fn().mockResolvedValue({
    authBaseUrl: "",
    legal: {
      personalDataConsent: { version: "consent-v1", href: "/consent" },
      userAgreement: { version: "terms-v1", href: "/terms" },
    },
    p2p: { bootstrapAccountId: "bootstrap-administrator" },
  }),
}));

vi.mock("../src/repositories/authClient", () => {
  class AuthClientError extends Error {
    constructor(readonly code: string, message: string, readonly status: number) {
      super(message);
    }
  }
  class AuthClient {
    session = authMocks.session;
    syncDirectoryProfile = authMocks.syncDirectoryProfile;
    syncDirectoryPet = authMocks.syncDirectoryPet;
  }
  return { AuthClient, AuthClientError };
});

vi.mock("../src/repositories/deviceVault", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/repositories/deviceVault")>(),
  getLastActiveRole: vi.fn().mockReturnValue("owner"),
  loadUserKeys: vi.fn().mockResolvedValue({ version: 1 }),
}));

vi.mock("../src/repositories", () => {
  const repository = {
    dispose: repositoryMocks.dispose,
    setActiveRole: repositoryMocks.setActiveRole,
    control: {
      snapshot: repositoryMocks.controlSnapshot,
      subscribe: vi.fn().mockReturnValue(() => undefined),
    },
    medical: {
      snapshot: repositoryMocks.medicalSnapshot,
      subscribe: vi.fn().mockReturnValue(() => undefined),
    },
    conflicts: vi.fn().mockResolvedValue([]),
    subscribeSyncStatus: vi.fn().mockReturnValue(() => undefined),
  };
  repositoryMocks.create.mockResolvedValue(repository);
  return { KlinokRepository: { create: repositoryMocks.create } };
});

import { appState, bootstrapApp } from "../src/appStore";

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.session.mockResolvedValue({
    authenticated: true,
    accountId: "owner-1",
    serverKeySetAvailable: true,
    setup: { requestedRoles: ["owner"] },
    device: {
      deviceId: "device-1",
      accountId: "owner-1",
      orbitIdentityId: "orbit-1",
      status: "active",
      userKeyVersion: 1,
      signingPublicKey: {},
      encryptionPublicKey: {},
      issuedAt: "2026-07-22T00:00:00.000Z",
      attestation: "attestation",
    },
  });
  repositoryMocks.controlSnapshot.mockResolvedValue({
    profile: {
      accountId: "owner-1",
      revision: 1,
      firstName: "Иван",
      lastName: "Иванов",
      updatedAt: "2026-07-22T00:00:00.000Z",
    },
    profiles: [],
    roles: [{
      requestId: "owner-role-1",
      accountId: "owner-1",
      role: "owner",
      status: "approved",
      profileRevision: 1,
      requestedAt: "2026-07-22T00:00:00.000Z",
    }],
    allRoles: [],
    devices: [],
    pendingQueue: [],
    notifications: [],
    events: [],
  });
  repositoryMocks.medicalSnapshot.mockResolvedValue({
    pets: [{ petId: "pet-1", species: "Собака", name: "Бобик" }],
    grants: [],
    accessRequests: [],
    records: [],
    confirmations: [],
    confirmedRecordIds: [],
    events: [],
  });
  authMocks.syncDirectoryPet.mockResolvedValue(undefined);
});

describe("app-store directory reconciliation", () => {
  it("finishes bootstrap without waiting for profile and pet directory synchronization", async () => {
    let resolveProfile!: () => void;
    authMocks.syncDirectoryProfile.mockImplementation(() => new Promise<void>((resolve) => { resolveProfile = resolve; }));

    await bootstrapApp(true);

    expect(appState.repositoryConnected).toBe(true);
    expect(appState.busy).toBe(false);
    expect(appState.feedback).toBeNull();
    expect(authMocks.syncDirectoryProfile).toHaveBeenCalledOnce();
    expect(authMocks.syncDirectoryPet).not.toHaveBeenCalled();

    resolveProfile();
    await vi.waitFor(() => expect(authMocks.syncDirectoryPet).toHaveBeenCalledOnce());
  });
});
