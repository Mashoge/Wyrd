import type { PlayerView } from "../api-types";

export function freeTextHint(view: PlayerView | null): string {
  const enemy = view?.enemy ?? null;
  if (enemy !== null && enemy.defeated !== true && enemy.passed !== true) {
    return `Try: throw something at the ${enemy.name}`;
  }
  const items = view?.items ?? [];
  const first = items.length > 0 ? items[0] : undefined;
  if (first !== undefined && typeof first.name === "string" && first.name.length > 0) {
    return `Try: examine the ${first.name} closely`;
  }
  return "Try: ask what you hear";
}
