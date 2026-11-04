/** Muse Voice Transcribe client. Server-only: uses META_API_KEY, never exposed to web. */
export const VOICE_MODEL = "muse-voice-transcribe-1.0";
export const VOICE_URL = "https://api.meta.ai/v1/asr/transcribe";

/** "en" or Tagalog. Tagalog's ISO 639-1 code is "tl" (see report note: Meta's
 *  accepted-values list could not be verified from the public docs). */
export type VoiceLanguage = "en" | "tl";

export function parseVoiceLanguage(raw: unknown): VoiceLanguage | null {
  if (raw === undefined || raw === null || raw === "") return "en";
  if (raw === "en") return "en";
  if (raw === "tl" || raw === "tagalog" || raw === "tl-PH") return "tl";
  return null;
}

export class VoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textFrom(data: unknown, depth: number): string | null {
  if (typeof data === "string" && data.trim().length > 0) return data.trim();
  if (!isRecord(data) || depth > 3) return null;
  for (const key of ["text", "transcript", "transcription", "transcribed_text"]) {
    const v = data[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  for (const key of ["result", "data", "output"]) {
    const found = textFrom(data[key], depth + 1);
    if (found !== null) return found;
  }
  return null;
}

export interface TranscribeOptions {
  audio: Buffer;
  language: VoiceLanguage;
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
}

export async function transcribeAudio(opts: TranscribeOptions): Promise<string> {
  if (opts.apiKey === undefined || opts.apiKey.length === 0) {
    throw new VoiceError("Voice is unavailable right now.");
  }
  const form = new FormData();
  const settings = { model: VOICE_MODEL, audioEncoding: "WAV", sampleRate: 16000, language: opts.language };
  form.append("request", new Blob([JSON.stringify(settings)], { type: "application/json" }));
  form.append("audio", new Blob([new Uint8Array(opts.audio)], { type: "audio/wav" }), "audio.wav");
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(VOICE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      body: form,
    });
  } catch {
    throw new VoiceError("Could not transcribe that — try again.");
  }
  if (!res.ok) {
    // Never surface the upstream body to the player.
    throw new VoiceError("Could not transcribe that — try again.");
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new VoiceError("Could not transcribe that — try again.");
  }
  const text = textFrom(data, 0);
  if (text === null) throw new VoiceError("Didn't catch that — try again.");
  return text;
}
