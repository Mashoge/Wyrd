import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { runTurn, type TurnClient } from "../ai/loop.js";
import { suggestActions } from "../ai/suggest.js";
import { executeTool } from "../ai/tools.js";
import { playerView, type PlayerView } from "../ai/view.js";
import { RULES_VERSION } from "../game/version.js";
import { nearMissMessage } from "../game/distance.js";
import { verify } from "../game/secrets.js";
import { startGame } from "../game/state.js";
import { lossTip } from "../game/tips.js";
import type { GameStatus, Rng } from "../game/types.js";
import { sunkenCrypt } from "../game/worlds/sunkenCrypt.js";
import { SessionStore } from "./sessions.js";
import { buildMap } from "./map.js";

export interface AppDeps {
  store: SessionStore;
  client: TurnClient;
  newRng: () => Rng;
  newSalt: () => string;
  now: () => number;
}

const TURNS_PER_MINUTE = 10;
const GAMES_PER_MINUTE_PER_IP = 5;
const WINDOW_MS = 60 * 1000;
const MAX_TEXT_LENGTH = 500;

function allowedOrigins(): string[] {
  const raw = process.env["WEB_ORIGIN"] ?? "";
  const fromEnv = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const combined = [...fromEnv, "http://localhost:5173"];
  return [...new Set(combined)];
}

function prune(timestamps: number[], nowMs: number): number[] {
  return timestamps.filter((t) => nowMs - t < WINDOW_MS);
}

