import { describe, expect, it } from "vitest";
import type { TurnSession } from "../ai/loop.js";
import { startGame } from "../game/state.js";
import { sunkenCrypt } from "../game/worlds/sunkenCrypt.js";
import { SessionStore } from "./sessions.js";

function makeSession(id: string): TurnSession {
  const state = startGame(sunkenCrypt, id, () => 0, `salt-${id}`);
  return { state, world: sunkenCrypt, history: [] };
}

describe("SessionStore", () => {
  it("creates, gets, touches and deletes", () => {
    let nowMs = 1000;
    const store = new SessionStore({ now: () => nowMs, autoSweep: false });
    store.create("g1", makeSession("g1"));
    expect(store.get("g1")).toBeDefined();
    nowMs += 1000;
    store.touch("g1");
    expect(store.get("g1")?.lastActive).toBe(nowMs);
    store.delete("g1");
    expect(store.get("g1")).toBeUndefined();
    store.stop();
  });

  it("expires idle sessions after 60 minutes (fake clock)", () => {
    let nowMs = 0;
    const store = new SessionStore({ now: () => nowMs, autoSweep: false });
    store.create("g1", makeSession("g1"));
    nowMs += 60 * 60 * 1000 + 1;
    store.sweep();
    expect(store.get("g1")).toBeUndefined();
    store.stop();
  });

  it("lazy-expires on read even without sweep", () => {
    let nowMs = 0;
    const store = new SessionStore({ now: () => nowMs, autoSweep: false });
    store.create("g1", makeSession("g1"));
    nowMs += 61 * 60 * 1000;
    expect(store.get("g1")).toBeUndefined();
    expect(store.size).toBe(0);
    store.stop();
  });

  it("caps at 500 live games, evicting oldest idle", () => {
    let nowMs = 0;
    const store = new SessionStore({ now: () => nowMs, autoSweep: false });
    for (let i = 0; i < 500; i += 1) {
      store.create(`g${i}`, makeSession(`g${i}`));
      nowMs += 1;
    }
    expect(store.size).toBe(500);
    store.create("newest", makeSession("newest"));
    expect(store.size).toBe(500);
    expect(store.get("g0")).toBeUndefined();
    expect(store.get("newest")).toBeDefined();
    store.stop();
  });
});
