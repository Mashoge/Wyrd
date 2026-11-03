import type { GameState, GameStatus, World } from "../game/types.js";

export type ConditionLabel = "unhurt" | "wounded" | "badly wounded" | "defeated";

export interface PlayerViewExit {
  direction: string;
  locked: boolean;
  leadsTo?: string;
  omen?: string;
  unlocked?: boolean;
}

export interface PlayerViewItem {
  id: string;
  name: string;
}

export interface PlayerViewEnemy {
  id: string;
  name: string;
  quirk: string;
  defeated: boolean;
  condition: ConditionLabel;
  passed: boolean;
}

export interface PlayerViewPlayer {
  hp: number;
  maxHp: number;
  inventory: PlayerViewItem[];
  turn: number;
  maxTurns: number;
  status: GameStatus;
}

export interface PlayerViewRoom {
  id: string;
  name: string;
  description: string;
}

export interface PlayerView {
  room: PlayerViewRoom;
  exits: PlayerViewExit[];
  items: PlayerViewItem[];
  enemy: PlayerViewEnemy | null;
  player: PlayerViewPlayer;
}

export function conditionFor(hp: number, maxHp: number, defeated = false): ConditionLabel {
  if (defeated) {
    return "defeated";
  }
  if (hp >= maxHp) {
    return "unhurt";
  }
  if (maxHp <= 0) {
    return "badly wounded";
  }
  if (hp > maxHp / 2) {
    return "wounded";
  }
  return "badly wounded";
}

function itemView(world: World, itemId: string): PlayerViewItem {
  return { id: itemId, name: world.items[itemId]?.name ?? itemId };
}

/** The ONLY game info the AI ever receives. Never leaks secrets, other rooms, or exact enemy hp. */
export function playerView(state: GameState, world: World): PlayerView {
  const room = state.rooms[state.currentRoomId];
  if (room === undefined) {
    throw new Error(`Current room "${state.currentRoomId}" does not exist.`);
  }

  const exits: PlayerViewExit[] = room.exits.map((e) => {
    const dest = state.rooms[e.to];
    const base: PlayerViewExit =
      dest !== undefined && state.visitedRoomIds.includes(e.to)
        ? { direction: e.direction, locked: e.locked === true, leadsTo: dest.name }
        : { direction: e.direction, locked: e.locked === true };
    if (state.flags[`unlocked:${room.id}:${e.direction}`] === true) {
      base.unlocked = true;
    }
    if (e.omen !== undefined) {
      base.omen = e.omen;
    }
    return base;
  });

  const items: PlayerViewItem[] = room.items.map((id) => itemView(world, id));

  let enemy: PlayerViewEnemy | null = null;
  if (room.enemyId !== undefined) {
    const foe = state.enemies[room.enemyId];
    if (foe !== undefined) {
      const maxHp = world.enemies[foe.id]?.hp ?? foe.hp;
      enemy = {
        id: foe.id,
        name: foe.name,
        quirk: foe.quirk,
        defeated: foe.defeated,
        condition: conditionFor(foe.hp, maxHp, foe.defeated),
        passed: state.flags[`sneaked:${room.id}`] === true && !foe.defeated,
      };
    }
  }

  return {
    room: { id: room.id, name: room.name, description: room.description },
    exits,
    items,
    enemy,
    player: {
      hp: state.hp,
      maxHp: state.maxHp,
      inventory: state.inventory.map((id) => itemView(world, id)),
      turn: state.turn,
      maxTurns: world.maxTurns,
      status: state.status,
    },
  };
}
