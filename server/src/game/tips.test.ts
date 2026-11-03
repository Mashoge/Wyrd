import { describe, expect, it } from "vitest";
import { createGameState } from "./state.js";
import { lossTip } from "./tips.js";
import type { World } from "./types.js";
import { sunkenCrypt } from "./worlds/sunkenCrypt.js";

function lostState(): {
  state: ReturnType<typeof createGameState>;
  world: World;
} {
  const world: World = structuredClone(sunkenCrypt);
  const state = createGameState(world, "s1");
  state.status = "lost";
  return { state, world };
}

describe("lossTip", () => {
  it("returns null unless the game is lost", () => {
    const world: World = structuredClone(sunkenCrypt);
    const state = createGameState(world, "s1");
    expect(lossTip(state, world)).toBeNull();
    const won = createGameState(world, "s2");
    won.status = "won";
    expect(lossTip(won, world)).toBeNull();
    const playing = createGameState(world, "s3");
    expect(lossTip(playing, world)).toBeNull();
  });

  it("names the Bone Troll when the player died after meeting it", () => {
    const { state, world } = lostState();
    state.hp = 0;
    state.visitedRoomIds.push("gate_hall");
    expect(lossTip(state, world)).toBe(
      "The Bone Troll barely notices its surroundings. Sneaking past is easier than fighting it.",
    );
  });

  it("suggests grabbing several things when the player timed out empty-handed", () => {
    const { state, world } = lostState();
    state.hp = 6;
    state.turn = world.maxTurns;
    state.inventory = [];
    expect(lossTip(state, world)).toBe(
      "Pick up several things in one go: 'grab the key and the coin'.",
    );
  });

  it("never reveals secrets", () => {
    const { state, world } = lostState();
    state.hp = 0;
    state.visitedRoomIds.push("gate_hall", "ossuary", "goblin_den");
    state.flags["trap_sprung"] = true;
    const tip = lossTip(state, world);
    expect(typeof tip).toBe("string");
    expect(tip as string).not.toMatch(/relic/i);
    expect(tip as string).not.toMatch(/trap/i);
    // The only proper nouns allowed are fixed dangers already met.
    expect(tip as string).not.toContain("Ossuary");
    expect(tip as string).not.toContain("Goblin Den");
  });
});
