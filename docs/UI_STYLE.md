# Wyrd UI style guide — "Kinetic Fate" (V3)

The look: crisp, kinetic, stylish game UI (angled panels, big cut-ins, snappy motion)
carrying a quiet "fate" flavor (carved titles, a serif storytelling voice, runes, seals, threads).
Cohesion first: when a fate detail fights the crisp structure, the structure wins.

Living document: we refine it as we build. Concept mockups: V3 "Kinetic fate" on the Wyrd UI concept canvas.

---

## 1. Hard rules

1. **Crisp edges only.** Angled, straight-edged shapes (CSS `clip-path` polygons). No torn paper, brush strokes, wax drips, or other irregular organic edges.
2. **Dark panels only.** No light parchment surfaces. Every surface comes from the palette below.
3. **Never skew text.** Shapes behind text can angle; the text itself stays level and sharp.
4. **Calm while reading, loud at key moments.** Narration sits in a quiet panel. Style explodes only for the big beats (see section 5).
5. **One accent.** Violet marks what matters (main action, the dice result, the logo). Coral and mint are meaning colors, used only for their meaning.
6. **Honest proof labels.** Show "Fate sealed" (with "Relic & trap locked" under it) while secrets are hidden and "Seal matches" (with "Fate verified" as a small caption) only after the proof is actually checked in the player's browser. Never show a green or mint "verified" state early, and never claim the whole game or the dice were fair — the seal covers only where the relic and the trap were hidden.
7. **Original assets only.** Inspired by the games below, never copied: no logos, menus, characters, fonts, color schemes or screens from them. No Persona-style red-and-black.
8. **Accessible.** Text contrast 4.5:1 or better, real `<button>`/`<input>`/`<label>` elements, touch targets 44px+, and every animation respects `prefers-reduced-motion`. Full-screen flashes are rare and soft.

## 2. Color (60 / 30 / 10)

| Role | Hex | Use |
|---|---|---|
| Base | `#120E17` | Page background (60%) |
| Panel | `#1A1421` | Cards, story panel, sidebars |
| Panel raised | `#2A2133` | Secondary buttons, player-action chips |
| Text | `#F4EFF6` | Main text (30%) |
| Muted text | `#B9AEC0` | Labels, captions, secondary info |
| Accent: witchfire violet | `#B44DFF` | Logo, main button, dice result, thread of fate (10%) |
| Accent tint | `#3A2848` / `#E8CCFF` | Tag fills / tag text on violet |
| Danger: coral | `#FF6B5B` | Damage, hearts, REJECTED / REFUSED stamps, traps |
| Verified: mint | `#4DE8B5` | Hits, success, checkmarks, SEAL MATCHES |
| Line | `#5A4A68` | Outlines, empty hearts, dividers |

## 3. Typography

| Use | Font (Google Fonts) |
|---|---|
| Titles, names, stamps, big numbers | **Cinzel** 600/800, uppercase, letter-spaced |
| Story narration, player lines | **Literata** (a serif built for on-screen reading; player lines in italic, prefixed with "— ") |
| UI labels, stats, buttons, numbers in sentences | **Inter** 400/500/600 |
| Runes (decoration only) | **Noto Sans Runic** |
| Code view (Inspector only) | System monospace |

Narration 18–21px, line-height ~1.65, max ~66 characters per line. Mark the latest narration with a thin slanted violet bar on its left; older narration uses muted text.

## 4. Shapes and components

- **Panels:** dark, straight edges; signature corner cut `polygon(0 0,100% 0,100% 88%,95% 100%,0 100%)`.
- **Slanted blocks** (logo, dice number, buttons): `polygon(4–6% 0,100% 0,94–96% 100%,0 100%)`.
- **Stamps:** outlined, uppercase Cinzel, rotated -4° to -12° (DEFEATED, REFUSED).
- **Hearts** for HP (filled coral / outlined line color).
- **Turns left** for the turn limit: a violet line that shortens, frayed at the end.
- **Geometric seal** with a rune for "Fate sealed"; it cracks for "Seal matches" (caption "Fate verified").
- **Rune border** as a faint divider under the header.
- **Action log:** the player-facing action log in plain words ("Claimed a Legendary Sword → REFUSED"). The raw tool calls live in the Inspector for judges.
- **Suggestions** are titled "What you can do".
- **Goal panel** is titled "Goal".

## 5. Motion and key moments

- Library: Framer Motion. Transitions 150–250 ms, snappy overshoot easing: `cubic-bezier(0.175, 0.885, 0.32, 1.275)`.
- Hover on options: a solid block slides in behind the text and the text snaps to contrast.
- Letter-by-letter animation only for titles and cut-ins, never for narration. A click skips any animation.
- Key moments (the only "loud" moments):
  - **Encounter:** the enemy card slides in angled; name in big Cinzel.
  - **Dice roll:** a quick spin, then the number lands big in a violet block with "NEEDED 10+ → HIT".
  - **Cheat rejected:** a coral REFUSED stamp lands across the attempted claim.
  - **Trap / big hit:** a short coral flash and a small screen shake.
  - **Verify:** the seal cracks, then "SEAL MATCHES" in mint (caption "Fate verified"), with proof details behind a link.

## 6. Layout

- Left: story feed (player lines, dice result, narration), suggestions, input with mic and ACT button.
- Right sidebar: enemy card (with Muse Image portrait), You (hearts, turns left, inventory), Action log, Goal.
- Header: WYRD logo block, world title and goal, seal with fingerprint, Inspector toggle.
- Works at phone width: the sidebar stacks under the story; buttons wrap.

## 7. Inspiration references

Inspired by the principles of these games' interfaces, not their assets:

| Game | What we take |
|---|---|
| Persona 5 (Atlus) | Kinetic, angled menus; bold cut-ins for big moments; stylish typography as art |
| Metaphor: ReFantazio (Studio Zero / Atlus) | Kinetic UI applied to a fantasy world; fate and storybook flavor without losing energy |
| Clair Obscur: Expedition 33 | Artistic, striking interface with elegant type |
| Yakuza: Like a Dragon | Commands that feel part of the world (our enemy card with actions beside it) |
| Danganronpa | High-contrast pop presentation and dramatic reveal moments |
| NieR: Automata | Minimal HUD during play; style reserved for transitions and menus |
| Soul Hackers 2, Tokyo Mirage Sessions #FE | Sleek stylized menus with a restrained palette |

Design principle from the research: "Asymmetry with restraint" — angled, energetic shapes, strict colors, readable text.

Concept history: V1 "Kinetic modern" (cohesive but off-theme), V2 "Kinetic ancient" (on-theme but rough edges broke cohesion), V3 "Kinetic fate" (chosen).
Reference mockups (static, visual target only): docs/mockups/game-screen.html and docs/mockups/key-moments.html