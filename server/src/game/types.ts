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
  loot: string[];
  blocksRetreat: boolean;
  alertness: number;
  quirk: string;
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
  relicItemId: string;
  maxTurns: number;
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
  lastRoomId: string | null;
  rooms: Record<string, Room>;
  enemies: Record<string, Enemy>;
  flags: Record<string, boolean>;
  turn: number;
  status: GameStatus;
}

export type Rng = () => number;

export interface DiceRoll {
  purpose: string;
  sides: number;
  value: number;
}

export interface ToolResult {
  ok: boolean;
  action: string;
  reason?: string;
  rolls: DiceRoll[];
  events: string[];
}
