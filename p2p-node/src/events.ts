import { describeOrbitEntryShape, extractSignedEvent } from "@klinok/protocol";

interface OrbitEvents {
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface P2pOperationalCounters {
  authorizationRejected: number;
  invalidSignatures: number;
  rejectedProofs: number;
  conflicts: number;
  syncUpdates: number;
  syncErrors: number;
  lastSyncUpdateAt?: string;
}

export function createP2pOperationalCounters(): P2pOperationalCounters {
  return {
    authorizationRejected: 0,
    invalidSignatures: 0,
    rejectedProofs: 0,
    conflicts: 0,
    syncUpdates: 0,
    syncErrors: 0,
  };
}

export function recordAuthorizationRejection(counters: P2pOperationalCounters, code: string): void {
  counters.authorizationRejected += 1;
  if (code.includes("SIGNATURE")) counters.invalidSignatures += 1;
  if (code.includes("PROOF") || code.includes("ROLE") || code.includes("GRANT") || code.includes("CAPABILITY")) {
    counters.rejectedProofs += 1;
  }
}

export function logOperationalCounters(counters: P2pOperationalCounters, roleConflicts = 0): void {
  console.log(JSON.stringify({ level: "info", event: "p2p.metrics", counters: { ...counters, roleConflicts } }));
}

export function registerOrbitDbEventHandlers(
  db: { events?: OrbitEvents },
  label: string,
  counters: P2pOperationalCounters,
  roleConflicts: () => number,
): () => void {
  const update = (...args: unknown[]) => {
    counters.syncUpdates += 1;
    counters.lastSyncUpdateAt = new Date().toISOString();
    const signedEvent = extractSignedEvent(args[0]);
    console.log(JSON.stringify({
      level: "info",
      event: "p2p.sync.update",
      database: label,
      eventId: signedEvent?.eventId,
      eventType: signedEvent?.eventType,
      entryShape: describeOrbitEntryShape(args[0]),
    }));
    logOperationalCounters(counters, roleConflicts());
  };
  const error = (value: unknown) => {
    counters.syncErrors += 1;
    console.error(JSON.stringify({ level: "error", event: "p2p.sync.error", database: label, error: value instanceof Error ? value.message : String(value) }));
    logOperationalCounters(counters, roleConflicts());
  };
  db.events?.on?.("update", update);
  db.events?.on?.("error", error);
  return () => {
    db.events?.off?.("update", update);
    db.events?.off?.("error", error);
  };
}

export function registerRecoverableProcessErrorHandlers(): () => void {
  const rejection = (reason: unknown) => console.error(JSON.stringify({ level: "error", event: "process.unhandledRejection", error: reason instanceof Error ? reason.message : String(reason) }));
  const exception = (error: Error) => console.error(JSON.stringify({ level: "error", event: "process.uncaughtException", error: error.message }));
  process.on("unhandledRejection", rejection);
  process.on("uncaughtException", exception);
  return () => {
    process.off("unhandledRejection", rejection);
    process.off("uncaughtException", exception);
  };
}
