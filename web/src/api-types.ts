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
export interface PlayerViewExit { direction: string; locked: boolean; leadsTo?: string }
export interface PlayerViewEnemy {
  id: string; name: string; quirk: string;
  defeated: boolean; condition: "unhurt" | "wounded" | "badly wounded" | "defeated";
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
export interface NewGameResponse {
  gameId: string; commitment: string; narration: string;
  toolLog: ToolLogEntry[]; view: PlayerView; status: GameStatus; suggestions: string[];
}
export interface TurnResponse {
  narration: string; toolLog: ToolLogEntry[];
  view: PlayerView; status: GameStatus; suggestions: string[];
}
export interface ResumeResponse {
  gameId: string; commitment: string;
  view: PlayerView; status: GameStatus; suggestions: string[];
}
