// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { exportUserKeySet, generateUserKeySet, importUserKeySet, stableSerialize } from "@klinok/protocol";
import { loadAuthConfig } from "./config.js";
import { hashPassword, normalizeEmail, validatePassword } from "./security.js";
import { AuthStore, type AuthAccount } from "./store.js";
import { AttestationService } from "./attestation.js";
import { UserKeyEscrowService } from "./escrow.js";

const config = loadAuthConfig();
const accountId = process.env.KLINOK_BOOTSTRAP_ACCOUNT_ID ?? "bootstrap-administrator";
const email = normalizeEmail(process.env.KLINOK_BOOTSTRAP_EMAIL ?? "administrator@klinok.local");
const password = process.env.KLINOK_BOOTSTRAP_PASSWORD ?? "";
const recoveryPassphrase = process.env.KLINOK_RECOVERY_PASSPHRASE ?? "";
const outputDir = process.env.KLINOK_PROVISION_OUTPUT_DIR ?? join(config.dataDir, "provisioned");

if (!validatePassword(password) || recoveryPassphrase.length < 16) {
  throw new Error("KLINOK_BOOTSTRAP_PASSWORD must be 6-128 characters and KLINOK_RECOVERY_PASSPHRASE at least 16 characters.");
}

await mkdir(outputDir, { recursive: true });
const anchorPath = join(outputDir, "bootstrap-public-anchor.json");
const recoveryPath = join(outputDir, "bootstrap-recovery.bundle.json");
const attestationPath = join(outputDir, "auth-attestation-public-key.json");
const attestationCertificatePath = join(outputDir, "auth-attestation-certificate.json");
const store = new AuthStore(config.dataDir);
await store.open();

try {
  const existing = await store.getAccount(accountId);
  try {
    await readFile(anchorPath, "utf8");
    await readFile(recoveryPath, "utf8");
    await readFile(attestationCertificatePath, "utf8");
  } catch {
    if (existing) throw new Error("Bootstrap account exists but provisioning outputs are missing; restore the offline bundle instead of regenerating trust.");
  }
  if (!existing) {
    const keys = await exportUserKeySet(await generateUserKeySet());
    const escrow = await UserKeyEscrowService.loadOrCreate(config.escrowKeyPath);
    const importedKeys = await importUserKeySet(keys);
    const attestation = await AttestationService.loadOrCreate(config.attestationKeyPath);
    const attestationPublicKey = await attestation.publicJwk();
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const recoveryKey = pbkdf2Sync(recoveryPassphrase, salt, 600_000, 32, "sha256");
    const cipher = createCipheriv("aes-256-gcm", recoveryKey, iv);
    const encrypted = Buffer.concat([cipher.update(stableSerialize(keys), "utf8"), cipher.final()]);
    const createdAt = new Date().toISOString();
    const account: AuthAccount = {
      accountId,
      email,
      passwordHash: await hashPassword(password),
      credentialStatus: "active",
      verificationState: "verified",
      createdAt,
      updatedAt: createdAt,
      failureTimes: [],
      setup: {
        profile: { firstName: "Начальный", lastName: "Администратор" },
        requestedRoles: ["administrator"],
        ageConfirmed: true,
        personalDataConsentVersion: config.legal.personalDataConsentVersion,
        userAgreementVersion: config.legal.userAgreementVersion,
      },
      devices: [],
      enrollments: [],
      pendingOperations: [],
      sessionDigests: [],
      immutableBootstrap: true,
      encryptedUserKeySet: await escrow.encrypt(accountId, keys),
    };
    await store.createAccount(account);
    await writeFile(anchorPath, `${JSON.stringify({ accountId, signingPublicKey: keys.signingPublicKey, encryptionPublicKey: keys.encryptionPublicKey }, null, 2)}\n`, { mode: 0o644 });
    const certificate = { accountId, publicKey: attestationPublicKey, issuedAt: createdAt };
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" }, importedKeys.signingPrivateKey,
      new TextEncoder().encode(stableSerialize(certificate)),
    );
    await writeFile(attestationCertificatePath, `${JSON.stringify({ ...certificate, signature: Buffer.from(signature).toString("base64url") }, null, 2)}\n`, { mode: 0o644 });
    await writeFile(recoveryPath, `${JSON.stringify({
      version: 1,
      algorithm: "PBKDF2-SHA256/AES-256-GCM",
      iterations: 600_000,
      salt: salt.toString("base64url"),
      iv: iv.toString("base64url"),
      ciphertext: encrypted.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
    }, null, 2)}\n`, { mode: 0o600 });
  }
  const attestation = await AttestationService.loadOrCreate(config.attestationKeyPath);
  await writeFile(attestationPath, `${JSON.stringify(await attestation.publicJwk(), null, 2)}\n`, { mode: 0o644 });
  await mkdir(dirname(anchorPath), { recursive: true });
  process.stdout.write(`Bootstrap Administrator provisioned: ${accountId}\nPublic anchor: ${anchorPath}\nAuth attestation key: ${attestationPath}\nAuth attestation certificate: ${attestationCertificatePath}\nRecovery bundle: ${recoveryPath}\n`);
} finally {
  await store.close();
}
