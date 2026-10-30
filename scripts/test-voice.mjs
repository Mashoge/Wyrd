// S3: does Muse Voice Transcribe turn a WAV file into text?
// Run with:  node --env-file=.env scripts/test-voice.mjs
import { openAsBlob } from "node:fs";

const KEY = process.env.META_API_KEY;
const form = new FormData();

const settings = { model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", sampleRate: 16000, language: "en" };
form.append("request", new Blob([JSON.stringify(settings)], { type: "application/json" }));
form.append("audio", await openAsBlob("scripts/test.wav", { type: "audio/wav" }), "test.wav");

const res = await fetch("https://api.meta.ai/v1/asr/transcribe", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}` },
  body: form,
});

console.log("HTTP", res.status);
console.log(await res.text());