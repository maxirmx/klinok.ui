import type { DatabaseKind, SignedEvent } from "@klinok/protocol";

export interface AuthorizationConflict {
  eventId: string;
  database: DatabaseKind;
  code: string;
  message: string;
  createdAt: string;
}

export interface EventSyncStatus {
  pendingCount: number;
  failedCount: number;
  syncing: boolean;
  lastError: string;
}

export interface EventTransport {
  initialize(): Promise<void>;
  list(database: DatabaseKind): Promise<SignedEvent[]>;
  append(event: SignedEvent): Promise<void>;
  subscribe(database: DatabaseKind, listener: () => void): () => void;
  listConflicts(): Promise<AuthorizationConflict[]>;
  recordConflict(conflict: AuthorizationConflict): Promise<void>;
  removeConflict(eventId: string): Promise<void>;
  pendingOutbox(): Promise<SignedEvent[]>;
  queueOutbox(event: SignedEvent): Promise<void>;
  removeOutbox(eventId: string): Promise<void>;
  syncStatus(): Promise<EventSyncStatus>;
  subscribeSyncStatus(listener: (status: EventSyncStatus) => void): () => void;
  dispose(): Promise<void>;
}

export class MemoryEventTransport implements EventTransport {
  private readonly events = new Map<DatabaseKind, SignedEvent[]>([["control", []], ["medical", []]]);
  private readonly conflicts: AuthorizationConflict[] = [];
  private readonly listeners = new Map<DatabaseKind, Set<() => void>>([["control", new Set()], ["medical", new Set()]]);
  private readonly syncListeners = new Set<(status: EventSyncStatus) => void>();

  async initialize() {}
  async list(database: DatabaseKind) { return [...(this.events.get(database) ?? [])]; }
  async append(event: SignedEvent) {
    const events = this.events.get(event.database)!;
    if (!events.some((candidate) => candidate.eventId === event.eventId)) events.push(event);
    for (const listener of this.listeners.get(event.database) ?? []) listener();
  }
  subscribe(database: DatabaseKind, listener: () => void) {
    this.listeners.get(database)!.add(listener);
    return () => this.listeners.get(database)!.delete(listener);
  }
  async listConflicts() { return [...this.conflicts]; }
  async recordConflict(conflict: AuthorizationConflict) { this.conflicts.push(conflict); }
  async removeConflict(eventId: string) {
    const index = this.conflicts.findIndex((conflict) => conflict.eventId === eventId);
    if (index >= 0) this.conflicts.splice(index, 1);
  }
  async pendingOutbox() { return []; }
  async queueOutbox(event: SignedEvent) { void event; }
  async removeOutbox(eventId: string) { void eventId; }
  async syncStatus() { return { pendingCount: 0, failedCount: this.conflicts.length, syncing: false, lastError: "" }; }
  subscribeSyncStatus(listener: (status: EventSyncStatus) => void) {
    this.syncListeners.add(listener);
    void this.syncStatus().then(listener);
    return () => this.syncListeners.delete(listener);
  }
  async dispose() {}
}

const DB_NAME = "klinok-events-v1";

export class IndexedDbEventTransport implements EventTransport {
  private db: IDBDatabase | null = null;
  private readonly listeners = new Map<DatabaseKind, Set<() => void>>([["control", new Set()], ["medical", new Set()]]);
  private readonly syncListeners = new Set<(status: EventSyncStatus) => void>();
  private readonly sessionConflictIds = new Set<string>();
  protected syncing = false;
  protected lastSyncError = "";

  async initialize() {
    this.sessionConflictIds.clear();
    this.syncing = false;
    this.lastSyncError = "";
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("control")) request.result.createObjectStore("control", { keyPath: "eventId" });
        if (!request.result.objectStoreNames.contains("medical")) request.result.createObjectStore("medical", { keyPath: "eventId" });
        if (!request.result.objectStoreNames.contains("conflicts")) request.result.createObjectStore("conflicts", { keyPath: "eventId" });
        if (!request.result.objectStoreNames.contains("outbox")) request.result.createObjectStore("outbox", { keyPath: "eventId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private requireDb() {
    if (!this.db) throw new Error("Event transport has not been initialized.");
    return this.db;
  }

  async list(database: DatabaseKind): Promise<SignedEvent[]> {
    const db = this.requireDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(database, "readonly").objectStore(database).getAll();
      request.onsuccess = () => resolve(request.result as SignedEvent[]);
      request.onerror = () => reject(request.error);
    });
  }

  async append(event: SignedEvent): Promise<void> {
    const db = this.requireDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(event.database, "readwrite");
      tx.objectStore(event.database).put(event);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    for (const listener of this.listeners.get(event.database) ?? []) listener();
  }

  subscribe(database: DatabaseKind, listener: () => void): () => void {
    this.listeners.get(database)!.add(listener);
    return () => this.listeners.get(database)!.delete(listener);
  }

  async listConflicts(): Promise<AuthorizationConflict[]> {
    return new Promise((resolve, reject) => {
      const request = this.requireDb().transaction("conflicts", "readonly").objectStore("conflicts").getAll();
      request.onsuccess = () => resolve(request.result as AuthorizationConflict[]);
      request.onerror = () => reject(request.error);
    });
  }

  async recordConflict(conflict: AuthorizationConflict): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tx = this.requireDb().transaction("conflicts", "readwrite");
      tx.objectStore("conflicts").put(conflict);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this.sessionConflictIds.add(conflict.eventId);
    await this.emitSyncStatus();
  }

  async removeConflict(eventId: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tx = this.requireDb().transaction("conflicts", "readwrite");
      tx.objectStore("conflicts").delete(eventId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this.sessionConflictIds.delete(eventId);
    await this.emitSyncStatus();
  }

  async pendingOutbox(): Promise<SignedEvent[]> {
    return new Promise((resolve, reject) => {
      const request = this.requireDb().transaction("outbox", "readonly").objectStore("outbox").getAll();
      request.onsuccess = () => resolve(request.result as SignedEvent[]);
      request.onerror = () => reject(request.error);
    });
  }

  async queueOutbox(event: SignedEvent): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tx = this.requireDb().transaction("outbox", "readwrite");
      tx.objectStore("outbox").put(event);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await this.emitSyncStatus();
  }

  async removeOutbox(eventId: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const tx = this.requireDb().transaction("outbox", "readwrite");
      tx.objectStore("outbox").delete(eventId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await this.emitSyncStatus();
  }

  async syncStatus(): Promise<EventSyncStatus> {
    const pending = await this.pendingOutbox();
    return {
      pendingCount: pending.length,
      failedCount: this.sessionConflictIds.size,
      syncing: this.syncing,
      lastError: this.lastSyncError,
    };
  }

  subscribeSyncStatus(listener: (status: EventSyncStatus) => void): () => void {
    this.syncListeners.add(listener);
    void this.syncStatus().then(listener);
    return () => this.syncListeners.delete(listener);
  }

  protected async setSyncState(input: { syncing?: boolean; lastError?: string }): Promise<void> {
    if (input.syncing !== undefined) this.syncing = input.syncing;
    if (input.lastError !== undefined) this.lastSyncError = input.lastError;
    await this.emitSyncStatus();
  }

  protected async emitSyncStatus(): Promise<void> {
    if (!this.syncListeners.size) return;
    const status = await this.syncStatus();
    for (const listener of this.syncListeners) listener(status);
  }

  async dispose(): Promise<void> {
    this.db?.close();
    this.db = null;
    this.sessionConflictIds.clear();
    this.syncing = false;
    this.lastSyncError = "";
  }
}
