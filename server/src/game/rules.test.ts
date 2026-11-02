import { describe, expect, it } from "vitest";
import { createGameState } from "./state.js";
import { attack, endTurn, move, pickUp, sneak, useItem } from "./rules.js";
import type { GameState, Rng, World } from "./types.js";

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) {
      throw new Error("seqRng exhausted: more rolls than expected.");
    }
    return values[i++] as number;
  };
}

function makeWorld(): World {
  return {
    id: "test-world",
    title: "Test World",
    startRoomId: "entrance",
    exitRoomId: "treasure",
    relicItemId: "relic",
    maxTurns: 20,
    relicCandidateRoomIds: [],
    trapCandidates: [],
    rooms: {
      entrance: {
        id: "entrance",
        name: "Entrance",
        description: "A dark entrance hall.",
        items: ["torch", "key"],
        exits: [
          { direction: "north", to: "hallway" },
          { direction: "east", to: "vault", locked: true, keyItemId: "key" },
        ],
        enemyId: "goblin",
      },
      hallway: {
        id: "hallway",
        name: "Hallway",
        description: "A narrow hallway.",
        items: [],
        exits: [
          { direction: "south", to: "entrance" },
          { direction: "north", to: "treasure" },
        ],
      },
      treasure: {
        id: "treasure",
        name: "Treasure Room",
        description: "A glittering treasure room.",
        items: ["relic"],
        exits: [{ direction: "south", to: "hallway" }],
      },
      vault: {
        id: "vault",
        name: "Vault",
        description: "A locked vault.",
        items: [],
        exits: [{ direction: "west", to: "entrance" }],
      },
    },
    items: {
      torch: { id: "torch", name: "Torch", description: "A flickering torch." },
      key: { id: "key", name: "Iron Key", description: "An iron key." },
      relic: { id: "relic", name: "Ancient Relic", description: "The relic." },
      coin: { id: "coin", name: "Gold Coin", description: "A gold coin." },
    },
    enemies: {
      goblin: {
        id: "goblin",
        name: "Goblin",
        hp: 5,
        attack: 2,
        defeated: false,
        loot: ["coin"],
        blocksRetreat: false,
        alertness: 5,
        quirk: "Picks its teeth.",
      },
      dragon: {
        id: "dragon",
        name: "Dragon",
        hp: 100,
        attack: 20,
        defeated: false,
        loot: [],
        blocksRetreat: true,
        alertness: 20,
        quirk: "Counts its gold.",
      },
    },
  };
}

function makeState(world: World): GameState {
  return createGameState(world, "session-1");
}

function snapshot(state: GameState): GameState {
  return structuredClone(state);
}

describe("move", () => {
  it("moves to the connected room when the way is clear", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.defeated = true;
    const result = move(state, world, "north", seqRng([]));
    expect(result.ok).toBe(true);
    expect(state.currentRoomId).toBe("hallway");
    expect(state.lastRoomId).toBe("entrance");
    expect(state.turn).toBe(1);
    expect(result.events[0]).toContain("Hallway");
  });

  it("rejects an unknown direction without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = move(state, world, "west", seqRng([]));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("west");
    expect(state).toEqual(before);
  });

  it("rejects a locked exit without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = move(state, world, "east", seqRng([]));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("locked");
    expect(state).toEqual(before);
  });

  it("rejects moving past a live enemy without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = move(state, world, "north", seqRng([]));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("The Goblin blocks your way.");
    expect(state).toEqual(before);
  });

  it("lets you retreat from a normal enemy back the way you came", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.currentRoomId = "entrance";
    state.lastRoomId = "hallway";
    const result = move(state, world, "north", seqRng([]));
    expect(result.ok).toBe(true);
    expect(state.currentRoomId).toBe("hallway");
    expect(state.lastRoomId).toBe("entrance");
    expect(state.turn).toBe(1);
  });

  it("still blocks a non-retreat exit when retreat is available", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.currentRoomId = "entrance";
    state.lastRoomId = "vault";
    const before = snapshot(state);
    const result = move(state, world, "north", seqRng([]));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("The Goblin blocks your way.");
    expect(state).toEqual(before);
  });

  it("rejects retreat from a boss that seals the doors", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.blocksRetreat = true;
    state.currentRoomId = "entrance";
    state.lastRoomId = "hallway";
    const before = snapshot(state);
    const result = move(state, world, "north", seqRng([]));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("The doors are sealed.");
    expect(state).toEqual(before);
    expect(state.turn).toBe(0);
  });

  it("allows moving past a sneaked enemy", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.flags["sneaked:entrance"] = true;
    const result = move(state, world, "north", seqRng([]));
    expect(result.ok).toBe(true);
    expect(state.currentRoomId).toBe("hallway");
  });

  it("allows moving past a defeated enemy", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.defeated = true;
    const result = move(state, world, "north", seqRng([]));
    expect(result.ok).toBe(true);
    expect(state.currentRoomId).toBe("hallway");
  });

  it("rejected moves do not advance the turn", () => {
    const world = makeWorld();
    const state = makeState(world);
    move(state, world, "west", seqRng([]));
    expect(state.turn).toBe(0);
  });

  it("normalizes direction case and whitespace", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.defeated = true;
    const first = move(state, world, "North", seqRng([]));
    expect(first.ok).toBe(true);
    expect(state.currentRoomId).toBe("hallway");
    const second = move(state, world, " north ", seqRng([]));
    expect(second.ok).toBe(true);
    expect(state.currentRoomId).toBe("treasure");
  });
});

