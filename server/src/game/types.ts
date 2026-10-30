export interface Item {
  id: string;
  name: string;
  description: string;
}

export interface Exit {
  direction: string;
  to: string;
  locked?: boolean;
  keyItemId?: string;
}

export interface Enemy {
  id: string;
  name: string;
  hp: number;
  attack: number;
  defeated: boolean;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  items: string[];
  exits: Exit[];
  enemyId?: string;
}

export interface World {
  id: string;
  title: string;
  startRoomId: string;
  exitRoomId: string;
  rooms: Record<string, Room>;
  items: Record<string, Item>;
  enemies: Record<string, Enemy>;
}

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  sessionId: string;
  worldId: string;
  hp: number;
  maxHp: number;
  inventory: string[];
  currentRoomId: string;
  rooms: Record<string, Room>;
  enemies: Record<string, Enemy>;
  flags: Record<string, boolean>;
  turn: number;
  status: GameStatus;
}
