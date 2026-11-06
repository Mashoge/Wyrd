import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiceRoll, PlayerViewEnemy, ToolLogEntry } from "./api";
import {
  CORAL,
  FirstEncounterTracker,
  FirstVisitTracker,
  MINT,
  VIOLET,
  cutInEnemy,
  refusalForTurn,
  rejectedEntries,
  rollDisplay,
  spinSequence,
  splitRolls,
  turnHasRefusal,
} from "./key-moments";
import { DiceCutIn } from "./components/DiceCutIn";
import { EncounterCutIn } from "./components/EncounterCutIn";
import { RoomTitleCard } from "./components/RoomTitleCard";
import { StoryFeed } from "./components/StoryFeed";

function entry(ok: boolean, reason?: string, name = "pick_up"): ToolLogEntry {
  return { name, args: {}, result: { ok, action: name, reason, rolls: [], events: [] } };
}

function roll(partial: Partial<DiceRoll> & { purpose: string }): DiceRoll {
  return { sides: 20, value: 10, target: 10, success: true, bonus: 0, ...partial };
}

describe("REFUSED stamp selection", () => {
  it("flags only turns containing a rejected claim (result.ok === false)", () => {
    expect(turnHasRefusal([])).toBe(false);
    expect(turnHasRefusal([entry(true)])).toBe(false);
    expect(turnHasRefusal([entry(true), entry(false, "No such item here.")])).toBe(true);
    // A failed dice roll is not a refusal: the claim was accepted.
    const failedRoll = entry(true);
    failedRoll.result.rolls = [roll({ purpose: "player attack", value: 3, target: 9, success: false })];
    expect(turnHasRefusal([failedRoll])).toBe(false);
  });

  it("collects every rejected entry in order", () => {
    const log = [entry(true), entry(false, "A."), entry(true), entry(false, "B.")];
    expect(rejectedEntries(log).map((e) => e.result.reason)).toEqual(["A.", "B."]);
  });

  it("reuses the short refusal reason and counts rejections", () => {
    expect(refusalForTurn([entry(true)])).toBeNull();
    expect(
      refusalForTurn([entry(false, "There is no Legendary Sword here. The crypt holds only dust.")]),
    ).toEqual({ reason: "There is no Legendary Sword here.", count: 1 });
    expect(refusalForTurn([entry(false), entry(false, "Locked.")])).toEqual({
      reason: "It did not work.",
      count: 2,
    });
  });
});

describe("roll display data", () => {
  it("builds NEEDED text and mint tone for a hit", () => {
    const d = rollDisplay(roll({ purpose: "player attack", value: 17, target: 9, success: true }));
    expect(d?.neededText).toBe("NEEDED 9+ → HIT");
    expect(d?.tone).toBe("hit");
    expect(d?.toneColor).toBe(MINT);
    expect(d?.label).toBe("Attack roll");
  });

  it("uses coral for a miss/fail and violet for a partial", () => {
    const miss = rollDisplay(roll({ purpose: "player attack", value: 3, target: 9, success: false }));
    expect(miss?.neededText).toBe("NEEDED 9+ → MISS");
    expect(miss?.toneColor).toBe(CORAL);
    const partial = rollDisplay(
      roll({ purpose: "attempt", value: 11, target: 13, success: false, result: "partial" }),
    );
    expect(partial?.neededText).toBe("NEEDED 13+ → PARTIAL");
    expect(partial?.tone).toBe("partial");
    expect(partial?.toneColor).toBe(VIOLET);
    const fail = rollDisplay(roll({ purpose: "sneak", value: 2, target: 13, success: false }));
    expect(fail?.neededText).toBe("NEEDED 13+ → FAIL");
    expect(fail?.toneColor).toBe(CORAL);
  });

  it("colors an enemy attack from the player's side", () => {
    const lands = rollDisplay(roll({ purpose: "enemy attack", value: 15, target: 12, success: true }));
    expect(lands?.neededText).toBe("NEEDED 12+ → IT HITS YOU");
    expect(lands?.toneColor).toBe(CORAL);
    const whiffs = rollDisplay(roll({ purpose: "enemy attack", value: 5, target: 12, success: false }));
    expect(whiffs?.neededText).toBe("NEEDED 12+ → IT MISSES");
    expect(whiffs?.toneColor).toBe(MINT);
  });

  it("returns null for non-check rolls and splits a mixed turn", () => {
    expect(rollDisplay(roll({ purpose: "player damage", value: 4, target: 0, bonus: 2 }))).toBeNull();
    expect(rollDisplay(roll({ purpose: "trap", value: 3, target: 0 }))).toBeNull();
    const { checks, others } = splitRolls([
      roll({ purpose: "player attack", value: 17, target: 9, success: true }),
      roll({ purpose: "player damage", value: 4, target: 0, bonus: 2 }),
      roll({ purpose: "enemy attack", value: 5, target: 12, success: false }),
    ]);
    expect(checks.map((c) => c.outcome)).toEqual(["HIT", "IT MISSES"]);
    expect(others.map((r) => r.purpose)).toEqual(["player damage"]);
  });

  it("spins through injected digits and always lands on the real value", () => {
    const seq = [0, 0.5, 0.999];
    let i = 0;
    const rng = (): number => seq[i++] ?? 0;
    expect(spinSequence(17, 20, 4, rng)).toEqual([1, 11, 20, 17]);
    expect(spinSequence(17, 20, 1, rng)).toEqual([17]);
    expect(spinSequence(5, 6, 3, () => 2)).toEqual([6, 6, 5]);
  });
});

