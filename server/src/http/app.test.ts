import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AssistantMessage, ChatMessage, ToolChoice } from "../ai/client.js";
import type { Rng } from "../game/types.js";
import { createApp, type AppDeps } from "./app.js";
import { SessionStore } from "./sessions.js";

class FakeClient {
  script: AssistantMessage[] = [];
  mode: "script" | "throw" = "script";
  delayMs = 0;
  async chat(
    _messages: ChatMessage[],
    _tools?: unknown[],
    _toolChoice?: ToolChoice,
  ): Promise<AssistantMessage> {
    if (this.mode === "throw") throw new Error("Muse down");
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    return this.script.shift() ?? { content: "The crypt breathes cold air." };
  }
}

function makeDeps(client: FakeClient, nowRef: { ms: number }): AppDeps {
  const store = new SessionStore({ now: () => nowRef.ms, autoSweep: false });
  let saltN = 0;
  return {
    store,
    client,
    newRng: (): Rng => () => 0,
    newSalt: () => `test-salt-${saltN++}`,
    now: () => nowRef.ms,
  };
}

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out);
  }
}

describe("health + game lifecycle", () => {
  it("GET /api/health returns ok", async () => {
    const deps = makeDeps(new FakeClient(), { ms: 0 });
    const res = await request(createApp(deps)).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    deps.store.stop();
  });

  it("POST /api/games happy path returns 201 with no leaks", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Dark steps descend." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const res = await request(app).post("/api/games");
    expect(res.status).toBe(201);
    expect(typeof res.body.gameId).toBe("string");
    expect(typeof res.body.commitment).toBe("string");
    expect(typeof res.body.narration).toBe("string");
    expect(Array.isArray(res.body.toolLog)).toBe(true);
    expect(res.body.view).toBeDefined();
    expect(res.body.status).toBe("playing");
    expect(res.body.meta).toMatchObject({ model: "muse-spark-1.3", rounds: 1, toolCalls: 0 });
    expect(typeof res.body.meta.ms).toBe("number");
    const entry = deps.store.get(res.body.gameId as string);
    expect(entry).toBeDefined();
    const blob = JSON.stringify(res.body);
    const state = entry?.session.state;
    if (state === undefined) throw new Error("missing state");
    expect(blob).not.toContain(state.salt);
    expect(blob).not.toContain(JSON.stringify(state.secrets));
    deps.store.stop();
  });

  it("turn responses carry meta with model, rounds, toolCalls, and ms", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Dark steps descend." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    expect(created.status).toBe(201);
    const gameId = created.body.gameId as string;
    client.script = [
      {
        content: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "look", arguments: "{}" } },
        ],
      },
      { content: "You looked." },
    ];
    const turn = await request(app).post(`/api/games/${gameId}/turn`).send({ text: "look around" });
    expect(turn.status).toBe(200);
    expect(turn.body.meta).toMatchObject({ model: "muse-spark-1.3", rounds: 2, toolCalls: 1 });
    expect(typeof turn.body.meta.ms).toBe("number");
    const resumed = await request(app).get(`/api/games/${gameId}`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.openingMeta).toMatchObject({ model: "muse-spark-1.3" });
    expect(typeof resumed.body.openingMeta.rounds).toBe("number");
    deps.store.stop();
  });

  it("POST /api/games with throwing client falls back to look, still 201", async () => {
    const client = new FakeClient();
    client.mode = "throw";
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const res = await request(app).post("/api/games");
    expect(res.status).toBe(201);
    expect(typeof res.body.narration).toBe("string");
    expect((res.body.narration as string).length).toBeGreaterThan(0);
    expect(res.body.toolLog).toEqual([]);
    expect(res.body.view).toBeDefined();
    expect(res.body.status).toBe("playing");
    // Session keeps working after fallback: history recorded, next turn uses real path.
    const entry = deps.store.get(res.body.gameId as string);
    expect(entry?.session.history.length).toBe(2);
    client.mode = "script";
    client.script = [{ content: "You look around again." }];
    const turn = await request(app)
      .post(`/api/games/${res.body.gameId as string}/turn`)
      .send({ text: "look around" });
    expect(turn.status).toBe(200);
    deps.store.stop();
  });

  it("turn + resume happy path", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Opening." }, { content: "You wait." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    const gameId = created.body.gameId as string;
    const turn = await request(app).post(`/api/games/${gameId}/turn`).send({ text: "wait" });
    expect(turn.status).toBe(200);
    expect(typeof turn.body.narration).toBe("string");
    expect(turn.body.view).toBeDefined();
    const resumed = await request(app).get(`/api/games/${gameId}`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.gameId).toBe(gameId);
    expect(resumed.body.commitment).toBe(created.body.commitment);
    deps.store.stop();
  });

  it("resume returns the stored opening narration and toolLog", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Dark steps descend." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    expect(created.status).toBe(201);
    const gameId = created.body.gameId as string;
    const resumed = await request(app).get(`/api/games/${gameId}`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.openingNarration).toBe(created.body.narration);
    expect(resumed.body.openingToolLog).toEqual(created.body.toolLog);
    deps.store.stop();
  });

  it("every game response includes 2-4 valid suggestions and no leaks", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Opening." }, { content: "You wait." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    expect(created.status).toBe(201);
    for (const label of ["created", "turn", "resumed"] as const) {
      const body =
        label === "created"
          ? created.body
          : label === "turn"
            ? (await request(app).post(`/api/games/${created.body.gameId as string}/turn`).send({ text: "wait" })).body
            : (await request(app).get(`/api/games/${created.body.gameId as string}`)).body;
      expect(Array.isArray(body.suggestions)).toBe(true);
      const suggestions = body.suggestions as unknown[];
      expect(suggestions.length).toBeGreaterThanOrEqual(2);
      expect(suggestions.length).toBeLessThanOrEqual(4);
      for (const s of suggestions) {
        const rec = s as { text?: unknown; kind?: unknown; target?: unknown };
        expect(typeof rec.text).toBe("string");
        expect(typeof rec.kind).toBe("string");
        if (rec.target !== undefined) expect(typeof rec.target).toBe("number");
      }
      const blob = JSON.stringify(body);
      expect(blob).not.toContain("lost_relic");
    }
    deps.store.stop();
  });

  it("map field shows visited rooms + unexplored stubs, never secrets", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Opening." }, { content: "You wait." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    expect(created.status).toBe(201);
    const gameId = created.body.gameId as string;
    const entry = deps.store.get(gameId);
    if (entry === undefined) throw new Error("game missing");
    const st = entry.session.state;
    const world = entry.session.world;
    for (const label of ["created", "turn", "resumed"] as const) {
      const body =
        label === "created"
          ? created.body as Record<string, unknown>
          : label === "turn"
            ? (await request(app).post(`/api/games/${gameId}/turn`).send({ text: "wait" })).body as Record<string, unknown>
            : (await request(app).get(`/api/games/${gameId}`)).body as Record<string, unknown>;
      const map = body["map"] as { rooms?: unknown; links?: unknown; unexplored?: unknown } | undefined;
      expect(map).toBeDefined();
      const rooms = (map?.rooms ?? []) as { id?: unknown; name?: unknown; isCurrent?: unknown }[];
      const links = (map?.links ?? []) as { from?: unknown; to?: unknown; direction?: unknown }[];
      const unexplored = (map?.unexplored ?? []) as { from?: unknown; direction?: unknown; to?: unknown; name?: unknown }[];
      const visited = new Set(st.visitedRoomIds);
      expect(rooms.length).toBe(visited.size);
      const roomIds = new Set<string>();
      for (const r of rooms) {
        expect(typeof r.id).toBe("string");
        expect(typeof r.name).toBe("string");
        expect(typeof r.isCurrent).toBe("boolean");
        roomIds.add(r.id as string);
        expect(visited.has(r.id as string)).toBe(true);
      }
      expect(roomIds.has(st.currentRoomId)).toBe(true);
      for (const l of links) {
        expect(roomIds.has(l.from as string)).toBe(true);
        expect(roomIds.has(l.to as string)).toBe(true);
        expect(typeof l.direction).toBe("string");
      }
      for (const u of unexplored) {
        expect(roomIds.has(u.from as string)).toBe(true);
        expect(typeof u.direction).toBe("string");
        expect(u.to).toBeUndefined();
        expect(u.name).toBeUndefined();
      }
      // Never leak unvisited names/ids, trap info, relic room, or secrets.
      const blob = JSON.stringify(map);
      for (const [id, room] of Object.entries(world.rooms)) {
        if (!visited.has(id)) {
          expect(blob).not.toContain(id);
          expect(blob).not.toContain(room.name);
        }
      }
      const trap = st.secrets.trap;
      if (!visited.has(trap.roomId)) expect(blob).not.toContain(trap.roomId);
      expect(blob).not.toContain('"trap"');
      expect(blob).not.toContain('"secrets"');
      expect(blob).not.toContain(st.salt);
      if (!visited.has(st.secrets.relicRoomId)) expect(blob).not.toContain(st.secrets.relicRoomId);
    }
    deps.store.stop();
  });
});

