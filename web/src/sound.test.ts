import { describe, expect, it } from "vitest";
import type { DiceRoll, ToolLogEntry } from "./api";
import {
  MASTER_VOLUME,
  SOUND_STORAGE_KEY,
  loadSoundOn,
  saveSoundOn,
  soundForRoll,
  soundForStatus,
  soundsForRoll,
  soundsForTurn,
  type KeyValueStorage,
} from "./sound";

function roll(partial: Partial<DiceRoll> & { purpose: string }): DiceRoll {
  return { sides: 20, value: 10, target: 10, success: true, bonus: 0, ...partial };
}

function entry(ok: boolean, rolls: DiceRoll[] = [], name = "move"): ToolLogEntry {
  return { name, args: {}, result: { ok, action: name, reason: ok ? undefined : "No.", rolls, events: [] } };
}

function fakeStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
  };
}

describe("event -> sound mapping", () => {
  it("master volume is low", () => {
    expect(MASTER_VOLUME).toBe(0.25);
  });

  it("maps check rolls: hit/miss by player-side tone, partial ticks only", () => {
    expect(soundsForRoll(roll({ purpose: "player attack", success: true }))).toEqual(["dice", "hit"]);
    expect(soundsForRoll(roll({ purpose: "player attack", success: false }))).toEqual(["dice", "miss"]);
    // Enemy attack landing is bad for the player (coral tone) -> miss sound.
    expect(soundsForRoll(roll({ purpose: "enemy attack", success: true }))).toEqual(["dice", "miss"]);
    expect(soundsForRoll(roll({ purpose: "enemy attack", success: false }))).toEqual(["dice", "hit"]);
    expect(soundsForRoll(roll({ purpose: "attempt", success: false, result: "partial" }))).toEqual(["dice"]);
  });

  it("maps trap rolls to the sting and ignores non-check rolls", () => {
    expect(soundForRoll(roll({ purpose: "trap", target: 0 }))).toBe("trap");
    expect(soundsForRoll(roll({ purpose: "trap", target: 0 }))).toEqual(["trap"]);
    expect(soundForRoll(roll({ purpose: "player damage", target: 0 }))).toBeNull();
    expect(soundsForRoll(roll({ purpose: "player damage", target: 0 }))).toEqual([]);
  });

  it("turn: refused claims thunk once; ordinary moves/pickups are silent", () => {
    expect(soundsForTurn([entry(true)])).toEqual([]);
    expect(soundsForTurn([entry(true, [], "pick_up")])).toEqual([]);
    expect(soundsForTurn([entry(false), entry(false)])).toEqual(["refused"]);
    expect(
      soundsForTurn([entry(true, [roll({ purpose: "player attack", success: true })], "attack"), entry(false)]),
    ).toEqual(["dice", "hit", "refused"]);
    expect(soundsForTurn([entry(true, [roll({ purpose: "trap", target: 0 })])])).toEqual(["trap"]);
  });

  it("maps game-over status", () => {
    expect(soundForStatus("won")).toBe("victory");
    expect(soundForStatus("lost")).toBe("defeat");
    expect(soundForStatus("playing")).toBeNull();
  });
});

describe("mute persistence", () => {
  it("defaults on, round-trips, and only an explicit 0 mutes", () => {
    const s = fakeStorage();
    expect(loadSoundOn(s)).toBe(true);
    saveSoundOn(false, s);
    expect(s.data.get(SOUND_STORAGE_KEY)).toBe("0");
    expect(loadSoundOn(s)).toBe(false);
    saveSoundOn(true, s);
    expect(loadSoundOn(s)).toBe(true);
    expect(loadSoundOn(fakeStorage({ [SOUND_STORAGE_KEY]: "junk" }))).toBe(true);
    expect(loadSoundOn(null)).toBe(true);
  });

  it("never throws on broken storage", () => {
    const broken: KeyValueStorage = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    expect(loadSoundOn(broken)).toBe(true);
    expect(() => saveSoundOn(false, broken)).not.toThrow();
    expect(() => saveSoundOn(false, null)).not.toThrow();
  });
});
