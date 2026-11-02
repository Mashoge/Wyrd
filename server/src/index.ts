import { randomInt } from "node:crypto";
import { createMuseClient } from "./ai/client.js";
import { newSalt } from "./game/secrets.js";
import type { Rng } from "./game/types.js";
import { createApp } from "./http/app.js";
import { SessionStore } from "./http/sessions.js";

function cryptoRng(): Rng {
  return () => randomInt(0, 4294967296) / 4294967296;
}

function main(): void {
  const apiKey = process.env["META_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) {
    console.error(
      "META_API_KEY is missing. Set it in ../.env (repo root) or as an environment variable, then run: npm run dev",
    );
    process.exit(1);
  }
  const portRaw = process.env["PORT"] ?? "8787";
  const port = Number(portRaw);
  const listenPort = Number.isInteger(port) && port > 0 ? port : 8787;

  const client = createMuseClient({ apiKey, model: "muse-spark-1.3" });
  const store = new SessionStore();
  const app = createApp({
    store,
    client,
    newRng: cryptoRng,
    newSalt,
    now: () => Date.now(),
  });
  app.listen(listenPort, () => {
    console.log(`Wyrd server listening on port ${listenPort}`);
  });
}

main();
