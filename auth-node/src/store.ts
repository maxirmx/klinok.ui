// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ClassicLevel } from "classic-level";
import type {
  CredentialStatus,
  DeviceCertificate,
  DeviceEnrollmentDto,
  PendingOperationDto,
  RegistrationSetupDto,
  DirectoryPetDto,
  DirectoryProfileDto,
  PetAccessGrant,
  Role,
  RoleStatus,
} from "@klinok/protocol";

export interface EncryptedUserKeySet {
  formatVersion: 1;
  algorithm: "AES-256-GCM";
  keyVersion: number;
  iv: string;
  ciphertext: string;
}

export interface AuthAccount {
  accountId: string;
  email: string;
  passwordHash: string;
  credentialStatus: CredentialStatus;
  verificationState: "pending" | "verified";
  createdAt: string;
  updatedAt: string;
  failureTimes: string[];
  lockedUntil?: string;
  setup?: RegistrationSetupDto;
  devices: DeviceCertificate[];
  enrollments: DeviceEnrollmentDto[];
  pendingOperations: PendingOperationDto[];
  sessionDigests: string[];
  immutableBootstrap?: boolean;
  encryptedUserKeySet?: EncryptedUserKeySet;
}

export interface AuthSessionRecord {
  digest: string;
  accountId: string;
  csrfToken: string;
  deviceId?: string;
  createdAt: string;
  lastSeenAt: string;
  absoluteExpiresAt: string;
}

export interface SingleUseTokenRecord {
  digest: string;
  accountId: string;
  kind: "verification" | "password_reset";
  expiresAt: string;
  usedAt?: string;
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "LEVEL_NOT_FOUND");
}

export class AuthStore {
  private readonly db: ClassicLevel<string, unknown>;

  constructor(private readonly dataDir: string) {
    this.db = new ClassicLevel(join(dataDir, "leveldb"), { valueEncoding: "json" });
  }

