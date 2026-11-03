import { createHash, randomBytes } from "node:crypto";
import type { Rng, Secrets, World } from "./types.js";
import { RULES_VERSION } from "./version.js";

/**
 * Pick the hidden relic room and the hidden trap.
 *
 * Each choice consumes exactly one rng() call, in order:
 *   1. relicRoomId: index = Math.floor(rng() * world.relicCandidateRoomIds.length)
 *   2. trap:        index = Math.floor(rng() * world.trapCandidates.length)
 */
export function chooseSecrets(world: World, rng: Rng): Secrets {
  if (world.relicCandidateRoomIds.length === 0) {
    throw new Error("World has no relic candidate rooms.");
  }
  if (world.trapCandidates.length === 0) {
    throw new Error("World has no trap candidates.");
  }
  const relicIndex = Math.floor(rng() * world.relicCandidateRoomIds.length);
  const trapIndex = Math.floor(rng() * world.trapCandidates.length);
  const relicRoomId = world.relicCandidateRoomIds[relicIndex] as string;
  const trapCandidate = world.trapCandidates[trapIndex] as {
    roomId: string;
    direction: string;
  };
  return {
    relicRoomId,
    trap: { roomId: trapCandidate.roomId, direction: trapCandidate.direction },
  };
}

/**
 * Canonical string that is hashed for the commitment.
 *
 * DOCUMENTED FORMAT (the browser recomputes this later to verify):
 *   JSON.stringify of an object built with this FIXED key order:
 *     { rulesVersion, relicRoomId, trapRoomId, trapDirection, salt }
 * Example:
 *   {"rulesVersion":"wyrd-rules-v1","relicRoomId":"library","trapRoomId":"hall","trapDirection":"east","salt":"abc123"}
 */
export function canonicalSecrets(secrets: Secrets, salt: string): string {
  return JSON.stringify({
    rulesVersion: RULES_VERSION,
    relicRoomId: secrets.relicRoomId,
    trapRoomId: secrets.trap.roomId,
    trapDirection: secrets.trap.direction,
    salt,
  });
}

/** SHA-256 hex of the canonical secrets string, using node:crypto. */
export function commit(secrets: Secrets, salt: string): string {
  return createHash("sha256").update(canonicalSecrets(secrets, salt), "utf8").digest("hex");
}

/** 16 random bytes as hex (32 hex chars) via node:crypto randomBytes. */
export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

/** True when commit(secrets, salt) equals the stored commitment. */
export function verify(secrets: Secrets, salt: string, commitment: string): boolean {
  return commit(secrets, salt) === commitment;
}
