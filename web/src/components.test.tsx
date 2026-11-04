import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EnemyCard } from "./components/EnemyCard";
import { Ledger } from "./components/Ledger";
import { BootScreen } from "./components/BootScreen";
import { StoryFeed } from "./components/StoryFeed";
import { Suggestions, buildFreeTextHint } from "./components/Suggestions";
import { CHEAT_FILLS, cheatFillForLabel, shouldClearHintOnBlur } from "./components/ActionForm";
import { ActionForm } from "./components/ActionForm";
import { freeTextHint } from "./components/freeTextHint";
import { WhereYouAre } from "./components/WhereYouAre";
import type { GameMap, PlayerView, PlayerViewEnemy, Suggestion, ToolLogEntry } from "./api";

function enemy(partial: Partial<PlayerViewEnemy> = {}): PlayerViewEnemy {
  return {
    id: "goblin",
    name: "Goblin",
    quirk: "keeps counting its coins",
    defeated: false,
    condition: "unhurt",
    passed: false,
    ...partial,
  };
}

function failedAttack(): ToolLogEntry {
  return {
    name: "attack",
    args: { enemy_id: "goblin" },
    result: {
      ok: true,
      action: "attack",
      rolls: [{ purpose: "player attack", sides: 20, value: 3, target: 9, success: false, bonus: 0 }],
      events: ["You missed the Goblin."],
    },
  };
}

describe("EnemyCard portrait", () => {
  it("renders the static portrait for the enemy id, never placeholder text", () => {
    const html = renderToStaticMarkup(<EnemyCard enemy={enemy()} />);
    expect(html).toContain('src="/portraits/goblin.webp"');
    expect(html).toContain('alt="Goblin"');
    expect(html).toContain("object-fit:cover");
    expect(html).not.toContain("[portrait]");
  });

  it("uses the enemy id for other enemies' portraits", () => {
    const html = renderToStaticMarkup(
      <EnemyCard enemy={enemy({ id: "bone_troll", name: "Bone Troll" })} />,
    );
    expect(html).toContain('src="/portraits/bone_troll.webp"');
    expect(html).toContain('alt="Bone Troll"');
    expect(html).not.toContain("[portrait]");
  });
});

describe("EnemyCard progress line", () => {
  it("shows slipped-past text only when passed and living", () => {
    expect(renderToStaticMarkup(<EnemyCard enemy={enemy({ passed: true })} />)).toContain("You slipped past it");
    expect(renderToStaticMarkup(<EnemyCard enemy={enemy({ passed: false })} />)).not.toContain("You slipped past it");
    expect(renderToStaticMarkup(<EnemyCard enemy={enemy({ passed: true, defeated: true })} />)).not.toContain(
      "You slipped past it",
    );
  });
});

