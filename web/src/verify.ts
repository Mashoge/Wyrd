export interface RevealSecrets {
  relicRoomId: string;
  trapRoomId: string;
  trapDirection: string;
  rulesVersion: string;
  salt: string;
}

/** Reveal payload returned by GET /api/games/:id/reveal. */
export interface RevealResponse {
  rulesVersion: string;
  secrets: { relicRoomId: string; trap: { roomId: string; direction: string } };
  display: { relicRoom: string; trapRoom: string; trapDirection: string };
  salt: string;
  commitment: string;
  verified: boolean;
  nearMiss: string | null;
  tip: string | null;
}

/**
 * Canonical string hashed for the commitment. Must mirror
 * server/src/game/secrets.ts canonicalSecrets EXACTLY: same key order
 * {rulesVersion, relicRoomId, trapRoomId, trapDirection, salt},
 * same JSON.stringify formatting, same UTF-8 encoding.
 */
export function canonicalString(input: RevealSecrets): string {
  return JSON.stringify({
    rulesVersion: input.rulesVersion,
    relicRoomId: input.relicRoomId,
    trapRoomId: input.trapRoomId,
    trapDirection: input.trapDirection,
    salt: input.salt,
  });
}

export function canonicalFromReveal(reveal: RevealResponse): string {
  return canonicalString({
    rulesVersion: reveal.rulesVersion,
    relicRoomId: reveal.secrets.relicRoomId,
    trapRoomId: reveal.secrets.trap.roomId,
    trapDirection: reveal.secrets.trap.direction,
    salt: reveal.salt,
  });
}

function toHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (const b of view) out += b.toString(16).padStart(2, "0");
  return out;
}

/** SHA-256 hex of a UTF-8 string using WebCrypto. */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  return toHex(digest);
}

/** Hash the reveal payload exactly as the server did at game start. */
export async function hashReveal(reveal: RevealResponse): Promise<{ canonical: string; hash: string }> {
  const canonical = canonicalFromReveal(reveal);
  const hash = await sha256Hex(canonical);
  return { canonical, hash };
}

/** True when the browser-computed hash equals the commitment stored at turn one. */
export function matchesStoredCommitment(browserHash: string, storedCommitment: string): boolean {
  return browserHash === storedCommitment;
}