  async open(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await this.db.open();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  private async get<T>(key: string): Promise<T | null> {
    try {
      return await this.db.get(key) as T;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async getAccount(accountId: string): Promise<AuthAccount | null> {
    return this.get<AuthAccount>(`account:${accountId}`);
  }

  async getAccountByEmail(email: string): Promise<AuthAccount | null> {
    const accountId = await this.get<string>(`email:${email}`);
    return accountId ? this.getAccount(accountId) : null;
  }

  async createAccount(account: AuthAccount): Promise<void> {
    await this.db.batch()
      .put(`account:${account.accountId}`, account)
      .put(`email:${account.email}`, account.accountId)
      .write();
  }

  async putAccount(account: AuthAccount, previousEmail?: string): Promise<void> {
    const batch = this.db.batch().put(`account:${account.accountId}`, account).put(`email:${account.email}`, account.accountId);
    if (previousEmail && previousEmail !== account.email) batch.del(`email:${previousEmail}`);
    await batch.write();
  }

  async releaseEmail(email: string): Promise<void> {
    await this.db.del(`email:${email}`);
  }

  async putToken(token: SingleUseTokenRecord): Promise<void> {
    await this.db.put(`token:${token.kind}:${token.digest}`, token);
  }

  async getToken(kind: SingleUseTokenRecord["kind"], digest: string): Promise<SingleUseTokenRecord | null> {
    return this.get<SingleUseTokenRecord>(`token:${kind}:${digest}`);
  }

  async useToken(token: SingleUseTokenRecord, usedAt: string): Promise<void> {
    await this.db.put(`token:${token.kind}:${token.digest}`, { ...token, usedAt });
  }

  async putSession(session: AuthSessionRecord): Promise<void> {
    await this.db.put(`session:${session.digest}`, session);
  }

  async putSessionForAccount(session: AuthSessionRecord, account: AuthAccount): Promise<void> {
    const updated = {
      ...account,
      sessionDigests: [...new Set([...account.sessionDigests, session.digest])],
      updatedAt: session.lastSeenAt,
    };
    await this.db.batch()
      .put(`session:${session.digest}`, session)
      .put(`account:${account.accountId}`, updated)
      .write();
  }

  async replaceSessionForAccount(previousDigest: string, session: AuthSessionRecord, account: AuthAccount): Promise<AuthAccount> {
    const updated = {
      ...account,
      sessionDigests: [...new Set(account.sessionDigests.filter((digest) => digest !== previousDigest).concat(session.digest))],
      updatedAt: session.lastSeenAt,
    };
    await this.db.batch()
      .del(`session:${previousDigest}`)
      .put(`session:${session.digest}`, session)
      .put(`account:${account.accountId}`, updated)
      .write();
    return updated;
  }

  async getSession(digest: string): Promise<AuthSessionRecord | null> {
    return this.get<AuthSessionRecord>(`session:${digest}`);
  }

  async deleteSession(digest: string): Promise<void> {
    await this.db.del(`session:${digest}`);
  }

  async deleteSessionForAccount(digest: string, account: AuthAccount): Promise<AuthAccount> {
    const updated = { ...account, sessionDigests: account.sessionDigests.filter((value) => value !== digest) };
    await this.db.batch().del(`session:${digest}`).put(`account:${account.accountId}`, updated).write();
    return updated;
  }

  async revokeAccountSessions(account: AuthAccount): Promise<AuthAccount> {
    const batch = this.db.batch();
    for (const digest of account.sessionDigests) batch.del(`session:${digest}`);
    const updated = { ...account, sessionDigests: [], updatedAt: new Date().toISOString() };
    batch.put(`account:${account.accountId}`, updated);
    await batch.write();
    return updated;
  }

  async replaceAllSessionsForAccount(session: AuthSessionRecord, account: AuthAccount): Promise<AuthAccount> {
    const updated = {
      ...account,
      sessionDigests: [session.digest],
      updatedAt: session.lastSeenAt,
    };
    const batch = this.db.batch();
    for (const digest of account.sessionDigests) batch.del(`session:${digest}`);
    await batch
      .put(`session:${session.digest}`, session)
      .put(`account:${account.accountId}`, updated)
      .write();
    return updated;
  }

  async deleteCredentialAccount(account: AuthAccount): Promise<AuthAccount> {
    const updated: AuthAccount = {
      ...account,
      credentialStatus: "deleted",
      setup: undefined,
      encryptedUserKeySet: undefined,
      pendingOperations: [],
      sessionDigests: [],
      updatedAt: new Date().toISOString(),
    };
    const batch = this.db.batch().del(`email:${account.email}`).put(`account:${account.accountId}`, updated);
    for (const digest of account.sessionDigests) batch.del(`session:${digest}`);
    await batch.write();
    return updated;
  }

  async hasMarker(id: string): Promise<boolean> {
    return (await this.get<{ id: string }>(`marker:${id}`)) != null;
  }

  async putMarker(id: string): Promise<void> {
    await this.db.put(`marker:${id}`, { id, createdAt: new Date().toISOString() });
  }

  async putDirectoryProfile(profile: DirectoryProfileDto): Promise<void> {
    await this.db.put(`directory:profile:${profile.accountId}`, profile);
  }

  async getDirectoryProfile(accountId: string): Promise<DirectoryProfileDto | null> {
    return this.get<DirectoryProfileDto>(`directory:profile:${accountId}`);
  }

  async listDirectoryProfiles(): Promise<DirectoryProfileDto[]> {
    const profiles: DirectoryProfileDto[] = [];
    for await (const [, value] of this.db.iterator({ gte: "directory:profile:", lt: "directory:profile;" })) {
      profiles.push(value as DirectoryProfileDto);
    }
    return profiles;
  }

  async putDirectoryPet(pet: DirectoryPetDto): Promise<void> {
    await this.db.put(`directory:pet:${pet.petId}`, pet);
  }

  async getDirectoryPet(petId: string): Promise<DirectoryPetDto | null> {
    return this.get<DirectoryPetDto>(`directory:pet:${petId}`);
  }

  async deleteDirectoryPet(petId: string): Promise<void> {
    await this.db.del(`directory:pet:${petId}`);
  }

  async listDirectoryPets(): Promise<DirectoryPetDto[]> {
    const pets: DirectoryPetDto[] = [];
    for await (const [, value] of this.db.iterator({ gte: "directory:pet:", lt: "directory:pet;" })) {
      pets.push(value as DirectoryPetDto);
    }
    return pets;
  }

  async putObservedRole(accountId: string, role: Role, status: RoleStatus): Promise<void> {
    await this.db.put(`projection:role:${accountId}:${role}`, status);
  }

  async getObservedRole(accountId: string, role: Role): Promise<RoleStatus | null> {
    return this.get<RoleStatus>(`projection:role:${accountId}:${role}`);
  }

  async putObservedPetOwner(petId: string, ownerAccountId: string): Promise<void> {
    await this.db.put(`projection:pet-owner:${petId}`, ownerAccountId);
  }

  async getObservedPetOwner(petId: string): Promise<string | null> {
    return this.get<string>(`projection:pet-owner:${petId}`);
  }

  async putObservedGrant(grant: PetAccessGrant): Promise<void> {
    await this.db.put(`projection:grant:${grant.grantId}`, grant);
  }

  async listObservedGrants(): Promise<PetAccessGrant[]> {
    const grants: PetAccessGrant[] = [];
    for await (const [, value] of this.db.iterator({ gte: "projection:grant:", lt: "projection:grant;" })) {
      grants.push(value as PetAccessGrant);
    }
    return grants;
  }
}
