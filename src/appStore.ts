// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { computed, reactive, readonly } from "vue";
import {
  exportUserKeySet,
  generateUserKeySet,
  type AuthSessionDto,
  type DirectoryPageDto,
  type DirectoryPetDto,
  type DirectoryProfileDto,
  type ExportedUserKeySet,
  type Role,
  type RoleRequest,
  type UserKeySet,
} from "@klinok/protocol";
import { loadRuntimeConfig, type AppRuntimeConfig } from "./runtimeConfig";
import { AuthClient, AuthClientError, type RegisterInput } from "./repositories/authClient";
import {
  createAndStoreUserKeys,
  createEnrollmentKey,
  clearDeviceId,
  decryptAndStoreUserKeyBundle,
  encryptUserKeyBundle,
  getDeviceId,
  getLastActiveRole,
  getOrCreateDeviceId,
  getOrCreateDeviceName,
  importBootstrapRecoveryBundle,
  loadUserKeys,
  setDeviceName,
  setLastActiveRole,
  signBootstrapDeviceReplacement,
  storeExportedUserKeys,
} from "./repositories/deviceVault";
import { KlinokRepository } from "./repositories";
import type { ControlSnapshot, MedicalSnapshot } from "./repositories/types";
import type { EventSyncStatus } from "./repositories/eventTransport";
import { reconcileDirectorySnapshot, type DirectoryPetInput } from "./directoryReconciliation";
import { useAlertStore } from "./stores/alert";

const emptyControl: ControlSnapshot = { profile: null, profiles: [], roles: [], allRoles: [], devices: [], pendingQueue: [], notifications: [], events: [] };
const emptyMedical: MedicalSnapshot = { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], confirmedRecordIds: [], events: [] };
const emptySync: EventSyncStatus = { pendingCount: 0, failedCount: 0, syncing: false, lastError: "" };

type AuthSuccessCode = "registration" | "verification" | "recovery" | "password-reset" | "device-approved";

export const AUTH_SUCCESS_MESSAGES = {
  registration: "Перейдите в Вашу программу электронной почты и откройте ссылку из письма для завершения регистрации.",
  verification: "Почта подтверждена, Вы можете войти в систему.",
  recovery: "Перейдите в Вашу программу электронной почты и откройте ссылку из письма для восстановления доступа.",
  "password-reset": "Пароль изменён. Вы можете войти в систему.",
  "device-approved": "Устройство подтверждено. Ключи переданы по защищённому каналу.",
} as const satisfies Record<AuthSuccessCode, string>;

const state = reactive({
  initialized: false,
  busy: false,
  session: { authenticated: false } as AuthSessionDto,
  activeRole: null as Role | null,
  control: emptyControl,
  medical: emptyMedical,
  conflicts: [] as Array<{ eventId: string; code: string; message: string }>,
  devicePending: false,
  keyRecoveryRequired: false,
  sync: emptySync,
  repositoryConnected: false,
});

let config: AppRuntimeConfig;
let auth: AuthClient;
let repository: KlinokRepository | null = null;
let keys: UserKeySet | null = null;
let controlUnsubscribe: (() => void) | null = null;
let medicalUnsubscribe: (() => void) | null = null;
let syncUnsubscribe: (() => void) | null = null;

function setAuthFeedback(input: { kind: "success"; code: AuthSuccessCode } | { kind: "error"; reason: unknown } | null) {
  const alertStore = useAlertStore();
  if (!input) {
    alertStore.clear();
    return;
  }
  if (input.kind === "success") alertStore.success(AUTH_SUCCESS_MESSAGES[input.code]);
  else alertStore.error(input.reason);
}

function beginAuthAction() {
  state.busy = true;
  setAuthFeedback(null);
}