describe("errors", () => {
  it("400 on bad turn text", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Opening." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    const gameId = created.body.gameId as string;
    for (const bad of [{}, { text: 42 }, { text: "" }, { text: "   " }, { text: "x".repeat(501) }]) {
      const res = await request(app).post(`/api/games/${gameId}/turn`).send(bad);
      expect(res.status).toBe(400);
      expect(typeof res.body.error).toBe("string");
    }
    deps.store.stop();
  });

  it("400 on invalid JSON and oversized body", async () => {
    const deps = makeDeps(new FakeClient(), { ms: 0 });
    const app = createApp(deps);
    const badJson = await request(app)
      .post("/api/games/whatever/turn")
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(badJson.status).toBe(400);
    const big = await request(app)
      .post("/api/games/whatever/turn")
      .send({ text: "x".repeat(11 * 1024) });
    expect(big.status).toBe(400);
    deps.store.stop();
  });

  it("404 on unknown game for turn/get/reveal", async () => {
    const deps = makeDeps(new FakeClient(), { ms: 0 });
    const app = createApp(deps);
    expect((await request(app).post("/api/games/nope/turn").send({ text: "hi" })).status).toBe(404);
    expect((await request(app).get("/api/games/nope")).status).toBe(404);
    expect((await request(app).get("/api/games/nope/reveal")).status).toBe(404);
    deps.store.stop();
  });

  it("409 when a turn is already running (busy lock)", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Opening." }, { content: "Slow turn." }];
    client.delayMs = 150;
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    const gameId = created.body.gameId as string;
    // Kick off the first turn (.then starts the superagent request) and hold it
    // in-flight via the fake client's delay; the second must see busy=true.
    const firstTest = request(app).post(`/api/games/${gameId}/turn`).send({ text: "go north" });
    const firstDone = firstTest.then((res) => res);
    await new Promise((r) => setTimeout(r, 30));
    const second = await request(app).post(`/api/games/${gameId}/turn`).send({ text: "go south" });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already running/);
    const firstRes = await firstDone;
    expect(firstRes.status).toBe(200);
    deps.store.stop();
  });

  it("409 reveal blocked while playing", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Opening." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    const res = await request(app).get(`/api/games/${created.body.gameId as string}/reveal`);
    expect(res.status).toBe(409);
    deps.store.stop();
  });

  it("429 turn rate limit: 10/min per game", async () => {
    const nowRef = { ms: 0 };
    const client = new FakeClient();
    client.script = Array.from({ length: 20 }, (_, i) => ({ content: `N${i}` }));
    const deps = makeDeps(client, nowRef);
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    const gameId = created.body.gameId as string;
    for (let i = 0; i < 10; i += 1) {
      const r = await request(app).post(`/api/games/${gameId}/turn`).send({ text: `t${i}` });
      expect(r.status).toBe(200);
    }
    const limited = await request(app).post(`/api/games/${gameId}/turn`).send({ text: "one more" });
    expect(limited.status).toBe(429);
    nowRef.ms += 61 * 1000;
    const after = await request(app).post(`/api/games/${gameId}/turn`).send({ text: "after window" });
    expect(after.status).toBe(200);
    deps.store.stop();
  });

  it("429 game creation limit: 5/min per IP, separate per X-Forwarded-For", async () => {
    const nowRef = { ms: 0 };
    const client = new FakeClient();
    client.script = Array.from({ length: 20 }, (_, i) => ({ content: `G${i}` }));
    const deps = makeDeps(client, nowRef);
    const app = createApp(deps);
    const ipA = "1.2.3.4";
    const ipB = "5.6.7.8";
    for (let i = 0; i < 5; i += 1) {
      const r = await request(app).post("/api/games").set("X-Forwarded-For", ipA);
      expect(r.status).toBe(201);
    }
    expect((await request(app).post("/api/games").set("X-Forwarded-For", ipA)).status).toBe(429);
    // Different IP has its own bucket thanks to trust proxy.
    const other = await request(app).post("/api/games").set("X-Forwarded-For", ipB);
    expect(other.status).toBe(201);
    deps.store.stop();
  });

  it("502 when the game master throws mid-game", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Opening." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    const gameId = created.body.gameId as string;
    client.mode = "throw";
    const res = await request(app).post(`/api/games/${gameId}/turn`).send({ text: "hello" });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("The game master is unavailable, try again.");
    deps.store.stop();
  });
});

