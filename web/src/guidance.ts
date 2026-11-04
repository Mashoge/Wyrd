import type { PlayerView, ToolLogEntry } from "./api-types";
import { turnsLeft } from "./format";

/**
 * First-time player guidance: intro cards, one-time tips, and the help panel.
 * Pure logic + localStorage helpers (all try/catch — storage may be blocked,
 * in which case guidance still works for this visit).
 */

export interface IntroCard {
  title: string;
  body: string;
}

export const INTRO_CARDS: IntroCard[] = [
  {
    title: "Your goal",
    body: "Find the Lost Relic and escape through the gate before your torch burns out (40 turns).",
  },
  {
    title: "How to act",
    body: "Click an idea, type anything, or press the mic and say it. Clever ideas work too: the rules roll the dice for them.",
  },
  {
    title: "Why Wyrd is different",
    body: "Meta's Muse Spark tells the story, but code checks every move. Where the relic and the trap are was sealed before you started. At the end, your browser checks that seal.",
  },
];

export interface HelpEntry {
  title: string;
  body: string;
}

/** Short guide to each part of the screen, shown under the intro cards. */
export const HELP_GUIDE: HelpEntry[] = [
  { title: "Story", body: "The story, top to bottom. The newest part has a violet bar." },
  {
    title: "What you can do + Your idea",
    body: "Buttons for easy moves. “Your idea” (Something else…) lets you type your own move.",
  },
  { title: "The text box / mic / EN-TL", body: "Type what you do, or press the mic and say it. EN / TL picks the speech language." },
  { title: "Test the rules", body: "Try a cheat on purpose. The rules will refuse it." },
  { title: "Where you are", body: "Your room and a map of the rooms you have found." },
  { title: "The enemy card", body: "The enemy here, if any. Its hearts show how much it can take." },
  { title: "You", body: "Your hearts, turns left, and what you carry." },
  {
    title: "Action log",
    body: "What happened, in plain words: ✓ worked, ◐ worked at a cost, ✗ failed, REFUSED the rules said no.",
  },
  { title: "Goal", body: "Find the Lost Relic, then escape through the gate." },
  { title: "The Fate sealed seal", body: "Top right. It proves the relic and the trap were locked in before you started." },
  { title: "Inspector", body: "For the curious: what the AI asked for, and what the rules allowed." },
];

export type TipId = "enemy" | "dice" | "refused" | "omen" | "attempt" | "torch" | "gameover";

export interface Tip {
  id: TipId;
  text: string;
}

export const TIPS: Record<TipId, Tip> = {
  enemy: { id: "enemy", text: "An enemy! Attack, sneak past, or try something clever. Its hearts show how much it can take." },
  dice: { id: "dice", text: "Dice decide risky moves. The number shows what you rolled and what you needed." },
  refused: { id: "refused", text: "The rules refused that. The AI can't give you things that aren't in the game." },
  omen: { id: "omen", text: "Omens hint at danger behind a door." },
  attempt: { id: "attempt", text: "Your idea was judged by the rules: success, partial (it works, but at a cost), or fail." },
  torch: { id: "torch", text: "Your torch is burning low. Head for the gate." },
  gameover: { id: "gameover", text: "Every game ends with a seal check, win or lose. It proves the AI never moved the relic or the trap." },
};

/** Fixed display priority when several tips trigger on the same turn. */
export const TIP_ORDER: TipId[] = ["refused", "omen", "attempt", "dice", "enemy", "torch", "gameover"];

/* ---------------- localStorage (try/catch everywhere) ---------------- */

export const INTRO_SEEN_KEY = "wyrd.guidance.introSeen";
export const tipSeenKey = (id: TipId): string => `wyrd.guidance.tip.${id}`;

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* guidance still works for this visit */
  }
}

export function hasSeenIntro(): boolean {
  return storageGet(INTRO_SEEN_KEY) === "1";
}

export function markIntroSeen(): void {
  storageSet(INTRO_SEEN_KEY);
}

export function hasSeenTip(id: TipId): boolean {
  return storageGet(tipSeenKey(id)) === "1";
}

export function markTipSeen(id: TipId): void {
  storageSet(tipSeenKey(id));
}

/* ---------------- tip queue ---------------- */

/**
 * One tip at a time. `pending` holds ids that triggered but must wait for
 * the showing tip to be closed first. Nothing queued is ever lost.
 */
export class TipQueue {
  private seen = new Set<TipId>();
  private pending: TipId[] = [];
  private current: TipId | null = null;

  constructor(isSeen: (id: TipId) => boolean = hasSeenTip) {
    for (const id of TIP_ORDER) {
      if (isSeen(id)) this.seen.add(id);
    }
  }

  /** Offer newly triggered tips; returns the tip now showing. */
  offer(ids: Iterable<TipId>): Tip | null {
    for (const id of ids) {
      if (this.seen.has(id) || id === this.current || this.pending.includes(id)) continue;
      this.pending.push(id);
    }
    this.pending.sort((a, b) => TIP_ORDER.indexOf(a) - TIP_ORDER.indexOf(b));
    if (this.current === null && this.pending.length > 0) {
      this.current = this.pending.shift() ?? null;
    }
    return this.currentTip();
  }

  currentTip(): Tip | null {
    return this.current === null ? null : TIPS[this.current];
  }

  get currentId(): TipId | null {
    return this.current;
  }

  get pendingIds(): TipId[] {
    return [...this.pending];
  }

  /** Close the showing tip (X or the player's next action). It never shows again. */
  closeCurrent(markSeen: (id: TipId) => void = markTipSeen): Tip | null {
    if (this.current === null) return null;
    const done = this.current;
    this.seen.add(done);
    markSeen(done);
    this.current = this.pending.shift() ?? null;
    return this.currentTip();
  }
}

/* ---------------- trigger detection ---------------- */

export interface TipSnapshot {
  /** Tool calls made by the player's own actions this visit (not the opening). */
  entries: ToolLogEntry[];
  view: PlayerView | null;
  over: boolean;
}

/**
 * Which tips have their condition met by this snapshot. Pure: seen/queued
 * filtering happens in TipQueue. Conditions based on the view (an enemy in
 * the first room) count from the opening — the tip simply waits for the
 * player's next action, or its X, to close.
 */
export function detectTips(snap: TipSnapshot): TipId[] {
  const found = new Set<TipId>();
  const { view } = snap;
  if (view !== null) {
    const enemy = view.enemy;
    if (enemy !== null && !enemy.defeated && !enemy.passed) found.add("enemy");
    if (view.exits.some((e) => typeof e.omen === "string" && e.omen.trim().length > 0)) found.add("omen");
    if (turnsLeft(view.player) <= 10) found.add("torch");
  }
  for (const entry of snap.entries) {
    if (!entry.result.ok) found.add("refused");
    for (const roll of entry.result.rolls) {
      found.add("dice");
      if (roll.purpose.trim().toLowerCase() === "attempt") found.add("attempt");
    }
  }
  if (snap.over) found.add("gameover");
  return TIP_ORDER.filter((id) => found.has(id));
}

