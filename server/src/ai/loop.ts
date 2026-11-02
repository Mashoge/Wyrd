import type {
  GameState,
  GameStatus,
  Rng,
  ToolResult,
  World,
} from "../game/types.js";
import type { AssistantMessage, ChatMessage, ToolChoice } from "./client.js";
import { GAME_MASTER_PROMPT } from "./prompt.js";
import { TOOL_DEFINITIONS, executeTool } from "./tools.js";
import { playerView, type PlayerView } from "./view.js";

export interface TurnHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface TurnSession {
  state: GameState;
  world: World;
  history: TurnHistoryEntry[];
}

export interface TurnClient {
  chat(
    messages: ChatMessage[],
    tools?: unknown[],
    toolChoice?: ToolChoice,
  ): Promise<AssistantMessage>;
}

export interface TurnDeps {
  client: TurnClient;
  rng: Rng;
}

export interface ToolLogEntry {
  name: string;
  args: Record<string, unknown>;
  result: ToolResult;
}

export interface TurnResult {
  narration: string;
  toolLog: ToolLogEntry[];
  view: PlayerView;
  status: GameStatus;
}

const MAX_ROUNDS = 3;
const MAX_TOOL_CALLS = 3;

function parseArgsObject(rawArgs: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs) as unknown;
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

function capResult(name: string): ToolResult {
  return {
    ok: false,
    action: name,
    reason: "One action at a time.",
    rolls: [],
    events: [],
  };
}

function gameOverResult(name: string): ToolResult {
  return {
    ok: false,
    action: name,
    reason: "The game is over.",
    rolls: [],
    events: [],
  };
}

export async function runTurn(
  session: TurnSession,
  playerText: string,
  deps: TurnDeps,
): Promise<TurnResult> {
  const { state, world } = session;
  const toolLog: ToolLogEntry[] = [];
  const allEvents: string[] = [];
  let totalCalls = 0;

  const openingView = playerView(state, world);
  const conversation: ChatMessage[] = [
    {
      role: "system",
      content: `${GAME_MASTER_PROMPT}\n\nCurrent view:\n${JSON.stringify(openingView)}`,
    },
    ...session.history.slice(-6).map(
      (entry): ChatMessage => ({
        role: entry.role,
        content: entry.content,
      }),
    ),
    { role: "user", content: playerText },
  ];

  const finalize = (narration: string): TurnResult => {
    session.history.push(
      { role: "user", content: playerText },
      { role: "assistant", content: narration },
    );
    return {
      narration,
      toolLog,
      view: playerView(state, world),
      status: state.status,
    };
  };

  const fallbackNarration = (): string => allEvents.join(" ");

  try {
    let narration = "";
    let pendingTools = false;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const lastMessage = await deps.client.chat(
        conversation,
        TOOL_DEFINITIONS,
        "auto",
      );
      const toolCalls = lastMessage.tool_calls;
      if (toolCalls === undefined || toolCalls.length === 0) {
        narration = lastMessage.content ?? "";
        pendingTools = false;
        break;
      }
      pendingTools = true;
      conversation.push({
        role: "assistant",
        content: lastMessage.content,
        tool_calls: toolCalls,
      });
      for (const call of toolCalls) {
        const name = call.function.name;
        const args = parseArgsObject(call.function.arguments);
        let result: ToolResult;
        if (totalCalls >= MAX_TOOL_CALLS) {
          result = capResult(name);
        } else if (state.status !== "playing") {
          result = gameOverResult(name);
        } else {
          result = executeTool(
            state,
            world,
            name,
            call.function.arguments,
            deps.rng,
          );
        }
        totalCalls += 1;
        toolLog.push({ name, args, result });
        allEvents.push(...result.events);
        const viewAfter = playerView(state, world);
        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            ok: result.ok,
            reason: result.reason,
            events: result.events,
            rolls: result.rolls,
            view: viewAfter,
          }),
        });
      }
    }

    if (pendingTools) {
      const final = await deps.client.chat(
        conversation,
        TOOL_DEFINITIONS,
        "none",
      );
      narration = final.content ?? "";
    }

    if (narration.trim().length === 0) {
      narration = fallbackNarration();
    }
    return finalize(narration);
  } catch (err) {
    if (toolLog.length > 0) {
      const base = fallbackNarration();
      const narration =
        base.length > 0
          ? `${base} (The game master lost its voice for a moment.)`
          : "(The game master lost its voice for a moment.)";
      return finalize(narration);
    }
    throw err;
  }
}
