import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { transcribeVoice, type VoiceLang } from "../api";
import { encodeWav16k } from "../wav";

const LANG_KEY = "wyrd.voiceLang";
const MAX_RECORD_MS = 15000;

export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function loadVoiceLang(): VoiceLang {
  try {
    return window.localStorage.getItem(LANG_KEY) === "tl" ? "tl" : "en";
  } catch {
    return "en";
  }
}

export function saveVoiceLang(lang: VoiceLang): void {
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* language choice still works for this visit */
  }
}

type Phase = "idle" | "recording" | "listening";

interface Recorder {
  stream: MediaStream;
  context: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  chunks: Float32Array[];
}

interface Props {
  disabled: boolean;
  gameId: string | null;
  onTranscript: (text: string) => void;
}

export function VoiceInput({ disabled, gameId, onTranscript }: Props): JSX.Element {
  const [lang, setLang] = useState<VoiceLang>(() => loadVoiceLang());
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);

  const clearTimers = (): void => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (autoStopRef.current !== null) window.clearTimeout(autoStopRef.current);
    timerRef.current = null;
    autoStopRef.current = null;
  };

  const teardown = (): Recorder | null => {
    clearTimers();
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec === null) return null;
    rec.processor.onaudioprocess = null;
    try { rec.processor.disconnect(); } catch { /* already closed */ }
    try { rec.source.disconnect(); } catch { /* already closed */ }
    for (const track of rec.stream.getTracks()) track.stop();
    void rec.context.close().catch(() => undefined);
    return rec;
  };

  const stopAndTranscribe = async (): Promise<void> => {
    const rec = teardown();
    const sampleRate = rec?.context.sampleRate ?? 16000;
    setElapsed(0);
    if (rec === null || gameId === null) { setPhase("idle"); return; }
    const total = rec.chunks.reduce((n, c) => n + c.length, 0);
    if (total === 0) { setPhase("idle"); return; }
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of rec.chunks) { merged.set(chunk, offset); offset += chunk.length; }
    setPhase("listening");
    try {
      const wav = encodeWav16k(merged, sampleRate);
      const text = await transcribeVoice(gameId, wav, lang);
      onTranscript(text);
      setError(null);
    } catch (err) {
      setError(err instanceof Error && err.message.length > 0 ? err.message : "Could not transcribe that — try again.");
    } finally {
      setPhase("idle");
    }
  };


  const start = async (): Promise<void> => {
    setError(null);
    const md = navigator.mediaDevices;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (md === undefined || typeof md.getUserMedia !== "function" || Ctor === undefined) {
      setUnavailable(true);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await md.getUserMedia({ audio: true });
    } catch {
      setUnavailable(true);
      return;
    }
    const context = new Ctor();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    processor.onaudioprocess = (e: AudioProcessingEvent): void => {
      chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(context.destination);
    recorderRef.current = { stream, context, processor, source, chunks };
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase("recording");
    timerRef.current = window.setInterval(() => {
      setElapsed((Date.now() - startedAtRef.current) / 1000);
    }, 250);
    autoStopRef.current = window.setTimeout(() => { void stopAndTranscribe(); }, MAX_RECORD_MS);
  };

  const onMicClick = (): void => {
    if (disabled || phase === "listening") return;
    if (phase === "recording") { void stopAndTranscribe(); return; }
    void start();
  };

  useEffect(() => {
    return () => { teardown(); };
    // teardown is stable via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (unavailable) {
    return (
      <span role="status" style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#B9AEC0", alignSelf: "center" }}>
        Mic not available — you can type instead.
      </span>
    );
  }

  const recording = phase === "recording";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        aria-pressed={recording}
        aria-label={recording ? "Stop recording" : phase === "listening" ? "Transcribing" : "Record your action"}
        title={recording ? "Stop recording" : "Record your action"}
        disabled={disabled || phase === "listening"}
        onClick={onMicClick}
        className={recording ? "wyrd-mic wyrd-mic--recording" : "wyrd-mic"}
        style={{ minWidth: 44, width: 44, height: 44 }}
      >
        {recording ? formatElapsed(elapsed) : phase === "listening" ? "…" : "🎙"}
      </button>
      <span style={{ display: "inline-flex" }} role="group" aria-label="Voice language">
        {(["en", "tl"] as VoiceLang[]).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            disabled={disabled || phase !== "idle"}
            onClick={() => { setLang(l); saveVoiceLang(l); }}
            style={{
              minWidth: 44, minHeight: 44, padding: "0 6px", cursor: "pointer",
              fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600,
              color: lang === l ? "#120E17" : "#B9AEC0",
              background: lang === l ? "#B44DFF" : "#2A2133",
              border: "1px solid #5A4A68",
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </span>
      {recording && <span role="status" style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#FF6B5B" }}>Recording…</span>}
      {phase === "listening" && <span role="status" style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#B9AEC0" }}>Listening…</span>}
      {error !== null && phase === "idle" && <span role="alert" style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#FF6B5B" }}>{error}</span>}
    </span>
  );
}

