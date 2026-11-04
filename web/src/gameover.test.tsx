import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameOverView } from "./components/GameOver";
import { Header } from "./components/Header";
import * as verifyMod from "./verify";
import type { RevealResponse } from "./verify";

function demoReveal(): RevealResponse {
  return {
    rulesVersion: "wyrd-rules-v1",
    secrets: { relicRoomId: "library", trap: { roomId: "hall", direction: "east" } },
    display: { relicRoom: "Library", trapRoom: "Hall", trapDirection: "east" },
    salt: "abc123-salt-xyz",
    commitment: "bed6536ccf426fd97eb3f6a31d777a11c38344a9d4b65b36dbbc94a244217255",
    verified: true,
    nearMiss: "You passed the Library twice.",
    tip: "Grab the key first.",
  };
}

const noop = (): void => {};

function viewProps(phase: "loading" | "verified" | "broken" | "error", stored: string | null = null): Parameters<typeof GameOverView>[0] {
  const r = demoReveal();
  return {
    phase,
    reveal: phase === "verified" || phase === "broken" ? r : null,
    browserHash: phase === "verified" || phase === "broken" ? r.commitment : null,
    canonical: phase === "verified" || phase === "broken" ? "canon" : null,
    storedCommitment: stored ?? r.commitment,
    won: true,
    onRetry: noop,
    onVerified: noop,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GameOver states", () => {
  it("loading shows the seal pulse and no mint or coral verdict", () => {
    const html = renderToStaticMarkup(<GameOverView {...viewProps("loading")} />);
    expect(html).toContain("Breaking the seal");
    expect(html).not.toContain("#4DE8B5");
    expect(html).not.toContain("Fate verified");
    expect(html).not.toContain("Seal broken");
  });

  it("error shows retry button and no mint", () => {
    const html = renderToStaticMarkup(<GameOverView {...viewProps("error")} />);
    expect(html).toContain("Couldn");
    expect(html).toContain("<button");
    expect(html).toContain("Try again");
    expect(html).not.toContain("#4DE8B5");
  });

  it("verified shows mint Fate verified with facts", () => {
    const html = renderToStaticMarkup(<GameOverView {...viewProps("verified")} />);
    expect(html).toContain("Fate verified");
    expect(html).toContain("#4DE8B5");
    expect(html).toContain("The relic and the trap never moved since turn one.");
    expect(html).toContain("Relic was in Library");
    expect(html).toContain("Trap was Hall, east");
    expect(html).toContain("You passed the Library twice.");
    expect(html).toContain("Grab the key first.");
    expect(html).toContain("Show proof");
  });

  it("broken shows coral Seal broken and no mint", () => {
    const html = renderToStaticMarkup(<GameOverView {...viewProps("broken", "0".repeat(64))} />);
    expect(html).toContain("Seal broken");
    expect(html).toContain("#FF6B5B");
    expect(html).toContain("The secrets do not match the seal from turn one.");
    expect(html).not.toContain("#4DE8B5");
    expect(html).not.toContain("Fate verified");
  });

  it("verified block uses mint only after browser check", async () => {
    const r = demoReveal();
    const { hash } = await verifyMod.hashReveal(r);
    expect(hash).toBe(r.commitment);
    expect(verifyMod.matchesStoredCommitment(hash, r.commitment)).toBe(true);
    expect(verifyMod.matchesStoredCommitment(hash, "f".repeat(64))).toBe(false);
  });
});

describe("Header verify state", () => {
  it("sealed by default, verified after success", () => {
    const sealed = renderToStaticMarkup(<Header commitment="abcdef1234567890" verified={false} />);
    expect(sealed).toContain("Fate sealed");
    expect(sealed).not.toContain("#4DE8B5");
    const verified = renderToStaticMarkup(<Header commitment="abcdef1234567890" verified={true} />);
    expect(verified).toContain("Fate verified");
    expect(verified).toContain("#4DE8B5");
  });
});
