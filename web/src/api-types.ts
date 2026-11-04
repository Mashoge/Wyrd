export type GameStatus = "playing" | "won" | "lost";
export interface DiceRoll {
  purpose: string; sides: number; value: number;
  target: number; success: boolean; bonus: number;
}
export interface ToolResult {
  ok: boolean; action: string; reason?: string;
  rolls: DiceRoll[]; events: string[];
}
export interface ToolLogEntry {
  name: string; args: Record<string, unknown>; result: ToolResult;
}
export interface PlayerViewItem { id: string; name: string }
export interface PlayerViewExit { direction: string; locked: boolean; leadsTo?: string; omen?: string; unlocked?: boolean }
export interface PlayerViewEnemy {
  id: string; name: string; quirk: string; passed: boolean;
  defeated: boolean; condition: "unhurt" | "wounded" | "badly wounded" | "defeated";
  distracted?: boolean;
  enemyHp?: { hp: number; maxHp: number } | null;
}
export interface PlayerViewPlayer {
  hp: number; maxHp: number; inventory: PlayerViewItem[];
  turn: number; maxTurns: number; status: GameStatus;
}
export interface PlayerViewRoom { id: string; name: string; description: string }
export interface PlayerView {
  room: PlayerViewRoom; exits: PlayerViewExit[]; items: PlayerViewItem[];
  enemy: PlayerViewEnemy | null; player: PlayerViewPlayer;
}
export interface Suggestion { text: string; kind: string; target?: number; isNew?: boolean; usesConsumable?: boolean }
export interface GameMapRoom { id: string; name: string; isCurrent: boolean }
export interface GameMapLink { from: string; to: string; direction: string }
export interface GameMapStub { from: string; direction: string }
export interface GameMap { rooms: GameMapRoom[]; links: GameMapLink[]; unexplored: GameMapStub[] }
export interface NewGameResponse {
  gameId: string; commitment: string; narration: string;
  toolLog: ToolLogEntry[]; view: PlayerView; status: GameStatus; suggestions: Suggestion[]; map: GameMap;
}
export interface TurnResponse {
  narration: string; toolLog: ToolLogEntry[];
  view: PlayerView; status: GameStatus; suggestions: Suggestion[]; map: GameMap;
}
export interface ResumeResponse {
  gameId: string; commitment: string;
  view: PlayerView; status: GameStatus; suggestions: Suggestion[];
  openingNarration: string; openingToolLog: ToolLogEntry[]; map: GameMap;
}
