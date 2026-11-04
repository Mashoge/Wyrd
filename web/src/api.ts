import type { DiceRoll, GameMap, NewGameResponse, PlayerView, ResumeResponse, Suggestion, TurnMeta } from "./api-types";
import type { ToolLogEntry, ToolResult, TurnResponse } from "./api-types";
import { ApiError, apiBaseUrl, clearGameId } from "./api-base";
import { loadGameId, saveGameId } from "./api-base";
import { toPlayerView } from "./api-view";

export type {
  DiceRoll,
  GameMap,
  GameMapLink,
  GameMapRoom,
  GameMapStub,
  GameStatus,
  NewGameResponse,
  PlayerView,
  PlayerViewEnemy,
  PlayerViewExit,
  PlayerViewItem,
  PlayerViewPlayer,
  PlayerViewRoom,
  ResumeResponse,
  Suggestion,
  ToolLogEntry,
  ToolResult,
  TurnMeta,
  TurnResponse,
} from "./api-types";
export { ApiError, clearGameId, loadGameId, saveGameId } from "./api-base";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toDiceRoll(value: unknown): DiceRoll | null {
  if (!isRecord(value)) return null;
  const p = value["purpose"];
  const s = value["sides"];
  const v = value["value"];
  const t = value["target"];
  const ok = value["success"];
  const b = value["bonus"];
  if (typeof p !== "string") return null;
  if (typeof s !== "number") return null;
  if (typeof v !== "number") return null;
  if (typeof t !== "number") return null;
  if (typeof ok !== "boolean") return null;
  if (typeof b !== "number") return null;
  const roll: DiceRoll = { purpose: p, sides: s, value: v, target: t, success: ok, bonus: b };
  // Optional attempt outcome band: keep it only when it is a known string,
  // ignore anything else (absent, wrong type, unknown word).
  const result = value["result"];
  if (result === "success" || result === "partial" || result === "fail") {
    roll.result = result;
  }
  return roll;
}

function toToolResult(value: unknown): ToolResult | null {
  if (!isRecord(value)) return null;
  const ok = value["ok"];
  const action = value["action"];
  const reason = value["reason"];
  const rolls = value["rolls"];
  const events = value["events"];
  if (typeof ok !== "boolean") return null;
  if (typeof action !== "string") return null;
  if (reason !== undefined && typeof reason !== "string") return null;
  if (!Array.isArray(rolls) || !Array.isArray(events)) return null;
  const cleanRolls: DiceRoll[] = [];
  for (const r of rolls) {
    const roll = toDiceRoll(r);
    if (roll === null) return null;
    cleanRolls.push(roll);
  }
  const cleanEvents: string[] = [];
  for (const e of events) {
    if (typeof e !== "string") return null;
    cleanEvents.push(e);
  }
  return { ok, action, reason, rolls: cleanRolls, events: cleanEvents };
}

function toStatus(value: unknown): PlayerView["player"]["status"] {
  if (value === "won" || value === "lost") return value;
  return "playing";
}

function toSuggestions(value: unknown): Suggestion[] {
  if (!Array.isArray(value)) return [];
  const out: Suggestion[] = [];
  for (const s of value) {
    if (typeof s === "string") {
      out.push({ text: s, kind: "other" });
      continue;
    }
    if (!isRecord(s)) continue;
    const text = s["text"];
    const kind = s["kind"];
    const target = s["target"];
    const isNew = s["isNew"];
    const usesConsumable = s["usesConsumable"];
    if (typeof text !== "string" || typeof kind !== "string") continue;
    if (target !== undefined && typeof target !== "number") continue;
    if (isNew !== undefined && typeof isNew !== "boolean") continue;
    if (usesConsumable !== undefined && typeof usesConsumable !== "boolean") continue;
    const clean: Suggestion = target === undefined ? { text, kind } : { text, kind, target };
    if (isNew === true) clean.isNew = true;
    if (usesConsumable === true) clean.usesConsumable = true;
    out.push(clean);
  }
  return out;
}

function toGameMap(value: unknown): GameMap {
  const empty: GameMap = { rooms: [], links: [], unexplored: [] };
  if (!isRecord(value)) return empty;
  const rooms: GameMap["rooms"] = [];
  const links: GameMap["links"] = [];
  const unexplored: GameMap["unexplored"] = [];
  if (Array.isArray(value["rooms"])) {
    for (const r of value["rooms"]) {
      if (!isRecord(r)) continue;
      if (typeof r["id"] !== "string" || typeof r["name"] !== "string" || typeof r["isCurrent"] !== "boolean") continue;
      rooms.push({ id: r["id"], name: r["name"], isCurrent: r["isCurrent"] });
    }
  }
  if (Array.isArray(value["links"])) {
    for (const l of value["links"]) {
      if (!isRecord(l)) continue;
      if (typeof l["from"] !== "string" || typeof l["to"] !== "string" || typeof l["direction"] !== "string") continue;
      links.push({ from: l["from"], to: l["to"], direction: l["direction"] });
    }
  }
  if (Array.isArray(value["unexplored"])) {
    for (const u of value["unexplored"]) {
      if (!isRecord(u)) continue;
      if (typeof u["from"] !== "string" || typeof u["direction"] !== "string") continue;
      unexplored.push({ from: u["from"], direction: u["direction"] });
    }
  }
  return { rooms, links, unexplored };
}

