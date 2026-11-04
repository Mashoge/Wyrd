import type { PlayerView } from "./view.js";
import type { World } from "../game/types.js";

export interface Suggestion {
  text: string;
  kind: string;
  target?: number;
  isNew?: boolean;
  usesConsumable?: boolean;
}

function dedupeKeepOrder(values: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const v of values) {
    const key = v.text.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push({
      text: v.text.trim(),
      kind: v.kind,
      ...(v.target === undefined ? {} : { target: v.target }),
      ...(v.isNew === true ? { isNew: true as const } : {}),
      ...(v.usesConsumable === true ? { usesConsumable: true as const } : {}),
    });
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
  // Mirror rules.bestWeapon scoring: best attack+damage score wins, then the
  // target comes from that weapon's attackBonus (which may be negative).
  let bestScore = -Infinity;
  let bestAttackBonus = 0;
  if (world !== undefined) {
    for (const inv of view.player.inventory) {
      const item = world.items[inv.id];
      if (item !== undefined && item.kind === "weapon") {
        const score = (item.attackBonus ?? 0) + (item.damageBonus ?? 0);
        if (score > bestScore) {
          bestScore = score;
          bestAttackBonus = item.attackBonus ?? 0;
        }
      }
    }
  }
  return 10 - bestAttackBonus;
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
 *
 * `lastRoomId` (from state, never shown to the AI) lets the server label the
 * exit that leads back. `world` is only used for safe labels/targets.
 */
export function suggestActions(view: PlayerView, world?: World, lastRoomId?: string | null): Suggestion[] {
  if (view.player.status !== "playing") return [];

  const out: Suggestion[] = [];

  // Direction back to the room we came from, resolved from the real layout
  // (view alone has no room ids). Empty when unknown or not visible.
  let backDirection: string | null = null;
  if (world !== undefined && typeof lastRoomId === "string" && lastRoomId.length > 0) {
    const current = world.rooms[view.room.id];
    if (current !== undefined) {
      const back = current.exits.find((e) => e.to === lastRoomId);
      if (back !== undefined && view.exits.some((e) => e.direction === back.direction)) {
        backDirection = back.direction;
      }
    }
  }

  const moveText = (
    exit: { direction: string; leadsTo?: string; omen?: string; unlocked?: boolean },
  ): { text: string; isNew: boolean } => {
    const isNew = exit.leadsTo === undefined;
    if (backDirection !== null && exit.direction === backDirection && exit.leadsTo !== undefined) {
      return { text: `Go back ${exit.direction} to ${exit.leadsTo}`, isNew: false };
    }
    return { text: exitLabel(exit.direction, exit.leadsTo, exit.omen, exit.unlocked), isNew };
  };

  const pushMove = (exit: { direction: string; leadsTo?: string; omen?: string; unlocked?: boolean }): void => {
    const { text, isNew } = moveText(exit);
    out.push(isNew ? { text, kind: "move", isNew: true } : { text, kind: "move" });
  };

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
    out.push({
      text: `Sneak past the ${livingEnemy.name}`,
      kind: "sneak",
      target: livingEnemy.distracted ? 9 : 13,
    });
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

  // Combo: sneak AND grab in one breath when both are live. Placed before
  // the single pickups so it survives the cap of 4.
  const awakeEnemy = livingEnemy !== null && !livingEnemy.passed ? livingEnemy : null;
  if (awakeEnemy !== null && view.items.length > 0) {
    const first = view.items[0];
    if (first !== undefined) {
      let combo = `Sneak past the ${awakeEnemy.name} and grab the ${first.name}`;
      if (combo.length > 60) {
        const room = 60 - `Sneak past the  and grab the `.length;
        const half = Math.max(1, Math.floor(room / 2));
        const enemyBit = awakeEnemy.name.slice(0, half).trim();
        const itemBit = first.name.slice(0, Math.max(1, room - enemyBit.length)).trim();
        combo = `Sneak past the ${enemyBit} and grab the ${itemBit}`.slice(0, 60);
      }
      out.push({ text: combo, kind: "combo" });
    }
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

  // Moves: never offer a move the rule engine would reject. Locked exits are
  // always rejected (the "Use the key" chip covers that door). With a living,
  // unpassed enemy, only the retreat back toward lastRoomId is legal, and
  // only when that enemy does not block retreat (checked server-side from
  // the world; the flag itself is never rendered).
  const enemyBlocksMoves = livingEnemy !== null && !livingEnemy.passed;
  const foeBlocksRetreat =
    enemyBlocksMoves && world !== undefined && livingEnemy !== null
      ? (world.enemies[livingEnemy.id]?.blocksRetreat ?? false)
      : false;
  for (const exit of view.exits) {
    if (exit.locked) continue;
    if (enemyBlocksMoves) {
      if (foeBlocksRetreat) continue;
      if (backDirection === null || exit.direction !== backDirection) continue;
    }
    pushMove(exit);
  }

  // Heal: suggest drinking only when the draught would not be mostly wasted
  // (hp at most maxHp - heal) or the player is at/below half health.
  for (const inv of view.player.inventory) {
    if (!isDrinkable(inv.id, inv.name, world)) continue;
    const heal = world?.items[inv.id]?.heal;
    const hp = view.player.hp;
    const worthIt =
      heal !== undefined
        ? hp <= view.player.maxHp - heal || hp * 2 <= view.player.maxHp
        : hp < view.player.maxHp;
    if (worthIt) {
      out.push({ text: `Drink the ${inv.name}`, kind: "drink", usesConsumable: true });
    }
    break;
  }

  // Safe filler drawn only from visible things.
  const firstVisible = view.items[0] ?? view.player.inventory[0];
  if (firstVisible !== undefined) {
    out.push({ text: `Examine the ${firstVisible.name}`, kind: "examine" });
  }
  out.push({ text: "Look around", kind: "look" });

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