describe("Suggestions objects", () => {
  it("renders uniform chips with kind and target, no highlighted first", () => {
    const suggestions: Suggestion[] = [
      { text: "Attack the Goblin", kind: "attack", target: 9 },
      { text: "Go north", kind: "move" },
    ];
    const html = renderToStaticMarkup(<Suggestions suggestions={suggestions} disabled={false} onPick={() => {}} />);
    expect(html).toContain("Attack the Goblin");
    expect(html).toContain("attack");
    expect(html).toContain("needs 9+");
    expect(html).not.toContain("background:#B44DFF");
  });

  it("shows a muted NEW tag for new exits and plain combo chips", () => {
    const suggestions: Suggestion[] = [
      { text: "Go east", kind: "move", isNew: true },
      { text: "Sneak past the Goblin and grab the Silver Coin", kind: "combo" },
    ];
    const html = renderToStaticMarkup(<Suggestions suggestions={suggestions} disabled={false} onPick={() => {}} />);
    expect(html).toContain("NEW");
    expect(html).toContain("#3A2848");
    expect(html).toContain("#E8CCFF");
    expect(html).toContain("Sneak past the Goblin and grab the Silver Coin");
    expect(html).not.toContain("wyrd-chip--attack");
  });

  it("always appends a YOUR IDEA chip after the server chips", () => {
    const suggestions: Suggestion[] = [
      { text: "Attack the Goblin", kind: "attack", target: 9 },
      { text: "Go north", kind: "move" },
    ];
    const html = renderToStaticMarkup(<Suggestions suggestions={suggestions} disabled={false} onPick={() => {}} />);
    expect(html).toContain("YOUR IDEA");
    expect(html).toContain("Something else…");
    expect(html.indexOf("YOUR IDEA")).toBeGreaterThan(html.indexOf("Go north"));
    expect(html).toContain('class="wyrd-chip"');
  });

  it("still shows the YOUR IDEA chip when the server sends zero suggestions", () => {
    const html = renderToStaticMarkup(<Suggestions suggestions={[]} disabled={false} onPick={() => {}} />);
    expect(html).toContain("YOUR IDEA");
    expect(html).toContain("Something else…");
  });

  it("builds the free-text hint from the living enemy first", () => {
    expect(buildFreeTextHint(demoView({ enemyName: "Goblin", passed: false, defeated: false }))).toBe(
      "Try: throw something at the Goblin",
    );
    expect(freeTextHint(demoView({ enemyName: "Goblin", passed: false, defeated: false }))).toBe(
      "Try: throw something at the Goblin",
    );
  });

  it("falls back to the first room item, then to listening", () => {
    expect(buildFreeTextHint(demoView({ enemyName: null, items: [{ id: "coin", name: "Silver Coin" }] }))).toBe(
      "Try: examine the Silver Coin closely",
    );
    expect(buildFreeTextHint(demoView({ enemyName: null, items: [], enemyPassed: true }))).toBe("Try: ask what you hear");
    expect(buildFreeTextHint(null)).toBe("Try: ask what you hear");
  });

  it("treats a passed or defeated enemy as gone for the hint", () => {
    expect(buildFreeTextHint(demoView({ enemyName: "Goblin", passed: true, items: [{ id: "k", name: "Brass Key" }] }))).toBe(
      "Try: examine the Brass Key closely",
    );
    expect(buildFreeTextHint(demoView({ enemyName: "Goblin", defeated: true, items: [] }))).toBe("Try: ask what you hear");
  });
});

function demoView(args: {
  enemyName?: string | null;
  passed?: boolean;
  defeated?: boolean;
  enemyPassed?: boolean;
  items?: { id: string; name: string }[];
}): PlayerView {
  const enemyName = args.enemyName === undefined ? "Goblin" : args.enemyName;
  return {
    room: { id: "hall", name: "Echoing Hall", description: "Dark." },
    exits: [],
    items: args.items ?? [],
    enemy:
      enemyName === null
        ? null
        : {
            id: "goblin",
            name: enemyName,
            quirk: "counts coins",
            passed: args.passed ?? args.enemyPassed ?? false,
            defeated: args.defeated ?? false,
            condition: args.defeated === true ? "defeated" : "unhurt",
          },
    player: { hp: 5, maxHp: 5, inventory: [], turn: 1, maxTurns: 10, status: "playing" },
  };
}

describe("Free-text cheat buttons", () => {
  it("maps the three rule-test labels to fill text without sending", () => {
    expect(CHEAT_FILLS).toHaveLength(3);
    expect(cheatFillForLabel("Claim a Legendary Sword")).toBe("I pick up the Legendary Sword");
    expect(cheatFillForLabel("Say the enemy is dead")).toBe("The enemy here is already dead");
    expect(cheatFillForLabel("Heal to full")).toBe("I drink a potion and I'm at full health");
    expect(cheatFillForLabel("Unknown")).toBeNull();
  });

  it("renders Test the rules with muted label, violet small text buttons", () => {
    const html = renderToStaticMarkup(<ActionForm disabled={false} onSubmit={() => {}} />);
    expect(html).toContain("Test the rules:");
    expect(html).toContain("Claim a Legendary Sword");
    expect(html).toContain("Say the enemy is dead");
    expect(html).toContain("Heal to full");
    expect(html).toContain("#B9AEC0");
    expect(html).toContain("#B44DFF");
    expect(html).toContain("font-size:13px");
    const buttons = html.match(/<button/g) ?? [];
    // Form ACT + 3 cheat fills + mic + EN/TL toggles, all real buttons.
    expect(buttons.length).toBe(7);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("EN");
    expect(html).toContain("TL");
  });

  it("hides the cheat row while busy", () => {
    const html = renderToStaticMarkup(<ActionForm disabled={true} onSubmit={() => {}} />);
    expect(html).not.toContain("Test the rules:");
    expect(html).not.toContain("Claim a Legendary Sword");
  });

  it("keeps the sticky hint until blur-empty or a sent turn", () => {
    expect(shouldClearHintOnBlur("")).toBe(true);
    expect(shouldClearHintOnBlur("I pick up the Legendary Sword")).toBe(false);
  });
});