describe("reveal after forced loss", () => {
  it("returns raw + display secrets, salt, verified:true, nearMiss, rulesVersion, tip", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Opening." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    expect(created.status).toBe(201);
    const gameId = created.body.gameId as string;
    const entry = deps.store.get(gameId);
    if (entry === undefined) throw new Error("game missing");
    // Force a loss via the rule engine only: run out the clock.
    const { endTurn } = await import("../game/rules.js");
    const { verify: verifyCommit } = await import("../game/secrets.js");
    for (let i = 0; i < 45; i += 1) {
      endTurn(entry.session.state, entry.session.world);
    }
    expect(entry.session.state.status).toBe("lost");

    const res = await request(app).get(`/api/games/${gameId}/reveal`);
    expect(res.status).toBe(200);
    const st = entry.session.state;
    expect(res.body.secrets).toEqual({
      relicRoomId: st.secrets.relicRoomId,
      trap: { roomId: st.secrets.trap.roomId, direction: st.secrets.trap.direction },
    });
    const world = entry.session.world;
    expect(res.body.display).toEqual({
      relicRoom: world.rooms[st.secrets.relicRoomId]?.name ?? st.secrets.relicRoomId,
      trapRoom: world.rooms[st.secrets.trap.roomId]?.name ?? st.secrets.trap.roomId,
      trapDirection: st.secrets.trap.direction,
    });
    expect(res.body.salt).toBe(st.salt);
    expect(res.body.commitment).toBe(st.commitment);
    expect(res.body.verified).toBe(true);
    expect(verifyCommit(st.secrets, res.body.salt as string, res.body.commitment as string)).toBe(true);
    expect(typeof res.body.nearMiss === "string" || res.body.nearMiss === null).toBe(true);
    expect(res.body.rulesVersion).toBe("wyrd-rules-v2");
    expect(res.body.tip).toBe(
      "Pick up several things in one go: 'grab the key and the coin'.",
    );
    deps.store.stop();
  });
});