describe("pickUp", () => {
  it("moves the item from the room to the inventory", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.defeated = true;
    const result = pickUp(state, world, "torch", seqRng([0.5]));
    expect(result.ok).toBe(true);
    expect(state.inventory).toEqual(["torch"]);
    expect(state.rooms["entrance"]!.items).toEqual(["key"]);
    expect(state.turn).toBe(1);
    expect(result.events).toEqual(["You picked up the Torch."]);
    expect(result.rolls).toEqual([]);
  });

  it("picks up freely with no roll when alertness is 0", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.alertness = 0;
    const result = pickUp(state, world, "torch", seqRng([]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toEqual([]);
    expect(state.inventory).toEqual(["torch"]);
    expect(state.rooms["entrance"]!.items).toEqual(["key"]);
    expect(state.turn).toBe(1);
  });

  it("picks up the item when the grab roll beats alertness", () => {
    const world = makeWorld();
    const state = makeState(world);
    // grab d20=17 beats alertness 5.
    const result = pickUp(state, world, "torch", seqRng([0.84]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]).toMatchObject({ purpose: "grab", sides: 20, value: 17 });
    expect(state.inventory).toEqual(["torch"]);
    expect(state.rooms["entrance"]!.items).toEqual(["key"]);
    expect(state.hp).toBe(10);
    expect(state.turn).toBe(1);
  });

  it("keeps the item but ends the turn when the grab fails", () => {
    const world = makeWorld();
    const state = makeState(world);
    // grab d20=3 fails vs alertness 5; enemy d20=5 misses.
    const result = pickUp(state, world, "torch", seqRng([0.1, 0.2]));
    expect(result.ok).toBe(true);
    expect(result.rolls.map((r) => r.purpose)).toEqual(["grab", "enemy attack"]);
    expect(state.inventory).toEqual([]);
    expect(state.rooms["entrance"]!.items).toEqual(["torch", "key"]);
    expect(result.events[0]).toBe("The Goblin noticed you!");
    expect(state.turn).toBe(1);
  });

  it("takes counterattack damage when the grab fails and the enemy hits", () => {
    const world = makeWorld();
    const state = makeState(world);
    // grab d20=3 fails vs alertness 5; enemy d20=15 hits for 2.
    const result = pickUp(state, world, "torch", seqRng([0.1, 0.7]));
    expect(result.ok).toBe(true);
    expect(state.hp).toBe(8);
    expect(state.inventory).toEqual([]);
    expect(state.turn).toBe(1);
  });

  it("rejects when a fully alert enemy is watching without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.alertness = 20;
    const before = snapshot(state);
    const result = pickUp(state, world, "torch", seqRng([]));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("The Goblin is watching you.");
    expect(state).toEqual(before);
    expect(state.turn).toBe(0);
  });

  it("rejects an item that is not in the room without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = pickUp(state, world, "relic", seqRng([]));
    expect(result.ok).toBe(false);
    expect(state).toEqual(before);
    expect(state.turn).toBe(0);
  });

  it("rejects an unknown item without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = pickUp(state, world, "nope", seqRng([]));
    expect(result.ok).toBe(false);
    expect(state).toEqual(before);
  });
});

describe("useItem", () => {
  it("unlocks a matching locked exit", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("key");
    const result = useItem(state, world, "key", "east");
    expect(result.ok).toBe(true);
    expect(state.rooms["entrance"]!.exits.find((e) => e.direction === "east")!.locked).toBe(false);
    expect(state.turn).toBe(1);
    expect(result.events).toEqual(["You unlocked the door to the east."]);
  });

  it("rejects when the item is not in inventory", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = useItem(state, world, "key", "east");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("do not have");
    expect(state).toEqual(before);
  });

  it("rejects when there is no exit in that direction", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("key");
    const before = snapshot(state);
    const result = useItem(state, world, "key", "west");
    expect(result.ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("rejects when the exit is not locked", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("key");
    const before = snapshot(state);
    const result = useItem(state, world, "key", "north");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("not locked");
    expect(state).toEqual(before);
  });

  it("rejects the wrong key without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("torch");
    const before = snapshot(state);
    const result = useItem(state, world, "torch", "east");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("does not unlock");
    expect(state).toEqual(before);
    expect(state.turn).toBe(0);
  });

  it("normalizes direction case and whitespace", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("key");
    const result = useItem(state, world, "key", " East ");
    expect(result.ok).toBe(true);
    expect(state.rooms["entrance"]!.exits.find((e) => e.direction === "east")!.locked).toBe(false);
  });
});

