import { afterEach, describe, expect, it, vi } from "vitest";
import { playTurn } from "./api";

function turnBody(rolls: unknown[]): Record<string, unknown> {
  return {
    narration: "You try something clever.",
    toolLog: [
      {
        name: "attempt",
        args: { target: "goblin", approach: "charm", intent: "distract", description: "sing" },
        result: { ok: true, action: "attempt", rolls, events: ["The Goblin is distracted."] },
      },
    ],
    view: {
      room: { id: "goblin_den", name: "Goblin Den", description: "A damp den." },
      exits: [],
      items: [],
      enemy: null,
      player: { hp: 10, maxHp: 10, inventory: [], turn: 1, maxTurns: 40, status: "playing" },
    },
    status: "playing",
    suggestions: [],
    map: { rooms: [], links: [], unexplored: [] },
    meta: { model: "test-model", rounds: 1, toolCalls: 1, ms: 12 },
  };
}

const baseRoll = {
  purpose: "attempt",
  sides: 20,
  value: 15,
  target: 13,
  success: true,
  bonus: 0,
};

function stubFetch(body: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> => ({
        ok: true,
        status: 200,
        json: async () => body,
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DiceRoll result parsing (via playTurn)", () => {
  it.each(["success", "partial", "fail"] as const)("keeps result \"%s\" on the parsed roll", async (result) => {
    stubFetch(turnBody([{ ...baseRoll, result }]));
    const res = await playTurn("game-1", "sing to the goblin");
    expect(res.toolLog[0]?.result.rolls[0]).toEqual({ ...baseRoll, result });
  });

  it("omits result when the server did not send it", async () => {
    stubFetch(turnBody([{ ...baseRoll }]));
    const res = await playTurn("game-1", "sing to the goblin");
    const roll = res.toolLog[0]?.result.rolls[0];
    expect(roll).toEqual(baseRoll);
    expect(roll).not.toHaveProperty("result");
  });

  it.each([["unknown word", "great"], ["number", 3], ["boolean", true], ["null", null]] as const)(
    "ignores result when it is a %s",
    async (_label, result) => {
      stubFetch(turnBody([{ ...baseRoll, result }]));
      const res = await playTurn("game-1", "sing to the goblin");
      const roll = res.toolLog[0]?.result.rolls[0];
      expect(roll).toEqual(baseRoll);
      expect(roll).not.toHaveProperty("result");
    },
  );

  it("keeps valid results on some rolls while others stay plain", async () => {
    stubFetch(
      turnBody([
        { ...baseRoll, result: "partial" },
        { purpose: "attempt damage", sides: 4, value: 3, target: 0, success: true, bonus: 0 },
      ]),
    );
    const res = await playTurn("game-1", "sing to the goblin");
    const rolls = res.toolLog[0]?.result.rolls;
    expect(rolls).toHaveLength(2);
    expect(rolls?.[0]?.result).toBe("partial");
    expect(rolls?.[1]).not.toHaveProperty("result");
  });
});
