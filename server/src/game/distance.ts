import type { GameState, World } from "./types.js";

/** Shortest path (edge count) over exits, ignoring enemies and locks. Null if unreachable. */
export function roomDistance(world: World, fromId: string, toId: string): number | null {
  if (fromId === toId) {
    return world.rooms[fromId] === undefined ? null : 0;
  }
  if (world.rooms[fromId] === undefined || world.rooms[toId] === undefined) {
    return null;
  }
  const visited = new Set<string>([fromId]);
  let frontier: string[] = [fromId];
  let distance = 0;
  while (frontier.length > 0) {
    distance += 1;
    const next: string[] = [];
    for (const roomId of frontier) {
      const room = world.rooms[roomId];
      if (room === undefined) continue;
      for (const exit of room.exits) {
        if (visited.has(exit.to)) continue;
        if (world.rooms[exit.to] === undefined) continue;
        if (exit.to === toId) return distance;
        visited.add(exit.to);
        next.push(exit.to);
      }
    }
    frontier = next;
  }
  return null;
}

function roomsWord(n: number): string {
  return n === 1 ? "room" : "rooms";
}

/**
 * Near-miss line for a lost game. Returns null when the target is unreachable.
 * When the inventory holds the relic, measures current room -> exit room.
 * Otherwise measures current room -> relic's room.
 */
export function nearMissMessage(state: GameState, world: World): string | null {
  if (state.status === "won") return null;
  if (state.inventory.includes(world.relicItemId)) {
    const d = roomDistance(world, state.currentRoomId, world.exitRoomId);
    if (d === null) return null;
    return `You held the Lost Relic — the exit was ${d} ${roomsWord(d)} away.`;
  }
  if (state.secrets.relicRoomId === "") return null;
  const d = roomDistance(world, state.currentRoomId, state.secrets.relicRoomId);
  if (d === null) return null;
  return `The relic was ${d} ${roomsWord(d)} away.`;
}
