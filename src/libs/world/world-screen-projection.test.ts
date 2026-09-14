import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { projectWorldScreenAnchor } from '@/libs/world/world-screen-projection';

describe('world screen projection', () => {
  const camera = () => new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 100);

  it('follows a moving world point and an orbiting camera without changing the world position', () => {
    const view = camera();
    const point = new THREE.Vector3(0, 0, -10);
    expect(projectWorldScreenAnchor(point, view)).toEqual({ x: 0.5, y: 0.5 });
    point.set(2, 3, -10);
    const moved = projectWorldScreenAnchor(point, view)!;
    expect(moved.x).toBeGreaterThan(0.5);
    expect(moved.y).toBeLessThan(0.5);
    view.position.set(10, 4, -2);
    view.lookAt(point);
    const orbited = projectWorldScreenAnchor(point, view)!;
    expect(orbited.x).toBeCloseTo(0.5);
    expect(orbited.y).toBeCloseTo(0.5);
    expect(point.toArray()).toEqual([2, 3, -10]);
  });

  it.each([
    [0, 0, 10],
    [0, 0, 0],
    [0, 0, -0.1],
    [0, 0, -101],
    [20, 0, -10],
    [-20, 0, -10],
    [0, 20, -10],
    [0, -20, -10],
    [Number.NaN, 0, -10],
    [0, Number.POSITIVE_INFINITY, -10],
  ])('hides anchors behind or outside the camera at (%s, %s, %s)', (x, y, z) => {
    expect(projectWorldScreenAnchor(new THREE.Vector3(x, y, z), camera())).toBeNull();
  });
});
