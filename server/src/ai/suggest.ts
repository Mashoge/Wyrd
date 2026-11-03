import type { PlayerView } from "./view.js";
import type { World } from "../game/types.js";

export interface Suggestion {
  text: string;
  kind: string;
  target?: number;
}

function dedupeKeepOrder(values: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const v of values) {
    const key = v.text.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push({ text: v.text.trim(), kind: v.kind, ...(v.target === undefined ? {} : { target: v.target }) });
  }
  return out;
}

function isKeyItem(viewId: string, viewName: string, world: World | undefined): boolean {
  if (world !== undefined) {
    const item = world.items[viewId];
    if (item !== undefined) return item.kind === "key";
  }
  const hay = `${viewId} ${viewName}`.toLowerCase();
  return hay.includes("key");
}

function isDrinkable(viewId: string, viewName: string, world: World | undefined): boolean {
  if (world !== undefined) {
    const item = world.items[viewId];
    if (item !== undefined) return item.kind === "consumable";
  }
  const hay = `${viewId} ${viewName}`.toLowerCase();
  return hay.includes("draught") || hay.includes("potion") || hay.includes("vial");
}

function attackTarget(world: World | undefined, view: PlayerView): number {
  let best = 0;
  let found = false;
  if (world !== undefined) {
    for (const inv of view.player.inventory) {
      const item = world.items[inv.id];
      if (item !== undefined && item.kind === "weapon") {
        found = true;
        best = Math.max(best, item.attackBonus ?? 0);
      }
    }
  }
  return 10 - (found ? best : 0);
}

function pickUpTarget(view: PlayerView, world: World | undefined): number | undefined {
  const enemy = view.enemy;
  if (enemy === null || enemy.defeated) return undefined;
  if (world !== undefined) {
    const foe = world.enemies[enemy.id];
    if (foe !== undefined) return foe.alertness + 1;
  }
  return undefined;
}

function exitLabel(
  direction: string,
  leadsTo: string | undefined,
  omen: string | undefined,
  unlocked: boolean | undefined,
): string {
  if (leadsTo !== undefined) return `Go ${direction} to ${leadsTo}`;
  if (unlocked === true) return `Go ${direction} through the gate you unlocked`;
  if (omen !== undefined) {
    const lower = omen.trim();
    const noPeriod = lower.endsWith(".") ? lower.slice(0, -1) : lower;
    const loweredFirst = noPeriod.charAt(0).toLowerCase() + noPeriod.slice(1);
    return `Go ${direction} — ${loweredFirst}`;
  }
  return `Go ${direction}`;
}

/**
 * Suggest 2-4 short, valid, plain-English actions built only from what is
 * visible in the player view. Never mentions secrets, unvisited rooms, or
 * anything not present in `view`. Deterministic so tests can lock it.
 */
export function suggestActions(view: PlayerView, world?: World): Suggestion[] {
  if (view.player.status !== "playing") return [];

  const out: Suggestion[] = [];

  // Highest priority: unlock a visible locked door with a key we hold.
  const lockedExits = view.exits.filter((e) => e.locked);
  if (lockedExits.length > 0) {
    for (const inv of view.player.inventory) {
      if (isKeyItem(inv.id, inv.name, world)) {
        const exit = lockedExits[0];
        if (exit !== undefined) {
          out.push({ text: `Use the ${inv.name} on the ${exit.direction} door`, kind: "use" });
        }
        break;
      }
    }
  }

  // Combat: sneak unless already passed or the foe is down, otherwise attack first.
  const livingEnemy = view.enemy !== null && !view.enemy.defeated ? view.enemy : null;
  if (livingEnemy !== null && !livingEnemy.passed) {
    out.push({ text: `Sneak past the ${livingEnemy.name}`, kind: "sneak", target: 13 });
    out.push({
      text: `Attack the ${livingEnemy.name}`,
      kind: "attack",
      target: attackTarget(world, view),
    });
  } else if (livingEnemy !== null) {
    out.push({
      text: `Attack the ${livingEnemy.name}`,
      kind: "attack",
      target: attackTarget(world, view),
    });
  }

  // Pick up what is on the ground here.
  for (const item of view.items) {
    const target = pickUpTarget(view, world);
    out.push(
      target === undefined
        ? { text: `Pick up the ${item.name}`, kind: "pick up" }
        : { text: `Pick up the ${item.name}`, kind: "pick up", target },
    );
  }

  // Move through open exits first.
  for (const exit of view.exits) {
    if (!exit.locked) {
      out.push({
        text: exitLabel(exit.direction, exit.leadsTo, exit.omen, exit.unlocked),
        kind: "move",
      });
    }
  }

  // Heal when hurt and holding something drinkable.
  if (view.player.hp < view.player.maxHp) {
    for (const inv of view.player.inventory) {
      if (isDrinkable(inv.id, inv.name, world)) {
        out.push({ text: `Drink the ${inv.name}`, kind: "drink" });
        break;
      }
    }
  }

  // Safe filler drawn only from visible things.
  const firstVisible = view.items[0] ?? view.player.inventory[0];
  if (firstVisible !== undefined) {
    out.push({ text: `Examine the ${firstVisible.name}`, kind: "examine" });
  }
  out.push({ text: "Look around", kind: "look" });
  // Locked exits last: still a valid thing to try, lowest priority.
  for (const exit of view.exits) {
    if (exit.locked) {
      out.push({
        text: exitLabel(exit.direction, exit.leadsTo, exit.omen, exit.unlocked),
        kind: "move",
      });
    }
  }

  const deduped = dedupeKeepOrder(out);
  let capped = deduped.slice(0, 4);

  // Relic-first: carrying the relic, push an unlocked-exit move to the front.
  if (world !== undefined && view.player.inventory.some((i) => i.id === world.relicItemId)) {
    const relicIdx = deduped.findIndex(
      (s) =>
        s.kind === "move" &&
        (s.text.toLowerCase().includes("gate you unlocked") ||
          s.text.toLowerCase().includes("to sunken gate") ||
          view.exits.some((e) => e.unlocked === true && s.text.toLowerCase().includes(e.direction))),
    );
    if (relicIdx >= 0 && !capped.some((s) => s.text === deduped[relicIdx]?.text)) {
      const move = deduped[relicIdx];
      if (move !== undefined) capped = [move, ...capped].slice(0, 4);
    } else if (relicIdx > 0) {
      const within = capped.findIndex((s) => s.text === deduped[relicIdx]?.text);
      if (within > 0) {
        const [relicMove] = capped.splice(within, 1);
        if (relicMove !== undefined) capped.unshift(relicMove);
      }
    }
  }

  if (capped.length >= 2) return capped;
  if (!capped.some((s) => s.text === "Look around")) capped.push({ text: "Look around", kind: "look" });
  if (capped.length < 2 && !capped.some((s) => s.text === "Check your pack"))
    capped.push({ text: "Check your pack", kind: "look" });
  return capped.slice(0, 4);
}
