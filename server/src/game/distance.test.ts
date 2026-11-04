import { describe, expect, it } from "vitest";
import { nearMissMessage, roomDistance } from "./distance.js";
import { createGameState } from "./state.js";
import type { World } from "./types.js";
import { sunkenCrypt } from "./worlds/sunkenCrypt.js";

function makeWorld(): World {
  return {
    id: "distance-world",
    title: "Distance World",
    startRoomId: "a",
    exitRoomId: "exit",
    relicItemId: "relic",
    maxTurns: 40,
    relicCandidateRoomIds: [],
    trapCandidates: [],
    rooms: {
      a: {
        id: "a",
        name: "A",
        description: "Room A.",
        items: [],
        exits: [
          { direction: "north", to: "b" },
          { direction: "east", to: "exit", locked: true, keyItemId: "key" },
        ],
        enemyId: "goblin",
      },
      b: {
        id: "b",
        name: "B",
        description: "Room B.",
        items: [],
        exits: [
          { direction: "south", to: "a" },
          { direction: "north", to: "c" },
        ],
      },
      c: {
        id: "c",
        name: "C",
        description: "Room C.",
        items: [],
        exits: [
          { direction: "south", to: "b" },
          { direction: "north", to: "exit" },
        ],
      },
      exit: {
        id: "exit",
        name: "Exit",
        description: "The exit.",
        items: [],
        exits: [{ direction: "south", to: "c" }],
      },
      island: {
        id: "island",
        name: "Island",
        description: "Unreachable.",
        items: [],
        exits: [],
      },
    },
    items: {
      relic: { id: "relic", name: "Relic", description: "The relic.", kind: "treasure" },
      key: { id: "key", name: "Key", description: "A key.", kind: "key" },
    },
    enemies: {
      goblin: {
        id: "goblin",
        name: "Goblin",
        hp: 5,
        attack: 2,
        defeated: false,
        loot: [],
        blocksRetreat: false,
        alertness: 5,
        quirk: "Growls.",
      },
    },
  };
}

describe("roomDistance", () => {
  it("returns 0 for the same room", () => {
    expect(roomDistance(makeWorld(), "a", "a")).toBe(0);
  });

  it("returns 1 for adjacent rooms, even through a locked door or past an enemy", () => {
    const world = makeWorld();
    // a -> exit is locked and room a holds an enemy; both are ignored.
    expect(roomDistance(world, "a", "exit")).toBe(1);
    expect(roomDistance(world, "a", "b")).toBe(1);
  });

  it("finds the shortest multi-hop path", () => {
    const world = makeWorld();
    // Shortest a -> c avoids the direct locked shortcut only when measured b-first:
    // b -> exit is 2 via c.
    expect(roomDistance(world, "b", "exit")).toBe(2);
    expect(roomDistance(world, "c", "a")).toBe(2);
  });

  it("returns null when unreachable or unknown", () => {
    const world = makeWorld();
    expect(roomDistance(world, "a", "island")).toBeNull();
    expect(roomDistance(world, "island", "a")).toBeNull();
    expect(roomDistance(world, "a", "nowhere")).toBeNull();
    expect(roomDistance(world, "nowhere", "a")).toBeNull();
  });
});

describe("nearMissMessage", () => {
  it("points at the exit when the relic is held (plural)", () => {
    const world = makeWorld();
    const state = createGameState(world, "s1");
    state.currentRoomId = "b";
    state.inventory = ["relic"];
    state.secrets = { relicRoomId: "c", trap: { roomId: "a", direction: "north" } };
    expect(nearMissMessage(state, world)).toBe(
      "You held the Lost Relic — the exit was 2 rooms away.",
    );
  });

  it("uses singular room when the exit is 1 away", () => {
    const world = makeWorld();
    const state = createGameState(world, "s1");
    state.currentRoomId = "c";
    state.inventory = ["relic"];
    state.secrets = { relicRoomId: "c", trap: { roomId: "a", direction: "north" } };
    expect(nearMissMessage(state, world)).toBe(
      "You held the Lost Relic — the exit was 1 room away.",
    );
  });

  it("points at the relic when it is not held (plural)", () => {
    const world = makeWorld();
    const state = createGameState(world, "s1");
    state.currentRoomId = "a";
    state.inventory = [];
    state.secrets = { relicRoomId: "c", trap: { roomId: "a", direction: "north" } };
    expect(nearMissMessage(state, world)).toBe("The relic was 2 rooms away.");
  });

  it("uses singular room when the relic is 1 away", () => {
    const world = makeWorld();
    const state = createGameState(world, "s1");
    state.currentRoomId = "b";
    state.inventory = [];
    state.secrets = { relicRoomId: "c", trap: { roomId: "a", direction: "north" } };
    expect(nearMissMessage(state, world)).toBe("The relic was 1 room away.");
  });

  it("returns null when the target is unreachable", () => {
    const world = makeWorld();
    const state = createGameState(world, "s1");
    state.currentRoomId = "a";
    state.inventory = [];
    state.secrets = { relicRoomId: "island", trap: { roomId: "a", direction: "north" } };
    expect(nearMissMessage(state, world)).toBeNull();
  });

  it("returns null for a won game, with or without the relic", () => {
    const world = makeWorld();
    const withRelic = createGameState(world, "s1");
    withRelic.status = "won";
    withRelic.currentRoomId = "b";
    withRelic.inventory = ["relic"];
    withRelic.secrets = { relicRoomId: "c", trap: { roomId: "a", direction: "north" } };
    expect(nearMissMessage(withRelic, world)).toBeNull();
    const withoutRelic = createGameState(world, "s1");
    withoutRelic.status = "won";
    withoutRelic.currentRoomId = "a";
    withoutRelic.inventory = [];
    withoutRelic.secrets = { relicRoomId: "c", trap: { roomId: "a", direction: "north" } };
    expect(nearMissMessage(withoutRelic, world)).toBeNull();
  });
});

describe("sunkenCrypt pacing", () => {
  it("allows 40 turns", () => {
    expect(sunkenCrypt.maxTurns).toBe(40);
  });
});
