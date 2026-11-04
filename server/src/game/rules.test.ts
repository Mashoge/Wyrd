import { describe, expect, it } from "vitest";
import { createGameState } from "./state.js";
import { attempt, attack, endTurn, examine, move, pickUp, sneak, throwItem, useItem } from "./rules.js";
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
      torch: { id: "torch", name: "Torch", description: "A flickering torch.", kind: "misc" },
      key: { id: "key", name: "Iron Key", description: "An iron key.", kind: "key" },
      relic: { id: "relic", name: "Ancient Relic", description: "The relic.", kind: "treasure" },
      coin: { id: "coin", name: "Gold Coin", description: "A gold coin.", kind: "misc" },
      dagger: {
        id: "dagger",
        name: "Dagger",
        description: "A sharp dagger.",
        kind: "weapon",
        attackBonus: 1,
        damageBonus: 1,
      },
      club: {
        id: "club",
        name: "Club",
        description: "A heavy club.",
        kind: "weapon",
        attackBonus: 0,
        damageBonus: 1,
      },
      bone: {
        id: "bone",
        name: "Thigh Bone",
        description: "A heavy bone, gnawed clean and good for swinging.",
        kind: "weapon",
        attackBonus: -2,
        damageBonus: 3,
      },
      draught: {
        id: "draught",
        name: "Healing Draught",
        description: "A healing vial.",
        kind: "consumable",
        heal: 4,
      },
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
        lureItemId: "coin",
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

  it("tracks visited rooms: start included, move adds the new room, no duplicates", () => {
    const world = makeWorld();
    const state = makeState(world);
    expect(state.visitedRoomIds).toEqual(["entrance"]);
    state.enemies["goblin"]!.defeated = true;
    move(state, world, "north", seqRng([]));
    expect(state.visitedRoomIds).toEqual(["entrance", "hallway"]);
    state.lastRoomId = null;
    state.currentRoomId = "entrance";
    move(state, world, "north", seqRng([]));
    expect(state.visitedRoomIds).toEqual(["entrance", "hallway"]);
  });

  it("leaves visited rooms unchanged on a rejected move", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = move(state, world, "east", seqRng([]));
    expect(result.ok).toBe(false);
    expect(state.visitedRoomIds).toEqual(before.visitedRoomIds);
    expect(state).toEqual(before);
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
    // grab d20=17 beats alertness 5 (target 6).
    const result = pickUp(state, world, "torch", seqRng([0.84]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]).toMatchObject({ purpose: "grab", sides: 20, value: 17 });
    expect(result.rolls[0]).toMatchObject({ target: 6, success: true });
    expect(state.inventory).toEqual(["torch"]);
    expect(state.rooms["entrance"]!.items).toEqual(["key"]);
    expect(state.hp).toBe(10);
    expect(state.turn).toBe(1);
  });

  it("keeps the item but ends the turn when the grab fails", () => {
    const world = makeWorld();
    const state = makeState(world);
    // grab d20=3 fails vs alertness 5 (target 6); enemy d20=5 misses (target 12).
    const result = pickUp(state, world, "torch", seqRng([0.1, 0.2]));
    expect(result.ok).toBe(true);
    expect(result.rolls.map((r) => r.purpose)).toEqual(["grab", "enemy attack"]);
    expect(result.rolls[0]).toMatchObject({ target: 6, success: false });
    expect(result.rolls[1]).toMatchObject({ target: 12, success: false });
    expect(state.inventory).toEqual([]);
    expect(state.rooms["entrance"]!.items).toEqual(["torch", "key"]);
    expect(result.events[0]).toBe("The Goblin noticed you!");
    expect(state.turn).toBe(1);
  });

  it("takes counterattack damage when the grab fails and the enemy hits", () => {
    const world = makeWorld();
    const state = makeState(world);
    // grab d20=3 fails vs alertness 5 (target 6); enemy d20=15 hits (target 12) for 2.
    const result = pickUp(state, world, "torch", seqRng([0.1, 0.7]));
    expect(result.ok).toBe(true);
    expect(result.rolls[1]).toMatchObject({ target: 12, success: true });
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
    expect(result.reason).toContain("Nothing happens");
    expect(state).toEqual(before);
    expect(state.turn).toBe(0);
  });

  it("rejects a key without a direction", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("key");
    const before = snapshot(state);
    const result = useItem(state, world, "key");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Use the Iron Key on which door? Say a direction.");
    expect(state).toEqual(before);
    expect(state.turn).toBe(0);
  });

  it("rejects using a weapon", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("dagger");
    const before = snapshot(state);
    const result = useItem(state, world, "dagger", "east");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("The Dagger is used automatically when you attack.");
    expect(state).toEqual(before);
    expect(state.turn).toBe(0);
  });

  it("rejects using a treasure or misc item", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("coin");
    expect(useItem(state, world, "coin").reason).toBe(
      "Nothing happens when you use the Gold Coin.",
    );
    state.inventory.push("relic");
    expect(useItem(state, world, "relic").reason).toBe(
      "Nothing happens when you use the Ancient Relic.",
    );
    expect(state.turn).toBe(0);
  });

  it("heals with a consumable, capped at maxHp, and consumes it", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.hp = 8;
    state.inventory.push("draught");
    const result = useItem(state, world, "draught");
    expect(result.ok).toBe(true);
    expect(state.hp).toBe(10);
    expect(state.inventory).not.toContain("draught");
    expect(result.events).toContain("You drink the Healing Draught and recover 2 HP.");
    expect(state.turn).toBe(1);
  });

  it("heals the full amount when hurt more", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.hp = 5;
    state.inventory.push("draught");
    const result = useItem(state, world, "draught");
    expect(result.ok).toBe(true);
    expect(state.hp).toBe(9);
    expect(result.events).toContain("You drink the Healing Draught and recover 4 HP.");
  });

  it("rejects a consumable at full health", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("draught");
    const before = snapshot(state);
    const result = useItem(state, world, "draught");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("You are already unhurt.");
    expect(state).toEqual(before);
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
  it("hits bare-handed with target 10 and bonus damage", () => {
    const world = makeWorld();
    const state = makeState(world);
    // d20=17 hit (target 10), d4=2 -> 3 damage, enemy d20=5 miss (target 12).
    const result = attack(state, world, "goblin", seqRng([0.84, 0.3, 0.2]));
    expect(result.ok).toBe(true);
    expect(result.rolls.map((r) => r.purpose)).toEqual([
      "player attack",
      "player damage",
      "enemy attack",
    ]);
    expect(result.rolls[0]).toMatchObject({ sides: 20, value: 17 });
    expect(result.rolls[0]).toMatchObject({ target: 10, success: true });
    expect(result.rolls[1]).toMatchObject({ sides: 4, value: 2, bonus: 1 });
    expect(result.rolls[1]).toMatchObject({ target: 0, success: true });
    expect(result.rolls[2]).toMatchObject({ target: 12, success: false });
    expect(result.events[0]).toBe("You fight bare-handed.");
    expect(state.enemies["goblin"]!.hp).toBe(2);
    expect(state.enemies["goblin"]!.defeated).toBe(false);
    expect(state.hp).toBe(10);
    expect(state.turn).toBe(1);
  });

  it("uses the best weapon: hit target 10 - attackBonus, damage d4+1+damageBonus", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("club", "dagger");
    // dagger score 2 > club score 1, so dagger: target 9, bonus 2.
    // d20=17 hit (target 9), d4=2 -> 4 damage, enemy d20=5 miss.
    const result = attack(state, world, "goblin", seqRng([0.84, 0.3, 0.2]));
    expect(result.ok).toBe(true);
    expect(result.rolls[0]).toMatchObject({ target: 9, success: true });
    expect(result.rolls[1]).toMatchObject({ sides: 4, value: 2, bonus: 2 });
    expect(result.events[0]).toBe("You strike with the Dagger.");
    expect(state.enemies["goblin"]!.hp).toBe(1);
  });

  it("hits on the lowered target with a weapon (roll 9 hits with dagger)", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("dagger");
    // d20=9: miss bare-handed (target 10) but hit with dagger (target 9).
    // d20 = 1 + floor(0.4*20) = 9; d4 = 1 + floor(0.3*4) = 2 -> 4 damage; enemy d20=5 miss.
    const result = attack(state, world, "goblin", seqRng([0.4, 0.3, 0.2]));
    expect(result.ok).toBe(true);
    expect(result.rolls[0]).toMatchObject({ value: 9, target: 9, success: true });
    expect(result.rolls[1]).toMatchObject({ bonus: 2 });
    expect(state.enemies["goblin"]!.hp).toBe(1);
  });

  it("misses and takes counterattack damage clamped at 0", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.hp = 1;
    // player d20=3 miss (target 10), enemy d20=15 hit (target 12) for 2 -> clamped to 0.
    const result = attack(state, world, "goblin", seqRng([0.1, 0.7]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toHaveLength(2);
    expect(result.rolls[0]).toMatchObject({ purpose: "player attack", target: 10, success: false });
    expect(result.rolls[1]).toMatchObject({ purpose: "enemy attack", target: 12, success: true });
    expect(state.hp).toBe(0);
    expect(state.status).toBe("lost");
    expect(result.events).toContain("You died.");
  });

  it("defeats the enemy, drops loot, and skips the counterattack", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.hp = 2;
    // d20=20 hit (target 10), d4=3 -> 4 damage kills.
    const result = attack(state, world, "goblin", seqRng([0.95, 0.6]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toHaveLength(2);
    expect(result.rolls[0]).toMatchObject({ target: 10, success: true });
    expect(result.rolls[1]).toMatchObject({ target: 0, success: true });
    expect(state.enemies["goblin"]!.defeated).toBe(true);
    expect(state.rooms["entrance"]!.items).toContain("coin");
    expect(state.hp).toBe(10);
    expect(result.events).toContain("You defeated the Goblin.");
    expect(result.events).toContain("The Goblin dropped Gold Coin.");
    expect(result.events.indexOf("The Goblin dropped Gold Coin.")).toBeGreaterThan(
      result.events.indexOf("You defeated the Goblin."),
    );
  });

  it("emits one drop event per loot item, none when there is no loot", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.hp = 2;
    state.enemies["goblin"]!.loot = ["coin", "torch"];
    const result = attack(state, world, "goblin", seqRng([0.95, 0.6]));
    expect(result.ok).toBe(true);
    expect(result.events).toContain("The Goblin dropped Gold Coin.");
    expect(result.events).toContain("The Goblin dropped Torch.");
    expect(state.rooms["entrance"]!.items).toEqual(
      expect.arrayContaining(["coin", "torch"]),
    );

    const bare = makeWorld();
    bare.enemies["goblin"]!.loot = [];
    bare.enemies["goblin"]!.hp = 2;
    const bareState = makeState(bare);
    const bareResult = attack(bareState, bare, "goblin", seqRng([0.95, 0.6]));
    expect(bareResult.ok).toBe(true);
    expect(bareResult.events).toContain("You defeated the Goblin.");
    expect(bareResult.events.filter((e) => e.includes("dropped"))).toEqual([]);
  });

  it("uses a chosen weapon even when it is not the best (bone: target 12, damage d4+4)", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("dagger", "bone");
    // bone: target 10-(-2)=12, damage bonus 1+3=4. d20=12 hit, d4=2 -> 6 damage kills goblin (5 hp).
    const result = attack(state, world, "goblin", seqRng([0.55, 0.3]), "bone");
    expect(result.ok).toBe(true);
    expect(result.rolls[0]).toMatchObject({ target: 12, success: true });
    expect(result.rolls[1]).toMatchObject({ sides: 4, value: 2, bonus: 4 });
    expect(result.events[0]).toBe("You strike with the Thigh Bone.");
    expect(state.enemies["goblin"]!.defeated).toBe(true);
  });

  it("rejects a chosen weapon that is not in the inventory, with no rolls or state change", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("dagger");
    const before = snapshot(state);
    const result = attack(state, world, "goblin", seqRng([]), "bone");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("You do not have the Thigh Bone.");
    expect(result.rolls).toEqual([]);
    expect(state).toEqual(before);
  });

  it("rejects a chosen item that is not a weapon, with no rolls or state change", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("torch");
    const before = snapshot(state);
    const result = attack(state, world, "goblin", seqRng([]), "torch");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("The Torch is not a weapon.");
    expect(result.rolls).toEqual([]);
    expect(state).toEqual(before);
  });

  it("picks the bone as best weapon when it is the only weapon (target 12, not bare-handed 10)", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("bone");
    // d20=11 would hit bare-handed (target 10) but misses with the bone (target 12); enemy d20=5 misses.
    const result = attack(state, world, "goblin", seqRng([0.5, 0.2]));
    expect(result.ok).toBe(true);
    expect(result.rolls[0]).toMatchObject({ target: 12, success: false });
    expect(result.events[0]).toBe("You strike with the Thigh Bone.");
  });

  it("formats negative weapon bonuses without a double sign on examine", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("bone");
    const result = examine(state, world, "bone");
    expect(result.ok).toBe(true);
    expect(result.events[0]).toContain("-2 attack");
    expect(result.events[0]).toContain("+3 damage");
    expect(result.events[0]).not.toContain("+-");
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

describe("examine", () => {
  it("describes an item in the room without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = examine(state, world, "torch");
    expect(result.ok).toBe(true);
    expect(result.action).toBe("examine");
    expect(result.rolls).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toContain("Torch");
    expect(state).toEqual(before);
    expect(state.turn).toBe(0);
  });

  it("describes an inventory item with bonuses and heal amounts", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("dagger", "draught");
    const weapon = examine(state, world, "dagger");
    expect(weapon.ok).toBe(true);
    expect(weapon.events[0]).toContain("Dagger");
    expect(weapon.events[0]).toContain("+1 attack");
    expect(weapon.events[0]).toContain("+1 damage");
    const potion = examine(state, world, "draught");
    expect(potion.ok).toBe(true);
    expect(potion.events[0]).toContain("4 HP");
    expect(state.turn).toBe(0);
  });

  it("rejects unknown items without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    const before = snapshot(state);
    const result = examine(state, world, "nope");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("You don't see any nope here.");
    expect(state).toEqual(before);
  });
});

