import { randomUUID } from "node:crypto";
import * as readline from "node:readline";
import type { DiceRoll, GameState, World } from "../game/types.js";
import { startGame } from "../game/state.js";
import { nearMissMessage } from "../game/distance.js";
import { newSalt, verify } from "../game/secrets.js";
import { sunkenCrypt } from "../game/worlds/sunkenCrypt.js";
import { runTurn, type TurnResult, type TurnSession } from "../ai/loop.js";
import { createMuseClient } from "../ai/client.js";

function stringArg(args: Record<string, unknown>, key: string): string | null {
  const value: unknown = args[key];
  return typeof value === "string" ? value : null;
}

function formatToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "move": {
      const direction = stringArg(args, "direction");
      return direction === null ? "move()" : `move(${direction})`;
    }
    case "pick_up": {
      const itemId = stringArg(args, "item_id");
      return itemId === null ? "pick_up()" : `pick_up(${itemId})`;
    }
    case "use_item": {
      const itemId = stringArg(args, "item_id");
      const direction = stringArg(args, "direction");
      if (itemId === null && direction === null) return "use_item()";
      if (direction === null) return `use_item(${itemId as string})`;
      if (itemId === null) return `use_item(${direction})`;
      return `use_item(${itemId}, ${direction})`;
    }
    case "attack": {
      const enemyId = stringArg(args, "enemy_id");
      return enemyId === null ? "attack()" : `attack(${enemyId})`;
    }
    case "sneak": {
      const enemyId = stringArg(args, "enemy_id");
      return enemyId === null ? "sneak()" : `sneak(${enemyId})`;
    }
    case "look": {
      return "look()";
    }
    case "examine": {
      const itemId = stringArg(args, "item_id");
      return itemId === null ? "examine()" : `examine(${itemId})`;
    }
    default: {
      const entries = Object.entries(args)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => `${key}=${String(value)}`);
      return entries.length === 0 ? `${name}()` : `${name}(${entries.join(", ")})`;
    }
  }
}

export function formatRoll(roll: DiceRoll): string {
  switch (roll.purpose) {
    case "player attack": {
      return `🎲 Attack roll: ${roll.value} (needed ${roll.target}+) → ${roll.success ? "hit" : "miss"}`;
    }
    case "enemy attack": {
      return `🎲 Enemy attack: ${roll.value} (needed ${roll.target}+) → ${roll.success ? "it hits you" : "it misses"}`;
    }
    case "sneak": {
      return `🎲 Sneak roll: ${roll.value} (needed ${roll.target}+) → ${roll.success ? "success" : "fail"}`;
    }
    case "attempt": {
      const outcome = roll.result ?? (roll.success ? "success" : "fail");
      return `🎲 Attempt roll: ${roll.value} (needed ${roll.target}+) → ${outcome}`;
    }
    case "attempt damage": {
      return `🎲 Attempt damage: ${roll.value}`;
    }
    case "grab": {
      return `🎲 Grab roll: ${roll.value} (needed ${roll.target}+) → ${roll.success ? "success" : "fail"}`;
    }
    case "player damage": {
      if (roll.bonus === 0) {
        return `🎲 Damage: ${roll.value}`;
      }
      return `🎲 Damage: ${roll.value} + ${roll.bonus} = ${roll.value + roll.bonus}`;
    }
    case "trap": {
      return `🎲 Trap: ${roll.value} damage`;
    }
    default: {
      if (roll.target > 0) {
        return `🎲 ${roll.purpose}: ${roll.value} (needed ${roll.target}+) → ${roll.success ? "success" : "fail"}`;
      }
      return `🎲 ${roll.purpose}: ${roll.value}`;
    }
  }
}

export function formatRelicReveal(state: GameState, world: World): string {
  const name = world.rooms[state.secrets.relicRoomId]?.name ?? state.secrets.relicRoomId;
  return `The relic was in: ${name}`;
}

export function formatTrapReveal(state: GameState, world: World): string {
  const name = world.rooms[state.secrets.trap.roomId]?.name ?? state.secrets.trap.roomId;
  return `Trapped door: ${name}, ${state.secrets.trap.direction}`;
}

function printTurn(result: TurnResult): void {
  console.log(result.narration);
  for (const entry of result.toolLog) {
    const call = formatToolCall(entry.name, entry.args);
    if (entry.result.ok) {
      console.log(`  ✓ ${call}`);
    } else {
      const reason = entry.result.reason ?? "failed";
      console.log(`  ✗ ${call}: ${reason}`);
    }
    for (const roll of entry.result.rolls) {
      console.log(`    ${formatRoll(roll)}`);
    }
  }
  const player = result.view.player;
  const inventory =
    player.inventory.length === 0
      ? "empty"
      : player.inventory.map((item) => item.name).join(", ");
  console.log(
    `HP ${player.hp}/${player.maxHp} · Turn ${player.turn}/${player.maxTurns} · Inventory: ${inventory}`,
  );
}

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer: string) => {
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const apiKey = process.env.META_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    console.log(
      "META_API_KEY is missing. Set it in ../.env (repo root) or as an environment variable, then run again with: npm run play",
    );
    process.exit(1);
  }

  const client = createMuseClient({ apiKey, model: "muse-spark-1.3" });
  const state = startGame(sunkenCrypt, randomUUID(), Math.random, newSalt());
  const session: TurnSession = { state, world: sunkenCrypt, history: [] };
  const deps = { client, rng: Math.random };

  console.log(`Wyrd — ${sunkenCrypt.title}`);
  console.log("Find the Lost Relic and escape through the gate");
  console.log(`Secrets sealed: ${state.commitment}`);

  const finishIfOver = (): boolean => {
    if (state.status === "won" || state.status === "lost") {
      if (state.status === "won") {
        console.log("You won! You escaped with the Lost Relic.");
      } else {
        console.log("You lost. The crypt keeps you.");
        const nearMiss = nearMissMessage(state, sunkenCrypt);
        if (nearMiss !== null) {
          console.log(nearMiss);
        }
      }
      console.log(formatRelicReveal(state, sunkenCrypt));
      console.log(formatTrapReveal(state, sunkenCrypt));
      console.log(`Salt: ${state.salt}`);
      if (verify(state.secrets, state.salt, state.commitment)) {
        console.log("Verify: ✓ the secrets match the sealed fingerprint");
      } else {
        console.log("Verify: ✗ the secrets do NOT match the sealed fingerprint");
      }
      return true;
    }
    return false;
  };

  try {
    const opening = await runTurn(session, "Look around.", deps);
    printTurn(opening);
    if (finishIfOver()) {
      return;
    }
  } catch {
    console.log("The game master is unavailable, try again.");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const line = (await ask(rl, "> ")).trim();
      if (line.toLowerCase() === "quit") {
        break;
      }
      if (line.length === 0) {
        continue;
      }
      try {
        const result = await runTurn(session, line, deps);
        printTurn(result);
        if (finishIfOver()) {
          break;
        }
      } catch {
        console.log("The game master is unavailable, try again.");
      }
    }
  } finally {
    rl.close();
  }
}

if (process.env["VITEST"] !== "true") {
  void main();
}
