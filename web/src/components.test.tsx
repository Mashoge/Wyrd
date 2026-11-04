import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EnemyCard } from "./components/EnemyCard";
import { Ledger } from "./components/Ledger";
import { StoryFeed } from "./components/StoryFeed";
import { Suggestions } from "./components/Suggestions";
import type { PlayerViewEnemy, Suggestion, ToolLogEntry } from "./api";

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
        turns={[
          { playerText: null, narration: "Old dark.", toolLog: [] },
          { playerText: null, narration: "New light.", toolLog: [] },
        ]}
      />,
    );
    expect(html).not.toContain("dropcap");
    expect(html).toContain("polygon(0 4%,100% 0,100% 96%,0 100%)");
    expect(html).toContain("#B44DFF");
    expect(html).toContain("#F4EFF6");
    expect(html).toContain("#B9AEC0");
  });
});