describe("sneak", () => {
  it("succeeds on 13+ and sets the sneaked flag", () => {
    const world = makeWorld();
    const state = makeState(world);
    // d20=17 success (target 13), no counterattack roll needed.
    const result = sneak(state, world, "goblin", seqRng([0.84]));
    expect(result.ok).toBe(true);
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]).toMatchObject({ purpose: "sneak", sides: 20, value: 17 });
    expect(result.rolls[0]).toMatchObject({ target: 13, success: true });
    expect(state.flags["sneaked:entrance"]).toBe(true);
    expect(state.hp).toBe(10);
    expect(state.turn).toBe(1);
    expect(result.events).toEqual(["You sneaked past the Goblin."]);
  });

  it("fails and provokes a counterattack hit", () => {
    const world = makeWorld();
    const state = makeState(world);
    // sneak d20=3 fail (target 13), enemy d20=15 hit (target 12) for 2.
    const result = sneak(state, world, "goblin", seqRng([0.1, 0.7]));
    expect(result.ok).toBe(true);
    expect(result.rolls.map((r) => r.purpose)).toEqual(["sneak", "enemy attack"]);
    expect(result.rolls[0]).toMatchObject({ target: 13, success: false });
    expect(result.rolls[1]).toMatchObject({ target: 12, success: true });
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

  it("rejects a second sneak past the same enemy without changing state", () => {
    const world = makeWorld();
    const state = makeState(world);
    // d20=17 succeeds (target 13).
    const first = sneak(state, world, "goblin", seqRng([0.84]));
    expect(first.ok).toBe(true);
    expect(state.flags["sneaked:entrance"]).toBe(true);
    const before = snapshot(state);
    const second = sneak(state, world, "goblin", seqRng([0.84]));
    expect(second.ok).toBe(false);
    expect(second.action).toBe("sneak");
    expect(second.reason).toBe("You're already past the Goblin.");
    expect(second.rolls).toEqual([]);
    expect(second.events).toEqual([]);
    expect(state).toEqual(before);
    expect(state.turn).toBe(1);
  });
});

