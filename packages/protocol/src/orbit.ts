import type { SignedEvent } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSignedEvent(value: unknown): value is SignedEvent {
  return isRecord(value) && value.schemaVersion === 1 &&
    typeof value.eventId === "string" && typeof value.database === "string";
}

function nextOrbitValue(value: Record<string, unknown>): unknown {
  if (isRecord(value.payload) && "value" in value.payload) return value.payload.value;
  if ("value" in value) return value.value;
  return undefined;
}

export function extractSignedEvent(value: unknown): SignedEvent | null {
  const visited = new Set<object>();
  let candidate = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (isSignedEvent(candidate)) return candidate;
    if (!isRecord(candidate) || visited.has(candidate)) return null;
    visited.add(candidate);
    candidate = nextOrbitValue(candidate);
  }
  return isSignedEvent(candidate) ? candidate : null;
}

export function describeOrbitEntryShape(value: unknown): string {
  const parts: string[] = [];
  const visited = new Set<object>();
  let candidate = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (isSignedEvent(candidate)) {
      parts.push("signed-event");
      return parts.join(">");
    }
    if (!isRecord(candidate)) {
      parts.push(candidate === undefined ? "undefined" : typeof candidate);
      return parts.join(">");
    }
    if (visited.has(candidate)) {
      parts.push("cycle");
      return parts.join(">");
    }
    visited.add(candidate);
    if (isRecord(candidate.payload) && "value" in candidate.payload) {
      parts.push("payload.value");
      candidate = candidate.payload.value;
    } else if ("value" in candidate) {
      parts.push("value");
      candidate = candidate.value;
    } else {
      parts.push("object");
      return parts.join(">");
    }
  }
  parts.push(isSignedEvent(candidate) ? "signed-event" : "depth-limit");
  return parts.join(">");
}
