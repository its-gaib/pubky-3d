import { describe, expect, it } from 'vitest';
import { WORLD_ZONES } from './world-catalog';
import {
  WORLD_ANCHORS,
  WORLD_DIMENSIONS,
  WORLD_RADIUS,
  WORLD_TREE_POSITIONS,
  worldArrival,
  worldCameraFar,
} from './world-layout';
import { resolvePosition } from './world-motion';

describe('expanded world layout', () => {
  it('arrives inside the walkable coast and within the intended district for every destination', () => {
    for (const zone of WORLD_ZONES) {
      const arrival = worldArrival(zone.id);
      expect(Math.hypot(arrival.x, arrival.z)).toBeLessThan(WORLD_RADIUS);
      expect(resolvePosition(arrival.x, arrival.z, [])).toEqual(arrival);
      const ownDistance = Math.hypot(zone.position[0] - arrival.x, zone.position[1] - arrival.z);
      for (const other of WORLD_ZONES.filter((candidate) => candidate.id !== zone.id)) {
        expect(ownDistance).toBeLessThan(Math.hypot(other.position[0] - arrival.x, other.position[1] - arrival.z));
      }
    }
  });

  it('gives the previously crowded buildings space without enlarging their models', () => {
    for (const [left, right] of [
      ['theater', 'university'],
      ['theater', 'github'],
      ['bank', 'arena'],
      ['bank', 'forest'],
    ] as const) {
      const a = WORLD_ANCHORS[left];
      const b = WORLD_ANCHORS[right];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(30);
    }
  });

  it('leaves room around every tree for its canopy and hanging posts', () => {
    for (let index = 0; index < WORLD_TREE_POSITIONS.length; index++) {
      const tree = WORLD_TREE_POSITIONS[index];
      expect(Math.hypot(...tree) + 5).toBeLessThan(WORLD_RADIUS);
      for (const neighbor of WORLD_TREE_POSITIONS.slice(index + 1)) {
        expect(Math.hypot(tree[0] - neighbor[0], tree[1] - neighbor[1])).toBeGreaterThan(12);
      }
    }
  });

  it('keeps peripheral props and their decoration on the island', () => {
    for (const id of ['bank', 'duck', 'portal', 'trampoline', 'satoshi', 'balloon'] as const) {
      expect(Math.hypot(...WORLD_ANCHORS[id]) + 8).toBeLessThan(WORLD_DIMENSIONS.landRadius);
    }
  });

  it('keeps the far coastline visible when portrait views pull the overview camera back', () => {
    for (const aspect of [1.6, 390 / 844, 0.25]) {
      const distance = WORLD_DIMENSIONS.overviewDistance * Math.max(1, 1 / aspect) * 1.5;
      expect(worldCameraFar(distance)).toBeGreaterThan(distance + WORLD_DIMENSIONS.coastRadius);
    }
  });
});