describe("throwItem", () => {
  it("lure throw sets the sneaked flag with no rolls, drops the item, and it can be picked back up", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("coin");
    // coin is the goblin's lure. seqRng([]) proves no rolls happen.
    const result = throwItem(state, world, "coin", "goblin");
    expect(result.ok).toBe(true);
    expect(result.action).toBe("throw");
    expect(result.rolls).toEqual([]);
    expect(state.flags["sneaked:entrance"]).toBe(true);
    expect(state.inventory).not.toContain("coin");
    expect(state.rooms["entrance"]!.items).toContain("coin");
    expect(state.turn).toBe(1);
    expect(result.events[0]).toContain("goes after it");
    // Already past: throwing again is rejected, so the item is not wasted.
    state.inventory.push("coin");
    const before = snapshot(state);
    const again = throwItem(state, world, "coin", "goblin");
    expect(again.ok).toBe(false);
    expect(state).toEqual(before);
    // The thrown coin can be picked back up (already past, so no watcher roll).
    const grab = pickUp(state, world, "coin", seqRng([]));
    expect(grab.ok).toBe(true);
    expect(state.inventory).toContain("coin");
  });

  it("non-lure throw distracts: next sneak succeeds on 9-12 with target 9, flag consumed, then back to 13", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("torch");
    const result = throwItem(state, world, "torch", "goblin");
    expect(result.ok).toBe(true);
    expect(result.rolls).toEqual([]);
    expect(state.flags["distracted:entrance:goblin"]).toBe(true);
    expect(state.flags["sneaked:entrance"]).toBeUndefined();
    expect(state.inventory).not.toContain("torch");
    expect(state.rooms["entrance"]!.items).toContain("torch");
    expect(result.events[0]).toContain("distracted");
    // d20=10: fails at 13, succeeds at distracted target 9. No counterattack on success.
    const sneaked = sneak(state, world, "goblin", seqRng([0.45]));
    expect(sneaked.ok).toBe(true);
    expect(sneaked.rolls[0]).toMatchObject({ purpose: "sneak", value: 10, target: 9, success: true });
    expect(state.flags["sneaked:entrance"]).toBe(true);
    expect(state.flags["distracted:entrance:goblin"]).toBeUndefined();
  });

  it("consumes the distraction even on a failed sneak, and repeated throws do not stack", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("torch", "key");
    throwItem(state, world, "torch", "goblin");
    throwItem(state, world, "key", "goblin");
    expect(state.flags["distracted:entrance:goblin"]).toBe(true);
    // d20=3 fails even at 9; enemy d20=5 misses. Flag must be gone afterwards.
    const failed = sneak(state, world, "goblin", seqRng([0.1, 0.2]));
    expect(failed.ok).toBe(true);
    expect(failed.rolls[0]).toMatchObject({ target: 9, success: false });
    expect(state.flags["distracted:entrance:goblin"]).toBeUndefined();
    // Next sneak is back to target 13: d20=10 now fails; enemy misses.
    const normal = sneak(state, world, "goblin", seqRng([0.45, 0.2]));
    expect(normal.rolls[0]).toMatchObject({ target: 13, success: false });
  });

  it("rejects game over, missing item, wrong-room enemy, and defeated enemy with no state change", () => {
    const world = makeWorld();

    const over = makeState(world);
    over.status = "lost";
    over.inventory.push("torch");
    const overBefore = snapshot(over);
    expect(throwItem(over, world, "torch", "goblin").ok).toBe(false);
    expect(over).toEqual(overBefore);

    const noItem = makeState(world);
    const noItemBefore = snapshot(noItem);
    const missing = throwItem(noItem, world, "torch", "goblin");
    expect(missing.ok).toBe(false);
    expect(missing.reason).toBe("You do not have the Torch.");
    expect(noItem).toEqual(noItemBefore);

    const wrongRoom = makeState(world);
    wrongRoom.inventory.push("torch");
    const wrongBefore = snapshot(wrongRoom);
    expect(throwItem(wrongRoom, world, "torch", "dragon").ok).toBe(false);
    expect(wrongRoom).toEqual(wrongBefore);

    const dead = makeState(world);
    dead.inventory.push("torch");
    dead.enemies["goblin"]!.defeated = true;
    const deadBefore = snapshot(dead);
    const deadResult = throwItem(dead, world, "torch", "goblin");
    expect(deadResult.ok).toBe(false);
    expect(deadResult.reason).toContain("already defeated");
    expect(dead).toEqual(deadBefore);
  });
});

