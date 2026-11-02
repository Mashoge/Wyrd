import type { World } from "./types.js";

/** Validate a World. Empty array = valid; each string is a clear error. */
function explore(
  world: World,
  fromRoomId: string,
  seed: ReadonlySet<string>,
): { reachable: Set<string>; collected: Set<string> } {
  const reachable = new Set<string>();
  const collected = new Set<string>(seed);
  if (world.rooms[fromRoomId] === undefined) {
    return { reachable, collected };
  }
  reachable.add(fromRoomId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const roomId of [...reachable]) {
      const room = world.rooms[roomId];
      if (room === undefined) continue;
      for (const itemId of room.items) {
        if (!collected.has(itemId)) {
          collected.add(itemId);
          changed = true;
        }
      }
      if (room.enemyId !== undefined) {
        const enemy = world.enemies[room.enemyId];
        if (enemy !== undefined) {
          for (const lootId of enemy.loot) {
            if (!collected.has(lootId)) {
              collected.add(lootId);
              changed = true;
            }
          }
        }
      }
    }
    for (const roomId of [...reachable]) {
      const room = world.rooms[roomId];
      if (room === undefined) continue;
      for (const exit of room.exits) {
        if (world.rooms[exit.to] === undefined) continue;
        if (reachable.has(exit.to)) continue;
        if (!exit.locked) {
          reachable.add(exit.to);
          changed = true;
        } else if (
          exit.keyItemId !== undefined &&
          collected.has(exit.keyItemId)
        ) {
          reachable.add(exit.to);
          changed = true;
        }
      }
    }
  }
  return { reachable, collected };
}

