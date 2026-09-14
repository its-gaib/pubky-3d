import { describe, expect, it } from 'vitest';
import { WORLD_RIDEABLES } from '@/libs/world/world-transport-motion';
import {
  createWorldTransportUnlocks,
  getWorldUnlockCost,
  WORLD_KEY_COUNT,
  WORLD_UNLOCK_COSTS,
  type WorldUnlockableId,
} from '@/libs/world/world-transport-unlocks';
import { asInvalid } from '@/test-utils/type-assertions';

describe('transport and tool key inventory', () => {
  it('provides eleven keys for six regular rides, the three-key horse and two-key flamethrower', () => {
    const inventory = createWorldTransportUnlocks();
    expect(WORLD_KEY_COUNT).toBe(11);
    expect(inventory.totalKeys).toBe(WORLD_KEY_COUNT);
    expect(WORLD_RIDEABLES.map(({ id }) => id)).toEqual(expect.arrayContaining(['horse', 'dragon']));
    expect(inventory.availableKeys).toBe(0);
    expect(inventory.unlockedTransports).toBe(0);
    expect(WORLD_UNLOCK_COSTS.flamethrower).toBe(2);
    for (const { id } of WORLD_RIDEABLES) {
      expect(getWorldUnlockCost(id)).toBe(id === 'horse' ? 3 : 1);
      expect(inventory.isUnlocked(id)).toBe(false);
      expect(inventory.canUnlock(id)).toBe(false);
      expect(inventory.unlock(id)).toBe(false);
    }
    expect(inventory.unlock('flamethrower')).toBe(false);
  });

  it('counts each key once and rejects indices that have no collectible', () => {
    const inventory = createWorldTransportUnlocks();
    expect(inventory.collect(0)).toBe(true);
    expect(inventory.collect(0)).toBe(false);
    for (const index of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, inventory.totalKeys])
      expect(inventory.collect(index)).toBe(false);
    expect(inventory.availableKeys).toBe(1);
  });

  it('spends each price only once and allows unlimited free subsequent mounts or equips', () => {
    const inventory = createWorldTransportUnlocks();
    for (let index = 0; index < 6; index++) inventory.collect(index);
    expect(inventory.unlock('horse')).toBe(true);
    expect(inventory.availableKeys).toBe(3);
    expect(inventory.unlock('flamethrower')).toBe(true);
    expect(inventory.availableKeys).toBe(1);
    expect(inventory.unlock('dragon')).toBe(true);
    expect(inventory.availableKeys).toBe(0);
    expect(inventory.isUnlocked('horse')).toBe(true);
    for (let use = 0; use < 10; use++) {
      for (const id of ['horse', 'flamethrower', 'dragon'] as const) {
        expect(inventory.canUnlock(id)).toBe(true);
        expect(inventory.unlock(id)).toBe(true);
      }
    }
    expect(inventory.availableKeys).toBe(0);
    expect(inventory.unlockedTransports).toBe(2);
    expect(inventory.canUnlock('kart')).toBe(false);
  });

  it('requires the full price without consuming partial balances or charging for availability checks', () => {
    const inventory = createWorldTransportUnlocks();
    inventory.collect(0);
    expect(inventory.canUnlock('horse')).toBe(false);
    expect(inventory.unlock('horse')).toBe(false);
    expect(inventory.unlock('flamethrower')).toBe(false);
    expect(inventory.availableKeys).toBe(1);
    inventory.collect(1);
    expect(inventory.canUnlock('flamethrower')).toBe(true);
    expect(inventory.canUnlock('horse')).toBe(false);
    expect(inventory.availableKeys).toBe(2);
    inventory.collect(2);
    expect(inventory.canUnlock('horse')).toBe(true);
    expect(inventory.availableKeys).toBe(3);
    expect(inventory.unlock('horse')).toBe(true);
    expect(inventory.availableKeys).toBe(0);
    expect(inventory.unlockedTransports).toBe(1);
  });

  it.each([false, true])('unlocks everything using exactly all eleven keys (reverse order=%s)', (reverse) => {
    const inventory = createWorldTransportUnlocks();
    for (let index = 0; index < inventory.totalKeys; index++) expect(inventory.collect(index)).toBe(true);
    expect(inventory.availableKeys).toBe(inventory.totalKeys);
    const ids = Object.keys(WORLD_UNLOCK_COSTS) as WorldUnlockableId[];
    for (const id of reverse ? ids.reverse() : ids) expect(inventory.unlock(id)).toBe(true);
    expect(inventory.availableKeys).toBe(0);
    expect(ids.every((id) => inventory.isUnlocked(id))).toBe(true);
    expect(inventory.unlockedTransports).toBe(7);
    for (let index = 0; index < inventory.totalKeys; index++) expect(inventory.collect(index)).toBe(false);
    expect(inventory.availableKeys).toBe(0);
  });

  it('rejects unknown IDs, including inherited object properties, without spending keys', () => {
    const inventory = createWorldTransportUnlocks();
    for (let index = 0; index < inventory.totalKeys; index++) inventory.collect(index);
    for (const id of asInvalid<WorldUnlockableId[]>(['unknown', 'toString', '__proto__'])) {
      expect(getWorldUnlockCost(id)).toBe(0);
      expect(inventory.canUnlock(id)).toBe(false);
      expect(inventory.unlock(id)).toBe(false);
      expect(inventory.isUnlocked(id)).toBe(false);
    }
    expect(inventory.availableKeys).toBe(inventory.totalKeys);
  });

  it('resets keys, rides and the tool together when a new scene is created', () => {
    const previous = createWorldTransportUnlocks();
    for (let index = 0; index < 5; index++) previous.collect(index);
    previous.unlock('horse');
    previous.unlock('flamethrower');
    const respawn = createWorldTransportUnlocks();
    expect(respawn.isUnlocked('horse')).toBe(false);
    expect(respawn.isUnlocked('flamethrower')).toBe(false);
    expect(respawn.availableKeys).toBe(0);
    expect(respawn.unlockedTransports).toBe(0);
    for (let index = 0; index < 5; index++) expect(respawn.collect(index)).toBe(true);
    expect(respawn.unlock('horse')).toBe(true);
    expect(respawn.unlock('flamethrower')).toBe(true);
    expect(previous.isUnlocked('horse')).toBe(true);
  });
});
