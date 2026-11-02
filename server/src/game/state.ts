import type { GameState, World } from "./types.js";

export function createGameState(world: World, sessionId: string): GameState {
  return {
    sessionId,
    worldId: world.id,
    hp: 10,
    maxHp: 10,
    inventory: [],
    currentRoomId: world.startRoomId,
    lastRoomId: null,
    rooms: structuredClone(world.rooms),
    enemies: structuredClone(world.enemies),
    flags: {},
    turn: 0,
    status: "playing",
  };
}