async function ensureDevice(session: AuthSessionDto): Promise<AuthSessionDto> {
  if (!session.accountId) return session;
  keys = await loadUserKeys(session.accountId);
  if (session.device) {
    state.devicePending = false;
    state.keyRecoveryRequired = false;
    if (session.device.deviceName) setDeviceName(session.device.deviceName);
    if (!keys || keys.version !== session.device.userKeyVersion) {
      if (session.serverKeySetAvailable) {
        keys = await storeExportedUserKeys(session.accountId, (await auth.getUserKeySet()).userKeySet);
      } else {
        const enrollment = session.enrollments?.find((item) => item.deviceId === session.device?.deviceId && item.status === "active" && item.encryptedKeyBundle);
        if (enrollment?.encryptedKeyBundle) keys = await decryptAndStoreUserKeyBundle(session.accountId, enrollment.encryptedKeyBundle);
        else state.keyRecoveryRequired = true;
      }
    }
    if (keys && !session.serverKeySetAvailable) {
      await auth.putUserKeySet(await exportUserKeySet(keys));
      session = { ...session, serverKeySetAvailable: true };
    }
    return session;
  }
  let deviceId = getOrCreateDeviceId();
  if (session.devices?.some((device) => device.deviceId === deviceId && device.status === "revoked")) {
    clearDeviceId();
    deviceId = getOrCreateDeviceId();
  }
  const existingPending = session.enrollments?.find((enrollment) => enrollment.deviceId === deviceId && enrollment.status === "pending");
  if (existingPending && !session.serverKeySetAvailable) {
    state.devicePending = true;
    return session;
  }
  const firstDevice = !(session.devices ?? []).some((device) => device.status === "active");
  let signingPublicKey: JsonWebKey | undefined;
  let encryptionPublicKey: JsonWebKey | undefined;
  let ephemeralPublicKey: JsonWebKey | undefined;
  let userKeySet: ExportedUserKeySet | undefined;
  if (!session.serverKeySetAvailable && firstDevice) {
    if (!keys && session.accountId === config.p2p.bootstrapAccountId) {
      state.keyRecoveryRequired = true;
      return session;
    }
    keys ??= await createAndStoreUserKeys(session.accountId);
    const exported = await exportUserKeySet(keys);
    userKeySet = exported;
    signingPublicKey = exported.signingPublicKey;
    encryptionPublicKey = exported.encryptionPublicKey;
  } else if (!session.serverKeySetAvailable) {
    ephemeralPublicKey = await createEnrollmentKey(session.accountId);
  }
  const result = await auth.enrollDevice({
    deviceId,
    deviceName: getOrCreateDeviceName(),
    orbitIdentityId: `klinok-device-${deviceId}`,
    ...(signingPublicKey ? { signingPublicKey } : {}),
    ...(encryptionPublicKey ? { encryptionPublicKey } : {}),
    ...(ephemeralPublicKey ? { ephemeralPublicKey } : {}),
    ...(userKeySet ? { userKeySet } : {}),
  });
  if (!result.certificate) {
    state.devicePending = true;
    return { ...session, enrollments: [...(session.enrollments ?? []), result.enrollment] };
  }
  if (result.userKeySet) keys = await storeExportedUserKeys(session.accountId, result.userKeySet);
  state.devicePending = false;
  state.keyRecoveryRequired = false;
  const enrollments = existingPending
    ? (session.enrollments ?? []).map((candidate) => candidate.enrollmentId === result.enrollment.enrollmentId ? result.enrollment : candidate)
    : [...(session.enrollments ?? []), result.enrollment];
  return { ...session, device: result.certificate, enrollments, serverKeySetAvailable: Boolean(result.userKeySet || session.serverKeySetAvailable) };
}

function chooseInitialRole(session: AuthSessionDto): Role {
  if (session.accountId && session.device) {
    const saved = getLastActiveRole(session.accountId, session.device.deviceId);
    if (saved === "administrator" || saved === "doctor" || saved === "owner") return saved;
  }
  return session.setup?.requestedRoles.includes("owner") ? "owner" : session.setup?.requestedRoles[0] ?? "owner";
}

