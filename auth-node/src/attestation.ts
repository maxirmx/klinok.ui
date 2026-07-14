import { stableSerialize, type DeviceCertificate, type DeviceEnrollmentDto } from "@klinok/protocol";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export class AttestationService {
  private constructor(
    private readonly publicKey: CryptoKey,
    private readonly privateKey: CryptoKey,
  ) {}

  static async create(): Promise<AttestationService> {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    return new AttestationService(keys.publicKey, keys.privateKey);
  }

  static async loadOrCreate(path: string): Promise<AttestationService> {
    try {
      const stored = JSON.parse(await readFile(path, "utf8")) as { publicKey: JsonWebKey; privateKey: JsonWebKey };
      const [publicKey, privateKey] = await Promise.all([
        crypto.subtle.importKey("jwk", stored.publicKey, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]),
        crypto.subtle.importKey("jwk", stored.privateKey, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]),
      ]);
      return new AttestationService(publicKey, privateKey);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") throw error;
      const service = await AttestationService.create();
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify({
        publicKey: await crypto.subtle.exportKey("jwk", service.publicKey),
        privateKey: await crypto.subtle.exportKey("jwk", service.privateKey),
      }, null, 2)}\n`, { mode: 0o600 });
      return service;
    }
  }

  async publicJwk(): Promise<JsonWebKey> {
    return crypto.subtle.exportKey("jwk", this.publicKey);
  }

  async certificate(enrollment: DeviceEnrollmentDto, issuedAt = new Date().toISOString()): Promise<DeviceCertificate> {
    if (!enrollment.signingPublicKey || !enrollment.encryptionPublicKey) {
      throw new Error("Approved device enrollment is missing the transferred user public keys.");
    }
    const unsigned = {
      deviceId: enrollment.deviceId,
      ...(enrollment.deviceName ? { deviceName: enrollment.deviceName } : {}),
      accountId: enrollment.accountId,
      orbitIdentityId: enrollment.orbitIdentityId,
      status: "active" as const,
      userKeyVersion: enrollment.userKeyVersion ?? 1,
      signingPublicKey: enrollment.signingPublicKey,
      encryptionPublicKey: enrollment.encryptionPublicKey,
      issuedAt,
    };
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      this.privateKey,
      new TextEncoder().encode(stableSerialize(unsigned)),
    );
    return { ...unsigned, attestation: toBase64(new Uint8Array(signature)) };
  }
}
