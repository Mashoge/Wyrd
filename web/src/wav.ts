/** Browser WAV encoding: downsample Float32 samples to 16 kHz mono PCM16. */

export const TARGET_SAMPLE_RATE = 16000;

export function downsample(samples: Float32Array, inputRate: number, outputRate: number = TARGET_SAMPLE_RATE): Float32Array {
  if (!Number.isFinite(inputRate) || inputRate <= 0) throw new Error("Invalid sample rate.");
  if (inputRate === outputRate) return new Float32Array(samples);
  const ratio = inputRate / outputRate;
  const outLength = Math.max(0, Math.floor(samples.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += samples[j] ?? 0;
      count++;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/** Encode mono Float32 samples (-1..1, clamped) as a 44-byte-header WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number = TARGET_SAMPLE_RATE): Uint8Array {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

export function encodeWav16k(samples: Float32Array, inputRate: number): Uint8Array {
  return encodeWav(downsample(samples, inputRate, TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
}
