import { describe, expect, it } from "vitest";
import { downsample, encodeWav, encodeWav16k, TARGET_SAMPLE_RATE } from "./wav";

function ascii(bytes: Uint8Array, start: number, len: number): string {
  return String.fromCharCode(...bytes.slice(start, start + len));
}
function u32(bytes: Uint8Array, off: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(off, true);
}
function u16(bytes: Uint8Array, off: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(off, true);
}

describe("encodeWav header", () => {
  it("writes a valid 44-byte PCM16 mono header", () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 16000);
    expect(wav.length).toBe(44 + 10);
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(u32(wav, 4)).toBe(36 + 10);
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 12, 4)).toBe("fmt ");
    expect(u32(wav, 16)).toBe(16);
    expect(u16(wav, 20)).toBe(1);
    expect(u16(wav, 22)).toBe(1);
    expect(u32(wav, 24)).toBe(16000);
    expect(u32(wav, 28)).toBe(32000);
    expect(u16(wav, 32)).toBe(2);
    expect(u16(wav, 34)).toBe(16);
    expect(ascii(wav, 36, 4)).toBe("data");
    expect(u32(wav, 40)).toBe(10);
  });

  it("clamps and encodes PCM16 samples little-endian", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2]), 16000);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
    expect(view.getInt16(50, true)).toBe(32767);
    expect(view.getInt16(52, true)).toBe(-32768);
  });

  it("handles empty input", () => {
    const wav = encodeWav(new Float32Array(0));
    expect(wav.length).toBe(44);
    expect(u32(wav, 40)).toBe(0);
  });
});

describe("downsample", () => {
  it("is identity at the target rate (copies)", () => {
    const input = new Float32Array([0.1, -0.2, 0.3]);
    const out = downsample(input, TARGET_SAMPLE_RATE);
    expect([...out]).toEqual([...input]);
    expect(out).not.toBe(input);
  });

  it("48kHz -> 16kHz averages each block of 3", () => {
    const input = new Float32Array([0, 0.3, 0.6, 1, 1, 1, -0.3, 0, 0.3]);
    const out = downsample(input, 48000);
    expect(out.length).toBe(3);
    expect(out[0]).toBeCloseTo(0.3);
    expect(out[1]).toBeCloseTo(1);
    expect(out[2]).toBeCloseTo(0);
  });

  it("44.1kHz length scales by ratio", () => {
    const out = downsample(new Float32Array(44100).fill(0.5), 44100);
    expect(out.length).toBe(16000);
    expect(out[0]).toBeCloseTo(0.5);
  });

  it("encodeWav16k stamps 16000 in the header", () => {
    const wav = encodeWav16k(new Float32Array(4800).fill(0), 48000);
    expect(u32(wav, 24)).toBe(16000);
    expect(wav.length).toBe(44 + 1600 * 2);
  });

  it("rejects invalid rates", () => {
    expect(() => downsample(new Float32Array(1), 0)).toThrow();
    expect(() => downsample(new Float32Array(1), Number.NaN)).toThrow();
  });
});