describe("FirstVisitTracker", () => {
  it("reports a first visit exactly once per room per game", () => {
    const t = new FirstVisitTracker();
    t.beginGame("g1", ["entrance"]);
    expect(t.observe("g1", "entrance")).toBe(false); // seeded start room
    expect(t.observe("g1", "hall")).toBe(true);
    expect(t.observe("g1", "hall")).toBe(false);
    expect(t.observe("g1", "vault")).toBe(true);
    expect(t.observe("g1", "hall")).toBe(false); // backtracking is not new
  });

  it("seeds a resumed game's whole visited map", () => {
    const t = new FirstVisitTracker();
    t.beginGame("g2", ["entrance", "hall", "vault"]);
    expect(t.observe("g2", "hall")).toBe(false);
    expect(t.observe("g2", "ossuary")).toBe(true);
  });

  it("resets when the game key changes", () => {
    const t = new FirstVisitTracker();
    t.beginGame("g1", ["entrance"]);
    expect(t.observe("g1", "hall")).toBe(true);
    expect(t.observe("g3", "hall")).toBe(true); // new game: first visit again
    t.beginGame("g4");
    expect(t.observe("g4", "entrance")).toBe(true);
  });
});

function foe(partial: Partial<PlayerViewEnemy> = {}): PlayerViewEnemy {
  return {
    id: "goblin", name: "Goblin", quirk: "keeps counting its coins",
    passed: false, defeated: false, condition: "unhurt", ...partial,
  };
}

describe("encounter cut-in selection", () => {
  it("cutInEnemy: first meeting only; null for none/seen/defeated", () => {
    expect(cutInEnemy(null, new Set())).toBeNull();
    expect(cutInEnemy(foe(), new Set())?.id).toBe("goblin");
    expect(cutInEnemy(foe(), new Set(["goblin"]))).toBeNull();
    expect(cutInEnemy(foe({ defeated: true, condition: "defeated" }), new Set())).toBeNull();
    expect(cutInEnemy(foe({ id: "bone_troll" }), new Set(["goblin"]))?.id).toBe("bone_troll");
  });

  it("tracker triggers exactly once per enemy per game", () => {
    const t = new FirstEncounterTracker();
    t.beginGame("g1");
    expect(t.trigger("g1", foe())?.id).toBe("goblin");
    expect(t.trigger("g1", foe())).toBeNull(); // still standing there
    expect(t.trigger("g1", null)).toBeNull();
    expect(t.trigger("g1", foe({ id: "bone_troll", name: "Bone Troll" }))?.id).toBe("bone_troll");
    expect(t.trigger("g2", foe())?.id).toBe("goblin"); // new game: meets again
  });

  it("seeding on start/resume suppresses the present enemy only", () => {
    const t = new FirstEncounterTracker();
    t.beginGame("g1", ["goblin"]); // resumed beside the goblin
    expect(t.trigger("g1", foe())).toBeNull();
    expect(t.trigger("g1", foe({ id: "bone_troll" }))?.id).toBe("bone_troll");
  });
});

