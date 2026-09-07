import { describe, expect, it } from 'vitest';
import { movementStep, PERSONA_RADIUS, resolvePosition, WORLD_RADIUS } from './world-motion';

describe('world movement', () => {
  it('keeps diagonal and straight walking at the same speed', () => {
    const straight = movementStep(0, -1, 0, 0.016);
    const diagonal = movementStep(1, -1, 0, 0.016);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(Math.hypot(straight.x, straight.z));
  });

  it('moves forward relative to the orbited camera', () => {
    const step = movementStep(0, -1, Math.PI / 2, 0.05);
    expect(step.x).toBeCloseTo(-0.4);
    expect(step.z).toBeCloseTo(0);
  });

  it('caps a stalled frame so a visitor cannot jump through the map', () => {
    expect(movementStep(1, 0, 0, 50, true).x).toBe(0.75);
    expect(movementStep(1, 0, 0, -1).x).toBe(0);
  });

  it('resolves a visitor placed inside an obstacle without NaN positions', () => {
    const result = resolvePosition(2, 3, [{ x: 2, z: 3, radius: 2 }]);
    expect(result).toEqual({ x: 2 + 2 + PERSONA_RADIUS, z: 3 });
  });

  it('keeps the player within the coastline', () => {
    const result = resolvePosition(90, 90, []);
    expect(Math.hypot(result.x, result.z)).toBeCloseTo(WORLD_RADIUS);
  });
});