async function parseBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
}

function failMessage(status: number, body: Record<string, unknown>): string {
  const raw = body["error"];
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (status === 400) return "That didn't work — try a shorter action.";
  if (status === 404) return "That game is gone.";
  if (status === 409) return "A turn is already running — wait a moment.";
  if (status === 429) return "Too many turns — wait a moment.";
  return "The game master is unavailable — try again.";
}

async function postJson(path: string, payload: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiError(502, "The game master is unavailable — try again.");
  }
  const body = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, failMessage(res.status, body));
  return body;
}

async function getJson(path: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, { method: "GET" });
  } catch {
    throw new ApiError(502, "The game master is unavailable — try again.");
  }
  const body = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, failMessage(res.status, body));
  return body;
}

function toTurnMeta(value: unknown): TurnMeta | null {
  if (!isRecord(value)) return null;
  const model = value["model"];
  const rounds = value["rounds"];
  const toolCalls = value["toolCalls"];
  const ms = value["ms"];
  if (typeof model !== "string") return null;
  if (typeof rounds !== "number" || !Number.isFinite(rounds)) return null;
  if (typeof toolCalls !== "number" || !Number.isFinite(toolCalls)) return null;
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return { model, rounds, toolCalls, ms };
}

function toToolLog(value: unknown): ToolLogEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ToolLogEntry[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = entry["name"];
    const args = entry["args"];
    if (typeof name !== "string") continue;
    if (!isRecord(args)) continue;
    const result = toToolResult(entry["result"]);
    if (result === null) continue;
    out.push({ name, args, result });
  }
  return out;
}

export async function createGame(): Promise<NewGameResponse> {
  const body = await postJson("/api/games", {});
  const view = toPlayerView(body["view"]);
  const meta = toTurnMeta(body["meta"]);
  if (typeof body["gameId"] !== "string") throw new ApiError(502, "Bad game.");
  if (typeof body["commitment"] !== "string") throw new ApiError(502, "Bad game.");
  if (typeof body["narration"] !== "string") throw new ApiError(502, "Bad game.");
  if (view === null) throw new ApiError(502, "Bad game.");
  if (meta === null) throw new ApiError(502, "Bad game.");
  return {
    gameId: body["gameId"],
    commitment: body["commitment"],
    narration: body["narration"],
    toolLog: toToolLog(body["toolLog"]),
    view,
    status: toStatus(body["status"]),
    suggestions: toSuggestions(body["suggestions"]),
    map: toGameMap(body["map"]),
    meta,
  };
}

export async function playTurn(gameId: string, text: string): Promise<TurnResponse> {
  const body = await postJson(`/api/games/${encodeURIComponent(gameId)}/turn`, { text });
  const view = toPlayerView(body["view"]);
  const meta = toTurnMeta(body["meta"]);
  if (typeof body["narration"] !== "string") throw new ApiError(502, "Bad turn.");
  if (view === null) throw new ApiError(502, "Bad turn.");
  if (meta === null) throw new ApiError(502, "Bad turn.");
  return {
    narration: body["narration"],
    toolLog: toToolLog(body["toolLog"]),
    view,
    status: toStatus(body["status"]),
    suggestions: toSuggestions(body["suggestions"]),
    map: toGameMap(body["map"]),
    meta,
  };
}

export async function fetchGame(gameId: string): Promise<ResumeResponse> {
  const body = await getJson(`/api/games/${encodeURIComponent(gameId)}`);
  const view = toPlayerView(body["view"]);
  if (typeof body["commitment"] !== "string") throw new ApiError(502, "Bad game.");
  if (view === null) throw new ApiError(502, "Bad game.");
  if (typeof body["openingNarration"] !== "string") throw new ApiError(502, "Bad game.");
  return {
    gameId: typeof body["gameId"] === "string" ? body["gameId"] : gameId,
    commitment: body["commitment"],
    view,
    status: toStatus(body["status"]),
    suggestions: toSuggestions(body["suggestions"]),
    openingNarration: body["openingNarration"],
    openingToolLog: toToolLog(body["openingToolLog"]),
    openingMeta: toTurnMeta(body["openingMeta"]),
    map: toGameMap(body["map"]),
  };
}

export type VoiceLang = "en" | "tl";

export async function transcribeVoice(gameId: string, wav: Uint8Array, lang: VoiceLang): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/api/games/${encodeURIComponent(gameId)}/voice?lang=${lang}`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
    });
  } catch {
    throw new ApiError(502, "Could not transcribe that — try again.");
  }
  const body = await parseBody(res);
  if (!res.ok) throw new ApiError(res.status, failMessage(res.status, body));
  const text = body["text"];
  if (typeof text !== "string" || text.trim().length === 0) throw new ApiError(502, "Didn't catch that — try again.");
  return text;
}

export async function bootGame(): Promise<{ game: ResumeResponse | NewGameResponse; fresh: boolean }> {
  const stored = loadGameId();
  if (stored === null) {
    const game = await createGame();
    saveGameId(game.gameId);
    return { game, fresh: true };
  }
  try {
    const game = await fetchGame(stored);
    return { game, fresh: false };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      clearGameId();
      const game = await createGame();
      saveGameId(game.gameId);
      return { game, fresh: true };
    }
    throw err;
  }
}



