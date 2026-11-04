// Generate the enemy portraits ONCE with Muse Image and commit the PNGs.
// Run from the repo root:  node --env-file=.env scripts/gen-portraits.mjs
// There is NO runtime image generation: the app just serves these files
// from web/public/portraits/. Re-running skips files that already exist
// (delete one first if you want to regenerate it).
// Note: the generated PNGs were resized to 512px WebP for the web (the
// ~100 KB .webp files in web/public/portraits/ are what EnemyCard serves);
// the full-size PNGs are not committed.
//
// API (Meta Model API docs, API reference -> Images -> Generate an image):
//   POST https://api.meta.ai/v1/images/generations   (Bearer META_API_KEY)
//   model "muse-image-1.0" (confirmed via GET /v1/models)
//   size "1024x1024" sets the square aspect ratio, output_format "png",
//   response_format "b64_json" (the default) -> data[0].b64_json.

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_URL = "https://api.meta.ai/v1/images/generations";
const MODEL = "muse-image-1.0";
const KEY = process.env.META_API_KEY;
if (!KEY) {
  console.error("META_API_KEY is missing. Put it in .env (repo root) and run: node --env-file=.env scripts/gen-portraits.mjs");
  process.exit(1);
}

const STYLE =
  "Dark fantasy painted portrait, square composition, dark violet background in deep #120E17 tones, " +
  "dramatic rim light, original character design, no text, no logos.";

// File names must match the enemy ids in server/src/game/worlds/sunkenCrypt.ts
// (EnemyCard loads /portraits/<enemy id>.png).
const PORTRAITS = [
  {
    file: "goblin.png",
    prompt: `${STYLE} Subject: a scrawny cave goblin hunched over a pile of coins, counting them.`,
  },
  {
    file: "bone_troll.png",
    // NOTE: the literal subject line ("a huge troll made of fused bones
    // staring at its reflection in a puddle") was rejected twice by the API
    // with content_policy_violation, so it is phrased slightly softer here;
    // same subject: a huge bone-built troll gazing at its puddle reflection.
    prompt: `${STYLE} Subject: a huge ancient troll built from giant weathered bones, gazing down at its reflection in a still puddle.`,
  },
  {
    file: "crypt_warden.png",
    prompt: `${STYLE} Subject: a tall armored crypt guardian reciting names from a stone tablet.`,
  },
];

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "public", "portraits");
await mkdir(outDir, { recursive: true });

for (const { file, prompt } of PORTRAITS) {
  const outPath = join(outDir, file);
  // Skip portraits that already exist so a re-run (e.g. after a failed
  // prompt) doesn't regenerate — and re-bill — the ones that succeeded.
  const exists = await access(outPath).then(
    () => true,
    () => false,
  );
  if (exists) {
    console.log(`Skipping ${file} (already exists; delete it to regenerate)`);
    continue;
  }
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      n: 1,
      size: "1024x1024",
      output_format: "png",
      response_format: "b64_json",
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body === null) {
    console.error(`Failed to generate ${file}: HTTP ${res.status}`, body === null ? "" : JSON.stringify(body).slice(0, 500));
    process.exit(1);
  }
  const image = body.data?.[0];
  let bytes;
  if (typeof image?.b64_json === "string" && image.b64_json.length > 0) {
    bytes = Buffer.from(image.b64_json, "base64");
  } else if (typeof image?.url === "string" && image.url.length > 0) {
    const imgRes = await fetch(image.url);
    if (!imgRes.ok) {
      console.error(`Failed to download ${file}: HTTP ${imgRes.status}`);
      process.exit(1);
    }
    bytes = Buffer.from(await imgRes.arrayBuffer());
  } else {
    console.error(`No image data in response for ${file}:`, JSON.stringify(body).slice(0, 500));
    process.exit(1);
  }
  await writeFile(outPath, bytes);
  console.log(`Wrote ${outPath} (${bytes.length} bytes)`);
}

console.log("Done. Commit the PNGs in web/public/portraits/ — they are served as static files.");
