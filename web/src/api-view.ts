import type { PlayerView } from "./api-types";

function toItem(value: unknown): { id: string; name: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec["id"] !== "string") return null;
  if (typeof rec["name"] !== "string") return null;
  return { id: rec["id"], name: rec["name"] };
}

export function toPlayerView(value: unknown): PlayerView | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  const room = rec["room"];
  const exits = rec["exits"];
  const items = rec["items"];
  const player = rec["player"];
  if (typeof room !== "object" || room === null || Array.isArray(room)) return null;
  const roomRec = room as Record<string, unknown>;
  if (typeof roomRec["id"] !== "string") return null;
  if (typeof roomRec["name"] !== "string") return null;
  if (typeof roomRec["description"] !== "string") return null;
  if (!Array.isArray(exits) || !Array.isArray(items)) return null;
  if (typeof player !== "object" || player === null || Array.isArray(player)) return null;
  const pRec = player as Record<string, unknown>;
  if (typeof pRec["hp"] !== "number") return null;
  if (typeof pRec["maxHp"] !== "number") return null;
  if (!Array.isArray(pRec["inventory"])) return null;
  if (typeof pRec["turn"] !== "number") return null;
  if (typeof pRec["maxTurns"] !== "number") return null;
  const st = pRec["status"];
  if (st !== "playing" && st !== "won" && st !== "lost") return null;
  return value as PlayerView;
}

export function toViewItems(items: unknown): { id: string; name: string }[] {
  if (!Array.isArray(items)) return [];
  const out: { id: string; name: string }[] = [];
  for (const i of items) {
    const item = toItem(i);
    if (item !== null) out.push(item);
  }
  return out;
}