describe("attack", () => {
  it("hits, damages, and provokes a missed counterattack", () => {
    const world = makeWorld();
    const state = makeState(world);
    // d20=17 hit, d4=2 -> 3 damage, enemy d20=5 miss.
    const result = attack(state, world, "goblin", seqRng([0.84, 0.3, 0.2]));
    expect(result.ok).toBe(true);
    expect(result.rolls.map((r) => r.purpose)).toEqual([
      "player attack",
      "player damage",
      "enemy attack",
    ]);
    expect(result.rolls[0]).toMatchObject({ sides: 20, value: 17 });
    expect(result.rolls[1]).toMatchObject({ sides: 4, value: 2 });
    expect(state.enemies["goblin"]!.hp).toBe(2);
    expect(state.enemies["goblin"]!.defeated).toBe(false);
    expect(state.hp).toBe(10);
    expect(state.turn).toBe(1);
  });

  it("misses and takes counterattack damage clamped at 0", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.hp = 1;
    // player d20=3 miss, enemy d20=15 hit for 2 -> clamped to 0.
    const result = attack(state, world, "goblin", seqRng([0.1, 0.7]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toHaveLength(2);
    expect(state.hp).toBe(0);
    expect(state.status).toBe("lost");
    expect(result.events).toContain("You died.");
  });

  it("defeats the enemy, drops loot, and skips the counterattack", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.hp = 2;
    // d20=20 hit, d4=3 -> 4 damage kills.
    const result = attack(state, world, "goblin", seqRng([0.95, 0.6]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toHaveLength(2);
    expect(state.enemies["goblin"]!.defeated).toBe(true);
    expect(state.rooms["entrance"]!.items).toContain("coin");
    expect(state.hp).toBe(10);
    expect(result.events).toContain("You defeated the Goblin.");
  });

  it("rejects an enemy that is not in the room", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = attack(state, world, "dragon", seqRng([0.95]));
    expect(result.ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("rejects an already-defeated enemy without rolling", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.defeated = true;
    const before = snapshot(state);
    const result = attack(state, world, "goblin", seqRng([0.95]));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("already defeated");
    expect(state).toEqual(before);
    expect(state.turn).toBe(0);
  });
});

describe("sneak", () => {
  it("succeeds on 13+ and sets the sneaked flag", () => {
    const world = makeWorld();
    const state = makeState(world);
    // d20=17 success, no counterattack roll needed.
    const result = sneak(state, world, "goblin", seqRng([0.84]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]).toMatchObject({ purpose: "sneak", sides: 20, value: 17 });
    expect(state.flags["sneaked:entrance"]).toBe(true);
    expect(state.hp).toBe(10);
    expect(state.turn).toBe(1);
    expect(result.events).toEqual(["You sneaked past the Goblin."]);
  });

  it("fails and provokes a counterattack hit", () => {
    const world = makeWorld();
    const state = makeState(world);
    // sneak d20=3 fail, enemy d20=15 hit for 2.
    const result = sneak(state, world, "goblin", seqRng([0.1, 0.7]));
    expect(result.ok).toBe(true);
    expect(result.rolls.map((r) => r.purpose)).toEqual(["sneak", "enemy attack"]);
    expect(state.flags["sneaked:entrance"]).toBeUndefined();
    expect(state.hp).toBe(8);
    expect(state.turn).toBe(1);
  });

  it("rejects an enemy that is not in the room", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = sneak(state, world, "dragon", seqRng([0.95]));
    expect(result.ok).toBe(false);
    expect(state).toEqual(before);
  });

  it("rejects an already-defeated enemy without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.defeated = true;
    const before = snapshot(state);
    const result = sneak(state, world, "goblin", seqRng([0.95]));
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("already defeated");
    expect(state).toEqual(before);
    expect(state.turn).toBe(0);
  });
});

describe("endTurn / win / lose", () => {
  it("wins when holding the relic in the exit room", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.defeated = true;
    move(state, world, "north", seqRng([]));
    move(state, world, "north", seqRng([]));
    expect(state.currentRoomId).toBe("treasure");
    const result = pickUp(state, world, "relic", seqRng([]));
    expect(result.ok).toBe(true);
    expect(state.status).toBe("won");
    expect(result.events).toContain("You won!");
  });

  it("does not win with the relic outside the exit room", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.currentRoomId = "treasure";
    state.inventory.push("relic");
    state.currentRoomId = "hallway";
    const events = endTurn(state, world);
    expect(state.status).toBe("playing");
    expect(events).toEqual([]);
  });

  it("loses at maxTurns without the relic", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.currentRoomId = "treasure";
    state.turn = world.maxTurns - 1;
    const events = endTurn(state, world);
    expect(state.status).toBe("lost");
    expect(events).toEqual(["You ran out of time."]);
  });

  it("wins on the final turn when holding the relic in the exit room", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("relic");
    state.currentRoomId = "treasure";
    state.turn = world.maxTurns - 1;
    const events = endTurn(state, world);
    expect(state.turn).toBe(world.maxTurns);
    expect(state.status).toBe("won");
    expect(events).toEqual(["You won!"]);
  });

  it("loses when hp hits 0 even while winning (died first)", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("relic");
    state.currentRoomId = "treasure";
    state.hp = 0;
    const events = endTurn(state, world);
    expect(state.status).toBe("lost");
    expect(events).toEqual(["You died."]);
  });

  it("rejects every action after the game ends without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.status = "won";
    const before = snapshot(state);
    expect(move(state, world, "north", seqRng([])).ok).toBe(false);
    expect(pickUp(state, world, "torch", seqRng([])).ok).toBe(false);
    expect(useItem(state, world, "key", "east").ok).toBe(false);
    expect(attack(state, world, "goblin", seqRng([0.95])).ok).toBe(false);
    expect(sneak(state, world, "goblin", seqRng([0.95])).ok).toBe(false);
    expect(move(state, world, "north", seqRng([])).reason).toBe("The game is over.");
    expect(state).toEqual(before);
  });

  it("seqRng throws when an action rolls more than expected", () => {
    const world = makeWorld();
    const state = makeState(world);
    // attack hit needs: player attack + player damage + enemy attack = 3 rolls.
    expect(() => attack(state, world, "goblin", seqRng([0.95, 0.5]))).toThrow(
      /exhausted/,
    );
  });
});