describe("humanized names", () => {
  it("humanizes unknown ids with spaces and no underscores", () => {
    const world = makeWorld();
    const state = makeState(world);
    const attacked = attack(state, world, "legendary_sword", seqRng([]));
    expect(attacked.ok).toBe(false);
    expect(attacked.reason).toBe("There is no legendary sword here.");
    expect(attacked.reason).not.toContain("_");
    const sneaked = sneak(state, world, "shadow_beast", seqRng([]));
    expect(sneaked.ok).toBe(false);
    expect(sneaked.reason).toBe("There is no shadow beast here.");
    const grabbed = pickUp(state, world, "legendary_sword", seqRng([]));
    expect(grabbed.ok).toBe(false);
    expect(grabbed.reason).toBe("There is no legendary sword here.");
    const looked = examine(state, world, "legendary_sword");
    expect(looked.ok).toBe(false);
    expect(looked.reason).toBe("You don't see any legendary sword here.");
    const notHeld = useItem(state, world, "legendary_sword", "east");
    expect(notHeld.ok).toBe(false);
    expect(notHeld.reason).toBe("You do not have the legendary sword.");
  });

  it("unlocking a door records an unlocked flag", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.inventory.push("key");
    const result = useItem(state, world, "key", "east");
    expect(result.ok).toBe(true);
    expect(state.flags["unlocked:entrance:east"]).toBe(true);
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

  it("warns when exactly 10 turns are left", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.turn = world.maxTurns - 11;
    const events = endTurn(state, world);
    expect(state.turn).toBe(world.maxTurns - 10);
    expect(state.status).toBe("playing");
    expect(events).toEqual(["Your torch burns low: 10 turns left."]);
  });

  it("warns when exactly 5 turns are left", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.turn = world.maxTurns - 6;
    const events = endTurn(state, world);
    expect(state.turn).toBe(world.maxTurns - 5);
    expect(state.status).toBe("playing");
    expect(events).toEqual(["Your torch gutters: 5 turns left!"]);
  });

  it("stays quiet on other turn counts", () => {
    const world = makeWorld();
    for (const turnsLeft of [11, 9, 6, 4, 1]) {
      const state = makeState(world);
      state.turn = world.maxTurns - turnsLeft - 1;
      const events = endTurn(state, world);
      expect(state.status).toBe("playing");
      expect(events).toEqual([]);
    }
  });

  it("does not add a torch warning to a terminal event", () => {
    const timeoutWorld = makeWorld();
    const timedOut = makeState(timeoutWorld);
    timedOut.turn = timeoutWorld.maxTurns - 1;
    expect(endTurn(timedOut, timeoutWorld)).toEqual(["You ran out of time."]);

    const diedWorld = makeWorld();
    const died = makeState(diedWorld);
    died.hp = 0;
    expect(endTurn(died, diedWorld)).toEqual(["You died."]);

    const wonWorld = makeWorld();
    const won = makeState(wonWorld);
    won.inventory.push("relic");
    won.currentRoomId = "treasure";
    expect(endTurn(won, wonWorld)).toEqual(["You won!"]);
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
    expect(result.rolls).toEqual([{ purpose: "trap", sides: 4, value: 3, target: 0, success: true, bonus: 0 }]);
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
    expect(result.rolls).toEqual([{ purpose: "trap", sides: 4, value: 1, target: 0, success: true, bonus: 0 }]);
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





describe("attempt", () => {
  // d20 from rng x: 1 + floor(x * 20). Base target 12.
  const roll20 = (value: number): number => (value - 0.5) / 20;

  it("pins targets: modified 9 (charm -3), 16 (charm +4), base 12 unmodified", () => {
    const world = makeWorld();
    world.enemies["goblin"]!.attemptModifiers = { charm: -3 };
    const state = makeState(world);
    const r1 = attempt(state, world, "goblin", "charm", "harm", "sing", seqRng([roll20(9), 0, 0]));
    expect(r1.rolls[0]).toMatchObject({ purpose: "attempt", value: 9, target: 9, success: true, result: "success" });

    const world3 = makeWorld();
    world3.enemies["goblin"]!.attemptModifiers = { charm: 4 };
    const state3 = makeState(world3);
    const r3 = attempt(state3, world3, "goblin", "charm", "harm", "plead", seqRng([roll20(15), 0, roll20(1)]));
    expect(r3.rolls[0]).toMatchObject({ target: 16, success: false, result: "partial" });

    const world4 = makeWorld();
    const state4 = makeState(world4);
    const r4 = attempt(state4, world4, "goblin", "force", "harm", "shove", seqRng([roll20(12), 0, 0]));
    expect(r4.rolls[0]).toMatchObject({ target: 12, result: "success" });
  });

  it("pins sunkenCrypt modifiers: goblin charm 9, bone troll wits 9, warden charm 16", async () => {
    const { sunkenCrypt } = await import("./worlds/sunkenCrypt.js");
    const mk = (roomId: string, enemyId: string, approach: "charm" | "wits") => {
      const w: World = structuredClone(sunkenCrypt);
      const s = makeState(w);
      s.currentRoomId = roomId;
      s.enemies[enemyId]!.hp = 50;
      return attempt(s, w, enemyId, approach, "distract", "try", seqRng([roll20(20)]));
    };
    expect(mk("goblin_den", "goblin", "charm").rolls[0]?.target).toBe(9);
    expect(mk("gate_hall", "bone_troll", "wits").rolls[0]?.target).toBe(9);
    expect(mk("ossuary", "crypt_warden", "charm").rolls[0]?.target).toBe(16);
  });

  it("success/partial/fail bands for harm; partial and fail counterattack", () => {
    const world = makeWorld();
    const s1 = makeState(world);
    const ok = attempt(s1, world, "goblin", "force", "harm", "lunge", seqRng([roll20(20), 0.99]));
    expect(ok.rolls.map((r) => r.purpose)).toEqual(["attempt", "attempt damage"]);
    expect(ok.rolls[1]).toMatchObject({ sides: 4, value: 4 });
    expect(s1.enemies["goblin"]!.hp).toBe(1);
    expect(s1.hp).toBe(10);
    expect(s1.turn).toBe(1);

    const s2 = makeState(world);
    const part = attempt(s2, world, "goblin", "force", "harm", "lunge", seqRng([roll20(10), 0, roll20(15)]));
    expect(part.rolls[0]).toMatchObject({ result: "partial", success: false });
    expect(s2.enemies["goblin"]!.hp).toBe(4);
    expect(s2.hp).toBe(8);
    expect(part.rolls.map((r) => r.purpose)).toEqual(["attempt", "attempt damage", "enemy attack"]);

    const s3 = makeState(world);
    const fail = attempt(s3, world, "goblin", "force", "harm", "lunge", seqRng([roll20(1), roll20(15)]));
    expect(fail.rolls[0]).toMatchObject({ result: "fail", success: false });
    expect(s3.enemies["goblin"]!.hp).toBe(5);
    expect(s3.hp).toBe(8);
    expect(s3.turn).toBe(1);
  });

  it("harm kill drops loot like attack and prevents counterattack", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.hp = 3;
    const result = attempt(state, world, "goblin", "force", "harm", "smash", seqRng([roll20(20), 0.99]));
    expect(state.enemies["goblin"]!.defeated).toBe(true);
    expect(state.rooms["entrance"]!.items).toContain("coin");
    expect(result.events.some((e) => e.includes("dropped"))).toBe(true);
    expect(result.rolls.map((r) => r.purpose)).toEqual(["attempt", "attempt damage"]);
    expect(state.hp).toBe(10);
  });


  it("pass sets sneaked and unblocks move; distract enables sneak's 9 target", () => {
    const world = makeWorld();
    const s1 = makeState(world);
    const r = attempt(s1, world, "north", "finesse", "pass", "roll past", seqRng([roll20(12)]));
    expect(r.ok).toBe(true);
    expect(s1.flags["sneaked:entrance"]).toBe(true);
    expect(move(s1, world, "north", seqRng([])).ok).toBe(true);
    expect(s1.currentRoomId).toBe("hallway");

    const s2 = makeState(world);
    expect(attempt(s2, world, "goblin", "wits", "distract", "juggle", seqRng([roll20(12)])).ok).toBe(true);
    expect(s2.flags["distracted:entrance:goblin"]).toBe(true);
    const sn = sneak(s2, world, "goblin", seqRng([roll20(9)]));
    expect(sn.rolls[0]).toMatchObject({ target: 9, success: true });
  });

  it("partial learn with no enemy still spends the turn, no counterattack", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.currentRoomId = "hallway";
    state.secrets.trap = { roomId: "hallway", direction: "north" };
    const r = attempt(state, world, "north", "wits", "learn", "inspect", seqRng([roll20(10)]));
    expect(r.rolls[0]).toMatchObject({ result: "partial" });
    expect(r.events).toContain("The north exit is dangerous.");
    expect(state.turn).toBe(1);
    expect(state.hp).toBe(10);
  });

  it("repetition adds +2 per prior attempt, per enemy+approach", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.enemies["goblin"]!.hp = 50;
    expect(attempt(state, world, "goblin", "force", "harm", "x", seqRng([roll20(1), roll20(1)])).rolls[0]?.target).toBe(12);
    expect(attempt(state, world, "goblin", "force", "harm", "x", seqRng([roll20(1), roll20(1)])).rolls[0]?.target).toBe(14);
    expect(attempt(state, world, "goblin", "force", "harm", "x", seqRng([roll20(1), roll20(1)])).rolls[0]?.target).toBe(16);
    expect(state.flags["attempted:goblin:force:3"]).toBe(true);
    expect(attempt(state, world, "goblin", "wits", "harm", "x", seqRng([roll20(1), roll20(1)])).rolls[0]?.target).toBe(12);
  });

  it("rejects invalid combos with state deep-equal and no turn cost", () => {
    const world = makeWorld();
    const cases: Array<[string, "harm" | "pass" | "distract" | "learn", string]> = [
      ["goblin", "learn", "entrance"],
      ["nowhere", "harm", "entrance"],
      ["up", "learn", "hallway"],
      ["north", "harm", "hallway"],
      ["goblin", "harm", "hallway"],
      ["room", "harm", "entrance"],
      ["room", "distract", "entrance"],
      ["east", "distract", "entrance"],
      ["up", "pass", "entrance"],
    ];
    for (const [target, intent, roomId] of cases) {
      const state = makeState(world);
      state.currentRoomId = roomId;
      const before = snapshot(state);
      expect(attempt(state, world, target, "wits", intent, "x", seqRng([])).ok).toBe(false);
      expect(state).toEqual(before);
    }
    const dead = makeState(world);
    dead.enemies["goblin"]!.defeated = true;
    const beforeDead = snapshot(dead);
    expect(attempt(dead, world, "goblin", "force", "harm", "x", seqRng([])).ok).toBe(false);
    expect(dead).toEqual(beforeDead);
    const over = makeState(world);
    over.status = "lost";
    const beforeOver = snapshot(over);
    expect(attempt(over, world, "goblin", "force", "harm", "x", seqRng([])).ok).toBe(false);
    expect(over).toEqual(beforeOver);
    const past = makeState(world);
    past.flags["sneaked:entrance"] = true;
    const beforePast = snapshot(past);
    expect(attempt(past, world, "goblin", "finesse", "pass", "x", seqRng([])).ok).toBe(false);
    expect(past).toEqual(beforePast);
  });


  it("learn hint truth property: matches secrets.trap exactly, never leaks relic", () => {
    const directions = ["north", "east", "south", "west"];
    for (const trapRoom of ["entrance", "hallway"]) {
      for (const trapDir of directions) {
        for (const askDir of directions) {
          const world = makeWorld();
          const room = world.rooms[trapRoom]!;
          if (!room.exits.some((e) => e.direction === askDir)) continue;
          const state = makeState(world);
          state.currentRoomId = trapRoom;
          state.secrets = { relicRoomId: "treasure", trap: { roomId: trapRoom, direction: trapDir } };
          const r = attempt(state, world, askDir, "wits", "learn", "look", seqRng([roll20(20)]));
          expect(r.ok).toBe(true);
          const expected = askDir === trapDir ? `The ${askDir} exit is dangerous.` : `Nothing dangerous lies ${askDir}.`;
          expect(r.events).toContain(expected);
          expect(r.events.join(" ")).not.toContain("treasure");
          expect(r.events.join(" ").toLowerCase()).not.toContain("relic");
        }
      }
    }
  });

  it("learn on room: omen verbatim; else ONE exit only — first unvisited, else first", () => {
    const world = makeWorld();
    const state = makeState(world);
    state.secrets.trap = { roomId: "entrance", direction: "east" };
    const r = attempt(state, world, "room", "wits", "learn", "study", seqRng([roll20(20)]));
    expect(r.events).toEqual(["Nothing dangerous lies north."]);

    const s2 = makeState(world);
    s2.secrets.trap = { roomId: "entrance", direction: "east" };
    s2.visitedRoomIds.push("hallway");
    expect(attempt(s2, world, "room", "wits", "learn", "study", seqRng([roll20(20)])).events)
      .toEqual(["The east exit is dangerous."]);

    const s3 = makeState(world);
    s3.secrets.trap = { roomId: "entrance", direction: "east" };
    s3.visitedRoomIds.push("hallway", "vault");
    expect(attempt(s3, world, "room", "wits", "learn", "study", seqRng([roll20(20)])).events)
      .toEqual(["Nothing dangerous lies north."]);

    const world4 = makeWorld();
    world4.rooms["entrance"]!.exits[1]!.omen = "Cold air seeps from the east.";
    const s4 = makeState(world4);
    s4.secrets.trap = { roomId: "entrance", direction: "east" };
    expect(attempt(s4, world4, "room", "wits", "learn", "study", seqRng([roll20(20)])).events)
      .toEqual(["Cold air seeps from the east."]);

    // Fail band gives no hint at all.
    const s5 = makeState(world);
    s5.secrets.trap = { roomId: "entrance", direction: "east" };
    const r5 = attempt(s5, world, "room", "wits", "learn", "study", seqRng([roll20(1), roll20(1)]));
    expect(r5.rolls[0]).toMatchObject({ result: "fail" });
    expect(r5.events.join(" ")).not.toContain("dangerous");
  });
});

