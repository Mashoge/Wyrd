import type { GameState, World } from "./types.js";

/**
 * One plain-English tip for a lost game, chosen by code — never by the AI.
 *
 * Picks from the cause of loss (died with 0 hp vs timed out) and what the
 * player actually met (which enemies were visited, whether a trap fired,
 * what is in the inventory). Never reveals secrets: the relic room and trap
 * stay hidden; the reveal endpoint owns those. Returns null unless lost.
 */
export function lossTip(state: GameState, world: World): string | null {
  if (state.status !== "lost") return null;
  const died = state.hp <= 0;
  const visited = new Set(state.visitedRoomIds);

  const metEnemy = (enemyId: string): boolean => {
    for (const roomId of visited) {
      const room = world.rooms[roomId];
      if (room?.enemyId === enemyId) return true;
    }
    return false;
  };
  const metBoneTroll = metEnemy("bone_troll");
  const metWarden = metEnemy("crypt_warden");
  const metGoblin = metEnemy("goblin");
  const trapSprung = state.flags["trap_sprung"] === true;

  const heldHealing = state.inventory.some((id) => world.items[id]?.kind === "consumable");
  const heldWeapon = state.inventory.some((id) => world.items[id]?.kind === "weapon");

  if (died) {
    if (metBoneTroll) {
      return "The Bone Troll barely notices its surroundings. Sneaking past is easier than fighting it.";
    }
    if (trapSprung) {
      return "A sprung trap fires only once — but once is enough. Spend a turn to look before pushing through new doors.";
    }
    if (metWarden) {
      return "The Crypt Warden seals the doors behind you. Sneak past it before you try to leave.";
    }
    if (metGoblin && !heldWeapon) {
      return "Grab a weapon before you face the Goblin — the entrance steps hold a dagger.";
    }
    if (metGoblin) {
      return "The Goblin guards the only key. Sneaking past it keeps your health for what comes later.";
    }
    if (heldHealing) {
      return "You carried healing but never drank it. Drink the draught before your health runs out.";
    }
    return "Fighting everything drains your health fast. Sneaking past enemies keeps you alive longer.";
  }

  // Timed out: hp left but the turn budget ran out.
  if (state.inventory.length === 0) {
    return "Pick up several things in one go: 'grab the key and the coin'.";
  }
  if (!heldWeapon) {
    return "You fight bare-handed without a weapon. Pick up the dagger at the entrance first.";
  }
  if (!state.inventory.includes(world.relicItemId)) {
    return "Search every side room before the gate — the relic hides off the main path.";
  }
  return "You held the relic but ran out of time. Head straight for the gate once you have it.";
}
