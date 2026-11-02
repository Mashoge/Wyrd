import { describe, expect, it } from "vitest";
import type { ChatMessage } from "./client.js";
import { createMuseClient } from "./client.js";

function okResponse(message: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(message),
  } as Response;
}

describe("createMuseClient", () => {
  it("posts to the right URL with headers and body", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return okResponse({
        choices: [{ message: { content: "hello" } }],
      });
    }) as typeof fetch;
    const client = createMuseClient({ apiKey: "SECRET-KEY", fetchImpl: fakeFetch });
    const messages: ChatMessage[] = [{ role: "user", content: "hi" }];
    const tools: unknown[] = [{ type: "function" }];
    const result = await client.chat(messages, tools, "auto");
    expect(result).toEqual({ content: "hello" });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://api.meta.ai/v1/chat/completions");
    const init = seen[0]?.init as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBe("Bearer SECRET-KEY");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["model"]).toBe("muse-spark-1.3");
    expect(body["messages"]).toEqual(messages);
    expect(body["tools"]).toEqual(tools);
    expect(body["tool_choice"]).toBe("auto");
  });

  it("aborts on timeout", async () => {
    const fakeFetch = ((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init.signal as AbortSignal | undefined;
        if (signal === undefined) return;
        if (signal.aborted) {
          reject(new Error("aborted"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    }) as typeof fetch;
    const client = createMuseClient({
      apiKey: "SECRET-KEY",
      fetchImpl: fakeFetch,
      timeoutMs: 20,
    });
    await expect(
      client.chat([{ role: "user", content: "hi" }]),
    ).rejects.toThrow(/timed out after 20ms/);
  });

  it("throws a status error without the API key in it", async () => {
    const fakeFetch = (async () =>
      ({
        ok: false,
        status: 401,
        text: () => Promise.resolve("unauthorized body snippet here"),
      }) as Response) as typeof fetch;
    const client = createMuseClient({
      apiKey: "SUPER-SECRET-API-KEY-12345",
      fetchImpl: fakeFetch,
    });
    let message = "";
    try {
      await client.chat([{ role: "user", content: "hi" }]);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("401");
    expect(message).toContain("unauthorized");
    expect(message).not.toContain("SUPER-SECRET-API-KEY-12345");
  });
});
