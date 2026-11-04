export function commitmentKey(gameId: string): string {
  return `wyrd.commitment.${gameId}`;
}

export function saveCommitment(gameId: string, commitment: string): void {
  try {
    window.localStorage.setItem(commitmentKey(gameId), commitment);
  } catch {
    /* storage unavailable */
  }
}

/** Save only when nothing is stored yet for this game id. Returns true when a write happened. */
export function saveCommitmentIfAbsent(gameId: string, commitment: string): boolean {
  const existing = loadCommitment(gameId);
  if (existing !== null) return false;
  saveCommitment(gameId, commitment);
  return true;
}

export interface StoredCommitmentResult {
  stored: string;
  sealMismatch: boolean;
}

/**
 * First-write-wins resolution for the turn-one commitment.
 * Stores the server commitment only when none is stored yet for this game id.
 * When a stored value exists and differs from the server value, the stored
 * value is kept and sealMismatch is true so the reveal shows SEAL BROKEN.
 */
export function resolveStoredCommitment(gameId: string, serverCommitment: string): StoredCommitmentResult {
  const existing = loadCommitment(gameId);
  if (existing === null) {
    saveCommitment(gameId, serverCommitment);
    return { stored: serverCommitment, sealMismatch: false };
  }
  if (existing === serverCommitment) {
    return { stored: existing, sealMismatch: false };
  }
  return { stored: existing, sealMismatch: true };
}

export function loadCommitment(gameId: string): string | null {
  try {
    const raw = window.localStorage.getItem(commitmentKey(gameId));
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}
