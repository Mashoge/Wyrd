import { describe, expect, it } from "vitest";
import { startGame } from "../game/state.js";
import type { Rng } from "../game/types.js";
import { sunkenCrypt } from "../game/worlds/sunkenCrypt.js";
import { conditionFor, playerView } from "./view.js";

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error("seqRng exhausted.");
    return values[i++] as number;
  };
}

function collectKeys(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
}

function allKeys(value: unknown): Set<string> {
  const out = new Set<string>();
  collectKeys(value, out);
  return out;
}

function freshGame() {
  // rng 0 -> first relic candidate; rng 0 -> first trap candidate.
  return startGame(sunkenCrypt, "s1", seqRng([0, 0]), "super-secret-salt-123");
}

describe("playerView leaks nothing", () => {
  it("hides secrets and enemy internals at start", () => {
    const state = freshGame();
    const view = playerView(state, sunkenCrypt);
    const json = JSON.stringify(view);
    const keys = allKeys(view);
    for (const banned of ["secrets", "salt", "commitment", "trap", "alertness", "blocksRetreat"]) {
      expect(keys.has(banned)).toBe(false);
    }
    expect(view.enemy).toBeNull();
    expect(json).not.toContain(state.salt);
    expect(json).not.toContain(state.commitment);
    // Player starts at entrance; relic is in ossuary, so it must be hidden.
    expect(state.secrets.relicRoomId).not.toBe(state.currentRoomId);
    expect(json).not.toContain(sunkenCrypt.relicItemId);
    // Exits expose locked only, never the destination.
    expect(json).not.toContain("exit_gate");
    const viewAsKeys = JSON.stringify(view);
    expect(viewAsKeys).not.toContain('"to"');
    expect(viewAsKeys).not.toContain("keyItemId");
  });

  it("reveals the relic id once the player stands in the relic room", () => {
    const state = freshGame();
    state.currentRoomId = state.secrets.relicRoomId;
    const view = playerView(state, sunkenCrypt);
    const json = JSON.stringify(view);
    expect(json).toContain(sunkenCrypt.relicItemId);
    expect(allKeys(view).has("trap")).toBe(false);
  });

  it("exposes only safe enemy fields with a condition label", () => {
    const state = freshGame();
    state.currentRoomId = "goblin_den";
    const view = playerView(state, sunkenCrypt);
    expect(view.enemy).not.toBeNull();
    expect(view.enemy?.id).toBe("goblin");
    expect(view.enemy?.condition).toBe("unhurt");
    expect(view.enemy !== null && "hp" in view.enemy).toBe(false);
    expect(allKeys(view).has("alertness")).toBe(false);
    expect(allKeys(view).has("blocksRetreat")).toBe(false);
    expect(JSON.stringify(view.enemy)).not.toContain('"hp"');
  });

  it("shows passed once sneaked past", () => {
    const state = freshGame();
    state.currentRoomId = "goblin_den";
    let view = playerView(state, sunkenCrypt);
    expect(view.enemy?.passed).toBe(false);
    state.flags["sneaked:goblin_den"] = true;
    view = playerView(state, sunkenCrypt);
    expect(view.enemy?.passed).toBe(true);
    expect(view.enemy?.defeated).toBe(false);
  });

  it("shows unlocked once a door is opened", () => {
    const state = freshGame();
    state.currentRoomId = "gate_hall";
    let view = playerView(state, sunkenCrypt);
    expect(view.exits.find((e) => e.direction === "north")?.unlocked).toBeUndefined();
    state.flags["unlocked:gate_hall:north"] = true;
    view = playerView(state, sunkenCrypt);
    expect(view.exits.find((e) => e.direction === "north")?.unlocked).toBe(true);
  });

  it("maps hp to condition labels", () => {
    expect(conditionFor(12, 12)).toBe("unhurt");
    expect(conditionFor(15, 15)).toBe("unhurt");
    expect(conditionFor(9, 12)).toBe("wounded");
    expect(conditionFor(7, 12)).toBe("wounded");
    expect(conditionFor(6, 12)).toBe("badly wounded");
    expect(conditionFor(1, 12)).toBe("badly wounded");
  });

  it("returns defeated when the enemy is defeated", () => {
    expect(conditionFor(12, 12, true)).toBe("defeated");
    expect(conditionFor(1, 12, true)).toBe("defeated");
    expect(conditionFor(12, 12, false)).toBe("unhurt");
  });

  it("reflects wounded enemies through the view", () => {
    const state = freshGame();
    state.currentRoomId = "gate_hall";
    state.enemies["bone_troll"]!.hp = 7;
    expect(playerView(state, sunkenCrypt).enemy?.condition).toBe("wounded");
    state.enemies["bone_troll"]!.hp = 6;
    expect(playerView(state, sunkenCrypt).enemy?.condition).toBe("badly wounded");
    state.enemies["bone_troll"]!.defeated = true;
    const view = playerView(state, sunkenCrypt);
    expect(view.enemy?.defeated).toBe(true);
    expect(view.enemy?.condition).toBe("defeated");
  });

  it("shows leadsTo only for visited destinations and never leaks unvisited names", () => {
    const state = freshGame();
    // Start: entrance visited, hall not. Entrance north exit has no leadsTo.
    let view = playerView(state, sunkenCrypt);
    expect(view.exits).toHaveLength(1);
    expect(view.exits[0]).toEqual({ direction: "north", locked: false });
    expect(JSON.stringify(view)).not.toContain("Echoing Hall");
    // After visiting hall, entrance north exit names it.
    state.visitedRoomIds.push("hall");
    view = playerView(state, sunkenCrypt);
    expect(view.exits[0]).toEqual({ direction: "north", locked: false, leadsTo: "Echoing Hall" });
    // Hall leads back to visited entrance, but not to unvisited rooms.
    state.currentRoomId = "hall";
    view = playerView(state, sunkenCrypt);
    const byDirection = new Map(view.exits.map((e) => [e.direction, e]));
    expect(byDirection.get("south")).toEqual({
      direction: "south",
      locked: false,
      leadsTo: "Crypt Entrance",
    });
    expect(byDirection.get("north")?.leadsTo).toBeUndefined();
    expect(byDirection.get("east")?.leadsTo).toBeUndefined();
    expect(byDirection.get("west")?.leadsTo).toBeUndefined();
    const json = JSON.stringify(view);
    for (const room of Object.values(sunkenCrypt.rooms)) {
      if (!state.visitedRoomIds.includes(room.id)) {
        expect(json).not.toContain(room.name);
      }
    }
  });

  it("shows omens on the two fixed-danger exits and never hints at secrets", () => {
    const state = freshGame();
    state.currentRoomId = "hall";
    const view = playerView(state, sunkenCrypt);
    const byDirection = new Map(view.exits.map((e) => [e.direction, e]));
    expect(byDirection.get("east")?.omen).toBe("Low chanting drifts from the east.");
    expect(byDirection.get("south")?.omen).toBeUndefined();
    expect(byDirection.get("west")?.omen).toBeUndefined();
    expect(byDirection.get("north")?.omen).toBeUndefined();
    state.currentRoomId = "goblin_den";
    const den = playerView(state, sunkenCrypt);
    const denBy = new Map(den.exits.map((e) => [e.direction, e]));
    expect(denBy.get("north")?.omen).toBe("Something huge breathes slowly to the north.");
    expect(denBy.get("south")?.omen).toBeUndefined();
    const blob = JSON.stringify(view) + JSON.stringify(den);
    expect(blob).not.toMatch(/relic/i);
    expect(blob).not.toMatch(/trap/i);
  });
});