function sendErr(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (origin === undefined || origin === null) {
          callback(null, true);
          return;
        }
        if (allowedOrigins().includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
    }),
  );

  app.use(express.json({ limit: "10kb" }));

  const gameRngs = new Map<string, Rng>();
  const gameCreationsByIp = new Map<string, number[]>();
  const turnsByGame = new Map<string, number[]>();

  function gameCreationAllowed(ip: string): boolean {
    const nowMs = deps.now();
    const prev = prune(gameCreationsByIp.get(ip) ?? [], nowMs);
    if (prev.length >= GAMES_PER_MINUTE_PER_IP) {
      gameCreationsByIp.set(ip, prev);
      return false;
    }
    prev.push(nowMs);
    gameCreationsByIp.set(ip, prev);
    return true;
  }

  function turnAllowed(gameId: string): boolean {
    const nowMs = deps.now();
    const prev = prune(turnsByGame.get(gameId) ?? [], nowMs);
    if (prev.length >= TURNS_PER_MINUTE) {
      turnsByGame.set(gameId, prev);
      return false;
    }
    prev.push(nowMs);
    turnsByGame.set(gameId, prev);
    return true;
  }

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post("/api/games", async (req: Request, res: Response) => {
    const ip: string = req.ip ?? "unknown";
    if (!gameCreationAllowed(ip)) {
      sendErr(res, 429, "Rate limit exceeded, try again later.");
      return;
    }
    const gameId = randomUUID();
    const rng = deps.newRng();
    const salt = deps.newSalt();
    const state = startGame(sunkenCrypt, gameId, rng, salt);
    const session = {
      state,
      world: sunkenCrypt,
      history: [] as { role: "user" | "assistant"; content: string }[],
    };
    const entry = deps.store.create(gameId, session);
    gameRngs.set(gameId, rng);

    entry.busy = true;
    try {
      const result = await runTurn(session, "Look around.", { client: deps.client, rng });
      entry.openingNarration = result.narration;
      entry.openingToolLog = result.toolLog;
      deps.store.touch(gameId);
      res.status(201).json({
        gameId,
        commitment: state.commitment,
        narration: result.narration,
        toolLog: result.toolLog,
        view: result.view,
        status: result.status,
        suggestions: suggestActions(result.view, sunkenCrypt, state.lastRoomId),
        map: buildMap(state, sunkenCrypt),
      });
    } catch {
      const look = executeTool(state, sunkenCrypt, "look", "{}", rng);
      const narration = look.events.join(" ");
      session.history.push(
        { role: "user", content: "Look around." },
        { role: "assistant", content: narration },
      );
      const view: PlayerView = playerView(state, sunkenCrypt);
      const status: GameStatus = state.status;
      entry.openingNarration = narration;
      entry.openingToolLog = [];
      deps.store.touch(gameId);
      res.status(201).json({
        gameId,
        commitment: state.commitment,
        narration,
        toolLog: [],
        view,
        status,
        suggestions: suggestActions(view, sunkenCrypt, state.lastRoomId),
        map: buildMap(state, sunkenCrypt),
      });
    } finally {
      entry.busy = false;
    }
  });

  app.post("/api/games/:id/turn", async (req: Request, res: Response) => {
    const gameId = req.params["id"] as string;
    const entry = deps.store.get(gameId);
    if (entry === undefined) {
      sendErr(res, 404, "Game not found.");
      return;
    }
    const body = req.body as { text?: unknown } | undefined;
    const rawText: unknown = body?.text;
    if (typeof rawText !== "string") {
      sendErr(res, 400, "Text is required (1-500 characters).");
      return;
    }
    const text = rawText.trim();
    if (text.length < 1 || text.length > MAX_TEXT_LENGTH) {
      sendErr(res, 400, "Text is required (1-500 characters).");
      return;
    }
    if (entry.busy) {
      sendErr(res, 409, "A turn is already running for this game.");
      return;
    }
    if (!turnAllowed(gameId)) {
      sendErr(res, 429, "Rate limit exceeded, try again later.");
      return;
    }
    let rng = gameRngs.get(gameId);
    if (rng === undefined) {
      rng = deps.newRng();
      gameRngs.set(gameId, rng);
    }
    entry.busy = true;
    try {
      const result = await runTurn(entry.session, text, { client: deps.client, rng });
      deps.store.touch(gameId);
      res.json({
        narration: result.narration,
        toolLog: result.toolLog,
        view: result.view,
        status: result.status,
        suggestions: suggestActions(result.view, entry.session.world, entry.session.state.lastRoomId),
        map: buildMap(entry.session.state, entry.session.world),
      });
    } catch {
      sendErr(res, 502, "The game master is unavailable, try again.");
    } finally {
      entry.busy = false;
    }
  });

  app.get("/api/games/:id", (req: Request, res: Response) => {
    const gameId = req.params["id"] as string;
    const entry = deps.store.get(gameId);
    if (entry === undefined) {
      sendErr(res, 404, "Game not found.");
      return;
    }
    deps.store.touch(gameId);
    const { state, world } = entry.session;
    const resumeView = playerView(state, world);
    res.json({
      gameId,
      commitment: state.commitment,
      view: resumeView,
      status: state.status,
      suggestions: suggestActions(resumeView, world, state.lastRoomId),
      openingNarration: entry.openingNarration ?? "",
      openingToolLog: entry.openingToolLog ?? [],
      map: buildMap(state, world),
    });
  });

  app.get("/api/games/:id/reveal", (req: Request, res: Response) => {
    const gameId = req.params["id"] as string;
    const entry = deps.store.get(gameId);
    if (entry === undefined) {
      sendErr(res, 404, "Game not found.");
      return;
    }
    const { state, world } = entry.session;
    if (state.status === "playing") {
      sendErr(res, 409, "Game is still in progress.");
      return;
    }
    deps.store.touch(gameId);
    const relicRoomName = world.rooms[state.secrets.relicRoomId]?.name;
    const trapRoomName = world.rooms[state.secrets.trap.roomId]?.name;
    res.json({
      rulesVersion: RULES_VERSION,
      secrets: {
        relicRoomId: state.secrets.relicRoomId,
        trap: { roomId: state.secrets.trap.roomId, direction: state.secrets.trap.direction },
      },
      display: {
        relicRoom: relicRoomName ?? state.secrets.relicRoomId,
        trapRoom: trapRoomName ?? state.secrets.trap.roomId,
        trapDirection: state.secrets.trap.direction,
      },
      salt: state.salt,
      commitment: state.commitment,
      verified: verify(state.secrets, state.salt, state.commitment),
      nearMiss: nearMissMessage(state, world),
      tip: state.status === "lost" ? lossTip(state, world) : null,
    });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: () => void) => {
    if (typeof error === "object" && error !== null && "type" in error) {
      const type = (error as { type?: unknown }).type;
      if (type === "entity.too.large") {
        sendErr(res, 400, "Request body too large.");
        return;
      }
    }
    if (error instanceof SyntaxError) {
      sendErr(res, 400, "Invalid JSON body.");
      return;
    }
    throw error;
  });

  return app;
}