describe("key-moment rendering", () => {
  it("renders the encounter cut-in: portrait, big name, quirk, non-blocking", () => {
    const html = renderToStaticMarkup(<EncounterCutIn enemy={foe()} cutKey={1} onDone={() => {}} />);
    expect(html).toContain('src="/portraits/goblin.webp"');
    expect(html).toContain("Goblin");
    expect(html).toContain("keeps counting its coins.");
    expect(html).toContain("Encounter");
    expect(html).toContain(CORAL);
    expect(html).toContain("#1A1421");
    expect(html).toContain("pointer-events:none");
    expect(html).toContain("clip-path");
    expect(html).not.toContain("skew");
    expect(renderToStaticMarkup(<EncounterCutIn enemy={null} cutKey={0} onDone={() => {}} />)).not.toContain("Goblin");
  });

  it("stamps REFUSED beside the player line with the short reason below", () => {
    const html = renderToStaticMarkup(
      <StoryFeed
        onRetry={() => {}}
        turns={[
          {
            id: "t1",
            playerText: "I take the Legendary Sword",
            narration: "There is no sword.",
            toolLog: [entry(false, "There is no Legendary Sword here. The crypt holds only dust.")],
          },
        ]}
      />,
    );
    expect(html).toContain("Refused");
    expect(html).toContain(CORAL);
    expect(html).toContain("There is no Legendary Sword here.");
    expect(html).toContain("rotate(-8deg)");
  });

  it("shows no stamp for accepted turns, even with a failed roll", () => {
    const failedRoll = entry(true);
    failedRoll.result.rolls = [roll({ purpose: "player attack", value: 3, target: 9, success: false })];
    const html = renderToStaticMarkup(
      <StoryFeed
        onRetry={() => {}}
        turns={[{ id: "t1", playerText: "Attack the Goblin", narration: "You miss.", toolLog: [failedRoll] }]}
      />,
    );
    expect(html).not.toContain("Refused");
  });

  it("lands the newest turn's die in a violet block with the NEEDED line", () => {
    const html = renderToStaticMarkup(
      <DiceCutIn rolls={[roll({ purpose: "player attack", value: 17, target: 9, success: true })]} />,
    );
    expect(html).toContain("17");
    expect(html).toContain("NEEDED 9+ → HIT");
    expect(html).toContain(VIOLET); // slanted block
    expect(html).toContain(MINT); // hit outcome
    // Text stays level: only the block shape is angled (clip-path).
    expect(html).not.toContain("skew");
  });

  it("keeps older turns on compact text lines, newest on the cut-in", () => {
    const attack = entry(true);
    attack.result.rolls = [roll({ purpose: "player attack", value: 17, target: 9, success: true })];
    const html = renderToStaticMarkup(
      <StoryFeed
        onRetry={() => {}}
        turns={[
          { id: "old", playerText: "Attack", narration: "Old.", toolLog: [attack] },
          { id: "new", playerText: "Attack again", narration: "New.", toolLog: [attack] },
        ]}
      />,
    );
    expect(html).toContain("Attack roll 17 · needed 9+ → hit"); // old: compact
    expect(html).toContain("NEEDED 9+ → HIT"); // new: cut-in
  });

  it("renders the room title card name in Cinzel over the story area", () => {
    const html = renderToStaticMarkup(
      <RoomTitleCard roomName="Echoing Hall" cardKey={1} onDone={() => {}} />,
    );
    expect(html).toContain("Echoing Hall");
    expect(html).toContain("You enter");
    expect(html).toContain("pointer-events:none");
    expect(html).not.toContain("skew");
  });
});