async function connectRepository(session: AuthSessionDto) {
  state.repositoryConnected = false;
  controlUnsubscribe?.(); controlUnsubscribe = null;
  medicalUnsubscribe?.(); medicalUnsubscribe = null;
  syncUnsubscribe?.(); syncUnsubscribe = null;
  await repository?.dispose();
  repository = null;
  state.sync = emptySync;
  if (!session.accountId || !session.device || !keys || state.keyRecoveryRequired) return;
  const accountId = session.accountId;
  const deviceId = session.device.deviceId;
  const initialRole = chooseInitialRole(session);
  repository = await KlinokRepository.create({
    config,
    session: { ...session, accountId: session.accountId, device: session.device },
    keys,
    initialRole,
  });
  const connectedRepository = repository;
  const connectedAuth = auth;
  state.repositoryConnected = true;
  for (const operation of session.pendingOperations ?? []) {
    if (operation.kind === "profile" && operation.payload) {
      const snapshot = await repository.control.snapshot();
      const firstName = String(operation.payload.firstName ?? "");
      const lastName = String(operation.payload.lastName ?? "");
      const patronymic = String(operation.payload.patronymic ?? "");
      if (firstName && lastName) await repository.control.updateProfile({
        accountId: session.accountId,
        revision: (snapshot.profile?.revision ?? 0) + 1,
        firstName,
        lastName,
        ...(patronymic ? { patronymic } : {}),
        updatedAt: new Date().toISOString(),
      }, operation.operationId);
    }
    if (operation.kind === "account_delete") await repository.control.deleteAccount(operation.operationId);
  }
  let roleSwitchQueue = Promise.resolve();
  const applyControlSnapshot = async (snapshot: ControlSnapshot): Promise<void> => {
    state.control = snapshot;
    const approved = snapshot.roles.filter((role) => role.status === "approved");
    if (!state.activeRole || !approved.some((role) => role.role === state.activeRole)) {
      const preferred = approved.find((role) => role.role === initialRole) ?? approved[0];
      state.activeRole = null;
      if (!preferred) return;
      const switchTask = roleSwitchQueue.then(() => connectedRepository.setActiveRole(preferred.role, preferred.requestId));
      roleSwitchQueue = switchTask.catch(() => undefined);
      await switchTask;
      if (repository !== connectedRepository) return;
      const remainsApproved = state.control.roles.some((role) => role.status === "approved"
        && role.role === preferred.role
        && role.requestId === preferred.requestId);
      if (!remainsApproved) return;
      state.activeRole = preferred.role;
      setLastActiveRole(accountId, deviceId, preferred.role);
    }
  };
  await applyControlSnapshot(await connectedRepository.control.snapshot());
  controlUnsubscribe = connectedRepository.control.subscribe((snapshot) => {
    void applyControlSnapshot(snapshot).catch((reason) => {
      if (repository === connectedRepository) setAuthFeedback({ kind: "error", reason });
    });
  });
  state.medical = await connectedRepository.medical.snapshot();
  medicalUnsubscribe = connectedRepository.medical.subscribe((snapshot) => { state.medical = snapshot; });
  syncUnsubscribe = repository.subscribeSyncStatus((status) => {
    state.sync = status;
    if (status.failedCount) void connectedRepository.conflicts().then((conflicts) => {
      if (repository === connectedRepository) state.conflicts = conflicts;
    });
  });
  state.conflicts = await repository.conflicts();
  const directoryProfile = state.control.profile
    ? {
        firstName: state.control.profile.firstName,
        lastName: state.control.profile.lastName,
        ...(state.control.profile.patronymic ? { patronymic: state.control.profile.patronymic } : {}),
      }
    : null;
  const directoryPets = state.activeRole === "owner"
    ? state.medical.pets.map((pet) => ({ petId: pet.petId, species: pet.species, name: pet.name }))
    : [];
  void reconcileDirectorySnapshot({
    profile: directoryProfile,
    pets: directoryPets,
    syncProfile: (profile) => connectedAuth.syncDirectoryProfile(profile),
    syncPet: (pet) => syncDirectoryPetWithClient(connectedAuth, pet),
    shouldContinue: () => repository === connectedRepository && auth === connectedAuth,
    onFailure: (failure) => {
      const target = failure.kind === "profile" ? "profile" : `pet ${failure.petId}`;
      console.warn(`Directory ${target} reconciliation failed.`, failure.reason);
    },
  }).catch((reason) => console.warn("Directory reconciliation failed.", reason));
}

