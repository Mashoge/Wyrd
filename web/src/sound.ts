import type { DiceRoll, GameStatus, ToolLogEntry } from "./api";
import { rollDisplay, turnHasRefusal } from "./key-moments";

/**
 * Synthesized sound effects (Web Audio API, no audio files).
 * Pure helpers (event -> sound mapping, mute persistence) are exported for
 * tests; the engine below is the only impure part. One shared AudioContext
 * is created/resumed on the first user interaction and never plays before
 * that. Master gain is low (0.25); every sound finishes within ~400 ms.
 * No sounds for ordinary moves, pickups or typing.
 */

export type SoundName =
  | "dice" | "hit" | "miss" | "refused" | "trap"
  | "encounter" | "room" | "seal" | "victory" | "defeat";

export const SOUND_STORAGE_KEY = "wyrd.sound";
export const MASTER_VOLUME = 0.25;

/* ---- Pure: mute persistence (storage injected for tests) ---- */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Sound is on by default; only an explicit stored "0" mutes. Never throws. */
export function loadSoundOn(storage: KeyValueStorage | null = browserStorage()): boolean {
  try {
    if (storage === null) return true;
    return storage.getItem(SOUND_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveSoundOn(on: boolean, storage: KeyValueStorage | null = browserStorage()): void {
  try {
    storage?.setItem(SOUND_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* preference just will not persist */
  }
}

/* ---- Pure: event -> sound mapping ---- */

export function soundForRoll(roll: DiceRoll): SoundName | null {
  if (roll.purpose.trim().toLowerCase() === "trap") return "trap";
  const d = rollDisplay(roll);
  if (d === null) return null;
  if (d.tone === "partial") return "dice";
  return d.tone === "hit" ? "hit" : "miss";
}

/** Ordered sounds for one roll: dice ticks/land, then hit/miss. Trap is alone. */
export function soundsForRoll(roll: DiceRoll): SoundName[] {
  const s = soundForRoll(roll);
  if (s === null) return [];
  if (s === "trap" || s === "dice") return [s];
  return ["dice", s];
}

/**
 * Sounds for one completed turn, in play order. Ordinary accepted actions
 * (moves, pickups, looks…) are silent; rejected claims add one "refused".
 */
export function soundsForTurn(toolLog: ToolLogEntry[]): SoundName[] {
  const out: SoundName[] = [];
  for (const entry of toolLog) {
    for (const roll of entry.result.rolls) out.push(...soundsForRoll(roll));
  }
  if (turnHasRefusal(toolLog)) out.push("refused");
  return out;
}

export function soundForStatus(status: GameStatus): SoundName | null {
  if (status === "won") return "victory";
  if (status === "lost") return "defeat";
  return null;
}

/* ---- Engine: one shared context, gated on first interaction ---- */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
let soundOn = loadSoundOn();

export function isSoundOn(): boolean {
  return soundOn;
}

export function setSoundOn(on: boolean): void {
  soundOn = on;
  saveSoundOn(on);
  if (on) unlockAudio();
}

/** Create/resume the shared context; call from user-gesture handlers only. */
export function unlockAudio(): void {
  try {
    if (typeof window === "undefined") return;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (Ctor === undefined) return;
    if (ctx === null) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(ctx.destination);
    }
    unlocked = true;
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* audio is decorative; never break the game */
  }
}

interface ToneOpts { type: OscillatorType; from: number; to?: number; at: number; dur: number; gain: number }

function tone(c: AudioContext, out: GainNode, o: ToneOpts): void {
  const osc = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + o.at;
  osc.type = o.type;
  osc.frequency.setValueAtTime(Math.max(20, o.from), t0);
  if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(o.gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

function noise(c: AudioContext, out: GainNode, at: number, dur: number, gain: number, freq: number, type: BiquadFilterType): void {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = c.createGain();
  const t0 = c.currentTime + at;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function play(c: AudioContext, out: GainNode, name: SoundName): void {
  switch (name) {
    case "dice": // quick ticks, then a landing click
      for (let i = 0; i < 5; i += 1) tone(c, out, { type: "square", from: 1400 + i * 120, at: i * 0.05, dur: 0.03, gain: 0.25 });
      tone(c, out, { type: "square", from: 700, to: 300, at: 0.27, dur: 0.07, gain: 0.5 });
      noise(c, out, 0.27, 0.05, 0.3, 2500, "highpass");
      break;
    case "hit": // low thud
      tone(c, out, { type: "sine", from: 160, to: 55, at: 0, dur: 0.18, gain: 0.9 });
      noise(c, out, 0, 0.08, 0.35, 500, "lowpass");
      break;
    case "miss": // soft whoosh
      noise(c, out, 0, 0.22, 0.4, 900, "bandpass");
      break;
    case "refused": // heavy low thunk + short noise burst
      tone(c, out, { type: "sine", from: 110, to: 40, at: 0, dur: 0.25, gain: 1 });
      noise(c, out, 0, 0.12, 0.5, 350, "lowpass");
      break;
    case "trap": // short dissonant sting
      tone(c, out, { type: "sawtooth", from: 220, at: 0, dur: 0.32, gain: 0.3 });
      tone(c, out, { type: "sawtooth", from: 233, at: 0, dur: 0.32, gain: 0.3 });
      tone(c, out, { type: "sawtooth", from: 440, to: 110, at: 0.02, dur: 0.3, gain: 0.2 });
      break;
    case "encounter": // low hit + rising swell
      tone(c, out, { type: "sine", from: 130, to: 45, at: 0, dur: 0.2, gain: 0.9 });
      tone(c, out, { type: "triangle", from: 98, to: 196, at: 0.05, dur: 0.33, gain: 0.45 });
      break;
    case "room": // soft low swell
      tone(c, out, { type: "sine", from: 98, to: 147, at: 0, dur: 0.38, gain: 0.4 });
      tone(c, out, { type: "sine", from: 147, to: 196, at: 0.08, dur: 0.3, gain: 0.25 });
      break;
    case "seal": // sharp crack + shimmer
      noise(c, out, 0, 0.06, 0.7, 3000, "highpass");
      tone(c, out, { type: "sine", from: 1800, to: 2400, at: 0.03, dur: 0.3, gain: 0.25 });
      tone(c, out, { type: "sine", from: 2700, at: 0.08, dur: 0.25, gain: 0.15 });
      break;
    case "victory": // short rising chord
      [262, 330, 392].forEach((f, i) => tone(c, out, { type: "triangle", from: f, at: i * 0.07, dur: 0.35 - i * 0.05, gain: 0.4 }));
      break;
    case "defeat": // short falling tone
      tone(c, out, { type: "triangle", from: 220, to: 82, at: 0, dur: 0.38, gain: 0.5 });
      break;
  }
}

/** Play only if audio was unlocked by a user gesture and sound is on. */
export function playSound(name: SoundName): void {
  if (!soundOn || !unlocked || ctx === null || master === null) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    play(ctx, master, name);
  } catch {
    /* ignore */
  }
}

