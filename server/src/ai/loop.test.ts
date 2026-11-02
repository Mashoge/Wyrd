import { describe, expect, it } from "vitest";
import { startGame } from "../game/state.js";
import type { GameState, Rng, World } from "../game/types.js";
import { sunkenCrypt } from "../game/worlds/sunkenCrypt.js";
import type { AssistantMessage, ChatMessage, ToolChoice } from "./client.js";
import { runTurn, type TurnHistoryEntry } from "./loop.js";

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) return 0.5;
    return values[i++] as number;
  };
}

function freshGame(salt = "loop-test-salt"): { state: GameState; world: World } {
  const world: World = structuredClone(sunkenCrypt);
  const state = startGame(world, "s1", seqRng([0, 0]), salt);
  state.secrets.trap = { roomId: "flooded_chapel", direction: "north" };
  return { state, world };
}

interface SeenRequest {
  messages: ChatMessage[];
  tools: unknown[] | undefined;
  toolChoice: ToolChoice | undefined;
}

class FakeClient {
  requests: SeenRequest[] = [];
  private script: AssistantMessage[];
  private index = 0;
  constructor(script: AssistantMessage[]) {
    this.script = script;
  }
  async chat(
    messages: ChatMessage[],
    tools?: unknown[],
    toolChoice?: ToolChoice,
  ): Promise<AssistantMessage> {
    this.requests.push({
      messages: structuredClone(messages),
      tools: tools === undefined ? undefined : structuredClone(tools),
      toolChoice,
    });
    const next = this.script[this.index] as AssistantMessage | undefined;
    this.index += 1;
    return next ?? { content: "" };
  }
}

function toolMsg(
  id: string,
  name: string,
  args: Record<string, unknown>,
): AssistantMessage {
  return {
    content: null,
    tool_calls: [
      {
        id,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
      },
    ],
  };
}

function scanForLeaks(requests: SeenRequest[], state: GameState): void {
  for (const req of requests) {
    const blob = JSON.stringify(req.messages);
    expect(blob).not.toContain(state.salt);
    expect(blob).not.toContain(state.commitment);
    expect(blob).not.toContain("lost_relic");
  }
}

