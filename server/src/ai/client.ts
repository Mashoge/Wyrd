export interface ChatToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface AssistantMessage {
  content: string | null;
  tool_calls?: ChatToolCall[];
}

export type ToolChoice = "auto" | "none";

/** The Meta model id actually used. Single source of truth; index.ts and loop.ts read this. */
export const MUSE_MODEL = "muse-spark-1.3";

export interface MuseClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface MuseClient {
  readonly model: string;
  chat(
    messages: ChatMessage[],
    tools?: unknown[],
    toolChoice?: ToolChoice,
  ): Promise<AssistantMessage>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAssistantMessage(data: unknown): AssistantMessage {
  if (!isRecord(data)) {
    throw new Error("Muse request failed: malformed response (no choices).");
  }
  const choices: unknown = data["choices"];
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Muse request failed: malformed response (no choices).");
  }
  const first: unknown = choices[0];
  if (!isRecord(first)) {
    throw new Error("Muse request failed: malformed response (no message).");
  }
  const message: unknown = first["message"];
  if (!isRecord(message)) {
    throw new Error("Muse request failed: malformed response (no message).");
  }
  const contentRaw: unknown = message["content"];
  const content: string | null =
    typeof contentRaw === "string" ? contentRaw : null;
  const toolCallsRaw: unknown = message["tool_calls"];
  if (toolCallsRaw === undefined || toolCallsRaw === null) {
    return { content };
  }
  if (!Array.isArray(toolCallsRaw)) {
    throw new Error("Muse request failed: malformed response (bad tool_calls).");
  }
  const toolCalls: ChatToolCall[] = [];
  for (const entry of toolCallsRaw) {
    if (!isRecord(entry)) {
      throw new Error(
        "Muse request failed: malformed response (bad tool_calls).",
      );
    }
    const id: unknown = entry["id"];
    const fn: unknown = entry["function"];
    if (typeof id !== "string" || !isRecord(fn)) {
      throw new Error(
        "Muse request failed: malformed response (bad tool_calls).",
      );
    }
    const name: unknown = fn["name"];
    const args: unknown = fn["arguments"];
    if (typeof name !== "string" || typeof args !== "string") {
      throw new Error(
        "Muse request failed: malformed response (bad tool_calls).",
      );
    }
    toolCalls.push({
      id,
      type: "function",
      function: { name, arguments: args },
    });
  }
  return { content, tool_calls: toolCalls };
}

export function createMuseClient(options: MuseClientOptions): MuseClient {
  const {
    apiKey,
    fetchImpl = fetch,
    model = MUSE_MODEL,
    baseUrl = "https://api.meta.ai/v1",
    timeoutMs = 30000,
  } = options;
  return {
    model,
    async chat(
      messages: ChatMessage[],
      tools?: unknown[],
      toolChoice?: ToolChoice,
    ): Promise<AssistantMessage> {
      const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
      const body: Record<string, unknown> = { model, messages };
      if (tools !== undefined) {
        body["tools"] = tools;
      }
      if (toolChoice !== undefined) {
        body["tool_choice"] = toolChoice;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      try {
        let res: Response;
        try {
          res = await fetchImpl(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } catch (err) {
          if (controller.signal.aborted) {
            throw new Error(
              `Muse request timed out after ${timeoutMs}ms.`,
            );
          }
          throw err;
        }
        if (!res.ok) {
          let text = "";
          try {
            text = await res.text();
          } catch {
            text = "";
          }
          const snippet = text.slice(0, 300);
          throw new Error(
            `Muse request failed with status ${res.status}: ${snippet}`,
          );
        }
        const data: unknown = await res.json();
        return parseAssistantMessage(data);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