export async function bootstrapApp(force = false) {
  if (state.initialized && !force) return;
  state.busy = true;
  if (useAlertStore().alert?.kind === "error") setAuthFeedback(null);
  try {
    config = await loadRuntimeConfig();
    auth = new AuthClient(config.authBaseUrl);
    let session = await auth.session();
    if (session.authenticated) session = await ensureDevice(session);
    state.session = session;
    await connectRepository(session);
    if (!session.authenticated) {
      state.activeRole = null;
      state.control = emptyControl;
      state.medical = emptyMedical;
    }
  } catch (reason) {
    setAuthFeedback({ kind: "error", reason });
  } finally {
    state.initialized = true;
    state.busy = false;
  }
}

export async function register(input: Omit<RegisterInput, "personalDataConsentVersion" | "userAgreementVersion">) {
  beginAuthAction();
  try {
    await auth.register({
      ...input,
      personalDataConsentVersion: config.legal.personalDataConsent.version,
      userAgreementVersion: config.legal.userAgreement.version,
    });
    setAuthFeedback({ kind: "success", code: "registration" });
  } catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}

export async function verifyEmail(token: string) {
  beginAuthAction();
  try { await auth.verifyEmail(token); setAuthFeedback({ kind: "success", code: "verification" }); }
  catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}

export async function login(email: string, password: string, deviceName?: string) {
  beginAuthAction();
  try {
    await auth.login(email, password, getDeviceId() ?? undefined);
    if (deviceName?.trim()) setDeviceName(deviceName);
    state.initialized = false;
    await bootstrapApp(true);
  }
  catch (reason) { setAuthFeedback({ kind: "error", reason }); throw reason; } finally { state.busy = false; }
}

export async function logout(all = false) {
  state.busy = true;
  setAuthFeedback(null);
  try { if (all) await auth.logoutAll(); else await auth.logout(); } finally {
    controlUnsubscribe?.(); controlUnsubscribe = null;
    medicalUnsubscribe?.(); medicalUnsubscribe = null;
    syncUnsubscribe?.(); syncUnsubscribe = null;
    await repository?.dispose(); repository = null; keys = null;
    state.session = { authenticated: false }; state.activeRole = null; state.control = emptyControl; state.medical = emptyMedical; state.sync = emptySync; state.repositoryConnected = false; state.busy = false;
  }
}

export async function revokeDevice(deviceId: string) {
  const activeRepository = requireRepository();
  const currentDeviceId = state.session.device?.deviceId;
  if (currentDeviceId && currentDeviceId !== deviceId && keys) {
    const nextKeys = await generateUserKeySet(keys.version + 1);
    const exported = await exportUserKeySet(nextKeys);
    const result = await auth.revokeDevice(deviceId, exported);
    for (const revokedId of result.revokedDeviceIds) await activeRepository.control.revokeDevice(revokedId);
    if (result.certificate) {
      await activeRepository.control.rotateCurrentDevice(result.certificate);
      keys = await storeExportedUserKeys(state.session.accountId!, exported);
    }
  } else {
    await activeRepository.control.revokeDevice(deviceId);
    await auth.revokeDevice(deviceId);
    if (currentDeviceId === deviceId) clearDeviceId();
  }
  await repository?.dispose();
  repository = null;
  controlUnsubscribe?.(); controlUnsubscribe = null;
  medicalUnsubscribe?.(); medicalUnsubscribe = null;
  syncUnsubscribe?.(); syncUnsubscribe = null;
  state.session = { authenticated: false };
  state.activeRole = null;
  state.repositoryConnected = false;
  state.sync = emptySync;
}

export async function deleteAccount() {
  const activeRepository = requireRepository();
  const { operationId } = await auth.deleteAccount();
  await activeRepository.control.deleteAccount(operationId);
  await repository?.dispose();
  repository = null;
  controlUnsubscribe?.(); controlUnsubscribe = null;
  medicalUnsubscribe?.(); medicalUnsubscribe = null;
  syncUnsubscribe?.(); syncUnsubscribe = null;
  state.session = { authenticated: false };
  state.activeRole = null;
  state.repositoryConnected = false;
  state.sync = emptySync;
}

