// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok ui application

import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  BUILD_SHARED_PARTICIPANT_KEY_FILE_MODE,
  createSharedParticipantKeyOverlay,
  decodePrivateJwkBase64,
  encodePrivateJwkBase64,
  generateSharedParticipantPrivateKey,
  SHARED_DEMO_PARTICIPANT_ID,
} from "../scripts/shared-participant-key.js";

const execFileAsync = promisify(execFile);

describe("shared participant key scripts", () => {
  it("uses a public-readable file mode for the build-time browser overlay", () => {
    expect(BUILD_SHARED_PARTICIPANT_KEY_FILE_MODE).toBe(0o644);
  });

  it("decodes a base64 private JWK and writes a shared participant overlay", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "klinok-shared-key-"));
    const secretPath = join(tempDir, "secret.base64");
    const outputPath = join(tempDir, "shared-participant-key.json");

    try {
      const privateKey = await generateSharedParticipantPrivateKey();
      writeFileSync(secretPath, encodePrivateJwkBase64(privateKey));

      await execFileAsync(process.execPath, [
        "scripts/write-shared-participant-key-overlay.js",
        "--secret-file",
        secretPath,
        "--output",
        outputPath,
      ]);

      const overlay = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(overlay).toMatchObject({
        p2p: {
          participantId: SHARED_DEMO_PARTICIPANT_ID,
          allowGeneratedParticipantKeys: false,
        },
      });
      expect(overlay.p2p.participantPrivateKey.d).toBe(privateKey.d);
      expect(overlay.p2p.participantPublicKeys[SHARED_DEMO_PARTICIPANT_ID]).toMatchObject({
        n: privateKey.n,
        e: privateKey.e,
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps optional build overlay generation a no-op without a secret file", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "klinok-shared-key-"));
    const outputPath = join(tempDir, "shared-participant-key.json");

    try {
      await execFileAsync(process.execPath, [
        "scripts/write-shared-participant-key-overlay.js",
        "--secret-file",
        join(tempDir, "missing.base64"),
        "--output",
        outputPath,
        "--optional",
      ]);

      expect(existsSync(outputPath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails invalid build secrets without logging decoded key material", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "klinok-shared-key-"));
    const secretPath = join(tempDir, "secret.base64");
    const outputPath = join(tempDir, "shared-participant-key.json");
    const leakedKeyMaterial = "leaked-private-key-fragment";
    const malformedDecodedJwk = `{"kty":"RSA","dq":"${leakedKeyMaterial}\nrest"}`;

    try {
      writeFileSync(secretPath, Buffer.from(malformedDecodedJwk, "utf8").toString("base64"));

      const failure = await execFileAsync(process.execPath, [
        "scripts/write-shared-participant-key-overlay.js",
        "--secret-file",
        secretPath,
        "--output",
        outputPath,
      ]).catch((error: unknown) => error as { code?: number; stderr?: string; stdout?: string });

      expect(failure).toMatchObject({ code: 1 });
      expect(failure.stderr).toContain("Invalid shared participant key secret");
      expect(failure.stderr).toContain("KLINOK_DEMO_PARTICIPANT_PRIVATE_KEY_B64");
      expect(failure.stderr).not.toContain(leakedKeyMaterial);
      expect(failure.stderr).not.toContain("<anonymous_script>");
      expect(failure.stderr).not.toContain("Bad control character");
      expect(failure.stdout).toBe("");
      expect(existsSync(outputPath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails when required build overlay generation has no secret file", async () => {
    await expect(
      execFileAsync(process.execPath, [
        "scripts/write-shared-participant-key-overlay.js",
        "--secret-file",
        "missing-shared-participant-key.base64",
      ]),
    ).rejects.toMatchObject({
      code: 1,
    });
  });

  it("roundtrips generated private keys through base64 decoding and overlay validation", async () => {
    const privateKey = await generateSharedParticipantPrivateKey();
    const decoded = decodePrivateJwkBase64(encodePrivateJwkBase64(privateKey));
    const overlay = await createSharedParticipantKeyOverlay(decoded);

    expect(decoded.d).toBe(privateKey.d);
    expect(overlay.p2p.participantPrivateKey.d).toBe(privateKey.d);
  });
});
