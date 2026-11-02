import type { TurnSession } from "../ai/loop.js";

export interface SessionEntry {
  session: TurnSession;
  lastActive: number;
  busy: boolean;
}

export interface SessionStoreOptions {
  now?: () => number;
  ttlMs?: number;
  sweepMs?: number;
  maxGames?: number;
  autoSweep?: boolean;
}

export const SESSION_TTL_MS = 60 * 60 * 1000;
export const SESSION_SWEEP_MS = 60 * 1000;
export const SESSION_MAX_GAMES = 500;

export class SessionStore {
  private games = new Map<string, SessionEntry>();
  private now: () => number;
  private ttlMs: number;
  private maxGames: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(opts: SessionStoreOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.ttlMs = opts.ttlMs ?? SESSION_TTL_MS;
    this.maxGames = opts.maxGames ?? SESSION_MAX_GAMES;
    const sweepMs = opts.sweepMs ?? SESSION_SWEEP_MS;
    const autoSweep = opts.autoSweep ?? true;
    if (autoSweep) {
      this.timer = setInterval(() => {
        this.sweep();
      }, sweepMs);
      if (typeof this.timer.unref === "function") {
        this.timer.unref();
      }
    }
  }

  get size(): number {
    return this.games.size;
  }

  create(gameId: string, session: TurnSession): SessionEntry {
    if (this.games.has(gameId)) {
      const existing = this.games.get(gameId) as SessionEntry;
      existing.session = session;
      existing.lastActive = this.now();
      existing.busy = false;
      return existing;
    }
    if (this.games.size >= this.maxGames) {
      let oldestId: string | undefined;
      let oldestTime = Number.POSITIVE_INFINITY;
      for (const [id, entry] of this.games) {
        if (entry.lastActive < oldestTime) {
          oldestTime = entry.lastActive;
          oldestId = id;
        }
      }
      if (oldestId !== undefined) {
        this.games.delete(oldestId);
      }
    }
    const entry: SessionEntry = { session, lastActive: this.now(), busy: false };
    this.games.set(gameId, entry);
    return entry;
  }

  get(gameId: string): SessionEntry | undefined {
    const entry = this.games.get(gameId);
    if (entry === undefined) return undefined;
    if (this.now() - entry.lastActive > this.ttlMs) {
      this.games.delete(gameId);
      return undefined;
    }
    return entry;
  }

  delete(gameId: string): void {
    this.games.delete(gameId);
  }

  touch(gameId: string): void {
    const entry = this.games.get(gameId);
    if (entry !== undefined) {
      entry.lastActive = this.now();
    }
  }

  setBusy(gameId: string, busy: boolean): void {
    const entry = this.games.get(gameId);
    if (entry !== undefined) {
      entry.busy = busy;
    }
  }

  sweep(): void {
    const nowMs = this.now();
    for (const [id, entry] of [...this.games]) {
      if (nowMs - entry.lastActive > this.ttlMs) {
        this.games.delete(id);
      }
    }
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
