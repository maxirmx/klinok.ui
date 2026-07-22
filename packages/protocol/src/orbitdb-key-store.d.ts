// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

declare module "@orbitdb/core/src/key-store.js" {
  export function signMessage(key: unknown, data: string): Promise<string>;
  export function verifyMessage(signature: string, publicKey: string, data: string): Promise<boolean>;
}
