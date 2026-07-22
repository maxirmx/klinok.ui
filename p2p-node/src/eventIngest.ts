// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of Klinok application

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  applyAcceptedEvent,
  shouldDeferEventVerification,
  stableSerialize,
  verifySignedEvent,
  type DatabaseKind,
  type EventIngestResponse,
  type EventIngestResult,
  type ProtocolState,
  type SignedEvent,
  type VerificationOptions,
} from "@klinok/protocol";

const MAX_BATCH_SIZE = 100;
const MAX_BODY_BYTES = 1024 * 1024;

export interface IngestDatabase {
  add(event: SignedEvent): Promise<unknown>;
}

export interface EventIngestServiceOptions {
  state: ProtocolState;
  databases: Record<DatabaseKind, IngestDatabase>;
  verification: VerificationOptions;
  onPersisted?: (event: SignedEvent) => Promise<void>;
}

function eventId(value: unknown): string {
  if (!value || typeof value !== "object" || !("eventId" in value)) return "";
  return typeof value.eventId === "string" ? value.eventId : "";
}

function notificationFailure(event: SignedEvent, reason: unknown): EventIngestResult {
  return {
    eventId: event.eventId,
    status: "deferred",
    code: "EVENT_NOTIFICATION_FAILED",
    message: reason instanceof Error ? reason.message : "The persisted event notification failed.",
  };
}

export class EventIngestService {
  constructor(private readonly options: EventIngestServiceOptions) {}

  async ingest(values: unknown[]): Promise<EventIngestResponse> {
    if (values.length > MAX_BATCH_SIZE) throw new Error(`A batch may contain at most ${MAX_BATCH_SIZE} events.`);
    const results: Array<EventIngestResult | undefined> = new Array(values.length);
    let remaining = values.map((value, index) => ({ value, index }));

    while (remaining.length) {
      let stateProgressed = false;
      const deferred: typeof remaining = [];
      const deferredReasons = new Map<number, { code?: string; message?: string }>();
      for (const item of remaining) {
        if (!item.value || typeof item.value !== "object") {
          results[item.index] = { eventId: "", status: "rejected", code: "EVENT_SCHEMA_INVALID", message: "Signed event schema is invalid." };
          continue;
        }
        const event = item.value as SignedEvent;
        const existing = this.options.state.events.get(event.eventId);
        if (existing) {
          if (stableSerialize(existing) === stableSerialize(event)) {
            try {
              await this.options.onPersisted?.(existing);
              results[item.index] = { eventId: event.eventId, status: "duplicate", code: "EVENT_DUPLICATE" };
            } catch (reason) {
              results[item.index] = notificationFailure(event, reason);
            }
          } else {
            results[item.index] = { eventId: event.eventId, status: "rejected", code: "EVENT_ID_COLLISION", message: "The event ID is already used by different content." };
          }
          continue;
        }
        const verification = await verifySignedEvent(event, this.options.state, {
          ...this.options.verification,
          allowUnknownDevice: event.eventType === "device.attested",
        });
        if (!verification.accepted) {
          if (shouldDeferEventVerification(verification)) {
            deferredReasons.set(item.index, verification);
            deferred.push(item);
          } else {
            results[item.index] = {
              eventId: eventId(item.value),
              status: "rejected",
              code: verification.code ?? "EVENT_REJECTED",
              message: verification.message ?? "The event was rejected.",
            };
          }
          continue;
        }
        try {
          await this.options.databases[event.database].add(event);
          if (!this.options.state.knownEvents.has(event.eventId)) applyAcceptedEvent(event, this.options.state);
          stateProgressed = true;
          try {
            await this.options.onPersisted?.(event);
            results[item.index] = { eventId: event.eventId, status: "persisted" };
          } catch (reason) {
            results[item.index] = notificationFailure(event, reason);
          }
        } catch (reason) {
          results[item.index] = {
            eventId: event.eventId,
            status: "deferred",
            code: reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "EVENT_WRITE_FAILED",
            message: reason instanceof Error ? reason.message : "The trusted node could not persist the event.",
          };
        }
      }
      if (!stateProgressed) {
        for (const item of deferred) {
          const reason = deferredReasons.get(item.index);
          results[item.index] = {
            eventId: eventId(item.value),
            status: "deferred",
            code: reason?.code ?? "EVENT_REJECTED",
            message: reason?.message ?? "A required authorization dependency has not reached the trusted node yet.",
          };
        }
        break;
      }
      remaining = deferred;
    }

    return { results: results.map((result, index) => result ?? {
      eventId: eventId(values[index]),
      status: "rejected",
      code: "EVENT_REJECTED",
      message: "The event was not processed.",
    }) };
  }
}

function json(reply: ServerResponse, status: number, body: unknown): void {
  reply.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  reply.end(JSON.stringify(body));
}

export async function handleEventIngestRequest(
  service: EventIngestService,
  request: { method?: string; url?: string; body?: unknown },
): Promise<{ status: number; body: unknown }> {
  if (request.method === "GET" && request.url === "/healthz") return { status: 200, body: { status: "ok" } };
  if (request.method !== "POST" || request.url !== "/events") {
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "Route not found." } } };
  }
  const body = request.body as { events?: unknown } | undefined;
  if (!body || !Array.isArray(body.events)) {
    return { status: 400, body: { error: { code: "EVENT_BATCH_INVALID", message: "The request must contain an events array." } } };
  }
  return { status: 200, body: await service.ingest(body.events) };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY_BYTES) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function startEventIngestServer(options: {
  service: EventIngestService;
  port: number;
  host?: string;
}): Promise<Server> {
  const server = createServer(async (request, reply) => {
    try {
      const result = await handleEventIngestRequest(options.service, {
        method: request.method,
        url: request.url,
        ...(request.method === "POST" ? { body: await readBody(request) } : {}),
      });
      json(reply, result.status, result.body);
    } catch (reason) {
      json(reply, 400, { error: { code: "EVENT_BATCH_INVALID", message: reason instanceof Error ? reason.message : "The request is invalid." } });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}