describe("enemyHp", () => {
  it("is null at creation and tracks the current room enemy on GET, keeping hp out of the view", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Opening." }, { content: "Still here." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    expect(created.status).toBe(201);
    expect(created.body.enemyHp).toBeNull();
    const gameId = created.body.gameId as string;
    const entry = deps.store.get(gameId);
    if (entry === undefined) throw new Error("game missing");
    entry.session.state.currentRoomId = "goblin_den";
    const resumed = await request(app).get(`/api/games/${gameId}`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.enemyHp).toEqual({ current: 5, max: 5 });
    expect("hp" in (resumed.body.view.enemy as Record<string, unknown>)).toBe(false);
    entry.session.state.enemies["goblin"]!.hp = 2;
    const damaged = await request(app).get(`/api/games/${gameId}`);
    expect(damaged.body.enemyHp).toEqual({ current: 2, max: 5 });
    // Defeated enemy keeps { current: 0, max }; overkill clamps at 0.
    entry.session.state.enemies["goblin"]!.hp = -3;
    entry.session.state.enemies["goblin"]!.defeated = true;
    const defeated = await request(app).get(`/api/games/${gameId}`);
    expect(defeated.body.enemyHp).toEqual({ current: 0, max: 5 });
    // Turn responses carry it too.
    const turn = await request(app).post(`/api/games/${gameId}/turn`).send({ text: "look" });
    expect(turn.status).toBe(200);
    expect(turn.body.enemyHp).toEqual({ current: 0, max: 5 });
    deps.store.stop();
  });
});