describe("WhereYouAre mini-map", () => {
  const demo: GameMap = {
    rooms: [
      { id: "entrance", name: "Crypt Entrance", isCurrent: false },
      { id: "hall", name: "Echoing Hall", isCurrent: true },
    ],
    links: [{ from: "entrance", to: "hall", direction: "north" }],
    unexplored: [{ from: "hall", direction: "east" }],
  };

  it("shows the room name once with violet current box and ? stubs", () => {
    const html = renderToStaticMarkup(<WhereYouAre roomName="Echoing Hall" map={demo} />);
    expect(html).toContain("Where you are");
    expect(html).toContain("Echoing Hall");
    expect(html).toContain("#B44DFF");
    expect(html).toContain("?");
    // Names live in the heading + hover titles only, never as visible map text.
    expect(html).toContain("<title>Crypt Entrance</title>");
    expect(html).not.toContain(">Crypt Entrance</text>");
  });
});

describe("Ledger failed state", () => {
  function refusedClaim(): ToolLogEntry {
    return {
      name: "pick_up",
      args: { item_id: "legendary_sword" },
      result: {
        ok: false,
        action: "pick_up",
        reason: "There is no Legendary Sword here. The Crypt Warden watches you closely.",
        rolls: [],
        events: [],
      },
    };
  }

  function partialAttempt(): ToolLogEntry {
    return {
      name: "attempt",
      args: { target: "goblin" },
      result: {
        ok: true,
        action: "attempt",
        rolls: [{ purpose: "attempt", sides: 20, value: 7, target: 12, success: false, bonus: 0, result: "partial" }],
        events: ["You partly distract the Goblin."],
      },
    };
  }

  it("keeps failed rolls to one muted line with the roll appended", () => {
    const html = renderToStaticMarkup(<Ledger log={[failedAttack()]} />);
    expect(html).toContain("Missed the Goblin · 3 vs 9+");
    expect(html).toContain("#B9AEC0");
    expect(html).not.toContain("Refused");
    expect(html).not.toContain("Failed");
    expect(html).not.toContain("You missed the Goblin.");
  });

  it("renders partial attempts with the partial marker", () => {
    const html = renderToStaticMarkup(<Ledger log={[partialAttempt()]} />);
    expect(html).toContain("◐");
    expect(html).toContain("· partial");
    expect(html).not.toContain("Refused");
  });

  it("keeps refused claims loud with one short reason line", () => {
    const html = renderToStaticMarkup(<Ledger log={[refusedClaim()]} />);
    expect(html).toContain("Refused");
    expect(html).toContain("There is no Legendary Sword here.");
    expect(html).not.toContain("watches you closely");
  });

  it("collapses consecutive identical labels with a count", () => {
    const html = renderToStaticMarkup(<Ledger log={[failedAttack(), failedAttack()]} />);
    expect(html).toContain("Missed the Goblin ×2");
    expect(html).not.toContain("3 vs 9+");
  });

  it("expands a row to its full reason behind a real button", () => {
    const collapsed = renderToStaticMarkup(<Ledger log={[refusedClaim()]} />);
    expect(collapsed).toContain("<button");
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).not.toContain("watches you closely");
    const expanded = renderToStaticMarkup(<Ledger log={[refusedClaim()]} defaultExpanded={true} />);
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).toContain("The Crypt Warden watches you closely.");
  });

  it("shows Nothing yet. when the log is empty", () => {
    const html = renderToStaticMarkup(<Ledger log={[]} />);
    expect(html).toContain("Nothing yet.");
    expect(html).not.toContain("No claims yet.");
  });

  it("still offers Show all with the entry count", () => {
    const log: ToolLogEntry[] = [failedAttack(), failedAttack(), failedAttack(), failedAttack(), failedAttack(), failedAttack(), failedAttack()];
    const html = renderToStaticMarkup(<Ledger log={log} />);
    expect(html).toContain("Show all (7)");
  });
});

