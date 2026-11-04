import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AssistantMessage, ChatMessage, ToolChoice } from "../ai/client.js";
import type { Rng } from "../game/types.js";
import { createApp, type AppDeps } from "./app.js";
import { SessionStore } from "./sessions.js";

class FakeClient {
  script: AssistantMessage[] = [{ content: "Dark steps descend." }];
  async chat(_m: ChatMessage[], _t?: unknown[], _c?: ToolChoice): Promise<AssistantMessage> {
    return this.script.shift() ?? { content: "The crypt breathes." };
  }
}

function makeDeps(voiceFetch: typeof fetch): AppDeps {
  let saltN = 0;
  return {
    store: new SessionStore({ now: () => 0, autoSweep: false }),
    client: new FakeClient(),
    newRng: (): Rng => () => 0,
    newSalt: () => `salt-${saltN++}`,
    now: () => 0,
    voiceFetch,
    voiceApiKey: "test-key",
  };
}

const WAV = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);

describe("POST /api/games/:id/voice", () => {
  it("forwards multipart like scripts/test-voice.mjs and returns {text}", async () => {
    let seenUrl = "";
    let seenAuth: string | null = null;
    let seenForm: FormData = new FormData();
    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenForm = init?.body as FormData;
      seenAuth = new Headers(init?.headers).get("Authorization");
      return new Response(JSON.stringify({ text: " go north " }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const deps = makeDeps(mockFetch);
    const app = createApp(deps);
    const gameId = (await request(app).post("/api/games")).body.gameId as string;
    const res = await request(app)
      .post(`/api/games/${gameId}/voice`)
      .set("Content-Type", "audio/wav")
      .send(WAV);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: "go north" });
    expect(seenUrl).toBe("https://api.meta.ai/v1/asr/transcribe");
    expect(seenAuth).toBe("Bearer test-key");
    const reqPart = seenForm.get("request") as Blob;
    expect(JSON.parse(await reqPart.text())).toEqual({
      model: "muse-voice-transcribe-1.0",
      audioEncoding: "WAV",
      sampleRate: 16000,
      language: "en",
    });
    const audioPart = seenForm.get("audio") as Blob;
    expect(audioPart.type).toBe("audio/wav");
    expect(Buffer.from(await audioPart.arrayBuffer()).equals(WAV)).toBe(true);
    deps.store.stop();
  });

  it("maps ?lang=tl to Tagalog code tl", async () => {
    let lang = "";
    const mockFetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      const form = init?.body as FormData;
      lang = (JSON.parse(await (form.get("request") as Blob).text()) as { language: string }).language;
      return new Response(JSON.stringify({ transcript: "pumunta sa hilaga" }), { status: 200 });
    }) as unknown as typeof fetch;
    const deps = makeDeps(mockFetch);
    const app = createApp(deps);
    const gameId = (await request(app).post("/api/games")).body.gameId as string;
    const res = await request(app)
      .post(`/api/games/${gameId}/voice?lang=tl`)
      .set("Content-Type", "audio/wav")
      .send(WAV);
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("pumunta sa hilaga");
    expect(lang).toBe("tl");
    deps.store.stop();
  });


  it("404 unknown game, 400 bad lang / wrong type", async () => {
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ text: "x" }), { status: 200 })) as unknown as typeof fetch;
    const deps = makeDeps(mockFetch);
    const app = createApp(deps);
    expect((await request(app).post("/api/games/nope/voice").set("Content-Type", "audio/wav").send(WAV)).status).toBe(404);
    const gameId = (await request(app).post("/api/games")).body.gameId as string;
    expect((await request(app).post(`/api/games/${gameId}/voice?lang=fr`).set("Content-Type", "audio/wav").send(WAV)).status).toBe(400);
    expect((await request(app).post(`/api/games/${gameId}/voice`).set("Content-Type", "application/json").send({})).status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
    deps.store.stop();
  });

  it("never leaks upstream body on upstream failure", async () => {
    const mockFetch = vi.fn(async () => new Response("SECRET upstream detail", { status: 500 })) as unknown as typeof fetch;
    const deps = makeDeps(mockFetch);
    const app = createApp(deps);
    const gameId = (await request(app).post("/api/games")).body.gameId as string;
    const res = await request(app).post(`/api/games/${gameId}/voice`).set("Content-Type", "audio/wav").send(WAV);
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("SECRET");
    expect(typeof res.body.error).toBe("string");
    deps.store.stop();
  });

  it("rate limits at 10 per minute per game", async () => {
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ text: "hi" }), { status: 200 })) as unknown as typeof fetch;
    const deps = makeDeps(mockFetch);
    const app = createApp(deps);
    const gameId = (await request(app).post("/api/games")).body.gameId as string;
    for (let i = 0; i < 10; i++) {
      expect((await request(app).post(`/api/games/${gameId}/voice`).set("Content-Type", "audio/wav").send(WAV)).status).toBe(200);
    }
    expect((await request(app).post(`/api/games/${gameId}/voice`).set("Content-Type", "audio/wav").send(WAV)).status).toBe(429);
    deps.store.stop();
  });

  it("rejects bodies over 1 MB", async () => {
    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ text: "hi" }), { status: 200 })) as unknown as typeof fetch;
    const deps = makeDeps(mockFetch);
    const app = createApp(deps);
    const gameId = (await request(app).post("/api/games")).body.gameId as string;
    const big = Buffer.alloc(1024 * 1024 + 1, 1);
    const res = await request(app).post(`/api/games/${gameId}/voice`).set("Content-Type", "audio/wav").send(big);
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
    deps.store.stop();
  });
});

