import type { GameState, Rng, ToolResult, World } from "../game/types.js";
import { attempt, attack, examine, move, pickUp, sneak, throwItem, useItem } from "../game/rules.js";
import type { AttemptApproach, AttemptIntent } from "../game/types.js";

const ATTEMPT_APPROACHES: readonly AttemptApproach[] = ["force", "finesse", "wits", "charm"];
const ATTEMPT_INTENTS: readonly AttemptIntent[] = ["harm", "pass", "distract", "learn"];
import { playerView } from "./view.js";

export interface ToolFunctionParameter {
  type: "string";
  description: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolFunctionParameter>;
      required: string[];
      additionalProperties: boolean;
    };
  };
}

function def(
  name: string,
  description: string,
  properties: Record<string, ToolFunctionParameter>,
  required: string[],
): ToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required, additionalProperties: false },
    },
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  def(
    "move",
    "Move to an adjacent room. Fails if there is no exit that way, the door is locked, or a living enemy blocks the way.",
    { direction: { type: "string", description: "Exit direction, e.g. 'north'." } },
    ["direction"],
  ),
  def(
    "pick_up",
    "Pick up an item visible in the current room. Fails if the item is not here or a watcher stops you.",
    { item_id: { type: "string", description: "ID of the item, e.g. 'iron_key'." } },
    ["item_id"],
  ),
  def(
    "use_item",
    "Use an inventory item: drink a consumable to heal, or use a key on a locked exit in the current room.",
    {
      item_id: { type: "string", description: "ID of the inventory item to use." },
      direction: { type: "string", description: "Direction of the locked exit (keys only)." },
    },
    ["item_id"],
  ),
  def(
    "attack",
    "Attack the enemy in the current room. Fails if no such enemy is here or it is already defeated. The player may name a weapon to attack with, e.g. 'attack with the bone'; pass weapon_id only when the player names one.",
    {
      enemy_id: { type: "string", description: "ID of the enemy to attack." },
      weapon_id: { type: "string", description: "Optional ID of the inventory weapon to attack with, e.g. 'thigh_bone'." },
    },
    ["enemy_id"],
  ),
  def(
    "throw",
    "Throw an inventory item at or toward the enemy in the current room to distract it or lure it away. Fails if the item is not held, no such enemy is here, or it is already defeated.",
    {
      item_id: { type: "string", description: "ID of the inventory item to throw." },
      enemy_id: { type: "string", description: "ID of the enemy to throw at." },
    },
    ["item_id", "enemy_id"],
  ),
  def(
    "sneak",
    "Sneak past the enemy in the current room. Fails if no such enemy is here or it is already defeated.",
    { enemy_id: { type: "string", description: "ID of the enemy to sneak past." } },
    ["enemy_id"],
  ),
  def(
    "look",
    "Look around the current room. Returns what you see. Never changes state or ends the turn.",
    {},
    [],
  ),
  def(
    "examine",
    "Examine an item in the current room or your inventory. Returns its description. Never changes state or ends the turn.",
    { item_id: { type: "string", description: "ID of the item to examine." } },
    ["item_id"],
  ),
  def(
    "attempt",
    "Try a creative action that no other tool covers (improvised stunts, tricks, sweet-talking, searching for hidden danger). The game engine alone sets the difficulty and judges success; you cannot choose them. harm/pass/distract need the living enemy in this room as target (pass may instead name an exit direction that enemy blocks); learn targets an exit direction or 'room'. Always costs a turn when accepted.",
    {
      target: { type: "string", description: "Enemy ID, exit direction, or 'room' (learn only)." },
      approach: { type: "string", description: "One of: force, finesse, wits, charm." },
      intent: { type: "string", description: "One of: harm, pass, distract, learn." },
      description: { type: "string", description: "The player's own action in their words, for narration." },
    },
    ["target", "approach", "intent", "description"],
  ),
];

const KNOWN_TOOLS = new Set(["move", "pick_up", "use_item", "attack", "sneak", "look", "examine", "throw", "attempt"]);

function invalidArgs(action: string, reason: string): ToolResult {
  return { ok: false, action, reason, rolls: [], events: [] };
}

function getStringArg(args: Record<string, unknown>, key: string): string | null {
  const value: unknown = args[key];
  if (typeof value !== "string") return null;
  if (value.trim().length === 0) return null;
  return value;
}

