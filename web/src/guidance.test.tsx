import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  INTRO_CARDS,
  INTRO_SEEN_KEY,
  TIPS,
  TipQueue,
  detectTips,
  hasSeenIntro,
  hasSeenTip,
  markIntroSeen,
  markTipSeen,
  tipSeenKey,
  type TipId,
} from "./guidance";
import { TipCard } from "./components/TipCard";
import { IntroModal } from "./components/IntroModal";
import { HelpPanel } from "./components/HelpPanel";
import type { PlayerView, ToolLogEntry } from "./api-types";

const noop = (): void => {};

function view(partial: Partial<PlayerView> = {}): PlayerView {
  return {
    room: { id: "hall", name: "Hall", description: "" },
    exits: [{ direction: "north", locked: false }],
    items: [],
    enemy: null,
    player: { hp: 5, maxHp: 5, inventory: [], turn: 1, maxTurns: 40, status: "playing" },
    ...partial,
  };
}

function entry(partial: Partial<ToolLogEntry["result"]> & { name?: string }): ToolLogEntry {
  const { name, ...result } = partial;
  return {
    name: name ?? "move",
    args: {},
    result: { ok: true, action: name ?? "move", rolls: [], events: [], ...result },
  };
}

const roll = (purpose: string): ToolLogEntry["result"]["rolls"][number] => ({
  purpose,
  sides: 20,
  value: 12,
  target: 10,
  success: true,
  bonus: 0,
});

const enemy = { id: "goblin", name: "Goblin", quirk: "", passed: false, defeated: false, condition: "unhurt" as const };

describe("intro and help content", () => {
  it("has the 3 plain intro cards", () => {
    expect(INTRO_CARDS.map((c) => c.title)).toEqual(["Your goal", "How to act", "Why Wyrd is different"]);
    expect(INTRO_CARDS[0]?.body).toContain("(40 turns)");
    expect(INTRO_CARDS[2]?.body).toContain("your browser checks that seal");
  });

  it("renders the intro closed as nothing and the help panel with the guide", () => {
    expect(renderToStaticMarkup(<IntroModal open={false} onClose={noop} />)).toBe("");
    const help = renderToStaticMarkup(<HelpPanel open onClose={noop} />);
    expect(help).toContain("How to play");
    expect(help).toContain("Your goal");
    expect(help).toContain("What you can do + Your idea");
    expect(help).toContain("Test the rules");
    expect(help).toContain("Where you are");
    expect(help).toContain("The Fate sealed seal");
    expect(help).toContain("Inspector");
    expect(help).toContain("✓");
    expect(help).toContain("◐");
    expect(help).toContain("REFUSED");
  });
});

describe("intro and help panel rendering", () => {
  it("intro renders nothing closed; open shows the first card with real Next/Back/Skip buttons", () => {
    expect(renderToStaticMarkup(<IntroModal open={false} onClose={noop} />)).toBe("");
    const html = renderToStaticMarkup(<IntroModal open onClose={noop} />);
    expect(html).toContain("Your goal");
    expect(html).toContain("(40 turns)");
    expect(html).toContain("Next");
    expect(html).toContain("Back");
    expect(html).toContain("Skip");
    expect(html).toContain('aria-label="Skip intro"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it("help panel renders nothing closed; open shows the intro cards and the screen guide", () => {
    expect(renderToStaticMarkup(<HelpPanel open={false} onClose={noop} />)).toBe("");
    const html = renderToStaticMarkup(<HelpPanel open onClose={noop} />);
    expect(html).toContain("How to play");
    expect(html).toContain("Your goal");
    expect(html).toContain("How to act");
    expect(html).toContain("Why Wyrd is different");
    expect(html).toContain("Story");
    expect(html).toContain("What you can do + Your idea");
    expect(html).toContain("The text box / mic / EN-TL");
    expect(html).toContain("Test the rules");
    expect(html).toContain("Where you are");
    expect(html).toContain("The enemy card");
    expect(html).toContain("Action log");
    expect(html).toContain("✓");
    expect(html).toContain("◐");
    expect(html).toContain("✗");
    expect(html).toContain("REFUSED");
    expect(html).toContain("Goal");
    expect(html).toContain("The Fate sealed seal");
    expect(html).toContain("Inspector");
    expect(html).toContain('aria-label="Close how to play"');
    expect(html).toContain('role="dialog"');
  });
});

describe("intro seen in localStorage (first visit vs seen)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubStorage(): Map<string, string> {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string): string | null => store.get(k) ?? null,
        setItem: (k: string, v: string): void => {
          store.set(k, v);
        },
      },
    });
    return store;
  }

  it("first visit: unseen until marked, then seen", () => {
    const store = stubStorage();
    expect(hasSeenIntro()).toBe(false);
    markIntroSeen();
    expect(store.get(INTRO_SEEN_KEY)).toBe("1");
    expect(hasSeenIntro()).toBe(true);
  });

  it("blocked storage: unseen, and marking never throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (): string | null => {
          throw new Error("blocked");
        },
        setItem: (): void => {
          throw new Error("blocked");
        },
      },
    });
    expect(hasSeenIntro()).toBe(false);
    expect(() => markIntroSeen()).not.toThrow();
    expect(hasSeenTip("dice")).toBe(false);
    expect(() => markTipSeen("dice")).not.toThrow();
  });

  it("a tip closed via the queue stays seen on the next visit", () => {
    stubStorage();
    const queue = new TipQueue();
    expect(queue.offer(["enemy"])?.id).toBe("enemy");
    queue.closeCurrent();
    expect(hasSeenTip("enemy")).toBe(true);
    const nextVisit = new TipQueue();
    expect(nextVisit.offer(["enemy"])).toBeNull();
  });
});