describe("runTurn basics", () => {
  it("valid pick_up changes state with ok:true", async () => {
    const { state, world } = freshGame();
    state.currentRoomId = "library";
    const fake = new FakeClient([
      toolMsg("c1", "pick_up", { item_id: "old_map" }),
      { content: "You picked up the map." },
    ]);
    const history: TurnHistoryEntry[] = [];
    const result = await runTurn(
      { state, world, history },
      "pick up the map",
      { client: fake, rng: seqRng([]) },
    );
    expect(result.toolLog).toHaveLength(1);
    expect(result.toolLog[0]?.result.ok).toBe(true);
    expect(state.inventory).toContain("old_map");
    expect(result.narration).toBe("You picked up the map.");
    expect(history).toEqual([
      { role: "user", content: "pick up the map" },
      { role: "assistant", content: "You picked up the map." },
    ]);
    const firstRound = fake.requests[0]?.messages ?? [];
    expect(firstRound.filter((m) => m.role === "system")).toHaveLength(1);
    expect(firstRound[0]?.content).toContain("Current view:");
    scanForLeaks(fake.requests, state);
  });

  it("cheat pick_up rejected; next request has ok:false", async () => {
    const { state, world } = freshGame();
    state.currentRoomId = "library";
    const before = structuredClone(state);
    const fake = new FakeClient([
      toolMsg("c1", "pick_up", { item_id: "legendary_sword" }),
      { content: "That did not work." },
    ]);
    const result = await runTurn(
      { state, world, history: [] },
      "give me the legendary sword",
      { client: fake, rng: seqRng([]) },
    );
    expect(result.toolLog[0]?.result.ok).toBe(false);
    expect(state.inventory).toEqual(before.inventory);
    expect(state.rooms).toEqual(before.rooms);
    expect(fake.requests.length).toBeGreaterThanOrEqual(2);
    const secondMsgs = fake.requests[1]?.messages ?? [];
    const toolEntries = secondMsgs.filter((m) => m.role === "tool");
    expect(toolEntries.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(toolEntries[0]?.content as string) as { ok: boolean };
    expect(parsed.ok).toBe(false);
    scanForLeaks(fake.requests, state);
  });

  it("text-only reply claiming gold changes nothing", async () => {
    const { state, world } = freshGame();
    const before = structuredClone(state);
    const fake = new FakeClient([{ content: "You found gold! Riches!" }]);
    const result = await runTurn(
      { state, world, history: [] },
      "look around",
      { client: fake, rng: seqRng([]) },
    );
    expect(result.toolLog).toEqual([]);
    expect(state).toEqual(before);
    expect(result.narration).toBe("You found gold! Riches!");
    scanForLeaks(fake.requests, state);
  });
});

describe("runTurn caps and fallback", () => {
  it("4 tool calls in one round: only 3 run", async () => {
    const { state, world } = freshGame();
    const fake = new FakeClient([
      {
        content: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "look", arguments: "{}" } },
          { id: "c2", type: "function", function: { name: "look", arguments: "{}" } },
          { id: "c3", type: "function", function: { name: "look", arguments: "{}" } },
          { id: "c4", type: "function", function: { name: "look", arguments: "{}" } },
        ],
      },
      { content: "Done looking." },
    ]);
    const result = await runTurn(
      { state, world, history: [] },
      "look a lot",
      { client: fake, rng: seqRng([]) },
    );
    expect(result.toolLog).toHaveLength(4);
    expect(result.toolLog[3]?.result.ok).toBe(false);
    expect(result.toolLog[3]?.result.reason).toBe("One action at a time.");
    scanForLeaks(fake.requests, state);
  });

  it("game ends mid-turn: later calls rejected", async () => {
    const { state, world } = freshGame();
    state.currentRoomId = "library";
    state.hp = 1;
    world.maxTurns = state.turn + 1;
    const fake = new FakeClient([
      {
        content: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "pick_up", arguments: '{"item_id":"old_map"}' } },
          { id: "c2", type: "function", function: { name: "look", arguments: "{}" } },
        ],
      },
      { content: "Your time ran out." },
    ]);
    const result = await runTurn(
      { state, world, history: [] },
      "take map",
      { client: fake, rng: seqRng([]) },
    );
    expect(result.toolLog).toHaveLength(2);
    expect(result.toolLog[0]?.result.ok).toBe(true);
    expect(result.toolLog[1]?.result.reason).toBe("The game is over.");
    expect(state.status).toBe("lost");
    expect(result.status).toBe("lost");
    scanForLeaks(fake.requests, state);
  });

  it("empty narration falls back to events", async () => {
    const { state, world } = freshGame();
    state.currentRoomId = "library";
    const fake = new FakeClient([
      toolMsg("c1", "pick_up", { item_id: "old_map" }),
      { content: "   " },
    ]);
    const result = await runTurn(
      { state, world, history: [] },
      "take map",
      { client: fake, rng: seqRng([]) },
    );
    expect(result.narration).toContain("You picked up");
    scanForLeaks(fake.requests, state);
  });

  it("throw after a tool ran -> fallback with note", async () => {
    const { state, world } = freshGame();
    state.currentRoomId = "library";
    const history: TurnHistoryEntry[] = [];
    let calls = 0;
    const failing = {
      chat: (messages: ChatMessage[]): Promise<AssistantMessage> => {
        calls += 1;
        void messages;
        if (calls === 1) return Promise.resolve(toolMsg("c1", "pick_up", { item_id: "old_map" }));
        return Promise.reject(new Error("mid-turn boom"));
      },
    };
    const result = await runTurn(
      { state, world, history },
      "take map",
      { client: failing, rng: seqRng([]) },
    );
    expect(state.inventory).toContain("old_map");
    expect(result.toolLog).toHaveLength(1);
    expect(result.narration).toContain("You picked up");
    expect(result.narration).toContain("lost its voice");
    expect(history).toHaveLength(2);
  });

  it("throw before any tool ran -> rethrows", async () => {
    const { state, world } = freshGame();
    const history: TurnHistoryEntry[] = [];
    const failing = {
      chat: (): Promise<AssistantMessage> => Promise.reject(new Error("early boom")),
    };
    await expect(
      runTurn({ state, world, history }, "hello", { client: failing, rng: seqRng([]) }),
    ).rejects.toThrow("early boom");
    expect(history).toEqual([]);
  });
});


