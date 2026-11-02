export type ItemKind = "key" | "weapon" | "consumable" | "treasure" | "misc";

export interface Item {
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  attackBonus?: number;
  damageBonus?: number;
  heal?: number;
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
  relicCandidateRoomIds: string[];
  trapCandidates: { roomId: string; direction: string }[];
}

export interface Secrets {
  relicRoomId: string;
  trap: { roomId: string; direction: string };
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
  visitedRoomIds: string[];
  rooms: Record<string, Room>;
  enemies: Record<string, Enemy>;
  flags: Record<string, boolean>;
  turn: number;
  status: GameStatus;
  // NOTE: secrets and salt are server-only. They must never be sent to the
  // player before the game ends. Only `commitment` may be shared at game
  // start; secrets + salt are revealed at the end so the player (browser)
  // can recompute and verify the commitment.
  secrets: Secrets;
  salt: string;
  commitment: string;
}

export type Rng = () => number;

export interface DiceRoll {
  purpose: string;
  sides: number;
  value: number;
  target: number;
  success: boolean;
  bonus: number;
}

export interface ToolResult {
  ok: boolean;
  action: string;
  reason?: string;
  rolls: DiceRoll[];
  events: string[];
}
