import { describe, expect, it } from "vitest";
import {
  canonicalSecrets,
  chooseSecrets,
  commit,
  newSalt,
  verify,
} from "./secrets.js";
import { RULES_VERSION } from "./version.js";
import type { Rng, Secrets, World } from "./types.js";

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= values.length) {
      throw new Error("seqRng exhausted: more rolls than expected.");
    }
    return values[i++] as number;
  };
}

function makeWorld(): World {
  return {
    id: "test-world",
    title: "Test World",
    startRoomId: "entrance",
    exitRoomId: "exit",
    relicItemId: "relic",
    maxTurns: 20,
    relicCandidateRoomIds: ["lib", "vault", "crypt"],
    trapCandidates: [
      { roomId: "entrance", direction: "north" },
      { roomId: "hall", direction: "east" },
    ],
    rooms: {
      entrance: {
        id: "entrance",
        name: "Entrance",
        description: "Start.",
        items: [],
        exits: [{ direction: "north", to: "exit" }],
      },
      exit: {
        id: "exit",
        name: "Exit",
        description: "End.",
        items: [],
        exits: [],
      },
      lib: { id: "lib", name: "Lib", description: "Lib.", items: [], exits: [] },
      vault: {
        id: "vault",
        name: "Vault",
        description: "Vault.",
        items: [],
        exits: [],
      },
      crypt: {
        id: "crypt",
        name: "Crypt",
        description: "Crypt.",
        items: [],
        exits: [],
      },
      hall: {
        id: "hall",
        name: "Hall",
        description: "Hall.",
        items: [],
        exits: [],
      },
    },
    items: {
      relic: { id: "relic", name: "Relic", description: "The relic.", kind: "treasure" },
    },
    enemies: {},
  };
}

describe("chooseSecrets", () => {
  it("is deterministic with seqRng and uses one rng() call per pick", () => {
    const world = makeWorld();
    // index = Math.floor(rng() * length): 0 -> first, 0.99 -> last.
    const first = chooseSecrets(world, seqRng([0, 0]));
    expect(first).toEqual({
      relicRoomId: "lib",
      trap: { roomId: "entrance", direction: "north" },
    });
    const last = chooseSecrets(world, seqRng([0.99, 0.99]));
    expect(last).toEqual({
      relicRoomId: "crypt",
      trap: { roomId: "hall", direction: "east" },
    });
    // middle: floor(0.5 * 3) = 1 -> "vault"; floor(0.5 * 2) = 1 -> second trap.
    const middle = chooseSecrets(world, seqRng([0.5, 0.5]));
    expect(middle).toEqual({
      relicRoomId: "vault",
      trap: { roomId: "hall", direction: "east" },
    });
  });
});

describe("commit / verify", () => {
  it("commit is 64 hex chars", () => {
    const secrets: Secrets = {
      relicRoomId: "lib",
      trap: { roomId: "entrance", direction: "north" },
    };
    expect(commit(secrets, "salt-1")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verify is true for the right secrets", () => {
    const secrets: Secrets = {
      relicRoomId: "lib",
      trap: { roomId: "entrance", direction: "north" },
    };
    const salt = "abc123";
    expect(verify(secrets, salt, commit(secrets, salt))).toBe(true);
  });

  it("verify is false if relicRoomId changes", () => {
    const secrets: Secrets = {
      relicRoomId: "lib",
      trap: { roomId: "entrance", direction: "north" },
    };
    const salt = "abc123";
    const commitment = commit(secrets, salt);
    expect(
      verify(
        {
          relicRoomId: "vault",
          trap: { roomId: "entrance", direction: "north" },
        },
        salt,
        commitment,
      ),
    ).toBe(false);
  });

  it("verify is false if the trap changes", () => {
    const secrets: Secrets = {
      relicRoomId: "lib",
      trap: { roomId: "entrance", direction: "north" },
    };
    const salt = "abc123";
    const commitment = commit(secrets, salt);
    expect(
      verify(
        {
          relicRoomId: "lib",
          trap: { roomId: "hall", direction: "east" },
        },
        salt,
        commitment,
      ),
    ).toBe(false);
    expect(
      verify(
        {
          relicRoomId: "lib",
          trap: { roomId: "entrance", direction: "south" },
        },
        salt,
        commitment,
      ),
    ).toBe(false);
  });

  it("verify is false if the salt changes", () => {
    const secrets: Secrets = {
      relicRoomId: "lib",
      trap: { roomId: "entrance", direction: "north" },
    };
    const commitment = commit(secrets, "right-salt");
    expect(verify(secrets, "wrong-salt", commitment)).toBe(false);
  });
});

describe("canonicalSecrets", () => {
  it("pins the rules version first", () => {
    expect(RULES_VERSION).toBe("wyrd-rules-v1");
  });

  it("uses exactly the documented key order", () => {
    const secrets: Secrets = {
      relicRoomId: "library",
      trap: { roomId: "hall", direction: "east" },
    };
    const salt = "abc123";
    expect(canonicalSecrets(secrets, salt)).toBe(
      '{"rulesVersion":"wyrd-rules-v1","relicRoomId":"library","trapRoomId":"hall","trapDirection":"east","salt":"abc123"}',
    );
    const canonical = canonicalSecrets(secrets, salt);
    const versionIdx = canonical.indexOf('"rulesVersion"');
    const relicIdx = canonical.indexOf('"relicRoomId"');
    const roomIdx = canonical.indexOf('"trapRoomId"');
    const dirIdx = canonical.indexOf('"trapDirection"');
    const saltIdx = canonical.indexOf('"salt"');
    expect(versionIdx).toBeGreaterThanOrEqual(0);
    expect(relicIdx).toBeGreaterThan(versionIdx);
    expect(roomIdx).toBeGreaterThan(relicIdx);
    expect(dirIdx).toBeGreaterThan(roomIdx);
    expect(saltIdx).toBeGreaterThan(dirIdx);
  });
});

describe("newSalt", () => {
  it("returns 16 random bytes as hex", () => {
    expect(newSalt()).toMatch(/^[0-9a-f]{32}$/);
  });
});
