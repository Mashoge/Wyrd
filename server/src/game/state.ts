import { chooseSecrets, commit } from "./secrets.js";
import type { GameState, Rng, World } from "./types.js";

export function createGameState(world: World, sessionId: string): GameState {
  return {
    sessionId,
    worldId: world.id,
    hp: 10,
    maxHp: 10,
    inventory: [],
    currentRoomId: world.startRoomId,
    lastRoomId: null,
    visitedRoomIds: [world.startRoomId],
    rooms: structuredClone(world.rooms),
    enemies: structuredClone(world.enemies),
    flags: {},
    turn: 0,
    status: "playing",
    secrets: { relicRoomId: "", trap: { roomId: "", direction: "" } },
    salt: "",
    commitment: "",
  };
}

export function startGame(
  world: World,
  sessionId: string,
  rng: Rng,
  salt: string,
): GameState {
  const state = createGameState(world, sessionId);
  const secrets = chooseSecrets(world, rng);
  const room = state.rooms[secrets.relicRoomId];
  if (room === undefined) {
    throw new Error(`Relic room "${secrets.relicRoomId}" does not exist.`);
  }
  // Place the relic in the state's room copy only; never mutate the world.
  room.items.push(world.relicItemId);
  state.secrets = secrets;
  state.salt = salt;
  state.commitment = commit(secrets, salt);
  return state;
}