export async function forgotPassword(email: string) {
  beginAuthAction();
  try {
    await auth.forgotPassword(email);
    setAuthFeedback({ kind: "success", code: "recovery" });
  } catch (reason) {
    setAuthFeedback({ kind: "error", reason });
    throw reason;
  } finally {
    state.busy = false;
  }
}

export async function resetPassword(token: string, password: string) {
  beginAuthAction();
  try {
    await auth.resetPassword(token, password);
    setAuthFeedback({ kind: "success", code: "password-reset" });
  } catch (reason) {
    setAuthFeedback({ kind: "error", reason });
    throw reason;
  } finally {
    state.busy = false;
  }
}

export async function updateProfile(input: { firstName: string; lastName: string; patronymic?: string }) {
  if (!state.session.accountId) throw new Error("Необходимо войти в аккаунт.");
  const activeRepository = requireRepository();
  const operation = await auth.updateProfile(input);
  await activeRepository.control.updateProfile({
    accountId: state.session.accountId,
    revision: (state.control.profile?.revision ?? 0) + 1,
    ...input,
    updatedAt: new Date().toISOString(),
  }, operation.operationId);
  await auth.syncDirectoryProfile(input);
}

export function searchDoctorDirectory(query = "", page = 1, pageSize = 20, sort = "name"): Promise<DirectoryPageDto<DirectoryProfileDto>> {
  return auth.searchDoctors(query, page, pageSize, sort);
}

export function lookupPetDirectory(petId: string): Promise<DirectoryPetDto> {
  return auth.lookupDirectoryPet(petId);
}

export function searchPetDirectory(owner = "", pet = "", page = 1, pageSize = 20, sort = "owner"): Promise<DirectoryPageDto<DirectoryPetDto>> {
  return auth.searchDirectoryPets(owner, pet, page, pageSize, sort);
}

export function loadDoctorPets(query = "", page = 1, pageSize = 20, sort = "owner", direction = "asc"): Promise<DirectoryPageDto<DirectoryPetDto>> {
  return auth.getMyDirectoryPets(query, page, pageSize, sort, direction);
}

