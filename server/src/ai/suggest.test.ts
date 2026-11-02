import { describe, expect, it } from "vitest";
import { startGame } from "../game/state.js";
import type { Rng } from "../game/types.js";
import { sunkenCrypt } from "../game/worlds/sunkenCrypt.js";
import { suggestActions } from "./suggest.js";
import { playerView, type PlayerView } from "./view.js";

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) return 0;
    return values[i++] as number;
  };
}

function freshView(): PlayerView {
  const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
  return playerView(state, sunkenCrypt);
}

describe("suggestActions", () => {
  it("offers 2-4 short valid actions from the starting room", () => {
    const view = freshView();
    const out = suggestActions(view, sunkenCrypt);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(4);
    for (const s of out) {
      expect(s.length).toBeGreaterThan(0);
      expect(s.length).toBeLessThanOrEqual(60);
    }
    // Starting room has the dagger + north exit: both should surface.
    expect(out.some((s) => s.toLowerCase().includes("dagger"))).toBe(true);
    expect(out.some((s) => s.toLowerCase().includes("north"))).toBe(true);
  });

  it("offers attack AND sneak with different risks against a living enemy", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "goblin_den";
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt);
    expect(out).toContain("Attack the Goblin");
    expect(out).toContain("Sneak past the Goblin");
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it("hides attack/sneak once the enemy is defeated", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "goblin_den";
    state.enemies["goblin"]!.defeated = true;
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt);
    expect(out.some((s) => /attack|sneak/i.test(s))).toBe(false);
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it("prioritises using a held key on a locked door", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "gate_hall";
    state.inventory.push("iron_key");
    const view = playerView(state, sunkenCrypt);
    expect(view.exits.some((e) => e.locked)).toBe(true);
    const out = suggestActions(view, sunkenCrypt);
    expect(out[0]).toBe("Use the Iron Key on the north door");
  });

  it("never mentions anything not in the view", () => {
    const view = freshView();
    const out = suggestActions(view, sunkenCrypt);
    const blob = JSON.stringify(out);
    expect(blob).not.toContain("lost_relic");
    expect(blob).not.toContain("Lost Relic");
    expect(blob).not.toContain("Echoing Hall");
    expect(blob).not.toContain("Ossuary");
    expect(blob).not.toContain("keyItemId");
    // Deterministic: same view, same output.
    expect(suggestActions(view, sunkenCrypt)).toEqual(out);
  });

  it("returns [] when the game is over", () => {
    const view = freshView();
    const won: PlayerView = { ...view, player: { ...view.player, status: "won" } };
    const lost: PlayerView = { ...view, player: { ...view.player, status: "lost" } };
    expect(suggestActions(won, sunkenCrypt)).toEqual([]);
    expect(suggestActions(lost, sunkenCrypt)).toEqual([]);
  });
});
