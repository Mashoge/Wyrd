import { describe, expect, it } from "vitest";
import { canonicalFromReveal, canonicalString, hashReveal, matchesStoredCommitment, sha256Hex } from "./verify";
import type { RevealResponse } from "./verify";

function revealFixture(): RevealResponse {
  return {
    rulesVersion: "wyrd-rules-v1",
    secrets: { relicRoomId: "library", trap: { roomId: "hall", direction: "east" } },
    display: { relicRoom: "Library", trapRoom: "Hall", trapDirection: "east" },
    salt: "abc123-salt-xyz",
    commitment: "bed6536ccf426fd97eb3f6a31d777a11c38344a9d4b65b36dbbc94a244217255",
    verified: true,
    nearMiss: null,
    tip: null,
  };
}

describe("verify canonical string", () => {
  it("uses exact server key order and JSON formatting", () => {
    expect(
      canonicalString({
        rulesVersion: "wyrd-rules-v1",
        relicRoomId: "library",
        trapRoomId: "hall",
        trapDirection: "east",
        salt: "abc123-salt-xyz",
      }),
    ).toBe(
      '{"rulesVersion":"wyrd-rules-v1","relicRoomId":"library","trapRoomId":"hall","trapDirection":"east","salt":"abc123-salt-xyz"}',
    );
  });

  it("byte-for-byte cross-checked fixture from server commit()", () => {
    const r = revealFixture();
    expect(canonicalFromReveal(r)).toBe(
      '{"rulesVersion":"wyrd-rules-v1","relicRoomId":"library","trapRoomId":"hall","trapDirection":"east","salt":"abc123-salt-xyz"}',
    );
  });

  it("matches a second server-generated fixture", () => {
    expect(
      canonicalString({
        rulesVersion: "wyrd-rules-v1",
        relicRoomId: "crypt_vault",
        trapRoomId: "gatehouse",
        trapDirection: "north",
        salt: "deadbeefcafe1234",
      }),
    ).toBe(
      '{"rulesVersion":"wyrd-rules-v1","relicRoomId":"crypt_vault","trapRoomId":"gatehouse","trapDirection":"north","salt":"deadbeefcafe1234"}',
    );
  });
});

describe("verify hashing", () => {
  it("browser sha256 matches server commit() byte for byte", async () => {
    const { hash } = await hashReveal(revealFixture());
    expect(hash).toBe("bed6536ccf426fd97eb3f6a31d777a11c38344a9d4b65b36dbbc94a244217255");
  });

  it("sha256Hex matches a known vector", async () => {
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("match compares against the stored turn-one commitment", async () => {
    const { hash } = await hashReveal(revealFixture());
    expect(matchesStoredCommitment(hash, revealFixture().commitment)).toBe(true);
    expect(matchesStoredCommitment(hash, "0".repeat(64))).toBe(false);
  });

  it("tampered secrets do not match", async () => {
    const tampered: RevealResponse = {
      ...revealFixture(),
      secrets: { relicRoomId: "chapel", trap: { roomId: "hall", direction: "east" } },
    };
    const { hash } = await hashReveal(tampered);
    expect(matchesStoredCommitment(hash, revealFixture().commitment)).toBe(false);
  });
});
