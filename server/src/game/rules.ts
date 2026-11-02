import { rollDie } from "./dice.js";
import type { Enemy, GameState, Rng, ToolResult, World } from "./types.js";

function gameOverResult(action: string): ToolResult {
  return { ok: false, action, reason: "The game is over.", rolls: [], events: [] };
}

function reject(action: string, reason: string): ToolResult {
  return { ok: false, action, reason, rolls: [], events: [] };
}

function itemName(world: World, itemId: string): string {
  return world.items[itemId]?.name ?? itemId;
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
  return [];
}

function enemyCounterattack(
  state: GameState,
  enemy: Enemy,
  rng: Rng,
  rolls: ToolResult["rolls"],
  events: string[],
): void {
  const attackRoll = rollDie(20, rng, "enemy attack");
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
    const trapRoll = rollDie(4, rng, "trap");
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
    return reject("pickUp", `There is no ${itemName(world, itemId)} here.`);
  }
  const watcher =
    room.enemyId !== undefined ? state.enemies[room.enemyId] : undefined;
  const watched =
    watcher !== undefined && !watcher.defeated && !state.flags[`sneaked:${room.id}`];
  if (watched && watcher.alertness >= 20) {
    return reject("pickUp", `The ${watcher.name} is watching you.`);
  }
  if (watched && watcher.alertness > 0) {
    const grabRoll = rollDie(20, rng, "grab");
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
  rawDirection: string,
): ToolResult {
  if (state.status !== "playing") {
    return gameOverResult("useItem");
  }
  if (!state.inventory.includes(itemId)) {
    return reject("useItem", `You do not have the ${itemName(world, itemId)}.`);
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
  const events = [`You unlocked the door to the ${direction}.`];
  events.push(...endTurn(state, world));
  return { ok: true, action: "useItem", rolls: [], events };
}

export function attack(
  state: GameState,
  world: World,
  enemyId: string,
  rng: Rng,
): ToolResult {
  if (state.status !== "playing") {
    return gameOverResult("attack");
  }
  const room = state.rooms[state.currentRoomId];
  const enemy = state.enemies[enemyId];
  if (room === undefined || enemy === undefined || room.enemyId !== enemyId) {
    return reject("attack", `There is no ${enemyId} here.`);
  }
  if (enemy.defeated) {
    return reject("attack", `The ${enemy.name} is already defeated.`);
  }
  const rolls: ToolResult["rolls"] = [];
  const events: string[] = [];
  const attackRoll = rollDie(20, rng, "player attack");
  rolls.push(attackRoll);
  if (attackRoll.value >= 10) {
    const damageRoll = rollDie(4, rng, "player damage");
    rolls.push(damageRoll);
    const damage = damageRoll.value + 1;
    enemy.hp -= damage;
    events.push(`You hit the ${enemy.name} for ${damage} damage.`);
    if (enemy.hp <= 0) {
      enemy.defeated = true;
      for (const lootId of enemy.loot) {
        room.items.push(lootId);
      }
      events.push(`You defeated the ${enemy.name}.`);
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
    return reject("sneak", `There is no ${enemyId} here.`);
  }
  if (enemy.defeated) {
    return reject("sneak", `The ${enemy.name} is already defeated.`);
  }
  const rolls: ToolResult["rolls"] = [];
  const events: string[] = [];
  const sneakRoll = rollDie(20, rng, "sneak");
  rolls.push(sneakRoll);
  if (sneakRoll.value >= 13) {
    state.flags[`sneaked:${room.id}`] = true;
    events.push(`You sneaked past the ${enemy.name}.`);
  } else {
    events.push(`You failed to sneak past the ${enemy.name}.`);
    enemyCounterattack(state, enemy, rng, rolls, events);
  }
  events.push(...endTurn(state, world));
  return { ok: true, action: "sneak", rolls, events };
}
