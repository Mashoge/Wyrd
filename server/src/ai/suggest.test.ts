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
    // The troll would otherwise block every non-retreat move chip.
    state.enemies["bone_troll"]!.defeated = true;
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
    // The troll would otherwise block every non-retreat move chip.
    state.enemies["bone_troll"]!.defeated = true;
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

  it("labels the way back and flags new exits without leaking names", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "hall";
    state.visitedRoomIds.push("hall");
    state.lastRoomId = "entrance";
    const view = playerView(state, sunkenCrypt);
    // hall south -> entrance (visited) is the way back; east is unvisited.
    const out = suggestActions(view, sunkenCrypt, state.lastRoomId);
    expect(texts(out)).toContain("Go back south to Crypt Entrance");
    const east = out.find((s) => s.text.toLowerCase().includes("east"));
    expect(east?.isNew).toBe(true);
    expect(east?.text).toContain("low chanting drifts from the east");
    const back = out.find((s) => s.text.startsWith("Go back"));
    expect(back?.isNew).toBeUndefined();
    expect(out.length).toBeLessThanOrEqual(4);
    // Deterministic with lastRoomId.
    expect(suggestActions(view, sunkenCrypt, state.lastRoomId)).toEqual(out);
  });

  it("offers a sneak-and-grab combo when both are live, within the cap", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "goblin_den";
    const view = playerView(state, sunkenCrypt);
    expect(view.enemy !== null && !view.enemy.defeated && !view.enemy.passed).toBe(true);
    expect(view.items.length).toBeGreaterThan(0);
    const out = suggestActions(view, sunkenCrypt, state.lastRoomId);
    const combo = out.find((s) => s.kind === "combo");
    expect(combo).toBeDefined();
    expect(combo?.text).toBe("Sneak past the Goblin and grab the Silver Coin");
    expect(combo?.target).toBeUndefined();
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it("shows attack target 12 for a bone-only player and 9 with bone and dagger", () => {
    const boneOnly = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    boneOnly.currentRoomId = "goblin_den";
    boneOnly.inventory.push("thigh_bone");
    const boneOut = suggestActions(playerView(boneOnly, sunkenCrypt), sunkenCrypt);
    expect(boneOut.find((s) => s.text === "Attack the Goblin")?.target).toBe(12);
    const both = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    both.currentRoomId = "goblin_den";
    both.inventory.push("thigh_bone", "rusty_dagger");
    const bothOut = suggestActions(playerView(both, sunkenCrypt), sunkenCrypt);
    expect(bothOut.find((s) => s.text === "Attack the Goblin")?.target).toBe(9);
  });

  it("shows sneak target 9 while the enemy is distracted and never offers a throw chip", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "goblin_den";
    state.flags["distracted:goblin_den:goblin"] = true;
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt);
    expect(out.find((s) => s.text === "Sneak past the Goblin")?.target).toBe(9);
    expect(out.some((s) => s.kind === "throw")).toBe(false);
  });

  it("suggests drinking at HP 6 and 5 but not at 7-9 or full (draught heals 4 of 10)", () => {
    const atHp = (hp: number): Suggestion[] => {
      const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
      state.hp = hp;
      state.inventory.push("healing_draught");
      return suggestActions(playerView(state, sunkenCrypt), sunkenCrypt);
    };
    const hasDrink = (hp: number): boolean => atHp(hp).some((s) => s.kind === "drink");
    expect(hasDrink(6)).toBe(true);
    expect(hasDrink(5)).toBe(true);
    expect(hasDrink(7)).toBe(false);
    expect(hasDrink(8)).toBe(false);
    expect(hasDrink(9)).toBe(false);
    expect(hasDrink(10)).toBe(false);
  });

  it("offers no move chip in the ossuary while the Warden seals the only exit", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "ossuary";
    state.lastRoomId = "hall";
    state.visitedRoomIds.push("ossuary", "hall");
    // Clear the room (seed rng puts the relic here) so the 4-chip cap does not
    // crowd out the filler chips; a held item keeps the examine chip live.
    state.rooms["ossuary"]!.items = [];
    state.inventory.push("rusty_dagger");
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt, state.lastRoomId);
    expect(out.some((s) => s.kind === "move")).toBe(false);
    expect(texts(out).some((s) => s.includes("west"))).toBe(false);
    // Combat chips are still offered.
    expect(texts(out).some((s) => s.startsWith("Sneak past"))).toBe(true);
    expect(texts(out).some((s) => s.startsWith("Attack"))).toBe(true);
    expect(out.some((s) => s.kind === "examine" || s.kind === "look")).toBe(true);
  });

  it("still offers the retreat chip in the goblin den (goblin does not block retreat)", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "goblin_den";
    state.lastRoomId = "hall";
    state.visitedRoomIds.push("goblin_den", "hall");
    // Clear the room items so the combo/pickup chips do not crowd the retreat
    // chip out of the 4-chip cap; this isolates the move-filtering rule.
    state.rooms["goblin_den"]!.items = [];
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt, state.lastRoomId);
    expect(texts(out)).toContain("Go back south to Echoing Hall");
    // The forward exit is enemy-blocked, so it is not offered.
    expect(out.filter((s) => s.kind === "move")).toHaveLength(1);
  });

  it("never offers a locked exit as a move chip", () => {
    const state = startGame(sunkenCrypt, "s1", seqRng([0, 0]), "suggest-salt");
    state.currentRoomId = "gate_hall";
    state.enemies["bone_troll"]!.defeated = true;
    const view = playerView(state, sunkenCrypt);
    const out = suggestActions(view, sunkenCrypt);
    expect(out.some((s) => s.kind === "move" && s.text.toLowerCase().includes("north"))).toBe(false);
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
