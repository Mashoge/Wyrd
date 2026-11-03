import { describe, expect, it } from "vitest";
import { startGame } from "../game/state.js";
import type { Rng } from "../game/types.js";
import { sunkenCrypt } from "../game/worlds/sunkenCrypt.js";
import { suggestActions, type Suggestion } from "./suggest.js";
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

function texts(out: Suggestion[]): string[] {
  return out.map((s) => s.text);
}

describe("suggestActions", () => {
  it("offers 2-4 short valid actions from the starting room", () => {
    const view = freshView();
    const out = suggestActions(view, sunkenCrypt);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(4);
    for (const s of out) {
      expect(s.text.length).toBeGreaterThan(0);
      expect(s.text.length).toBeLessThanOrEqual(60);
      expect(typeof s.kind).toBe("string");
    }
    // Starting room has the dagger + north exit: both should surface.
    expect(texts(out).some((s) => s.toLowerCase().includes("dagger"))).toBe(true);
    expect(texts(out).some((s) => s.toLowerCase().includes("north"))).toBe(true);
  });

  it("offers attack AND sneak with targets against a living enemy", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "goblin_den";
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt);
    const byText = new Map(out.map((s) => [s.text, s]));
    expect(byText.has("Attack the Goblin")).toBe(true);
    expect(byText.has("Sneak past the Goblin")).toBe(true);
    expect(byText.get("Attack the Goblin")?.target).toBe(10);
    expect(byText.get("Sneak past the Goblin")?.target).toBe(13);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it("hides attack/sneak once the enemy is defeated", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "goblin_den";
    state.enemies["goblin"]!.defeated = true;
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt);
    expect(texts(out).some((s) => /attack|sneak/i.test(s))).toBe(false);
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it("prioritises using a held key on a locked door", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "gate_hall";
    state.inventory.push("iron_key");
    const view = playerView(state, sunkenCrypt);
    expect(view.exits.some((e) => e.locked)).toBe(true);
    const out = suggestActions(view, sunkenCrypt);
    expect(out[0]?.text).toBe("Use the Iron Key on the north door");
    expect(out[0]?.kind).toBe("use");
  });

  it("lowers the attack target with a weapon bonus", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "goblin_den";
    state.inventory.push("rusty_dagger");
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt);
    expect(out.find((s) => s.text === "Attack the Goblin")?.target).toBe(9);
  });

  it("raises the grab target from watcher alertness", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "goblin_den";
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt);
    expect(out.find((s) => s.text === "Pick up the Silver Coin")?.target).toBe(9);
  });

  it("hides sneak after slipping past", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "goblin_den";
    state.flags["sneaked:goblin_den"] = true;
    const view = playerView(state, sunkenCrypt);
    expect(view.enemy?.passed).toBe(true);
    const out = suggestActions(view, sunkenCrypt);
    expect(texts(out).some((s) => /sneak/i.test(s))).toBe(false);
  });

  it("names omens and leadsTo exits in move text", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "hall";
    state.visitedRoomIds.push("entrance");
    const view = playerView(state, sunkenCrypt);
    const blob = JSON.stringify(texts(suggestActions(view, sunkenCrypt)));
    expect(blob).toContain("Go east — low chanting drifts from the east");
    expect(blob).toContain("Go south to Crypt Entrance");
  });

  it("surfaces an unlocked exit with gate wording", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "gate_hall";
    state.flags["unlocked:gate_hall:north"] = true;
    const gateExit = state.rooms["gate_hall"]?.exits.find((e) => e.direction === "north");
    if (gateExit !== undefined) gateExit.locked = false;
    const view = playerView(state, sunkenCrypt);
    expect(view.exits.find((e) => e.direction === "north")?.unlocked).toBe(true);
    const out = suggestActions(view, sunkenCrypt);
    expect(texts(out).some((s) => s.includes("through the gate you unlocked"))).toBe(true);
  });

  it("moves the unlocked exit first when carrying the relic", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "gate_hall";
    state.flags["unlocked:gate_hall:north"] = true;
    const gateExit = state.rooms["gate_hall"]?.exits.find((e) => e.direction === "north");
    if (gateExit !== undefined) gateExit.locked = false;
    state.inventory.push("lost_relic");
    state.inventory.push("iron_key");
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt);
    expect(out[0]?.text).toContain("gate you unlocked");
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

  it("uses move-only suggestions without targets", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "hall";
    state.visitedRoomIds.push("hall");
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt);
    for (const s of out) {
      if (s.kind === "move" || s.kind === "use" || s.kind === "drink" || s.kind === "examine" || s.kind === "look") {
        expect(s.target).toBeUndefined();
      }
    }
  });

  it("returns [] when the game is over", () => {
    const view = freshView();
    const won: PlayerView = { ...view, player: { ...view.player, status: "won" } };
    const lost: PlayerView = { ...view, player: { ...view.player, status: "lost" } };
    expect(suggestActions(won, sunkenCrypt)).toEqual([]);
    expect(suggestActions(lost, sunkenCrypt)).toEqual([]);
  });

  it("keeps working when exits carry omens", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "hall";
    const view = playerView(state, sunkenCrypt);
    expect(view.exits.some((e) => e.omen !== undefined)).toBe(true);
    const out = suggestActions(view, sunkenCrypt);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(4);
    const blob = JSON.stringify(out);
    expect(blob).not.toContain("lost_relic");
    expect(blob).not.toContain("Lost Relic");
    // Deterministic with omens present.
    expect(suggestActions(view, sunkenCrypt)).toEqual(out);
  });
});