describe("secret leak scan", () => {
  it("no pre-end JSON contains salt, secrets object, or hidden relic id", async () => {
    const client = new FakeClient();
    client.script = [{ content: "Opening." }, { content: "Still here." }, { content: "Again." }];
    const deps = makeDeps(client, { ms: 0 });
    const app = createApp(deps);
    const bodies: unknown[] = [];
    const created = await request(app).post("/api/games");
    bodies.push(created.body);
    const gameId = created.body.gameId as string;
    const entry = deps.store.get(gameId);
    if (entry === undefined) throw new Error("game missing");
    const st = entry.session.state;
    bodies.push((await request(app).post(`/api/games/${gameId}/turn`).send({ text: "look" })).body);
    bodies.push((await request(app).get(`/api/games/${gameId}`)).body);

    for (const body of bodies) {
      const blob = JSON.stringify(body);
      expect(blob).not.toContain(st.salt);
      expect(blob).not.toContain('"salt"');
      expect(blob).not.toContain('"secrets"');
      // Relic room id must not appear unless the player is standing in it.
      const strings: string[] = [];
      collectStrings(body, strings);
      for (const s of strings) {
        if (s === st.secrets.relicRoomId) {
          expect(st.currentRoomId).toBe(st.secrets.relicRoomId);
        }
      }
      // The commitment hash is public and may appear; the salt must never.
      expect(typeof st.commitment).toBe("string");
    }
    deps.store.stop();
  });
});

describe("session expiry over HTTP", () => {
  it("expired game returns 404 (fake clock)", async () => {
    const nowRef = { ms: 0 };
    const client = new FakeClient();
    client.script = [{ content: "Opening." }];
    const deps = makeDeps(client, nowRef);
    const app = createApp(deps);
    const created = await request(app).post("/api/games");
    const gameId = created.body.gameId as string;
    expect((await request(app).get(`/api/games/${gameId}`)).status).toBe(200);
    nowRef.ms += 61 * 60 * 1000;
    expect((await request(app).get(`/api/games/${gameId}`)).status).toBe(404);
    expect((await request(app).post(`/api/games/${gameId}/turn`).send({ text: "hi" })).status).toBe(404);
    deps.store.stop();
  });
});




