import type { DiceRoll, Rng } from "./types.js";

export function rollDie(sides: number, rng: Rng, purpose: string): DiceRoll {
  if (sides < 2) {
    throw new Error(`Invalid die: sides must be >= 2, got ${sides}.`);
  }
  const value = 1 + Math.floor(rng() * sides);
  return { purpose, sides, value };
}
