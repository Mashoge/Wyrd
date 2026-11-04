import { describe, expect, it } from "vitest";
import { attempt, attack, examine, move, pickUp, sneak, throwItem, useItem } from "../game/rules.js";
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
  it("exposes nine tools with plain string params and no endTurn", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.function.name).sort();
    expect(names).toEqual(["attack", "attempt", "examine", "look", "move", "pick_up", "sneak", "throw", "use_item"]);
    const attemptDef = TOOL_DEFINITIONS.find((t) => t.function.name === "attempt");
    expect(attemptDef?.function.parameters.required).toEqual(["target", "approach", "intent", "description"]);
    expect(attemptDef?.function.parameters.additionalProperties).toBe(false);
    expect(attemptDef?.function.description).toContain("no other tool covers");
    const attackDef = TOOL_DEFINITIONS.find((t) => t.function.name === "attack");
    expect(attackDef?.function.parameters.required).toEqual(["enemy_id"]);
    expect(Object.keys(attackDef?.function.parameters.properties ?? {})).toContain("weapon_id");
    expect(attackDef?.function.description).toContain("weapon");
    const throwDef = TOOL_DEFINITIONS.find((t) => t.function.name === "throw");
    expect(throwDef?.function.parameters.required).toEqual(["item_id", "enemy_id"]);
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

  it("use_item without direction heals a consumable", () => {
    const { state, world } = freshGame();
    state.hp = 6;
    state.inventory.push("healing_draught");
    const direct = structuredClone(state);
    const expected = useItem(direct, world, "healing_draught");
    const result = executeTool(state, world, "use_item", '{"item_id":"healing_draught"}', seqRng([]));
    expect(result).toEqual(expected);
    expect(result.ok).toBe(true);
    expect(state.hp).toBe(10);
  });

  it("examine dispatches without changing state", () => {
    const { state, world } = freshGame();
    const direct = structuredClone(state);
    const expected = examine(direct, world, "rusty_dagger");
    const before = snapshot(state);
    const result = executeTool(state, world, "examine", '{"item_id":"rusty_dagger"}', seqRng([]));
    expect(result).toEqual(expected);
    expect(result.ok).toBe(true);
    expect(state).toEqual(before);
    const bad = executeTool(state, world, "examine", '{"item_id":"nope"}', seqRng([]));
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe("You don't see any nope here.");
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

  it("attack with weapon_id dispatches to rules.attack with that weapon", () => {
    const { state, world } = freshGame();
    state.currentRoomId = "goblin_den";
    state.inventory.push("rusty_dagger", "thigh_bone");
    const direct = structuredClone(state);
    const expected = attack(direct, world, "goblin", seqRng([0.99, 0.0, 0.0]), "thigh_bone");
    const result = executeTool(state, world, "attack", '{"enemy_id":"goblin","weapon_id":"thigh_bone"}', seqRng([0.99, 0.0, 0.0]));
    expect(result).toEqual(expected);
    expect(result.events[0]).toBe("You strike with the Thigh Bone.");
  });

  it("throw dispatches to rules.throwItem and rejects invalid args", () => {
    const { state, world } = freshGame();
    state.currentRoomId = "goblin_den";
    state.inventory.push("silver_coin");
    const direct = structuredClone(state);
    const expected = throwItem(direct, world, "silver_coin", "goblin");
    const result = executeTool(state, world, "throw", '{"item_id":"silver_coin","enemy_id":"goblin"}', seqRng([]));
    expect(result).toEqual(expected);
    expect(result.ok).toBe(true);
    expect(state.flags["sneaked:goblin_den"]).toBe(true);
    const before = snapshot(state);
    for (const raw of ["{}", '{"item_id":"silver_coin"}', '{"enemy_id":"goblin"}', '{"item_id":7,"enemy_id":"goblin"}']) {
      const bad = executeTool(state, world, "throw", raw, seqRng([]));
      expect(bad.ok).toBe(false);
      expect(bad.reason).toMatch(/Invalid arguments/);
    }
    expect(state).toEqual(before);
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
      ["examine", "{}"],
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


describe("executeTool attempt", () => {
  it("dispatches to rules.attempt exactly", () => {
    const { state, world } = freshGame();
    state.currentRoomId = "goblin_den";
    const direct = structuredClone(state);
    const expected = attempt(direct, world, "goblin", "charm", "distract", "flatter it", seqRng([0.99]));
    const result = executeTool(
      state, world, "attempt",
      '{"target":"goblin","approach":"charm","intent":"distract","description":"flatter it"}',
      seqRng([0.99]),
    );
    expect(result).toEqual(expected);
    expect(result.rolls[0]).toMatchObject({ purpose: "attempt", target: 9, result: "success" });
    expect(state.flags["distracted:goblin_den:goblin"]).toBe(true);
  });

  it("ignores injected difficulty/outcome/extra args — target is engine-computed", () => {
    const { state, world } = freshGame();
    state.currentRoomId = "goblin_den";
    const result = executeTool(
      state, world, "attempt",
      '{"target":"goblin","approach":"charm","intent":"distract","description":"x","difficulty":1,"outcome":"success","target_number":1}',
      seqRng([0.99]),
    );
    expect(result.ok).toBe(true);
    expect(result.rolls[0]?.target).toBe(9);
  });

  it("rejects malformed attempt args without state change", () => {
    const { state, world } = freshGame();
    state.currentRoomId = "goblin_den";
    const raws = [
      "{}",
      '{"target":"goblin","approach":"luck","intent":"distract","description":"x"}',
      '{"target":"goblin","approach":"charm","intent":"kill","description":"x"}',
      '{"target":"goblin","approach":"charm","intent":"distract"}',
      '{"target":7,"approach":"charm","intent":"distract","description":"x"}',
      '{"target":"goblin","approach":"charm","intent":"distract","description":"  "}',
    ];
    for (const raw of raws) {
      const before = snapshot(state);
      const bad = executeTool(state, world, "attempt", raw, seqRng([]));
      expect(bad.ok).toBe(false);
      expect(bad.reason).toMatch(/Invalid arguments/);
      expect(state).toEqual(before);
    }
  });
});

