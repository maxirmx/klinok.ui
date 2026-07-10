import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";

export function splitEnvList(name: string, fallback: string[] = [], env: NodeJS.ProcessEnv = process.env): string[] {
  const value = env[name];
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function optionalEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

export function getWebSocketListenMultiaddr(wsPort: string, hasTls: boolean): string {
  return `/ip4/0.0.0.0/tcp/${wsPort}/${hasTls ? "tls/ws" : "ws"}`;
}

export function getLibp2pListenMultiaddrs(wsPort: string, hasTls: boolean): string[] {
  return [getWebSocketListenMultiaddr(wsPort, hasTls)];
}

export function getTlsFilePaths(env: NodeJS.ProcessEnv = process.env) {
  const certPath = optionalEnv("KLINOK_P2P_TLS_CERT", env);
  const keyPath = optionalEnv("KLINOK_P2P_TLS_KEY", env);
  return certPath && keyPath ? { certPath, keyPath } : null;
}

export function loadWebSocketTransportOptions(paths: ReturnType<typeof getTlsFilePaths>) {
  return paths ? { https: { cert: readFileSync(paths.certPath), key: readFileSync(paths.keyPath) } } : {};
}

export function encodePrivateKey(privateKey: Parameters<typeof privateKeyToProtobuf>[0]): string {
  return Buffer.from(privateKeyToProtobuf(privateKey)).toString("base64");
}

export function decodePrivateKey(value: string) {
  return privateKeyFromProtobuf(Buffer.from(value.replace(/\s+/g, ""), "base64"));
}

export async function loadOrCreateLibp2pPrivateKey({
  env = process.env,
  dataDir = env.KLINOK_P2P_DATA_DIR ?? ".klinok-p2p",
  keyPath = optionalEnv("KLINOK_P2P_PRIVATE_KEY_PATH", env) ?? join(dataDir, "libp2p-private-key.base64"),
}: { env?: NodeJS.ProcessEnv; dataDir?: string; keyPath?: string } = {}) {
  const configured = optionalEnv("KLINOK_P2P_PRIVATE_KEY", env);
  if (configured) return decodePrivateKey(configured);
  if (existsSync(keyPath)) return decodePrivateKey(readFileSync(keyPath, "utf8"));
  const privateKey = await generateKeyPair("Ed25519");
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, `${encodePrivateKey(privateKey)}\n`, { mode: 0o600 });
  return privateKey;
}
