export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const STORAGE_KEY = "wyrd.gameId";

export function apiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return "";
}

export function loadGameId(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function saveGameId(gameId: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, gameId);
  } catch {
    /* storage unavailable: game still works for this visit */
  }
}

export function clearGameId(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
