import { describe, expect, it } from "vitest";
import { validateWorld } from "./validate.js";
import type { World } from "./types.js";
import { sunkenCrypt } from "./worlds/sunkenCrypt.js";

function clone(): World {
  return structuredClone(sunkenCrypt);
}

describe("validateWorld", () => {
  it("accepts sunkenCrypt as valid", () => {
    expect(validateWorld(sunkenCrypt)).toEqual([]);
  });

  it("rejects a broken exit target", () => {
    const w = clone();
    w.rooms["hall"]!.exits[0].to = "nowhere";
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("nowhere"))).toBe(true);
  });

  it("rejects a missing start room", () => {
    const w = clone();
    w.startRoomId = "nowhere";
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("startRoomId"))).toBe(true);
  });

  it("rejects a missing exit room", () => {
    const w = clone();
    w.exitRoomId = "nowhere";
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("exitRoomId"))).toBe(true);
  });

  it("rejects startRoomId equal to exitRoomId", () => {
    const w = clone();
    w.startRoomId = w.exitRoomId;
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("must not be the same"))).toBe(true);
  });

  it("rejects a room id key mismatch", () => {
    const w = clone();
    w.rooms["hall"]!.id = "wrong";
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes('Room key "hall"'))).toBe(true);
  });

  it("rejects an item id key mismatch", () => {
    const w = clone();
    w.items["iron_key"]!.id = "wrong";
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes('Item key "iron_key"'))).toBe(true);
  });

  it("rejects an enemy id key mismatch", () => {
    const w = clone();
    w.enemies["goblin"]!.id = "wrong";
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes('Enemy key "goblin"'))).toBe(true);
  });

  it("rejects a missing room item", () => {
    const w = clone();
    w.rooms["library"]!.items.push("ghost_item");
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("ghost_item"))).toBe(true);
  });

  it("rejects missing enemy loot", () => {
    const w = clone();
    w.enemies["goblin"]!.loot.push("ghost_loot");
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("ghost_loot"))).toBe(true);
  });

  it("rejects missing keyItemId", () => {
    const w = clone();
    w.rooms["gate_hall"]!.exits[1].keyItemId = "ghost_key";
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("ghost_key"))).toBe(true);
  });

  it("rejects missing relicItemId", () => {
    const w = clone();
    w.relicItemId = "ghost_relic";
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("ghost_relic"))).toBe(true);
  });

  it("rejects a missing room enemyId", () => {
    const w = clone();
    w.rooms["hall"]!.enemyId = "ghost_enemy";
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("ghost_enemy"))).toBe(true);
  });

  it("rejects alertness 25", () => {
    const w = clone();
    w.enemies["goblin"]!.alertness = 25;
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("alertness"))).toBe(true);
  });

  it("rejects maxTurns 0", () => {
    const w = clone();
    w.maxTurns = 0;
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("maxTurns"))).toBe(true);
  });

  it("rejects an unnormalized exit direction", () => {
    const w = clone();
    w.rooms["hall"]!.exits[0].direction = " North ";
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("trim().toLowerCase()"))).toBe(true);
  });

  it("rejects duplicate exit directions", () => {
    const w = clone();
    w.rooms["hall"]!.exits.push({ direction: "north", to: "entrance" });
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("rejects the relic pre-placed in a room", () => {
    const w = clone();
    w.rooms["library"]!.items.push("lost_relic");
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("already placed"))).toBe(true);
  });

  it("rejects the relic in enemy loot", () => {
    const w = clone();
    w.enemies["goblin"]!.loot.push("lost_relic");
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("loot"))).toBe(true);
  });

  it("rejects a missing relic candidate room", () => {
    const w = clone();
    w.relicCandidateRoomIds.push("nowhere");
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("nowhere"))).toBe(true);
  });

  it("rejects a relic candidate that is the exit room", () => {
    const w = clone();
    w.relicCandidateRoomIds.push("exit_gate");
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("must not be the exit room"))).toBe(true);
  });

  it("rejects a trap candidate with a missing room", () => {
    const w = clone();
    w.trapCandidates.push({ roomId: "nowhere", direction: "north" });
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("nowhere"))).toBe(true);
  });

  it("rejects a trap candidate pointing at no exit", () => {
    const w = clone();
    w.trapCandidates.push({ roomId: "hall", direction: "up" });
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("does not point at a real exit"))).toBe(true);
  });

  it("rejects an unnormalized trap candidate direction", () => {
    const w = clone();
    w.rooms["hall"]!.exits.push({ direction: "up", to: "entrance" });
    w.trapCandidates.push({ roomId: "hall", direction: " Up " });
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("trim().toLowerCase()"))).toBe(true);
  });

  it("rejects an unreachable relic candidate", () => {
    const w = clone();
    // Sever library from the map: nothing leads north anymore.
    w.rooms["flooded_chapel"]!.exits = [{ direction: "east", to: "hall" }];
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes('Relic candidate room "library" is unreachable'))).toBe(
      true,
    );
  });

  it("rejects an unreachable exit room", () => {
    const w = clone();
    w.rooms["gate_hall"]!.exits = [{ direction: "south", to: "goblin_den" }];
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes('Exit room "exit_gate" is unreachable'))).toBe(true);
  });

  it("rejects a key locked behind its own door", () => {
    const w = clone();
    // iron_key is only obtainable inside exit_gate, behind the iron_key door.
    w.enemies["goblin"]!.loot = [];
    w.rooms["exit_gate"]!.items = ["iron_key"];
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes('Exit room "exit_gate" is unreachable'))).toBe(true);
  });

  it("rejects a relic candidate with no path back to the exit", () => {
    const w = clone();
    // Ossuary is still reachable from the start, but nothing leads out of it.
    w.rooms["ossuary"]!.exits = [];
    const errors = validateWorld(w);
    expect(
      errors.some((e) =>
        e.includes('Relic candidate "ossuary" has no path to the exit'),
      ),
    ).toBe(true);
  });

  it("rejects empty relicCandidateRoomIds", () => {
    const w = clone();
    w.relicCandidateRoomIds = [];
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("must not be empty"))).toBe(true);
  });

  it("rejects a locked exit with no keyItemId", () => {
    const w = clone();
    delete w.rooms["gate_hall"]!.exits[1].keyItemId;
    const errors = validateWorld(w);
    expect(errors.some((e) => e.includes("has no keyItemId"))).toBe(true);
  });

  it("rejects an enemy used by more than one room", () => {
    const w = clone();
    w.rooms["hall"]!.enemyId = "goblin";
    const errors = validateWorld(w);
    expect(
      errors.some((e) => e.includes('Enemy "goblin" is used by more than one room')),
    ).toBe(true);
  });

  it("rejects an item placed more than once", () => {
    const w = clone();
    w.rooms["entrance"]!.items = ["silver_coin"];
    const errors = validateWorld(w);
    expect(
      errors.some((e) => e.includes('Item "silver_coin" appears more than once')),
    ).toBe(true);
  });
});
