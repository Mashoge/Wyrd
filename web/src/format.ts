import type { DiceRoll, ToolLogEntry } from "./api";

function titleCasePurpose(purpose: string): string {
  const map: Record<string, string> = {
    "player attack": "Attack roll",
    "enemy attack": "Enemy attack",
    sneak: "Sneak roll",
    grab: "Grab roll",
    "player damage": "Damage",
    trap: "Trap",
  };
  const lowered = purpose.trim().toLowerCase();
  if (lowered in map) return map[lowered] as string;
  if (lowered.length === 0) return "Roll";
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

/** Compact roll row, e.g. "Attack roll 17 · needed 9+ → hit" or "Damage 3 + 2 = 5". */
export function formatRoll(roll: DiceRoll): string {
  const label = titleCasePurpose(roll.purpose);
  const lower = roll.purpose.trim().toLowerCase();
  if (lower === "player damage") {
    if (roll.bonus > 0) return `${label} ${roll.value} + ${roll.bonus} = ${roll.value + roll.bonus}`;
    return `${label} ${roll.value}`;
  }
  if (lower === "trap") {
    return `${label} ${roll.value} damage`;
  }
  if (roll.target > 0) {
    const outcome =
      lower === "player attack"
        ? roll.success
          ? "hit"
          : "miss"
        : lower === "enemy attack"
          ? roll.success
            ? "it hits you"
            : "it misses"
          : roll.success
            ? "success"
            : "fail";
    return `${label} ${roll.value} · needed ${roll.target}+ → ${outcome}`;
  }
  return `${label} ${roll.value}`;
}

export interface PlainToolCall {
  label: string;
  accepted: boolean;
  failed: boolean;
  detail: string;
}

function argText(args: Record<string, unknown>, key: string): string | null {
  const v: unknown = args[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function prettyId(id: string): string {
  return id
    .split("_")
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function hasFailedPlayerRoll(rolls: DiceRoll[]): boolean {
  for (const r of rolls) {
    const purpose = r.purpose.trim().toLowerCase();
    if (r.success) continue;
    if (purpose === "player attack" || purpose === "sneak" || purpose === "grab") return true;
  }
  return false;
}

/** Tool call → plain words for the Action log. */
export function toolToPlain(entry: ToolLogEntry): PlainToolCall {
  const accepted = entry.result.ok;
  const failed = accepted && hasFailedPlayerRoll(entry.result.rolls);
  const detail = accepted
    ? (failed ? entry.result.events.join(" ") : "")
    : (entry.result.reason ?? "It did not work.");
  switch (entry.name) {
    case "move": {
      const dir = argText(entry.args, "direction") ?? "onward";
      return { label: `Moved ${dir}`, accepted, failed, detail };
    }
    case "pick_up": {
      const id = argText(entry.args, "item_id") ?? "item";
      if (failed) return { label: `Failed to grab the ${prettyId(id)}`, accepted, failed, detail };
      return { label: `Took the ${prettyId(id)}`, accepted, failed, detail };
    }
    case "use_item": {
      const id = argText(entry.args, "item_id") ?? "item";
      const dir = argText(entry.args, "direction");
      if (!accepted) {
        return {
          label: dir !== null ? `Used the ${prettyId(id)} to the ${dir}` : `Used the ${prettyId(id)}`,
          accepted,
          failed,
          detail,
        };
      }
      if (failed) return { label: `Failed to ${prettyId(entry.name)}`, accepted, failed, detail };
      return {
        label: dir !== null ? `Used the ${prettyId(id)} to the ${dir}` : `Used the ${prettyId(id)}`,
        accepted,
        failed,
        detail,
      };
    }
    case "attack": {
      const id = argText(entry.args, "enemy_id") ?? "enemy";
      if (failed) return { label: `Missed the ${prettyId(id)}`, accepted, failed, detail };
      return { label: `Struck the ${prettyId(id)}`, accepted, failed, detail };
    }
    case "sneak": {
      const id = argText(entry.args, "enemy_id") ?? "enemy";
      if (failed) return { label: `Failed to sneak past the ${prettyId(id)}`, accepted, failed, detail };
      return { label: `Sneaked past the ${prettyId(id)}`, accepted, failed, detail };
    }
    case "look":
      return { label: "Looked around", accepted, failed, detail };
    case "examine": {
      const id = argText(entry.args, "item_id") ?? "item";
      return { label: `Examined the ${prettyId(id)}`, accepted, failed, detail };
    }
    default:
      return { label: accepted ? (failed ? `Failed to ${prettyId(entry.name)}` : `Did ${prettyId(entry.name)}`) : `Claimed ${prettyId(entry.name)}`, accepted, failed, detail };
  }
}

/** Filled hearts for hp/maxHp, clamped. */
export function hearts(hp: number, maxHp: number): boolean[] {
  const max = Math.max(0, Math.floor(maxHp));
  const filled = Math.min(max, Math.max(0, Math.floor(hp)));
  return Array.from({ length: max }, (_, i) => i < filled);
}

export function turnsLeft(hp: { turn: number; maxTurns: number }): number {
  return Math.max(0, hp.maxTurns - hp.turn);
}

export function threadFraction(hp: { turn: number; maxTurns: number }): number {
  if (hp.maxTurns <= 0) return 0;
  return Math.min(1, Math.max(0, (hp.maxTurns - hp.turn) / hp.maxTurns));
}

export function shortCommit(commitment: string): string {
  if (commitment.length <= 12) return commitment;
  return `${commitment.slice(0, 6)}…${commitment.slice(-5)}`;
}

const RELIC_IDS = new Set(["lost_relic", "lost relic"]);

export function hasRelic(inventory: Array<{ id: string; name: string }>): boolean {
  return inventory.some((i) => RELIC_IDS.has(i.id.toLowerCase()) || i.name.toLowerCase() === "lost relic");
}
