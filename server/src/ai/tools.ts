import type { GameState, Rng, ToolResult, World } from "../game/types.js";
import { attack, move, pickUp, sneak, useItem } from "../game/rules.js";
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
    "Use an inventory item on a locked exit in the current room. Fails without the item, without the exit, or with the wrong key.",
    {
      item_id: { type: "string", description: "ID of the inventory item to use." },
      direction: { type: "string", description: "Direction of the locked exit." },
    },
    ["item_id", "direction"],
  ),
  def(
    "attack",
    "Attack the enemy in the current room. Fails if no such enemy is here or it is already defeated.",
    { enemy_id: { type: "string", description: "ID of the enemy to attack." } },
    ["enemy_id"],
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
];

const KNOWN_TOOLS = new Set(["move", "pick_up", "use_item", "attack", "sneak", "look"]);

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
    const parts = view.exits.map((e) => `${e.direction} (${e.locked ? "locked" : "open"})`);
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
      if (direction === null) {
        return invalidArgs(name, 'Invalid arguments: "direction" must be a non-empty string.');
      }
      return useItem(state, world, itemId, direction);
    }
    case "attack": {
      const enemyId = getStringArg(args, "enemy_id");
      if (enemyId === null) {
        return invalidArgs(name, 'Invalid arguments: "enemy_id" must be a non-empty string.');
      }
      return attack(state, world, enemyId, rng);
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
    default: {
      return { ok: false, action: name, reason: `Unknown action ${name}.`, rolls: [], events: [] };
    }
  }
}
