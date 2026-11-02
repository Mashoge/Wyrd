import type { PlayerView } from "./view.js";
import type { World } from "../game/types.js";

function dedupeKeepOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
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

/**
 * Suggest 2-4 short, valid, plain-English actions built only from what is
 * visible in the player view. Never mentions secrets, unvisited rooms, or
 * anything not present in `view`. Deterministic so tests can lock it.
 */
export function suggestActions(view: PlayerView, world?: World): string[] {
  if (view.player.status !== "playing") return [];

  const out: string[] = [];

  // Highest priority: unlock a visible locked door with a key we hold.
  const lockedExits = view.exits.filter((e) => e.locked);
  if (lockedExits.length > 0) {
    for (const inv of view.player.inventory) {
      if (isKeyItem(inv.id, inv.name, world)) {
        const exit = lockedExits[0];
        if (exit !== undefined) {
          out.push(`Use the ${inv.name} on the ${exit.direction} door`);
        }
        break;
      }
    }
  }

  // Combat pair: meaningfully different risks against a living enemy.
  if (view.enemy !== null && !view.enemy.defeated) {
    out.push(`Attack the ${view.enemy.name}`);
    out.push(`Sneak past the ${view.enemy.name}`);
  }

  // Pick up what is on the ground here.
  for (const item of view.items) {
    out.push(`Pick up the ${item.name}`);
  }

  // Move through open exits first.
  for (const exit of view.exits) {
    if (!exit.locked) out.push(`Go ${exit.direction}`);
  }

  // Heal when hurt and holding something drinkable.
  if (view.player.hp < view.player.maxHp) {
    for (const inv of view.player.inventory) {
      if (isDrinkable(inv.id, inv.name, world)) {
        out.push(`Drink the ${inv.name}`);
        break;
      }
    }
  }

  // Safe filler drawn only from visible things.
  const firstVisible = view.items[0] ?? view.player.inventory[0];
  if (firstVisible !== undefined) {
    out.push(`Examine the ${firstVisible.name}`);
  }
  out.push("Look around");
  // Locked exits last: still a valid thing to try, lowest priority.
  for (const exit of view.exits) {
    if (exit.locked) out.push(`Go ${exit.direction}`);
  }

  const deduped = dedupeKeepOrder(out);
  const capped = deduped.slice(0, 4);
  if (capped.length >= 2) return capped;
  if (!capped.includes("Look around")) capped.push("Look around");
  if (capped.length < 2 && !capped.includes("Check your pack")) capped.push("Check your pack");
  return capped.slice(0, 4);
}
