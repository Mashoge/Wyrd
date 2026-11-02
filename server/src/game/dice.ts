import type { DiceRoll, Rng } from "./types.js";

export function rollDie(sides: number, rng: Rng, purpose: string, target = 0): DiceRoll {
  if (sides < 2) {
    throw new Error(`Invalid die: sides must be >= 2, got ${sides}.`);
  }
  const value = 1 + Math.floor(rng() * sides);
  const success = target <= 0 ? true : value >= target;
  return { purpose, sides, value, target, success };
}
