import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeObject } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import { createSatoshi } from '@/libs/world/world-satoshi';

describe('Satoshi steel monument', () => {
  afterEach(() => vi.restoreAllMocks());

  it('retains the original contour spacing and angle-dependent gaps with one steel draw', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const scene = new THREE.Scene();
    const register = vi.fn();
    const obstacle = vi.fn();
    createSatoshi(scene, register, obstacle);
    const monument = scene.getObjectByName('Satoshi monument')!;
    const figure = monument.getObjectByName('satoshi-steel-contours')!;
    expect(figure.position.y).toBe(1.58);
    expect(figure.rotation.y).toBe(-0.52);
    const steel = figure.children.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
    expect(steel).toHaveLength(1);
    const positions = steel[0].geometry.getAttribute('position');
    const planes = new Set<number>();
    let largestDeviation = 0;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const x = positions.getX(vertex);
      const plane = Math.round(x / 0.175);
      planes.add(plane);
      largestDeviation = Math.max(largestDeviation, Math.abs(x - plane * 0.175));
    }
    // All 27 body sections survive. Floating-point tangencies can also create
    // a tiny section on an outer sample plane of the original 29-plane grid.
    expect([...planes]).toEqual(expect.arrayContaining(Array.from({ length: 27 }, (_, index) => index - 13)));
    expect([...planes].every((plane) => Math.abs(plane) <= 14)).toBe(true);
    expect(largestDeviation).toBeCloseTo(0.026, 5);
    expect(0.175 - largestDeviation * 2).toBeGreaterThan(0.12);
    expect(register).toHaveBeenCalledExactlyOnceWith(
      monument,
      { kind: 'fun', id: 'satoshi' },
      'Read the Satoshi monument plaque',
    );
    expect(obstacle).toHaveBeenCalledExactlyOnceWith(WORLD_ANCHORS.satoshi[0], WORLD_ANCHORS.satoshi[1], 3.05);
    expect(monument.getObjectByName('Satoshi dedication plaque')).toBeInstanceOf(THREE.Mesh);
    expect(monument.children.some((object) => object instanceof THREE.Sprite)).toBe(false);
    let meshCount = 0;
    let triangles = 0;
    monument.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshCount++;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    });
    expect(meshCount).toBeLessThanOrEqual(5);
    expect(triangles).toBeLessThan(65_000);
    disposeObject(scene);
  });
});
