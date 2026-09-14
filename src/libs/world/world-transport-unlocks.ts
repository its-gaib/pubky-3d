import { WORLD_RIDEABLES } from '@/libs/world/world-transport-motion';
import type { WorldRideableId } from '@/libs/world/world-types';

export type WorldUnlockableId = WorldRideableId | 'flamethrower';

export const WORLD_UNLOCK_COSTS = {
  skateboard: 1,
  jetpack: 1,
  kart: 1,
  bmx: 1,
  hoverboard: 1,
  dragon: 1,
  horse: 3,
  flamethrower: 2,
} as const satisfies Readonly<Record<WorldUnlockableId, number>>;

/** Exactly enough discoverable keys to unlock every ride and the flamethrower. */
export const WORLD_KEY_COUNT = Object.values(WORLD_UNLOCK_COSTS).reduce((sum, cost) => sum + cost, 0);

export function getWorldUnlockCost(id: WorldUnlockableId): number {
  return Object.hasOwn(WORLD_UNLOCK_COSTS, id) ? WORLD_UNLOCK_COSTS[id] : 0;
}

/** Unlocks and unspent keys last only for this scene. Charge after a successful mount or equip. */
export function createWorldTransportUnlocks() {
  const rideIds = new Set(WORLD_RIDEABLES.map(({ id }) => id));
  const collected = new Set<number>();
  const unlocked = new Set<WorldUnlockableId>();
  let spentKeys = 0;
  const canUnlock = (id: WorldUnlockableId) => {
    const cost = getWorldUnlockCost(id);
    return cost > 0 && (unlocked.has(id) || collected.size - spentKeys >= cost);
  };
  return {
    collect(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= WORLD_KEY_COUNT || collected.has(index)) return false;
      collected.add(index);
      return true;
    },
    canUnlock,
    unlock(id: WorldUnlockableId) {
      if (!canUnlock(id)) return false;
      if (unlocked.has(id)) return true;
      spentKeys += getWorldUnlockCost(id);
      unlocked.add(id);
      return true;
    },
    isUnlocked: (id: WorldUnlockableId) => unlocked.has(id),
    get availableKeys() {
      return collected.size - spentKeys;
    },
    get totalKeys() {
      return WORLD_KEY_COUNT;
    },
    get unlockedTransports() {
      return [...rideIds].filter((id) => unlocked.has(id)).length;
    },
  };
}
