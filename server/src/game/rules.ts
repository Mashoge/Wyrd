import { rollDie } from "./dice.js";
import type {
  AttemptApproach,
  AttemptIntent,
  Enemy,
  GameState,
  Item,
  Rng,
  ToolResult,
  World,
} from "./types.js";

function gameOverResult(action: string): ToolResult {
  return { ok: false, action, reason: "The game is over.", rolls: [], events: [] };
}

function reject(action: string, reason: string): ToolResult {
  return { ok: false, action, reason, rolls: [], events: [] };
}

function humanizeId(id: string): string {
  return id.replace(/_+/g, " ").trim();
}

function displayItemName(world: World, itemId: string): string {
  return world.items[itemId]?.name ?? humanizeId(itemId);
}

function displayEnemyName(world: World, state: GameState, enemyId: string): string {
  const fromState = state.enemies[enemyId]?.name;
  if (typeof fromState === "string" && fromState.length > 0) return fromState;
  return world.enemies[enemyId]?.name ?? humanizeId(enemyId);
}

function itemName(world: World, itemId: string): string {
  return world.items[itemId]?.name ?? humanizeId(itemId);
}

function bestWeapon(world: World, state: GameState): Item | undefined {
  let best: Item | undefined = undefined;
  let bestScore = -Infinity;
  for (const itemId of state.inventory) {
    const item = world.items[itemId];
    if (item === undefined || item.kind !== "weapon") continue;
    const score = (item.attackBonus ?? 0) + (item.damageBonus ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

export function examine(state: GameState, world: World, itemId: string): ToolResult {
  const room = state.rooms[state.currentRoomId];
  const inRoom = room !== undefined && room.items.includes(itemId);
  const inInventory = state.inventory.includes(itemId);
  if (!inRoom && !inInventory) {
    return reject("examine", `You don't see any ${displayItemName(world, itemId)} here.`);
  }
  const item = world.items[itemId];
  if (item === undefined) {
    return reject("examine", `You don't see any ${displayItemName(world, itemId)} here.`);
  }
  let detail = `${item.name}: ${item.description}`;
  if (item.kind === "weapon") {
    const parts: string[] = [];
    if (item.attackBonus !== undefined) parts.push(`${item.attackBonus >= 0 ? "+" : ""}${item.attackBonus} attack`);
    if (item.damageBonus !== undefined) parts.push(`${item.damageBonus >= 0 ? "+" : ""}${item.damageBonus} damage`);
    if (parts.length > 0) detail += ` (${parts.join(", ")})`;
  } else if (item.kind === "consumable" && item.heal !== undefined) {
    detail += ` (restores ${item.heal} HP)`;
  }
  return { ok: true, action: "examine", rolls: [], events: [detail] };
}

function normalizeDirection(direction: string): string {
  return direction.trim().toLowerCase();
}

/** Advance the clock by one turn and resolve win/lose. Order: died -> won -> timed out. */
export function endTurn(state: GameState, world: World): string[] {
  if (state.status !== "playing") {
    return [];
  }
  state.turn += 1;
  if (state.hp <= 0) {
    state.status = "lost";
    return ["You died."];
  }
  if (
    state.inventory.includes(world.relicItemId) &&
    state.currentRoomId === world.exitRoomId
  ) {
    state.status = "won";
    return ["You won!"];
  }
  if (state.turn >= world.maxTurns) {
    state.status = "lost";
    return ["You ran out of time."];
  }
  const turnsLeft = world.maxTurns - state.turn;
  if (turnsLeft === 10) {
    return ["Your torch burns low: 10 turns left."];
  }
  if (turnsLeft === 5) {
    return ["Your torch gutters: 5 turns left!"];
  }
  return [];
}

function enemyCounterattack(
  state: GameState,
  enemy: Enemy,
  rng: Rng,
  rolls: ToolResult["rolls"],
  events: string[],
): void {
  const attackRoll = rollDie(20, rng, "enemy attack", 12);
  rolls.push(attackRoll);
  if (attackRoll.value >= 12) {
    state.hp = Math.max(0, state.hp - enemy.attack);
    events.push(`The ${enemy.name} hit you for ${enemy.attack} damage.`);
  } else {
    events.push(`The ${enemy.name} missed you.`);
  }
}

export function move(
  state: GameState,
  world: World,
  rawDirection: string,
  rng: Rng,
): ToolResult {
  if (state.status !== "playing") {
    return gameOverResult("move");
  }
  const room = state.rooms[state.currentRoomId];
  if (room === undefined) {
    return reject("move", "You are nowhere.");
  }
  const direction = normalizeDirection(rawDirection);
  const exit = room.exits.find((e) => e.direction === direction);
  if (exit === undefined) {
    return reject("move", `There is no exit to the ${direction}.`);
  }
  if (exit.locked) {
    return reject("move", `The door to the ${direction} is locked.`);
  }
  if (room.enemyId !== undefined) {
    const enemy = state.enemies[room.enemyId];
    if (enemy !== undefined && !enemy.defeated && !state.flags[`sneaked:${room.id}`]) {
      const isRetreat = exit.to === state.lastRoomId;
      if (!isRetreat) {
        return reject("move", `The ${enemy.name} blocks your way.`);
      }
      if (enemy.blocksRetreat) {
        return reject("move", "The doors are sealed.");
      }
    }
  }
  state.lastRoomId = state.currentRoomId;
  state.currentRoomId = exit.to;
  if (!state.visitedRoomIds.includes(exit.to)) {
    state.visitedRoomIds.push(exit.to);
  }
  const destName = state.rooms[exit.to]?.name ?? exit.to;
  const rolls: ToolResult["rolls"] = [];
  const events = [`You moved ${direction} to the ${destName}.`];
  // The trap triggers when the player moves through the exit matching
  // state.secrets.trap (origin room + normalized direction), at most once.
  const originId = state.lastRoomId;
  if (
    state.flags["trap_sprung"] !== true &&
    originId === state.secrets.trap.roomId &&
    direction === normalizeDirection(state.secrets.trap.direction)
  ) {
    const trapRoll = rollDie(4, rng, "trap", 0);
    rolls.push(trapRoll);
    state.hp = Math.max(0, state.hp - trapRoll.value);
    state.flags["trap_sprung"] = true;
    events.push(`A trap springs! You take ${trapRoll.value} damage.`);
  }
  events.push(...endTurn(state, world));
  return { ok: true, action: "move", rolls, events };
}

export function pickUp(state: GameState, world: World, itemId: string, rng: Rng): ToolResult {
  if (state.status !== "playing") {
    return gameOverResult("pickUp");
  }
  const room = state.rooms[state.currentRoomId];
  if (room === undefined) {
    return reject("pickUp", "You are nowhere.");
  }
  const index = room.items.indexOf(itemId);
  if (index === -1) {
    return reject("pickUp", `There is no ${displayItemName(world, itemId)} here.`);
  }
  const watcher =
    room.enemyId !== undefined ? state.enemies[room.enemyId] : undefined;
  const watched =
    watcher !== undefined && !watcher.defeated && !state.flags[`sneaked:${room.id}`];
  if (watched && watcher.alertness >= 20) {
    return reject("pickUp", `The ${watcher.name} is watching you.`);
  }
  if (watched && watcher.alertness > 0) {
    const grabRoll = rollDie(20, rng, "grab", watcher.alertness + 1);
    if (grabRoll.value > watcher.alertness) {
      room.items.splice(index, 1);
      state.inventory.push(itemId);
      const events = [`You picked up the ${itemName(world, itemId)}.`];
      events.push(...endTurn(state, world));
      return { ok: true, action: "pickUp", rolls: [grabRoll], events };
    }
    const rolls: ToolResult["rolls"] = [grabRoll];
    const events = [`The ${watcher.name} noticed you!`];
    enemyCounterattack(state, watcher, rng, rolls, events);
    events.push(...endTurn(state, world));
    return { ok: true, action: "pickUp", rolls, events };
  }
  room.items.splice(index, 1);
  state.inventory.push(itemId);
  const events = [`You picked up the ${itemName(world, itemId)}.`];
  events.push(...endTurn(state, world));
  return { ok: true, action: "pickUp", rolls: [], events };
}

export function useItem(
  state: GameState,
  world: World,
  itemId: string,
  rawDirection?: string | null,
): ToolResult {
  if (state.status !== "playing") {
    return gameOverResult("useItem");
  }
  const item = world.items[itemId];
  if (item === undefined || !state.inventory.includes(itemId)) {
    return reject("useItem", `You do not have the ${itemName(world, itemId)}.`);
  }
  if (item.kind === "consumable") {
    const heal = item.heal ?? 0;
    if (state.hp >= state.maxHp) {
      return reject("useItem", "You are already unhurt.");
    }
    const recovered = Math.min(heal, state.maxHp - state.hp);
    state.hp += recovered;
    state.inventory = state.inventory.filter((id) => id !== itemId);
    const events = [`You drink the ${item.name} and recover ${recovered} HP.`];
    events.push(...endTurn(state, world));
    return { ok: true, action: "useItem", rolls: [], events };
  }
  if (item.kind === "weapon") {
    return reject("useItem", `The ${item.name} is used automatically when you attack.`);
  }
  if (item.kind === "treasure" || item.kind === "misc") {
    return reject("useItem", `Nothing happens when you use the ${item.name}.`);
  }
  if (rawDirection === undefined || rawDirection === null) {
    return reject("useItem", `Use the ${item.name} on which door? Say a direction.`);
  }
  const room = state.rooms[state.currentRoomId];
  if (room === undefined) {
    return reject("useItem", "You are nowhere.");
  }
  const direction = normalizeDirection(rawDirection);
  const exit = room.exits.find((e) => e.direction === direction);
  if (exit === undefined) {
    return reject("useItem", `There is no exit to the ${direction}.`);
  }
  if (!exit.locked) {
    return reject("useItem", `The door to the ${direction} is not locked.`);
  }
  if (exit.keyItemId !== itemId) {
    return reject(
      "useItem",
      `The ${itemName(world, itemId)} does not unlock the door to the ${direction}.`,
    );
  }
  exit.locked = false;
  state.flags[`unlocked:${room.id}:${direction}`] = true;
  const events = [`You unlocked the door to the ${direction}.`];
  events.push(...endTurn(state, world));
  return { ok: true, action: "useItem", rolls: [], events };
}

export function attack(
  state: GameState,
  world: World,
  enemyId: string,
  rng: Rng,
  weaponId?: string,
): ToolResult {
  if (state.status !== "playing") {
    return gameOverResult("attack");
  }
  const room = state.rooms[state.currentRoomId];
  const enemy = state.enemies[enemyId];
  if (room === undefined || enemy === undefined || room.enemyId !== enemyId) {
    return reject("attack", `There is no ${displayEnemyName(world, state, enemyId)} here.`);
  }
  if (enemy.defeated) {
    return reject("attack", `The ${enemy.name} is already defeated.`);
  }
  let weapon: Item | undefined;
  if (weaponId !== undefined) {
    if (!state.inventory.includes(weaponId)) {
      return reject("attack", `You do not have the ${itemName(world, weaponId)}.`);
    }
    const chosen = world.items[weaponId];
    if (chosen === undefined || chosen.kind !== "weapon") {
      return reject("attack", `The ${itemName(world, weaponId)} is not a weapon.`);
    }
    weapon = chosen;
  } else {
    weapon = bestWeapon(world, state);
  }
  const rolls: ToolResult["rolls"] = [];
  const events: string[] = [];
  const attackBonus = weapon?.attackBonus ?? 0;
  const damageBonus = weapon?.damageBonus ?? 0;
  const hitTarget = 10 - attackBonus;
  if (weapon !== undefined) {
    events.push(`You strike with the ${weapon.name}.`);
  } else {
    events.push("You fight bare-handed.");
  }
  const attackRoll = rollDie(20, rng, "player attack", hitTarget);
  rolls.push(attackRoll);
  if (attackRoll.value >= hitTarget) {
    const bonus = 1 + damageBonus;
    const damageRoll = rollDie(4, rng, "player damage", 0, bonus);
    rolls.push(damageRoll);
    const damage = damageRoll.value + bonus;
    enemy.hp -= damage;
    events.push(`You hit the ${enemy.name} for ${damage} damage.`);
    if (enemy.hp <= 0) {
      enemy.defeated = true;
      events.push(`You defeated the ${enemy.name}.`);
      for (const lootId of enemy.loot) {
        room.items.push(lootId);
        events.push(`The ${enemy.name} dropped ${itemName(world, lootId)}.`);
      }
    }
  } else {
    events.push(`You missed the ${enemy.name}.`);
  }
  if (!enemy.defeated) {
    enemyCounterattack(state, enemy, rng, rolls, events);
  }
  events.push(...endTurn(state, world));
  return { ok: true, action: "attack", rolls, events };
}

export function sneak(
  state: GameState,
  world: World,
  enemyId: string,
  rng: Rng,
): ToolResult {
  if (state.status !== "playing") {
    return gameOverResult("sneak");
  }
  const room = state.rooms[state.currentRoomId];
  const enemy = state.enemies[enemyId];
  if (room === undefined || enemy === undefined || room.enemyId !== enemyId) {
    return reject("sneak", `There is no ${displayEnemyName(world, state, enemyId)} here.`);
  }
  if (enemy.defeated) {
    return reject("sneak", `The ${enemy.name} is already defeated.`);
  }
  if (state.flags[`sneaked:${room.id}`] === true) {
    return reject("sneak", `You're already past the ${enemy.name}.`);
  }
  const distractedKey = `distracted:${room.id}:${enemyId}`;
  const distracted = state.flags[distractedKey] === true;
  // Distraction is consumed by the next sneak attempt, success or fail.
  if (distracted) {
    delete state.flags[distractedKey];
  }
  const sneakTarget = distracted ? 9 : 13;
  const rolls: ToolResult["rolls"] = [];
  const events: string[] = [];
  const sneakRoll = rollDie(20, rng, "sneak", sneakTarget);
  rolls.push(sneakRoll);
  if (sneakRoll.value >= sneakTarget) {
    state.flags[`sneaked:${room.id}`] = true;
    events.push(`You sneaked past the ${enemy.name}.`);
  } else {
    events.push(`You failed to sneak past the ${enemy.name}.`);
    enemyCounterattack(state, enemy, rng, rolls, events);
  }
  events.push(...endTurn(state, world));
  return { ok: true, action: "sneak", rolls, events };
}

function priorAttempts(state: GameState, enemyId: string, approach: AttemptApproach): number {
  let n = 0;
  while (state.flags[`attempted:${enemyId}:${approach}:${n + 1}`] === true) {
    n += 1;
  }
  return n;
}

function trapHint(state: GameState, roomId: string, direction: string): string {
  const isTrap =
    state.secrets.trap.roomId === roomId &&
    normalizeDirection(state.secrets.trap.direction) === direction;
  return isTrap ? `The ${direction} exit is dangerous.` : `Nothing dangerous lies ${direction}.`;
}

/**
 * Judged creative action. The engine alone fixes the target:
 * 12 + enemy approach modifier (negative = easier) + 2 per prior attempt
 * with the same approach against the same enemy.
 * Bands: >= target success; target-3..target-1 partial (effect applies but a
 * living enemy counterattacks); below fail (no effect, counterattack).
 * `description` is the player's own words for narration only; never judged.
 */
export function attempt(
  state: GameState,
  world: World,
  target: string,
  approach: AttemptApproach,
  intent: AttemptIntent,
  description: string,
  rng: Rng,
): ToolResult {
  void description;
  if (state.status !== "playing") {
    return gameOverResult("attempt");
  }
  const room = state.rooms[state.currentRoomId];
  if (room === undefined) {
    return reject("attempt", "You are nowhere.");
  }
  const normalized = target.trim().toLowerCase();
  const roomEnemy: Enemy | undefined =
    room.enemyId !== undefined ? state.enemies[room.enemyId] : undefined;

  // Resolve and validate the intent/target matrix. Rejections never roll,
  // never cost a turn, and never change state.
  let subject: Enemy | undefined;
  let chosenExit: (typeof room.exits)[number] | undefined;
  if (intent === "learn") {
    if (room.enemyId !== undefined && normalized === room.enemyId) {
      return reject("attempt", "You cannot learn about an enemy that way.");
    }
    if (normalized !== "room") {
      chosenExit = room.exits.find((e) => e.direction === normalized);
      if (chosenExit === undefined) {
        return reject("attempt", `There is no exit to the ${normalized}.`);
      }
    }
    subject = roomEnemy !== undefined && !roomEnemy.defeated ? roomEnemy : undefined;
  } else {
    // harm / pass / distract need a living enemy in the room.
    if (roomEnemy === undefined) {
      return reject("attempt", "There is no enemy here.");
    }
    if (roomEnemy.defeated) {
      return reject("attempt", `The ${roomEnemy.name} is already defeated.`);
    }
    if (intent === "pass" && normalized !== roomEnemy.id) {
      chosenExit = room.exits.find((e) => e.direction === normalized);
      if (chosenExit === undefined) {
        return reject(
          "attempt",
          `There is no exit to the ${normalized}, and no such enemy here.`,
        );
      }
    } else if (normalized !== roomEnemy.id) {
      return reject("attempt", `There is no ${displayEnemyName(world, state, normalized)} here.`);
    }
    if (intent === "pass" && state.flags[`sneaked:${room.id}`] === true) {
      return reject("attempt", `You're already past the ${roomEnemy.name}.`);
    }
    subject = roomEnemy;
  }

  const modifier = subject?.attemptModifiers?.[approach] ?? 0;
  const priors = subject !== undefined ? priorAttempts(state, subject.id, approach) : 0;
  const targetNumber = 12 + modifier + 2 * priors;

  const rolls: ToolResult["rolls"] = [];
  const events: string[] = [];
  const roll = rollDie(20, rng, "attempt", targetNumber);
  const result: "success" | "partial" | "fail" =
    roll.value >= targetNumber ? "success" : roll.value >= targetNumber - 3 ? "partial" : "fail";
  roll.success = result === "success";
  roll.result = result;
  rolls.push(roll);

  if (subject !== undefined) {
    state.flags[`attempted:${subject.id}:${approach}:${priors + 1}`] = true;
  }

  if (result === "fail") {
    events.push("Your attempt fails.");
  } else if (intent === "harm" && subject !== undefined) {
    const damageRoll = rollDie(4, rng, "attempt damage", 0);
    rolls.push(damageRoll);
    subject.hp -= damageRoll.value;
    events.push(`You hit the ${subject.name} for ${damageRoll.value} damage.`);
    if (subject.hp <= 0) {
      subject.defeated = true;
      events.push(`You defeated the ${subject.name}.`);
      for (const lootId of subject.loot) {
        room.items.push(lootId);
        events.push(`The ${subject.name} dropped ${itemName(world, lootId)}.`);
      }
    }
  } else if (intent === "pass") {
    state.flags[`sneaked:${room.id}`] = true;
    events.push(
      subject !== undefined
        ? `You got past the ${subject.name}.`
        : "You slipped through.",
    );
  } else if (intent === "distract" && subject !== undefined) {
    state.flags[`distracted:${room.id}:${subject.id}`] = true;
    events.push(`The ${subject.name} is distracted.`);
  } else if (intent === "learn") {
    if (normalized === "room") {
      const omenExit = room.exits.find((e) => e.omen !== undefined);
      if (omenExit !== undefined && omenExit.omen !== undefined) {
        events.push(omenExit.omen);
      } else {
        // One exit only: first unvisited in exit order, else the first exit.
        const hintExit =
          room.exits.find((e) => !state.visitedRoomIds.includes(e.to)) ?? room.exits[0];
        if (hintExit === undefined) {
          events.push("There is nothing more to learn here.");
        } else {
          events.push(trapHint(state, room.id, hintExit.direction));
        }
      }
    } else if (chosenExit !== undefined) {
      events.push(trapHint(state, room.id, chosenExit.direction));
    }
  }

  if (result !== "success" && subject !== undefined && !subject.defeated) {
    enemyCounterattack(state, subject, rng, rolls, events);
  }
  events.push(...endTurn(state, world));
  return { ok: true, action: "attempt", rolls, events };
}

export function throwItem(
  state: GameState,
  world: World,
  itemId: string,
  enemyId: string,
): ToolResult {
  if (state.status !== "playing") {
    return gameOverResult("throw");
  }
  const room = state.rooms[state.currentRoomId];
  const enemy = state.enemies[enemyId];
  if (room === undefined || enemy === undefined || room.enemyId !== enemyId) {
    return reject("throw", `There is no ${displayEnemyName(world, state, enemyId)} here.`);
  }
  if (enemy.defeated) {
    return reject("throw", `The ${enemy.name} is already defeated.`);
  }
  if (state.flags[`sneaked:${room.id}`] === true) {
    return reject("throw", `You're already past the ${enemy.name}.`);
  }
  const itemIndex = state.inventory.indexOf(itemId);
  if (itemIndex === -1) {
    return reject("throw", `You do not have the ${itemName(world, itemId)}.`);
  }
  state.inventory.splice(itemIndex, 1);
  room.items.push(itemId);
  const name = itemName(world, itemId);
  const events: string[] = [];
  if (enemy.lureItemId === itemId) {
    state.flags[`sneaked:${room.id}`] = true;
    events.push(`You throw the ${name}. The ${enemy.name} goes after it, and the way is open.`);
  } else {
    state.flags[`distracted:${room.id}:${enemyId}`] = true;
    events.push(`You throw the ${name}. The ${enemy.name} is distracted.`);
  }
  events.push(...endTurn(state, world));
  return { ok: true, action: "throw", rolls: [], events };
}

