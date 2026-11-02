import { describe, expect, it } from "vitest";
import type { DiceRoll, ToolLogEntry } from "./api";
import { formatRoll, hasRelic, hearts, shortCommit, threadFraction, toolToPlain, turnsLeft } from "./format";

function roll(partial: Partial<DiceRoll> & { purpose: string }): DiceRoll {
  return {
    sides: 20, value: 10, target: 10, success: true, bonus: 0, ...partial,
  };
}

function entry(name: string, args: Record<string, unknown>, ok: boolean, reason?: string): ToolLogEntry {
  return { name, args, result: { ok, action: name, reason, rolls: [], events: [] } };
}

describe("formatRoll", () => {
  it("formats attack hits and misses with their target", () => {
    expect(formatRoll(roll({ purpose: "player attack", value: 17, target: 9, success: true }))).toBe(
      "Attack roll 17 · needed 9+ → hit",
    );
    expect(formatRoll(roll({ purpose: "player attack", value: 3, target: 9, success: false }))).toBe(
      "Attack roll 3 · needed 9+ → miss",
    );
  });

  it("formats damage with its bonus maths", () => {
    expect(formatRoll(roll({ purpose: "player damage", value: 3, target: 0, bonus: 2 }))).toBe("Damage 3 + 2 = 5");
    expect(formatRoll(roll({ purpose: "player damage", value: 4, target: 0, bonus: 0 }))).toBe("Damage 4");
  });

  it("formats enemy attacks, sneak, grab and traps", () => {
    expect(formatRoll(roll({ purpose: "enemy attack", value: 15, target: 12, success: true }))).toBe(
      "Enemy attack 15 · needed 12+ → it hits you",
    );
    expect(formatRoll(roll({ purpose: "enemy attack", value: 5, target: 12, success: false }))).toBe(
      "Enemy attack 5 · needed 12+ → it misses",
    );
    expect(formatRoll(roll({ purpose: "sneak", value: 17, target: 13, success: true }))).toBe(
      "Sneak roll 17 · needed 13+ → success",
    );
    expect(formatRoll(roll({ purpose: "grab", value: 4, target: 9, success: false }))).toBe(
      "Grab roll 4 · needed 9+ → fail",
    );
    expect(formatRoll(roll({ purpose: "trap", value: 3, target: 0 }))).toBe("Trap 3 damage");
  });
});

describe("toolToPlain", () => {
  it("turns accepted calls into plain words", () => {
    expect(toolToPlain(entry("pick_up", { item_id: "silver_coin" }, true)).label).toBe("Took the Silver Coin");
    expect(toolToPlain(entry("attack", { enemy_id: "goblin" }, true)).label).toBe("Struck the Goblin");
    expect(toolToPlain(entry("move", { direction: "north" }, true)).label).toBe("Moved north");
    expect(toolToPlain(entry("sneak", { enemy_id: "goblin" }, true)).label).toBe("Sneaked past the Goblin");
    expect(toolToPlain(entry("look", {}, true)).label).toBe("Looked around");
  });

  it("keeps the claim struck through with a REFUSED reason", () => {
    const plain = toolToPlain(entry("pick_up", { item_id: "legendary_sword" }, false, "There is none here."));
    expect(plain.accepted).toBe(false);
    expect(plain.label).toBe("Took the Legendary Sword");
    expect(plain.detail).toBe("There is none here.");
  });
});

describe("hearts and thread maths", () => {
  it("fills hearts from hp/maxHp and clamps edges", () => {
    expect(hearts(8, 10)).toEqual([true, true, true, true, true, true, true, true, false, false]);
    expect(hearts(0, 3)).toEqual([false, false, false]);
    expect(hearts(99, 2)).toEqual([true, true]);
    expect(hearts(-4, 2)).toEqual([false, false]);
    expect(hearts(2, 0)).toEqual([]);
  });

  it("counts turns left and the thread fraction", () => {
    expect(turnsLeft({ turn: 19, maxTurns: 40 })).toBe(21);
    expect(turnsLeft({ turn: 40, maxTurns: 40 })).toBe(0);
    expect(turnsLeft({ turn: 99, maxTurns: 40 })).toBe(0);
    expect(threadFraction({ turn: 0, maxTurns: 40 })).toBe(1);
    expect(threadFraction({ turn: 19, maxTurns: 40 })).toBeCloseTo(0.525);
    expect(threadFraction({ turn: 40, maxTurns: 40 })).toBe(0);
  });

  it("shortens the commitment and spots the relic", () => {
    expect(shortCommit("5666eaXXXX7b36e")).toBe("5666ea…7b36e");
    expect(hasRelic([{ id: "lost_relic", name: "Lost Relic" }])).toBe(true);
    expect(hasRelic([{ id: "silver_coin", name: "Silver Coin" }])).toBe(false);
    expect(hasRelic([])).toBe(false);
  });
});
