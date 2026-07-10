declare module "@orbitdb/core/src/key-store.js" {
  export function signMessage(key: unknown, data: string): Promise<string>;
  export function verifyMessage(signature: string, publicKey: string, data: string): Promise<boolean>;
}
