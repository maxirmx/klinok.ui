import type {
  AuthErrorBody,
  AuthSessionDto,
  BootstrapDeviceReplacementPayload,
  DeviceCertificate,
  DeviceEnrollmentDto,
  DirectoryPageDto,
  DirectoryPetDto,
  DirectoryProfileDto,
  ExportedUserKeySet,
  Role,
} from "@klinok/protocol";

export interface RegisterInput {
  firstName: string;
  lastName: string;
  patronymic?: string;
  email: string;
  password: string;
  ageConfirmed: boolean;
  personalDataConsentVersion: string;
  userAgreementVersion: string;
  requestedRoles: Role[];
}

export class AuthClientError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

export class AuthClient {
  private csrfToken = "";

  constructor(private readonly baseUrl = "") {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("Content-Type", "application/json");
    if (this.csrfToken && init.method && init.method !== "GET") headers.set("X-CSRF-Token", this.csrfToken);
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, credentials: "include" });
    const body = response.status === 204 ? undefined : await response.json().catch(() => undefined) as T | AuthErrorBody | undefined;
    if (!response.ok) {
      const apiError = body && typeof body === "object" && "error" in body ? (body as AuthErrorBody).error : undefined;
      throw new AuthClientError(apiError?.code ?? "REQUEST_FAILED", apiError?.message ?? "Сервис авторизации недоступен.", response.status);
    }
    return body as T;
  }

  async session(): Promise<AuthSessionDto> {
    const session = await this.request<AuthSessionDto>("/api/auth/session");
    this.csrfToken = session.csrfToken ?? "";
    return session;
  }

  register(input: RegisterInput) {
    return this.request<{ accepted: true }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
  }

  verifyEmail(token: string) {
    return this.request<{ verified: true }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
  }

  async login(email: string, password: string, deviceId?: string) {
    const result = await this.request<{ authenticated: true; accountId: string; csrfToken: string }>("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password, ...(deviceId ? { deviceId } : {}) }),
    });
    this.csrfToken = result.csrfToken;
    return result;
  }

  logout() { return this.request<{ loggedOut: true }>("/api/auth/logout", { method: "POST" }); }
  logoutAll() { return this.request<{ loggedOut: true }>("/api/auth/logout-all", { method: "POST" }); }
  forgotPassword(email: string) { return this.request<{ accepted: true }>("/api/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) }); }
  resetPassword(token: string, password: string) { return this.request<{ reset: true }>("/api/auth/password/reset", { method: "POST", body: JSON.stringify({ token, password }) }); }
  updateProfile(profile: Record<string, string>) { return this.request<{ operationId: string }>("/api/auth/profile", { method: "PATCH", body: JSON.stringify(profile) }); }
  updateCredentials(input: { email?: string; password?: string }) {
    return this.request<{ updated: true; email: string }>("/api/auth/credentials", { method: "PATCH", body: JSON.stringify(input) });
  }
  deleteAccount() { return this.request<{ operationId: string }>("/api/auth/account", { method: "DELETE" }); }

  getUserKeySet() {
    return this.request<{ userKeySet: ExportedUserKeySet }>("/api/auth/user-key-set");
  }

  putUserKeySet(userKeySet: ExportedUserKeySet) {
    return this.request<{ stored: true; version: number }>("/api/auth/user-key-set", {
      method: "PUT",
      body: JSON.stringify({ userKeySet }),
    });
  }

  bootstrapDeviceReplacementChallenge() {
    return this.request<{ challenge: string; expiresAt: string }>("/api/auth/bootstrap-device-replacement/challenge", { method: "POST" });
  }

  replaceBootstrapDevice(payload: BootstrapDeviceReplacementPayload, signature: string) {
    return this.request<{
      certificate: DeviceCertificate;
      enrollment: DeviceEnrollmentDto;
      revokedDeviceIds: string[];
    }>("/api/auth/bootstrap-device-replacement", {
      method: "POST",
      body: JSON.stringify({ payload, signature }),
    });
  }

  enrollDevice(input: Omit<DeviceEnrollmentDto, "enrollmentId" | "operationId" | "accountId" | "status" | "createdAt"> & { userKeySet?: ExportedUserKeySet }) {
    return this.request<{ enrollment: DeviceEnrollmentDto; certificate?: DeviceCertificate; userKeySet?: ExportedUserKeySet }>("/api/auth/device-enrollments", { method: "POST", body: JSON.stringify(input) });
  }

  approveEnrollment(id: string, encryptedKeyBundle: string, signingPublicKey: JsonWebKey, encryptionPublicKey: JsonWebKey) {
    return this.request<{ certificate: DeviceCertificate }>(`/api/auth/device-enrollments/${encodeURIComponent(id)}/approve`, {
      method: "POST", body: JSON.stringify({ encryptedKeyBundle, signingPublicKey, encryptionPublicKey }),
    });
  }

  rejectEnrollment(id: string) {
    return this.request<{ rejected: true }>(`/api/auth/device-enrollments/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  revokeDevice(id: string, userKeySet?: ExportedUserKeySet) {
    return this.request<{ revoked: true; rotateUserKeys: boolean; certificate?: DeviceCertificate; revokedDeviceIds: string[] }>(
      `/api/auth/devices/${encodeURIComponent(id)}`,
      { method: "DELETE", ...(userKeySet ? { body: JSON.stringify({ userKeySet }) } : {}) },
    );
  }

  syncDirectoryProfile(profile: Pick<DirectoryProfileDto, "firstName" | "lastName" | "patronymic">) {
    return this.request<DirectoryProfileDto>("/api/auth/directory/profile", { method: "PUT", body: JSON.stringify(profile) });
  }

  searchDoctors(query = "", page = 1, pageSize = 20, sort = "name") {
    const params = new URLSearchParams({ query, page: String(page), pageSize: String(pageSize), sort });
    return this.request<DirectoryPageDto<DirectoryProfileDto>>(`/api/auth/directory/doctors?${params}`);
  }

  lookupDirectoryPet(petId: string) {
    return this.request<DirectoryPetDto>(`/api/auth/directory/pets/${encodeURIComponent(petId)}`);
  }

  searchDirectoryPets(owner = "", pet = "", page = 1, pageSize = 20, sort = "owner") {
    const params = new URLSearchParams({ owner, pet, page: String(page), pageSize: String(pageSize), sort });
    return this.request<DirectoryPageDto<DirectoryPetDto>>(`/api/auth/directory/pets?${params}`);
  }

  getMyDirectoryPets(query = "", page = 1, pageSize = 20, sort = "owner", direction = "asc") {
    const params = new URLSearchParams({ query, page: String(page), pageSize: String(pageSize), sort, direction });
    return this.request<DirectoryPageDto<DirectoryPetDto>>(`/api/auth/directory/my-pets?${params}`);
  }

  syncDirectoryPet(pet: Pick<DirectoryPetDto, "petId" | "species" | "name">) {
    return this.request<DirectoryPetDto>(`/api/auth/directory/pets/${encodeURIComponent(pet.petId)}`, {
      method: "PUT",
      body: JSON.stringify({ species: pet.species, name: pet.name }),
    });
  }

  deleteDirectoryPet(petId: string) {
    return this.request<void>(`/api/auth/directory/pets/${encodeURIComponent(petId)}`, { method: "DELETE" });
  }
}
