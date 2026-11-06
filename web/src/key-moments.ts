import type { Easing } from "framer-motion";
import type { DiceRoll, PlayerViewEnemy, ToolLogEntry } from "./api";
import { shortRefusalReason } from "./format";

/** Snappy overshoot easing from docs/UI_STYLE.md section 5. Never skew text. */
export const SNAPPY_EASE: Easing = [0.175, 0.885, 0.32, 1.275];

export const CORAL = "#FF6B5B";
export const MINT = "#4DE8B5";
export const VIOLET = "#B44DFF";
export const MUTED = "#B9AEC0";

/* REFUSED stamp */

/** Tool-log entries the rule engine rejected (`result.ok === false`). */
export function rejectedEntries(toolLog: ToolLogEntry[]): ToolLogEntry[] {
  return toolLog.filter((e) => !e.result.ok);
}

/** True when a turn gets a REFUSED stamp: it contains any rejected claim. */
export function turnHasRefusal(toolLog: ToolLogEntry[]): boolean {
  return toolLog.some((e) => !e.result.ok);
}

export interface RefusalDisplay {
  /** Short muted reason line shown below the stamp. */
  reason: string;
  /** How many claims were rejected in this turn. */
  count: number;
}

/** Display data for a turn's REFUSED stamp, or null when nothing was rejected. */
export function refusalForTurn(toolLog: ToolLogEntry[]): RefusalDisplay | null {
  const rejected = rejectedEntries(toolLog);
  const first = rejected[0];
  if (first === undefined) return null;
  return { reason: shortRefusalReason(first.result.reason), count: rejected.length };
}

/* Dice cut-in */

export type RollTone = "hit" | "miss" | "partial";

export interface RollDisplay {
  label: string;
  value: number;
  sides: number;
  target: number;
  /** Uppercase outcome word(s), e.g. "HIT", "PARTIAL", "IT HITS YOU". */
  outcome: string;
  /** "NEEDED 9+ → HIT" (outcome uppercased). */
  neededText: string;
  /** Meaning color: mint hit/success, coral miss/fail/danger, violet partial. */
  tone: RollTone;
  toneColor: string;
}

function purposeLabel(purpose: string): string {
  const map: Record<string, string> = {
    "player attack": "Attack roll",
    "enemy attack": "Enemy attack",
    sneak: "Sneak roll",
    grab: "Grab roll",
    attempt: "Attempt roll",
  };
  const lowered = purpose.trim().toLowerCase();
  if (lowered in map) return map[lowered] as string;
  if (lowered.length === 0) return "Roll";
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}

/**
 * Display data for the dice cut-in, or null for rolls that are not checks
 * (damage, trap, …: target <= 0). Those keep the compact text line.
 * Tone follows the guide's meaning colors from the player's side:
 * an enemy attack that lands is danger (coral), one that misses is mint.
 */
export function rollDisplay(roll: DiceRoll): RollDisplay | null {
  if (roll.target <= 0) return null;
  const lower = roll.purpose.trim().toLowerCase();
  let outcome: string;
  let tone: RollTone;
  if (lower === "attempt" && roll.result !== undefined) {
    outcome = roll.result.toUpperCase();
    tone = roll.result === "success" ? "hit" : roll.result === "partial" ? "partial" : "miss";
  } else if (lower === "player attack") {
    outcome = roll.success ? "HIT" : "MISS";
    tone = roll.success ? "hit" : "miss";
  } else if (lower === "enemy attack") {
    outcome = roll.success ? "IT HITS YOU" : "IT MISSES";
    tone = roll.success ? "miss" : "hit";
  } else {
    outcome = roll.success ? "SUCCESS" : "FAIL";
    tone = roll.success ? "hit" : "miss";
  }
  return {
    label: purposeLabel(roll.purpose),
    value: roll.value,
    sides: roll.sides,
    target: roll.target,
    outcome,
    neededText: `NEEDED ${roll.target}+ → ${outcome}`,
    tone,
    toneColor: tone === "hit" ? MINT : tone === "miss" ? CORAL : VIOLET,
  };
}

