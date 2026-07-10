import { applyAcceptedEvent, reconcileEffectiveEvents, reduceSignedEvents, type ProjectionConflict } from "./reducers.js";
import { createProtocolState, verifySignedEvent } from "./authorization.js";
import type { ProtocolState, SignedEvent, VerificationOptions } from "./types.js";

export class InMemorySignedEventRepository {
  readonly state: ProtocolState;
  readonly conflicts: ProjectionConflict[] = [];
  private readonly events = new Map<string, SignedEvent>();
  private readonly listeners = new Set<(events: SignedEvent[]) => void>();

  constructor(bootstrapAccountId?: string, private readonly verificationOptions: VerificationOptions = {}) {
    this.state = createProtocolState(bootstrapAccountId);
  }

  list(): SignedEvent[] {
    return [...this.events.values()];
  }

  subscribe(listener: (events: SignedEvent[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.list());
    return () => this.listeners.delete(listener);
  }

  async append(event: SignedEvent): Promise<void> {
    if (this.events.has(event.eventId)) return;
    const result = await verifySignedEvent(event, this.state, { ...this.verificationOptions, allowUnknownDevice: event.eventType === "device.attested" });
    if (!result.accepted) throw Object.assign(new Error(result.message ?? result.code), { code: result.code });
    this.events.set(event.eventId, event);
    applyAcceptedEvent(event, this.state);
    reconcileEffectiveEvents(this.list(), this.state);
    for (const listener of this.listeners) listener(this.list());
  }

  async import(events: SignedEvent[]): Promise<void> {
    const unseen = events.filter((event) => !this.events.has(event.eventId));
    const projection = await reduceSignedEvents(unseen, this.state, this.verificationOptions);
    for (const event of projection.accepted) this.events.set(event.eventId, event);
    reconcileEffectiveEvents(this.list(), this.state);
    this.conflicts.push(...projection.conflicts);
    for (const listener of this.listeners) listener(this.list());
  }
}
