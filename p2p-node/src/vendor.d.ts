// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

declare module "@orbitdb/core" {
  // OrbitDB does not publish TypeScript declarations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createOrbitDB(options: Record<string, unknown>): Promise<any>;
  export function useAccessController(controller: unknown): void;
  export function useIdentityProvider(provider: unknown): void;
}
