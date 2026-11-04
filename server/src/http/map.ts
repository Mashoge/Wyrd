import type { GameState, World } from "../game/types.js";

export interface MapRoom {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface MapLink {
  from: string;
  to: string;
  direction: string;
}

export interface MapStub {
  from: string;
  direction: string;
}

/**
 * Player-safe mini-map: visited rooms only, links between visited rooms,
 * and unexplored-exit stubs (from + direction, never a name or destination).
 * Built only from state + world names of visited rooms. Never touches
 * secrets, unvisited rooms, traps, or the relic. HTTP layer only — never
 * shown to the AI (not part of the player view or prompt).
 */
export interface GameMap {
  rooms: MapRoom[];
  links: MapLink[];
  unexplored: MapStub[];
}

export function buildMap(state: GameState, world: World): GameMap {
  const visited = new Set(state.visitedRoomIds);
  const rooms: MapRoom[] = [];
  for (const id of state.visitedRoomIds) {
    const room = state.rooms[id] ?? world.rooms[id];
    if (room === undefined) continue;
    // De-dupe while keeping first-visit order (visitedRoomIds should be unique).
    if (rooms.some((r) => r.id === id)) continue;
    rooms.push({ id, name: room.name, isCurrent: id === state.currentRoomId });
  }

  const links: MapLink[] = [];
  const seenLink = new Set<string>();
  const unexplored: MapStub[] = [];
  const seenStub = new Set<string>();
  for (const from of state.visitedRoomIds) {
    if (!visited.has(from)) continue;
    const room = state.rooms[from] ?? world.rooms[from];
    if (room === undefined) continue;
    for (const exit of room.exits) {
      if (visited.has(exit.to)) {
        const key = `${from}|${exit.to}|${exit.direction}`;
        if (!seenLink.has(key)) {
          seenLink.add(key);
          links.push({ from, to: exit.to, direction: exit.direction });
        }
      } else {
        const key = `${from}|${exit.direction}`;
        if (!seenStub.has(key)) {
          seenStub.add(key);
          unexplored.push({ from, direction: exit.direction });
        }
      }
    }
  }

  return { rooms, links, unexplored };
}