describe("tip rendering", () => {
  it("shows one angled tip card with a TIP tag and an X button", () => {
    const html = renderToStaticMarkup(<TipCard tip={TIPS.enemy} onClose={noop} />);
    expect(html).toContain("Tip");
    expect(html).toContain(TIPS.enemy.text);
    expect(html).toContain('aria-label="Close tip"');
    expect(html).toContain("panel-cut");
    expect(renderToStaticMarkup(<TipCard tip={null} onClose={noop} />)).toBe("");
  });
});

describe("tip queue: once-only and queued", () => {
  it("shows one at a time in priority order and never repeats a closed tip", () => {
    const seen = new Set<TipId>();
    const queue = new TipQueue((id) => seen.has(id));
    const mark = (id: TipId): void => {
      seen.add(id);
    };
    expect(queue.offer(["enemy", "dice"])?.id).toBe("dice");
    expect(queue.currentId).toBe("dice");
    expect(queue.pendingIds).toEqual(["enemy"]);
    // Offering the same triggers again does not duplicate the queue.
    queue.offer(["enemy", "dice"]);
    expect(queue.pendingIds).toEqual(["enemy"]);
    expect(queue.closeCurrent(mark)?.id).toBe("enemy");
    expect(queue.closeCurrent(mark)).toBeNull();
    // Once closed, a tip is never offered again.
    expect(queue.offer(["dice", "enemy"])).toBeNull();
    expect(queue.offer(["torch"])?.id).toBe("torch");
  });

  it("skips tips already seen in localStorage", () => {
    const queue = new TipQueue((id) => id === "dice");
    expect(queue.offer(["dice", "enemy"])?.id).toBe("enemy");
    expect(tipSeenKey("dice")).toBe("wyrd.guidance.tip.dice");
  });
});

describe("detectTips", () => {
  it("detects each trigger from view, entries, and game over", () => {
    expect(detectTips({ entries: [], view: view(), over: false })).toEqual([]);
    expect(detectTips({ entries: [], view: view({ enemy }), over: false })).toContain("enemy");
    expect(detectTips({ entries: [], view: view({ enemy: { ...enemy, defeated: true } }), over: false })).not.toContain("enemy");
    expect(
      detectTips({ entries: [], view: view({ exits: [{ direction: "east", locked: false, omen: "Low chanting." }] }), over: false }),
    ).toContain("omen");
    expect(detectTips({ entries: [entry({ rolls: [roll("player attack")] })], view: view(), over: false })).toContain("dice");
    const attempt = detectTips({ entries: [entry({ name: "attempt", rolls: [{ ...roll("attempt"), result: "partial" }] })], view: view(), over: false });
    expect(attempt).toContain("attempt");
    expect(attempt).toContain("dice");
    expect(detectTips({ entries: [entry({ ok: false, reason: "No." })], view: view(), over: false })).toContain("refused");
    const low = view();
    low.player = { ...low.player, turn: 31 };
    expect(detectTips({ entries: [], view: low, over: false })).toContain("torch");
    const fresh = view();
    fresh.player = { ...fresh.player, turn: 29 };
    expect(detectTips({ entries: [], view: fresh, over: false })).not.toContain("torch");
    expect(detectTips({ entries: [], view: view(), over: true })).toContain("gameover");
  });

  it("orders same-turn tips refused, omen, attempt, dice, enemy, torch, gameover", () => {
    const low = view({ enemy, exits: [{ direction: "east", locked: false, omen: "Low chanting." }] });
    low.player = { ...low.player, turn: 35 };
    const ids = detectTips({
      entries: [entry({ ok: false }), entry({ name: "attempt", rolls: [{ ...roll("attempt"), result: "fail" }] })],
      view: low,
      over: true,
    });
    expect(ids).toEqual(["refused", "omen", "attempt", "dice", "enemy", "torch", "gameover"]);
  });
});