describe("trap", () => {
  function makeTrapState(world: World): GameState {
    const state = makeState(world);
    state.enemies["goblin"]!.defeated = true;
    state.secrets = {
      relicRoomId: "treasure",
      trap: { roomId: "entrance", direction: "north" },
    };
    return state;
  }

  it("fires once with the right damage", () => {
    const world = makeWorld();
    const state = makeTrapState(world);
    // d4: 1 + floor(0.5 * 4) = 3.
    const result = move(state, world, "north", seqRng([0.5]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toEqual([{ purpose: "trap", sides: 4, value: 3 }]);
    expect(state.hp).toBe(7);
    expect(state.flags["trap_sprung"]).toBe(true);
    expect(result.events).toContain("A trap springs! You take 3 damage.");
    expect(state.currentRoomId).toBe("hallway");
    expect(state.turn).toBe(1);
  });

  it("does not fire on a second pass", () => {
    const world = makeWorld();
    const state = makeTrapState(world);
    move(state, world, "north", seqRng([0.5]));
    // Walk back south, then north again through the same trapped exit.
    state.lastRoomId = null;
    state.currentRoomId = "entrance";
    const second = move(state, world, "north", seqRng([]));
    expect(second.ok).toBe(true);
    expect(second.rolls).toEqual([]);
    expect(state.hp).toBe(7);
    expect(second.events).not.toContain(
      "A trap springs! You take 3 damage.",
    );
  });

  it("does not fire on other exits", () => {
    const world = makeWorld();
    const state = makeTrapState(world);
    // hallway north -> treasure is not the trapped exit.
    state.currentRoomId = "hallway";
    state.lastRoomId = "entrance";
    const result = move(state, world, "north", seqRng([]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toEqual([]);
    expect(state.hp).toBe(10);
    expect(state.flags["trap_sprung"]).toBeUndefined();
  });

  it("matches the trapped exit after direction normalization", () => {
    const world = makeWorld();
    const state = makeTrapState(world);
    const result = move(state, world, " North ", seqRng([0.0]));
    expect(result.rolls).toEqual([{ purpose: "trap", sides: 4, value: 1 }]);
    expect(state.hp).toBe(9);
    expect(result.events).toContain("A trap springs! You take 1 damage.");
  });

  it("a trap can kill the player", () => {
    const world = makeWorld();
    const state = makeTrapState(world);
    state.hp = 1;
    // d4 = 1 + floor(0.99 * 4) = 4, clamped at 0.
    const result = move(state, world, "north", seqRng([0.99]));
    expect(result.ok).toBe(true);
    expect(state.hp).toBe(0);
    expect(state.status).toBe("lost");
    expect(result.events).toContain("A trap springs! You take 4 damage.");
    expect(result.events).toContain("You died.");
  });
});




