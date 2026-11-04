import { ApiError, apiBaseUrl } from "./api-base";
import type { RevealResponse } from "./verify";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function toReveal(body: Record<string, unknown>): RevealResponse | null {
  if (typeof body["rulesVersion"] !== "string") return null;
  if (typeof body["salt"] !== "string") return null;
  if (typeof body["commitment"] !== "string") return null;
  if (!isRecord(body["secrets"])) return null;
  if (typeof body["secrets"]["relicRoomId"] !== "string") return null;
  if (!isRecord(body["secrets"]["trap"])) return null;
  if (typeof body["secrets"]["trap"]["roomId"] !== "string") return null;
  if (typeof body["secrets"]["trap"]["direction"] !== "string") return null;
  if (!isRecord(body["display"])) return null;
  if (typeof body["display"]["relicRoom"] !== "string") return null;
  if (typeof body["display"]["trapRoom"] !== "string") return null;
  if (typeof body["display"]["trapDirection"] !== "string") return null;
  if (body["nearMiss"] !== null && typeof body["nearMiss"] !== "string") return null;
  if (body["tip"] !== null && typeof body["tip"] !== "string") return null;
  return body as unknown as RevealResponse;
}

export async function fetchReveal(gameId: string): Promise<RevealResponse> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/api/games/${encodeURIComponent(gameId)}/reveal`);
  } catch {
    throw new ApiError(502, "Couldn't fetch the proof.");
  }
  let body: Record<string, unknown> = {};
  try {
    const raw: unknown = await res.json();
    if (isRecord(raw)) body = raw;
  } catch {
    body = {};
  }
  if (!res.ok) {
    const msg = typeof body["error"] === "string" && body["error"].length > 0 ? body["error"] : "Couldn't fetch the proof.";
    throw new ApiError(res.status, msg);
  }
  const reveal = toReveal(body);
  if (reveal === null) throw new ApiError(502, "Couldn't fetch the proof.");
  return reveal;
}