/** Check rolls (cut-in worthy) vs the rest (compact text), order preserved. */
export function splitRolls(rolls: DiceRoll[]): { checks: RollDisplay[]; others: DiceRoll[] } {
  const checks: RollDisplay[] = [];
  const others: DiceRoll[] = [];
  for (const r of rolls) {
    const d = rollDisplay(r);
    if (d === null) others.push(r);
    else checks.push(d);
  }
  return { checks, others };
}

/**
 * Digits shown while the die spins: `steps` faces in 1..sides, always
 * landing on the real value last. Randomness is injected for tests.
 */
export function spinSequence(
  finalValue: number,
  sides: number,
  steps = 6,
  rng: () => number = Math.random,
): number[] {
  const faces = Math.max(1, Math.floor(sides));
  const count = Math.max(1, Math.floor(steps));
  const out: number[] = [];
  for (let i = 0; i < count - 1; i += 1) {
    out.push(1 + Math.min(faces - 1, Math.max(0, Math.floor(rng() * faces))));
  }
  out.push(finalValue);
  return out;
}


/* First-visit room detection */

/**
 * Tracks visited rooms per game. Seed it with the rooms already known
 * (fresh start room / resumed map) so only genuinely new rooms entered
 * afterwards count as first visits.
 */
export class FirstVisitTracker {
  private gameKey: string | null = null;
  private seen = new Set<string>();

  /** Start tracking a game, seeding rooms that must not trigger a card. */
  beginGame(gameKey: string, seedRoomIds: Iterable<string> = []): void {
    this.gameKey = gameKey;
    this.seen = new Set(seedRoomIds);
  }

  /**
   * Record entering `roomId`. True exactly once per room per game (the
   * first visit). A different gameKey resets the tracker (seeded empty).
   */
  observe(gameKey: string, roomId: string): boolean {
    if (this.gameKey !== gameKey) {
      this.gameKey = gameKey;
      this.seen = new Set<string>();
    }
    if (this.seen.has(roomId)) return false;
    this.seen.add(roomId);
    return true;
  }

  hasSeen(roomId: string): boolean {
    return this.seen.has(roomId);
  }
}

/* First-encounter cut-in detection */

/**
 * Tracks enemies already met per game. Seed it on start/resume with the
 * enemy currently present (if any) so resuming beside an enemy does not
 * replay its cut-in; afterwards each new enemy id triggers exactly once.
 */
export class FirstEncounterTracker {
  private gameKey: string | null = null;
  private seen = new Set<string>();

  beginGame(gameKey: string, seedEnemyIds: Iterable<string> = []): void {
    this.gameKey = gameKey;
    this.seen = new Set(seedEnemyIds);
  }

  /**
   * The enemy earning a cut-in right now, or null. Marks it seen, so each
   * enemy triggers exactly once per game. A new gameKey resets (unseeded).
   */
  trigger(gameKey: string, enemy: PlayerViewEnemy | null): PlayerViewEnemy | null {
    if (this.gameKey !== gameKey) {
      this.gameKey = gameKey;
      this.seen = new Set<string>();
    }
    const hit = cutInEnemy(enemy, this.seen);
    if (hit !== null) this.seen.add(hit.id);
    return hit;
  }
}

/**
 * Pure: which enemy (if any) earns an encounter cut-in given the enemy now
 * present and the ids already seen. Null for no enemy, an already-seen
 * enemy, or an already-defeated enemy (its card alone is enough).
 */
export function cutInEnemy(
  enemy: PlayerViewEnemy | null,
  seenEnemyIds: ReadonlySet<string>,
): PlayerViewEnemy | null {
  if (enemy === null || enemy.defeated) return null;
  return seenEnemyIds.has(enemy.id) ? null : enemy;
}

