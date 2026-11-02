import { describe, expect, it } from "vitest";
import { attack, move, pickUp, sneak, useItem } from "../game/rules.js";
import { startGame } from "../game/state.js";
import type { GameState, Rng, World } from "../game/types.js";
import { sunkenCrypt } from "../game/worlds/sunkenCrypt.js";
import { TOOL_DEFINITIONS, executeTool } from "./tools.js";

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) throw new Error("seqRng exhausted.");
    return values[i++] as number;
  };
}

function freshGame(): { state: GameState; world: World } {
  const world: World = structuredClone(sunkenCrypt);
  const state = startGame(world, "s1", seqRng([0, 0]), "salt-for-tools");
  return { state, world };
}

function snapshot(state: GameState): GameState {
  return structuredClone(state);
}

describe("TOOL_DEFINITIONS", () => {
  it("exposes six tools with plain string params and no endTurn", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.function.name).sort();
    expect(names).toEqual(["attack", "look", "move", "pick_up", "sneak", "use_item"]);
    const blob = JSON.stringify(TOOL_DEFINITIONS);
    expect(blob).not.toContain("endTurn");
    expect(blob).not.toContain("end_turn");
    expect(blob).not.toContain('"enum"');
  });
});

describe("executeTool dispatch", () => {
  it("move dispatches to rules.move", () => {
    const { state, world } = freshGame();
    state.secrets.trap = { roomId: "flooded_chapel", direction: "north" };
    const direct = structuredClone(state);
    const expected = move(direct, world, "north", seqRng([]));
    const result = executeTool(state, world, "move", '{"direction":"north"}', seqRng([]));
    expect(result).toEqual(expected);
    expect(state.currentRoomId).toBe("hall");
  });

  it("pick_up dispatches and rejects unknown items visibly", () => {
    const { state, world } = freshGame();
    state.currentRoomId = "goblin_den";
    state.enemies["goblin"]!.defeated = true;
    const result = executeTool(state, world, "pick_up", '{"item_id":"silver_coin"}', seqRng([]));
    expect(result.ok).toBe(true);
    expect(state.inventory).toContain("silver_coin");
    const before = snapshot(state);
    const bad = executeTool(state, world, "pick_up", '{"item_id":"legendary_sword"}', seqRng([]));
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBeDefined();
    expect(state).toEqual(before);
  });

  it("use_item dispatches to rules.useItem", () => {
    const { state, world } = freshGame();
    const direct = structuredClone(state);
    direct.inventory.push("iron_key");
    direct.currentRoomId = "gate_hall";
    const expected = useItem(direct, world, "iron_key", "north");
    state.inventory.push("iron_key");
    state.currentRoomId = "gate_hall";
    const result = executeTool(state, world, "use_item", '{"item_id":"iron_key","direction":"north"}', seqRng([]));
    expect(result).toEqual(expected);
    expect(result.ok).toBe(true);
  });
});


describe("executeTool more dispatch", () => {
  it("attack and sneak dispatch to rules", () => {
    const a = freshGame();
    a.state.currentRoomId = "goblin_den";
    const directA = structuredClone(a.state);
    const expectedA = attack(directA, a.world, "goblin", seqRng([0.99, 0.0, 0.0]));
    const resultA = executeTool(a.state, a.world, "attack", '{"enemy_id":"goblin"}', seqRng([0.99, 0.0, 0.0]));
    expect(resultA).toEqual(expectedA);
    const s = freshGame();
    s.state.currentRoomId = "goblin_den";
    const directS = structuredClone(s.state);
    const expectedS = sneak(directS, s.world, "goblin", seqRng([0.99]));
    const resultS = executeTool(s.state, s.world, "sneak", '{"enemy_id":"goblin"}', seqRng([0.99]));
    expect(resultS).toEqual(expectedS);
  });

  it("pickUp via tool matches direct pickUp", () => {
    const { state, world } = freshGame();
    state.currentRoomId = "library";
    const direct = structuredClone(state);
    const expected = pickUp(direct, world, "old_map", seqRng([]));
    const result = executeTool(state, world, "pick_up", '{"item_id":"old_map"}', seqRng([]));
    expect(result).toEqual(expected);
  });
});

describe("executeTool validation", () => {
  it("rejects unknown tools with state unchanged", () => {
    const { state, world } = freshGame();
    const before = snapshot(state);
    const result = executeTool(state, world, "dance", "{}", seqRng([]));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Unknown action dance.");
    expect(state).toEqual(before);
  });

  it("never reaches endTurn", () => {
    const { state, world } = freshGame();
    const before = snapshot(state);
    for (const name of ["endTurn", "end_turn", "end"]) {
      const result = executeTool(state, world, name, "{}", seqRng([]));
      expect(result.ok).toBe(false);
      expect(result.reason).toBe(`Unknown action ${name}.`);
    }
    expect(state).toEqual(before);
  });

  it("rejects malformed JSON with state unchanged", () => {
    const { state, world } = freshGame();
    const before = snapshot(state);
    const result = executeTool(state, world, "move", "{not json", seqRng([]));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/malformed/i);
    expect(state).toEqual(before);
  });
});

describe("executeTool arg validation and look", () => {
  it("rejects missing, non-string and empty args", () => {
    const { state, world } = freshGame();
    const cases: Array<[string, string]> = [
      ["move", "{}"],
      ["move", '{"direction":123}'],
      ["move", '{"direction":"   "}'],
      ["pick_up", "{}"],
      ["pick_up", '{"item_id":null}'],
      ["use_item", '{"item_id":"iron_key"}'],
      ["attack", '{"enemy_id":""}'],
      ["sneak", '{"enemy_id":42}'],
      ["move", "[]"],
    ];
    for (const [name, raw] of cases) {
      const before = snapshot(state);
      const result = executeTool(state, world, name, raw, seqRng([]));
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/Invalid arguments/);
      expect(state).toEqual(before);
    }
  });

  it("look returns one event without changing state or turn", () => {
    const { state, world } = freshGame();
    const before = snapshot(state);
    const result = executeTool(state, world, "look", "{}", seqRng([]));
    expect(result.ok).toBe(true);
    expect(result.action).toBe("look");
    expect(result.events).toHaveLength(1);
    expect(result.rolls).toEqual([]);
    expect(result.events[0]).toContain("Crypt Entrance");
    expect(state).toEqual(before);
    expect(state.turn).toBe(before.turn);
  });
});