function describeLook(state: GameState, world: World): string {
  const view = playerView(state, world);
  const lines: string[] = [];
  lines.push(`You are in ${view.room.name}. ${view.room.description}`);
  if (view.exits.length === 0) {
    lines.push("There are no visible exits.");
  } else {
    const parts = view.exits.map((e) =>
      e.omen !== undefined
        ? `${e.direction} (${e.locked ? "locked" : "open"}) — ${e.omen}`
        : `${e.direction} (${e.locked ? "locked" : "open"})`,
    );
    lines.push(`Exits: ${parts.join(", ")}.`);
  }
  if (view.items.length === 0) {
    lines.push("You see nothing of value.");
  } else {
    lines.push(`You see: ${view.items.map((i) => i.name).join(", ")}.`);
  }
  if (view.enemy !== null) {
    const status = view.enemy.defeated ? "defeated" : view.enemy.condition;
    lines.push(`${view.enemy.name} is here - ${status} (${view.enemy.quirk}).`);
  }
  lines.push(`HP ${view.player.hp}/${view.player.maxHp}. Turn ${view.player.turn}/${view.player.maxTurns}.`);
  return lines.join(" ");
}


/** Execute one AI tool call. endTurn is never reachable from here. */
export function executeTool(
  state: GameState,
  world: World,
  name: string,
  rawArgs: string,
  rng: Rng,
): ToolResult {
  if (!KNOWN_TOOLS.has(name)) {
    return { ok: false, action: name, reason: `Unknown action ${name}.`, rolls: [], events: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs) as unknown;
  } catch {
    return invalidArgs(name, "Invalid arguments: malformed JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return invalidArgs(name, "Invalid arguments: expected a JSON object.");
  }
  const args = parsed as Record<string, unknown>;
  switch (name) {
    case "move": {
      const direction = getStringArg(args, "direction");
      if (direction === null) {
        return invalidArgs(name, 'Invalid arguments: "direction" must be a non-empty string.');
      }
      return move(state, world, direction, rng);
    }
    case "pick_up": {
      const itemId = getStringArg(args, "item_id");
      if (itemId === null) {
        return invalidArgs(name, 'Invalid arguments: "item_id" must be a non-empty string.');
      }
      return pickUp(state, world, itemId, rng);
    }
    case "use_item": {
      const itemId = getStringArg(args, "item_id");
      if (itemId === null) {
        return invalidArgs(name, 'Invalid arguments: "item_id" must be a non-empty string.');
      }
      const direction = getStringArg(args, "direction");
      return useItem(state, world, itemId, direction ?? undefined);
    }
    case "attack": {
      const enemyId = getStringArg(args, "enemy_id");
      if (enemyId === null) {
        return invalidArgs(name, 'Invalid arguments: "enemy_id" must be a non-empty string.');
      }
      // weapon_id is optional; a present-but-invalid value is ignored (null).
      const weaponId = getStringArg(args, "weapon_id");
      return attack(state, world, enemyId, rng, weaponId ?? undefined);
    }
    case "throw": {
      const itemId = getStringArg(args, "item_id");
      if (itemId === null) {
        return invalidArgs(name, 'Invalid arguments: "item_id" must be a non-empty string.');
      }
      const enemyId = getStringArg(args, "enemy_id");
      if (enemyId === null) {
        return invalidArgs(name, 'Invalid arguments: "enemy_id" must be a non-empty string.');
      }
      return throwItem(state, world, itemId, enemyId);
    }
    case "sneak": {
      const enemyId = getStringArg(args, "enemy_id");
      if (enemyId === null) {
        return invalidArgs(name, 'Invalid arguments: "enemy_id" must be a non-empty string.');
      }
      return sneak(state, world, enemyId, rng);
    }
    case "look": {
      return { ok: true, action: "look", rolls: [], events: [describeLook(state, world)] };
    }
    case "examine": {
      const itemId = getStringArg(args, "item_id");
      if (itemId === null) {
        return invalidArgs(name, 'Invalid arguments: "item_id" must be a non-empty string.');
      }
      return examine(state, world, itemId);
    }
    case "attempt": {
      // Only the four schema fields are read; extra keys (difficulty, outcome…)
      // are never looked at, so the engine alone computes the target.
      const target = getStringArg(args, "target");
      if (target === null) {
        return invalidArgs(name, 'Invalid arguments: "target" must be a non-empty string.');
      }
      const approachRaw = getStringArg(args, "approach");
      const approach = ATTEMPT_APPROACHES.find((a) => a === approachRaw);
      if (approach === undefined) {
        return invalidArgs(name, 'Invalid arguments: "approach" must be one of force, finesse, wits, charm.');
      }
      const intentRaw = getStringArg(args, "intent");
      const intent = ATTEMPT_INTENTS.find((i) => i === intentRaw);
      if (intent === undefined) {
        return invalidArgs(name, 'Invalid arguments: "intent" must be one of harm, pass, distract, learn.');
      }
      const descriptionRaw = getStringArg(args, "description");
      if (descriptionRaw === null) {
        return invalidArgs(name, 'Invalid arguments: "description" must be a non-empty string.');
      }
      return attempt(state, world, target, approach, intent, descriptionRaw.trim().slice(0, 200), rng);
    }
    default: {
      return { ok: false, action: name, reason: `Unknown action ${name}.`, rolls: [], events: [] };
    }
  }
}
