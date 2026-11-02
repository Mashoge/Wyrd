import { describe, expect, it } from "vitest";
import { createGameState } from "./state.js";
import type { World } from "./types.js";

function makeTestWorld(): World {
  return {
    id: "test-world",
    title: "Test World",
    startRoomId: "entrance",
    exitRoomId: "treasure",
    relicItemId: "torch",
    maxTurns: 20,
    rooms: {
      entrance: {
        id: "entrance",
        name: "Entrance",
        description: "A dark entrance hall.",
        items: ["torch"],
        exits: [{ direction: "north", to: "treasure" }],
        enemyId: "goblin",
      },
      treasure: {
        id: "treasure",
        name: "Treasure Room",
        description: "A glittering treasure room.",
        items: [],
        exits: [{ direction: "south", to: "entrance" }],
      },
    },
    items: {
      torch: {
        id: "torch",
        name: "Torch",
        description: "A flickering torch.",
      },
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
        alertness: 0,
        quirk: "Picks its teeth.",
      },
    },
  };
}

describe("createGameState", () => {
  it("sets the initial values correctly", () => {
    const world = makeTestWorld();
    const state = createGameState(world, "session-1");

    expect(state.sessionId).toBe("session-1");
    expect(state.worldId).toBe("test-world");
    expect(state.hp).toBe(10);
    expect(state.maxHp).toBe(10);
    expect(state.inventory).toEqual([]);
    expect(state.currentRoomId).toBe("entrance");
    expect(state.turn).toBe(0);
    expect(state.status).toBe("playing");
    expect(state.flags).toEqual({});
    expect(state.lastRoomId).toBeNull();

    // Rooms and enemies are copied over with equal content...
    expect(state.rooms).toEqual(world.rooms);
    expect(state.enemies).toEqual(world.enemies);
    // ...but are not the same object references.
    expect(state.rooms).not.toBe(world.rooms);
    expect(state.enemies).not.toBe(world.enemies);
  });

  it("does not let changes to state affect the original world", () => {
    const world = makeTestWorld();
    const state = createGameState(world, "session-2");

    // Mutate top-level room map and nested room fields.
    state.rooms["entrance"].name = "Changed Name";
    state.rooms["entrance"].items.push("fake-item");
    state.rooms["entrance"].exits[0].to = "nowhere";
    state.rooms["new-room"] = {
      id: "new-room",
      name: "New Room",
      description: "Should not appear in world.",
      items: [],
      exits: [],
    };

    // Mutate enemies.
    state.enemies["goblin"].hp = 0;
    state.enemies["goblin"].defeated = true;
    state.enemies["dragon"] = {
      id: "dragon",
      name: "Dragon",
      hp: 100,
      attack: 20,
      defeated: false,
      loot: [],
      blocksRetreat: true,
      alertness: 20,
      quirk: "Counts its gold.",
    };

    // Original world must be untouched.
    expect(world.rooms["entrance"].name).toBe("Entrance");
    expect(world.rooms["entrance"].items).toEqual(["torch"]);
    expect(world.rooms["entrance"].exits[0].to).toBe("treasure");
    expect(world.rooms["new-room"]).toBeUndefined();

    expect(world.enemies["goblin"].hp).toBe(5);
    expect(world.enemies["goblin"].defeated).toBe(false);
    expect(world.enemies["dragon"]).toBeUndefined();
  });
});
