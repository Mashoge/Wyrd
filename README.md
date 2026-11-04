# Wyrd — the game master that can't cheat

**Play it:** https://wyrd-web.onrender.com · **Demo video (3 min):** _VIDEO_LINK_

Wyrd is a short fantasy adventure run by an AI game master, **Meta's Muse Spark**. You can click an idea, type anything, or just say it out loud (English or Tagalog). The AI tells the story. But it can't cheat, and it can prove that:

- **Every action goes through code.** The AI only *proposes* actions as tool calls. A TypeScript rule engine is the only thing that can change the game, and it refuses anything that breaks the rules: an item that isn't there, an enemy that's "already dead", a door that's sealed.
- **The hidden secrets are sealed before you move.** Where the Lost Relic is and which door is trapped are chosen at the start and locked with a SHA-256 fingerprint shown on screen. When the game ends, the server reveals them and **your browser recomputes the fingerprint itself**. If it matches, the AI never moved the relic or the trap mid-game.

> The problem: as AI agents start acting for us (issuing refunds, booking, refereeing, running game economies), people need agents whose actions are *checked* and whose hidden decisions can be *proven* afterward. Wyrd is a small, playable demonstration of that pattern.

![Wyrd game screen](docs/screenshot.png)

---

## What makes it different

| Typical AI story game | Wyrd |
|---|---|
| The AI decides what happens and can hand you anything | The AI proposes; code decides. Cheats get a visible **REFUSED** |
| Hidden things can quietly change | Secrets are sealed on turn one and checked by your browser at the end |
| Free text is either "anything goes" or a menu | Creative ideas ("I tip the shelf onto the troll") are turned into a code-judged **attempt**: approach + intent, a d20 roll, and a fixed set of outcomes (success, partial, fail) |
| You can't see what the AI did | The **Inspector** shows every tool call the model made and the engine's verdict |

## Meta models used

| Model | Role in Wyrd |
|---|---|
| **Muse Spark 1.3** (Meta Model API) | The game master. Runs an agentic loop: reads a filtered player view, calls up to 9 game tools over multiple rounds (move, attack, sneak, throw, attempt, …), receives the engine's results, then narrates only what actually happened |
| **Muse Voice Transcribe 1.0** (Meta Model API) | Voice input. The browser records and encodes 16 kHz WAV; the server forwards it, so the API key never reaches the browser. English and Tagalog |
| **Muse Image** (Meta Model API) | Enemy portraits, generated once by scripts/gen-portraits.mjs and served as small WebP files |
| **Muse Wonder 1.0 and Muse Spark** (developer tooling) | Used as the coding model (through the Cline agent) to build much of this project during the hackathon |

## How it works

```
Player (click / type / speak)
        │
        ▼
Muse Spark ── sees only the player view (no secrets, no enemy HP, no salt)
        │  proposes tool calls
        ▼
Rule engine (TypeScript) ── validates, rolls dice, changes state, or REFUSES with a reason
        │  events + dice
        ▼
Muse Spark narrates the events (1–3 sentences) ──► Browser
```

- **Commit-reveal:** at game start the server picks the relic room and the trapped door, adds a random 16-byte salt, and publishes `SHA-256(canonical JSON {rulesVersion, relicRoomId, trapRoomId, trapDirection, salt})`. At game end it reveals the inputs; the browser hashes them with `crypto.subtle` and compares against the fingerprint it stored on turn one (a changed fingerprint on reload is flagged as **SEAL BROKEN**).
- **Player view filtering:** the model never receives the secrets, the salt, enemy HP, alertness, or which item lures which enemy.
- **Creative attempts:** the model may only classify an idea (target, approach, intent). Difficulty, the roll and the outcome are computed by the engine. Enemies react differently to approaches (the Goblin is easy to charm; the Crypt Warden hates being interrupted).
- **Rules version** (`wyrd-rules-v3`) is part of the sealed fingerprint.

## What is and isn't proven (honest scope)

- ✅ Proven: the relic location and the trapped door did not change after turn one.
- ✅ Enforced: the AI cannot change state outside validated tool calls; every refusal is shown.
- ⚠️ Not yet proven: the dice. They're rolled on the server with a cryptographic RNG and every roll is shown with its target, but a player can't independently verify them yet. Planned: client seed + per-roll HMAC (commit-reveal for dice).

## Security notes

- **Prompt injection / "cheating" in text:** players can type anything ("I find a legendary sword"). The model has no write access to state; the engine refuses impossible actions and the narration is instructed not to play along with invented items, allies or events.
- **Tool misuse:** tool arguments are whitelist-validated; extra arguments (e.g. a "difficulty") are ignored; rejected calls change nothing.
- **Secret leakage:** secrets live only on the server and are excluded from the model's view; tests check the view and the map for leaks.
- **API key:** server-side environment variable only; never sent to the browser; never committed (repo history checked).
- **Abuse limits:** 10 turns/min per game, 5 new games/min per IP, 10 voice requests/min per game, 1 MB audio cap, in-memory sessions with a 60-minute expiry.

## Run it locally

Requirements: Node 22, a Meta Model API key.

```bash
# 1. secrets (repo root, git-ignored)
echo "META_API_KEY=your_key_here" > .env

# 2. server  (http://localhost:8787)
cd server
npm ci
npm run dev

# 3. web  (http://localhost:5173, proxies /api to the server)
cd ../web
npm ci
npm run dev
```

Terminal version: `cd server && npm run play`.

Tests: `cd server && npm test` and `cd web && npx vitest run` (300+ tests across rules, secrets, AI tool handling, HTTP, voice, and UI formatting).

## Project structure

```
server/   Express API, rule engine (src/game), AI loop and tools (src/ai), HTTP (src/http)
web/      Vite + React + TypeScript UI
docs/     UI style guide and mockups
scripts/  Early API checks (tool calling, voice)
```

## Built during the hackathon

All of Wyrd's code, design and content were created during the Meta Global AI Developer Hackathon (Oct 27 – Nov 4, 2026). Solo entry, Indie Developer track, theme: Push the Frontier.

## License

MIT