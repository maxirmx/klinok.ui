import { computed, reactive, readonly } from "vue";
import {
  exportUserKeySet,
  generateUserKeySet,
  type AuthSessionDto,
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
  storeExportedUserKeys,
} from "./repositories/deviceVault";
import { KlinokRepository } from "./repositories";
import type { ControlSnapshot, MedicalSnapshot } from "./repositories/types";
import type { EventSyncStatus } from "./repositories/eventTransport";

const emptyControl: ControlSnapshot = { profile: null, profiles: [], roles: [], allRoles: [], devices: [], pendingQueue: [], notifications: [], events: [] };
const emptyMedical: MedicalSnapshot = { pets: [], grants: [], accessRequests: [], records: [], confirmations: [], events: [] };
const emptySync: EventSyncStatus = { pendingCount: 0, failedCount: 0, syncing: false, lastError: "" };

const state = reactive({
  initialized: false,
  busy: false,
  error: "",
  message: "",
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

function setError(reason: unknown) {
  state.error = reason instanceof AuthClientError || reason instanceof Error ? reason.message : "Не удалось выполнить операцию.";
}

async function ensureDevice(session: AuthSessionDto): Promise<AuthSessionDto> {
  if (!session.accountId) return session;
  keys = await loadUserKeys(session.accountId);
  if (session.device) {
    state.devicePending = false;
    if (session.device.deviceName) setDeviceName(session.device.deviceName);
    if (!keys) {
      const enrollment = session.enrollments?.find((item) => item.deviceId === session.device?.deviceId && item.status === "active" && item.encryptedKeyBundle);
      if (enrollment?.encryptedKeyBundle) keys = await decryptAndStoreUserKeyBundle(session.accountId, enrollment.encryptedKeyBundle);
      else state.keyRecoveryRequired = true;
    }
    return session;
  }
  let deviceId = getOrCreateDeviceId();
  if (session.devices?.some((device) => device.deviceId === deviceId && device.status === "revoked")) {
    clearDeviceId();
    deviceId = getOrCreateDeviceId();
  }
  const existingPending = session.enrollments?.find((enrollment) => enrollment.deviceId === deviceId && enrollment.status === "pending");
  if (existingPending) {
    state.devicePending = true;
    return session;
  }
  const firstDevice = !(session.devices ?? []).some((device) => device.status === "active");
  let signingPublicKey: JsonWebKey | undefined;
  let encryptionPublicKey: JsonWebKey | undefined;
  let ephemeralPublicKey: JsonWebKey | undefined;
  if (firstDevice) {
    if (!keys && session.accountId === config.p2p.bootstrapAccountId) {
      state.keyRecoveryRequired = true;
      return session;
    }
    keys ??= await createAndStoreUserKeys(session.accountId);
    const exported = await exportUserKeySet(keys);
    signingPublicKey = exported.signingPublicKey;
    encryptionPublicKey = exported.encryptionPublicKey;
  } else {
    ephemeralPublicKey = await createEnrollmentKey(session.accountId);
  }
  const result = await auth.enrollDevice({
    deviceId,
    deviceName: getOrCreateDeviceName(),
    orbitIdentityId: `klinok-device-${deviceId}`,
    ...(signingPublicKey ? { signingPublicKey } : {}),
    ...(encryptionPublicKey ? { encryptionPublicKey } : {}),
    ...(ephemeralPublicKey ? { ephemeralPublicKey } : {}),
  });
  if (!result.certificate) {
    state.devicePending = true;
    return { ...session, enrollments: [...(session.enrollments ?? []), result.enrollment] };
  }
  return { ...session, device: result.certificate, enrollments: [...(session.enrollments ?? []), result.enrollment] };
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
  const applyControlSnapshot = (snapshot: ControlSnapshot) => {
    state.control = snapshot;
    const approved = snapshot.roles.filter((role) => role.status === "approved");
    if (!state.activeRole || !approved.some((role) => role.role === state.activeRole)) {
      const preferred = approved.find((role) => role.role === initialRole) ?? approved[0];
      state.activeRole = preferred?.role ?? null;
      if (preferred) {
        repository?.setActiveRole(preferred.role, preferred.requestId);
        setLastActiveRole(accountId, deviceId, preferred.role);
      }
    }
  };
  applyControlSnapshot(await repository.control.snapshot());
  controlUnsubscribe = repository.control.subscribe(applyControlSnapshot);
  medicalUnsubscribe = repository.medical.subscribe((snapshot) => { state.medical = snapshot; });
  const connectedRepository = repository;
  syncUnsubscribe = repository.subscribeSyncStatus((status) => {
    state.sync = status;
    if (status.failedCount) void connectedRepository.conflicts().then((conflicts) => {
      if (repository === connectedRepository) state.conflicts = conflicts;
    });
  });
  state.conflicts = await repository.conflicts();
}

export async function bootstrapApp(force = false) {
  if (state.initialized && !force) return;
  state.busy = true;
  state.error = "";
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
    setError(reason);
  } finally {
    state.initialized = true;
    state.busy = false;
  }
}

export async function register(input: Omit<RegisterInput, "personalDataConsentVersion" | "userAgreementVersion">) {
  state.busy = true; state.error = "";
  try {
    await auth.register({
      ...input,
      personalDataConsentVersion: config.legal.personalDataConsent.version,
      userAgreementVersion: config.legal.userAgreement.version,
    });
    state.message = "Письмо для подтверждения отправлено. Проверьте почту.";
  } catch (reason) { setError(reason); throw reason; } finally { state.busy = false; }
}

export async function verifyEmail(token: string) {
  state.busy = true; state.error = "";
  try { await auth.verifyEmail(token); state.message = "Адрес подтверждён. Теперь войдите в аккаунт."; }
  catch (reason) { setError(reason); throw reason; } finally { state.busy = false; }
}

export async function login(email: string, password: string, deviceName?: string) {
  state.busy = true; state.error = "";
  try {
    await auth.login(email, password, getDeviceId() ?? undefined);
    if (deviceName?.trim()) setDeviceName(deviceName);
    state.initialized = false;
    await bootstrapApp(true);
  }
  catch (reason) { setError(reason); throw reason; } finally { state.busy = false; }
}

export async function logout(all = false) {
  state.busy = true;
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
    const result = await auth.revokeDevice(deviceId, {
      signingPublicKey: exported.signingPublicKey,
      encryptionPublicKey: exported.encryptionPublicKey,
    });
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

export async function forgotPassword(email: string) { await auth.forgotPassword(email); state.message = "Если аккаунт существует, письмо отправлено."; }
export async function resetPassword(token: string, password: string) { await auth.resetPassword(token, password); state.message = "Пароль изменён. Войдите снова."; }

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
}

export async function updateCredentials(input: { email?: string; password?: string }) {
  const result = await auth.updateCredentials(input);
  state.session = { ...state.session, email: result.email };
}

export function switchRole(role: Role) {
  const proof = state.control.roles.find((request) => request.role === role && request.status === "approved");
  if (!proof || !state.session.accountId || !state.session.device) throw new Error("Эта роль недоступна.");
  state.activeRole = role;
  setLastActiveRole(state.session.accountId, state.session.device.deviceId, role);
  requireRepository().setActiveRole(role, proof.requestId);
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
  state.error = "";
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
    setError(error);
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
  state.message = "Устройство подтверждено. Ключи переданы по защищённому каналу.";
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