describe("StoryFeed latest narration", () => {
  it("marks only the latest narration with the violet bar, no drop cap", () => {
    const html = renderToStaticMarkup(
      <StoryFeed
        onRetry={() => {}}
        turns={[
          { id: "a", playerText: null, narration: "Old dark.", toolLog: [] },
          { id: "b", playerText: null, narration: "New light.", toolLog: [] },
        ]}
      />,
    );
    expect(html).not.toContain("dropcap");
    expect(html).toContain("polygon(0 4%,100% 0,100% 96%,0 100%)");
    expect(html).toContain("#B44DFF");
    expect(html).toContain("#F4EFF6");
    expect(html).toContain("#B9AEC0");
  });

  it("shows the player line plus a pending placeholder", () => {
    const html = renderToStaticMarkup(
      <StoryFeed
        onRetry={() => {}}
        turns={[{ id: "p1", playerText: "Go north", narration: "", toolLog: [], pending: true }]}
      />,
    );
    expect(html).toContain("— Go north");
    expect(html).toContain("The game master is deciding");
    expect(html).toContain("#B44DFF");
  });

  it("shows one inline retry for a failed turn", () => {
    const html = renderToStaticMarkup(
      <StoryFeed
        onRetry={() => {}}
        turns={[{ id: "f1", playerText: "Go north", narration: "", toolLog: [], failed: true }]}
      />,
    );
    expect(html).toContain("— Go north");
    expect(html).toContain("Try again");
    expect(html).toContain("<button");
    expect(html).not.toContain("The game master is deciding");
  });
});

describe("BootScreen", () => {
  it("shows the sealing line and rune border while loading a fresh game", () => {
    const html = renderToStaticMarkup(
      <BootScreen phase="loading" isFresh={true} commitment={null} showSlowHint={false} onRetry={() => {}} />,
    );
    expect(html).toContain("Sealing the relic and the trap");
    expect(html).toContain("Wyrd");
    expect(html).toContain("ᚹ");
    expect(html).not.toContain("#4DE8B5");
  });

  it("shows the returning line on resume", () => {
    const html = renderToStaticMarkup(
      <BootScreen phase="loading" isFresh={false} commitment={null} showSlowHint={false} onRetry={() => {}} />,
    );
    expect(html).toContain("Returning to the crypt");
    expect(html).not.toContain("Sealing the relic");
  });

  it("shows the slow hint when the crypt takes a while", () => {
    const html = renderToStaticMarkup(
      <BootScreen phase="loading" isFresh={true} commitment={null} showSlowHint={true} onRetry={() => {}} />,
    );
    expect(html).toContain("Waking the crypt");
  });

  it("shows Fate sealed with the real short commitment", () => {
    const html = renderToStaticMarkup(
      <BootScreen
        phase="sealed"
        isFresh={true}
        commitment="5666eaXXXX7b36e"
        showSlowHint={false}
        onRetry={() => {}}
      />,
    );
    expect(html).toContain("Fate sealed");
    expect(html).toContain("5666ea…7b36e");
    expect(html).not.toContain("#4DE8B5");
  });

  it("shows a retry button on error", () => {
    const html = renderToStaticMarkup(
      <BootScreen phase="error" isFresh={true} commitment={null} showSlowHint={false} onRetry={() => {}} />,
    );
    expect(html).toContain("Couldn");
    expect(html).toContain("<button");
    expect(html).toContain("Try again");
  });
});