async function syncDirectoryPetWithClient(client: AuthClient, pet: DirectoryPetInput): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await client.syncDirectoryPet(pet);
      return;
    } catch (reason) {
      lastError = reason;
      if (!(reason instanceof AuthClientError) || reason.code !== "PET_PROJECTION_PENDING") throw reason;
      if (attempt === 4) break;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function syncDirectoryPet(pet: DirectoryPetInput): Promise<void> {
  return syncDirectoryPetWithClient(auth, pet);
}

export function deleteDirectoryPet(petId: string): Promise<void> {
  return auth.deleteDirectoryPet(petId);
}

export async function updateCredentials(input: { email?: string; password?: string }) {
  const result = await auth.updateCredentials(input);
  state.session = { ...state.session, email: result.email };
}

export async function switchRole(role: Role): Promise<void> {
  const proof = state.control.roles.find((request) => request.role === role && request.status === "approved");
  if (!proof || !state.session.accountId || !state.session.device) throw new Error("Эта роль недоступна.");
  await requireRepository().setActiveRole(role, proof.requestId);
  state.activeRole = role;
  setLastActiveRole(state.session.accountId, state.session.device.deviceId, role);
}

export async function requestRole(role: Role) { await requireRepository().control.requestRole(role, state.control.profile?.revision ?? 1); }
export async function cancelRole(role: Role) { await requireRepository().control.cancelRole(role); }
export async function decideRole(request: RoleRequest, status: "approved" | "rejected" | "suspended" | "revoked", reason?: string) {
  await requireRepository().control.decideRole({ accountId: request.accountId, role: request.role, status, ...(reason ? { reason } : {}) });
}
export function getRepository() { return repository; }
export function requireRepository() {
  if (!repository) throw new Error("Хранилище данных ещё не подключено. Повторите операцию после восстановления соединения.");
  return repository;
}
export function getConfig() { return config; }

export async function importBootstrapRecovery(bundleText: string, passphrase: string) {
  state.busy = true;
  setAuthFeedback(null);
  try {
    if (!state.session.accountId || state.session.accountId !== config.p2p.bootstrapAccountId) {
      throw new Error("Пакет восстановления предназначен только для начального администратора.");
    }
    keys = await importBootstrapRecoveryBundle(state.session.accountId, bundleText, passphrase);
    state.keyRecoveryRequired = false;
    state.initialized = false;
    await bootstrapApp(true);
  } catch (reason) {
    const error = reason instanceof DOMException && reason.name === "OperationError"
      ? new Error("Не удалось расшифровать пакет. Проверьте, что выбран bootstrap-recovery.bundle.json от этого развёртывания и введена отдельная фраза KLINOK_RECOVERY_PASSPHRASE, а не пароль учётной записи.")
      : reason;
    setAuthFeedback({ kind: "error", reason: error });
  } finally {
    state.busy = false;
  }
}

export async function replaceLostBootstrapDevice(bundleText: string, passphrase: string) {
  state.busy = true;
  try {
    const accountId = state.session.accountId;
    if (!accountId || accountId !== config.p2p.bootstrapAccountId) {
      throw new Error("Замена утраченного устройства доступна только начальному администратору.");
    }
    const deviceId = getDeviceId();
    const enrollment = state.session.enrollments?.find((candidate) =>
      candidate.deviceId === deviceId && candidate.status === "pending");
    if (!deviceId || !enrollment) throw new Error("Запрос текущего устройства не найден. Обновите страницу и повторите попытку.");

    const recoveredKeys = await importBootstrapRecoveryBundle(accountId, bundleText, passphrase);
    const exported = await exportUserKeySet(recoveredKeys);
    const { challenge } = await auth.bootstrapDeviceReplacementChallenge();
    const payload = {
      action: "bootstrap-device-replacement" as const,
      challenge,
      accountId,
      deviceId,
      deviceName: enrollment.deviceName ?? getOrCreateDeviceName(),
      orbitIdentityId: enrollment.orbitIdentityId,
      userKeyVersion: exported.version,
      signingPublicKey: exported.signingPublicKey,
      encryptionPublicKey: exported.encryptionPublicKey,
    };
    const replacement = await auth.replaceBootstrapDevice(
      payload,
      await signBootstrapDeviceReplacement(payload, recoveredKeys.signingPrivateKey),
    );
    keys = recoveredKeys;
    state.initialized = false;
    await bootstrapApp(true);
    const activeRepository = requireRepository();
    for (const revokedDeviceId of replacement.revokedDeviceIds) {
      await activeRepository.control.revokeDevice(revokedDeviceId);
    }
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "OperationError") {
      throw new Error("Не удалось расшифровать пакет. Проверьте пакет восстановления и отдельную фразу KLINOK_RECOVERY_PASSPHRASE.");
    }
    throw reason;
  } finally {
    state.busy = false;
  }
}

export async function approveDeviceEnrollment(enrollmentId: string) {
  if (!keys) throw new Error("Ключи действующего устройства недоступны.");
  const enrollment = state.session.enrollments?.find((item) => item.enrollmentId === enrollmentId);
  if (!enrollment?.ephemeralPublicKey) throw new Error("Запрос устройства не содержит ключ переноса.");
  const exported = await exportUserKeySet(keys);
  await auth.approveEnrollment(
    enrollmentId,
    await encryptUserKeyBundle(enrollment.ephemeralPublicKey, keys),
    exported.signingPublicKey,
    exported.encryptionPublicKey,
  );
  setAuthFeedback({ kind: "success", code: "device-approved" });
  state.initialized = false;
  await bootstrapApp(true);
}

export async function rejectDeviceEnrollment(enrollmentId: string) {
  await auth.rejectEnrollment(enrollmentId);
  state.session = {
    ...state.session,
    enrollments: state.session.enrollments?.filter((item) => item.enrollmentId !== enrollmentId),
  };
}

export const appState = readonly(state);
export const approvedRoles = computed(() => state.control.roles.filter((role) => role.status === "approved"));
