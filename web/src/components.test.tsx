import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EnemyCard } from "./components/EnemyCard";
import { Ledger } from "./components/Ledger";
import { BootScreen } from "./components/BootScreen";
import { StoryFeed } from "./components/StoryFeed";
import { Suggestions } from "./components/Suggestions";
import { WhereYouAre } from "./components/WhereYouAre";
import type { GameMap, PlayerViewEnemy, Suggestion, ToolLogEntry } from "./api";

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
    expect(html).not.toContain("#B44DFF");
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
  it("marks a failed player roll without REFUSED", () => {
    const html = renderToStaticMarkup(<Ledger log={[failedAttack()]} />);
    expect(html).toContain("Missed the Goblin");
    expect(html).toContain("Failed");
    expect(html).not.toContain("Refused");
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