import { describe, expect, it, vi } from 'vitest';
import { createWorldKeyPositions } from '@/libs/world/world-key-placement';
import { PERSONA_RADIUS, WORLD_RADIUS, type WorldObstacle } from '@/libs/world/world-motion';
import { WORLD_KEY_COUNT } from '@/libs/world/world-transport-unlocks';

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

describe('random island key placement', () => {
  it('spreads exactly eleven separated keys across the island, away from the spawn and shoreline', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const positions = createWorldKeyPositions([], seededRandom(seed));
      expect(positions).toHaveLength(WORLD_KEY_COUNT);
      for (const [index, point] of positions.entries()) {
        expect(Math.hypot(point.x, point.z)).toBeLessThan(WORLD_RADIUS - 6);
        expect(Math.hypot(point.x, point.z - 24)).toBeGreaterThan(32);
        for (const other of positions.slice(index + 1))
          expect(Math.hypot(point.x - other.x, point.z - other.z)).toBeGreaterThanOrEqual(20);
      }
      expect(Math.max(...positions.map(({ x }) => x)) - Math.min(...positions.map(({ x }) => x))).toBeGreaterThan(180);
      expect(Math.max(...positions.map(({ z }) => z)) - Math.min(...positions.map(({ z }) => z))).toBeGreaterThan(180);
    }
  });

  it('uses fresh random values for each scene instead of a fixed seed or cached positions', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(seededRandom(7));
    try {
      const first = createWorldKeyPositions([]);
      const second = createWorldKeyPositions([]);
      expect(first).not.toEqual(second);
      expect(first.every((point, index) => Math.hypot(point.x - second[index].x, point.z - second[index].z) > 1)).toBe(
        true,
      );
      expect(random).toHaveBeenCalled();
      expect(createWorldKeyPositions([], seededRandom(7))).toEqual(first);
    } finally {
      random.mockRestore();
    }
  });

  it('keeps all keys out of overlapping props and enclosed pockets, even if their centers are empty', () => {
    const obstacles: WorldObstacle[] = [
      { x: -50, z: -50, radius: 18 },
      { x: -65, z: -48, radius: 14 },
      ...Array.from({ length: 24 }, (_, index) => ({
        x: 78 + Math.cos((index / 24) * Math.PI * 2) * 23,
        z: 72 + Math.sin((index / 24) * Math.PI * 2) * 23,
        radius: 3.4,
      })),
    ];
    for (let seed = 20; seed < 26; seed++) {
      const positions = createWorldKeyPositions(obstacles, seededRandom(seed));
      expect(positions).toHaveLength(WORLD_KEY_COUNT);
      for (const point of positions) {
        for (const obstacle of obstacles)
          expect(Math.hypot(point.x - obstacle.x, point.z - obstacle.z)).toBeGreaterThan(
            obstacle.radius + PERSONA_RADIUS,
          );
        expect(Math.hypot(point.x - 78, point.z - 72)).toBeGreaterThan(23);
      }
    }
  });

  it('never puts a key across a solid map-spanning barrier from the player spawn', () => {
    const wall = Array.from({ length: 81 }, (_, index) => ({ x: 18, z: -200 + index * 5, radius: 3 }));
    const positions = createWorldKeyPositions(wall, seededRandom(28));
    expect(positions).toHaveLength(WORLD_KEY_COUNT);
    expect(positions.every(({ x }) => x < 18 - 3 - PERSONA_RADIUS)).toBe(true);
  });

  it('preserves ground paths beneath elevated panels and through disabled props', () => {
    const obstacles = [
      { x: 0, z: 0, radius: 190, enabled: false },
      { x: 0, z: 0, radius: 190, minHeight: 2 },
    ];
    expect(createWorldKeyPositions(obstacles, seededRandom(101))).toEqual(
      createWorldKeyPositions([], seededRandom(101)),
    );
  });

  it('bounds placement work when a future scene leaves no reachable space', () => {
    expect(createWorldKeyPositions([{ x: 0, z: 0, radius: WORLD_RADIUS }], seededRandom(15))).toEqual([]);
    expect(createWorldKeyPositions([], () => 1)).toHaveLength(WORLD_KEY_COUNT);
    expect(createWorldKeyPositions([], () => Number.NaN)).toHaveLength(WORLD_KEY_COUNT);
  });
});