export function validateWorld(world: World): string[] {
  const errors: string[] = [];

  const startExists = world.rooms[world.startRoomId] !== undefined;
  if (!startExists) {
    errors.push(`startRoomId "${world.startRoomId}" does not exist in world.rooms.`);
  }
  const exitExists = world.rooms[world.exitRoomId] !== undefined;
  if (!exitExists) {
    errors.push(`exitRoomId "${world.exitRoomId}" does not exist in world.rooms.`);
  }
  if (world.startRoomId === world.exitRoomId) {
    errors.push(
      `startRoomId and exitRoomId must not be the same ("${world.startRoomId}").`,
    );
  }
  if (!Number.isInteger(world.maxTurns) || world.maxTurns <= 0) {
    errors.push(`maxTurns must be a positive integer, got ${world.maxTurns}.`);
  }

  for (const [key, room] of Object.entries(world.rooms)) {
    if (room.id !== key) {
      errors.push(`Room key "${key}" does not match its id "${room.id}".`);
    }
  }
  for (const [key, item] of Object.entries(world.items)) {
    if (item.id !== key) {
      errors.push(`Item key "${key}" does not match its id "${item.id}".`);
    }
  }
  for (const [key, enemy] of Object.entries(world.enemies)) {
    if (enemy.id !== key) {
      errors.push(`Enemy key "${key}" does not match its id "${enemy.id}".`);
    }
  }

  if (world.items[world.relicItemId] === undefined) {
    errors.push(`relicItemId "${world.relicItemId}" does not exist in world.items.`);
  }

  for (const [roomKey, room] of Object.entries(world.rooms)) {
    for (const itemId of room.items) {
      if (world.items[itemId] === undefined) {
        errors.push(`Room "${roomKey}" contains unknown item "${itemId}".`);
      }
    }
    if (room.enemyId !== undefined && world.enemies[room.enemyId] === undefined) {
      errors.push(`Room "${roomKey}" has unknown enemyId "${room.enemyId}".`);
    }
    const seen = new Set<string>();
    for (const exit of room.exits) {
      if (exit.direction !== exit.direction.trim().toLowerCase()) {
        errors.push(
          `Room "${roomKey}" exit direction "${exit.direction}" must equal its trim().toLowerCase() form.`,
        );
      }
      if (seen.has(exit.direction)) {
        errors.push(`Room "${roomKey}" has duplicate exit direction "${exit.direction}".`);
      } else {
        seen.add(exit.direction);
      }
      if (world.rooms[exit.to] === undefined) {
        errors.push(
          `Room "${roomKey}" exit "${exit.direction}" points to unknown room "${exit.to}".`,
        );
      }
      if (exit.keyItemId !== undefined && world.items[exit.keyItemId] === undefined) {
        errors.push(
          `Room "${roomKey}" exit "${exit.direction}" has unknown keyItemId "${exit.keyItemId}".`,
        );
      }
      if (exit.locked === true && exit.keyItemId === undefined) {
        errors.push(
          `Room "${roomKey}" exit "${exit.direction}" is locked but has no keyItemId.`,
        );
      }
    }
  }

  for (const [enemyKey, enemy] of Object.entries(world.enemies)) {
    if (!Number.isInteger(enemy.alertness) || enemy.alertness < 0 || enemy.alertness > 20) {
      errors.push(
        `Enemy "${enemyKey}" has invalid alertness ${enemy.alertness}: must be 0-20.`,
      );
    }
    for (const lootId of enemy.loot) {
      if (world.items[lootId] === undefined) {
        errors.push(`Enemy "${enemyKey}" has unknown loot item "${lootId}".`);
      }
    }
    if (enemy.loot.includes(world.relicItemId)) {
      errors.push(
        `Relic item "${world.relicItemId}" must not appear in enemy "${enemyKey}" loot.`,
      );
    }
  }

  for (const candidateId of world.relicCandidateRoomIds) {
    if (world.rooms[candidateId] === undefined) {
      errors.push(`Relic candidate room "${candidateId}" does not exist.`);
    } else if (candidateId === world.exitRoomId) {
      errors.push(
        `Relic candidate room "${candidateId}" must not be the exit room.`,
      );
    }
  }
  if (world.relicCandidateRoomIds.length === 0) {
    errors.push(`relicCandidateRoomIds must not be empty.`);
  }

  // --- enemyId used by at most one room ---
  const enemyRooms = new Map<string, string[]>();
  for (const [roomKey, room] of Object.entries(world.rooms)) {
    if (room.enemyId !== undefined) {
      const list = enemyRooms.get(room.enemyId);
      if (list === undefined) {
        enemyRooms.set(room.enemyId, [roomKey]);
      } else {
        list.push(roomKey);
      }
    }
  }
  for (const [enemyId, roomKeys] of enemyRooms) {
    if (roomKeys.length > 1) {
      const sorted = [...roomKeys].sort();
      errors.push(
        `Enemy "${enemyId}" is used by more than one room: ${sorted.join(", ")}.`,
      );
    }
  }

  // --- no item placed/looted more than once ---
  const itemSources = new Map<string, string[]>();
  for (const [roomKey, room] of Object.entries(world.rooms)) {
    for (const itemId of room.items) {
      const list = itemSources.get(itemId);
      if (list === undefined) {
        itemSources.set(itemId, [`room "${roomKey}"`]);
      } else {
        list.push(`room "${roomKey}"`);
      }
    }
  }
  for (const [enemyKey, enemy] of Object.entries(world.enemies)) {
    for (const lootId of enemy.loot) {
      const list = itemSources.get(lootId);
      if (list === undefined) {
        itemSources.set(lootId, [`enemy "${enemyKey}" loot`]);
      } else {
        list.push(`enemy "${enemyKey}" loot`);
      }
    }
  }
  for (const [itemId, sources] of itemSources) {
    if (sources.length > 1) {
      const sorted = [...sources].sort();
      errors.push(
        `Item "${itemId}" appears more than once: ${sorted.join(", ")}.`,
      );
    }
  }

  for (const trap of world.trapCandidates) {
    const room = world.rooms[trap.roomId];
    if (room === undefined) {
      errors.push(`Trap candidate room "${trap.roomId}" does not exist.`);
      continue;
    }
    if (trap.direction !== trap.direction.trim().toLowerCase()) {
      errors.push(
        `Trap candidate direction "${trap.direction}" in room "${trap.roomId}" must equal its trim().toLowerCase() form.`,
      );
    }
    const match = room.exits.some((e) => e.direction === trap.direction);
    if (!match) {
      errors.push(
        `Trap candidate {roomId:"${trap.roomId}", direction:"${trap.direction}"} does not point at a real exit.`,
      );
    }
  }

  for (const [roomKey, room] of Object.entries(world.rooms)) {
    if (room.items.includes(world.relicItemId)) {
      errors.push(
        `Relic item "${world.relicItemId}" is already placed in room "${roomKey}"; it must be placed secretly at game start.`,
      );
    }
  }

  if (startExists) {
    const main = explore(world, world.startRoomId, new Set<string>());
    if (exitExists && !main.reachable.has(world.exitRoomId)) {
      errors.push(
        `Exit room "${world.exitRoomId}" is unreachable from start "${world.startRoomId}".`,
      );
    }
    for (const candidateId of world.relicCandidateRoomIds) {
      if (world.rooms[candidateId] === undefined) continue;
      if (!main.reachable.has(candidateId)) {
        errors.push(
          `Relic candidate room "${candidateId}" is unreachable from start "${world.startRoomId}".`,
        );
        continue;
      }
      if (exitExists) {
        const back = explore(world, candidateId, main.collected);
        if (!back.reachable.has(world.exitRoomId)) {
          errors.push(
            `Relic candidate "${candidateId}" has no path to the exit "${world.exitRoomId}".`,
          );
        }
      }
    }
  }

  return errors;
}
