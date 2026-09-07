import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WORLD_DIMENSIONS } from '@/libs/world/world-layout';
import {
  createGalacticJellyfish,
  createJellyfishState,
  GALACTIC_JELLYFISH,
  type GalacticJellyfishState,
  jellyfishExtent,
  jellyfishOpacity,
  jellyfishOutsideEnvelope,
  stepJellyfish,
} from './world-jellyfish';

function atDistance(state: GalacticJellyfishState, distance: number): GalacticJellyfishState {
  const y = 60;
  return { ...state, position: [Math.sqrt(distance * distance - y * y), y, 0], age: 12 };
}

describe('galactic jellyfish motion', () => {
  it('spreads sizes, colors, speeds, depths and headings throughout a joint world-space envelope', () => {
    const initial = Array.from({ length: GALACTIC_JELLYFISH.count }, (_, id) => createJellyfishState(id));
    expect(new Set(initial.map((state) => state.color)).size).toBe(6);
    expect(Math.max(...initial.map((state) => state.scale))).toBeGreaterThan(6);
    expect(Math.min(...initial.map((state) => state.scale))).toBeLessThan(4);
    expect(
      Math.max(...initial.map((state) => state.speed)) - Math.min(...initial.map((state) => state.speed)),
    ).toBeGreaterThan(3);
    expect(
      Math.max(...initial.map((state) => state.position[1])) - Math.min(...initial.map((state) => state.position[1])),
    ).toBeGreaterThan(30);
    for (const axis of [0, 1, 2]) {
      expect(initial.some((state) => state.velocity[axis] < -0.3)).toBe(true);
      expect(initial.some((state) => state.velocity[axis] > 0.3)).toBe(true);
    }
    for (let generation = 0; generation < 10; generation++) {
      for (let id = 0; id < GALACTIC_JELLYFISH.count; id++) {
        const state = createJellyfishState(id, generation);
        const extent = jellyfishExtent(state.scale);
        expect(Math.hypot(state.position[0], state.position[2]) - extent).toBeGreaterThan(
          GALACTIC_JELLYFISH.coastClearance,
        );
        expect(Math.hypot(...state.position) + extent).toBeLessThan(GALACTIC_JELLYFISH.outerRadius);
        expect(state.position[1] - extent).toBeGreaterThan(GALACTIC_JELLYFISH.lowerY);
        expect(state.position[1] + extent).toBeLessThan(GALACTIC_JELLYFISH.upperY);
        expect(jellyfishOpacity(state)).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every oriented body outside the coast and above the opaque ocean through long motion and recycling', () => {
    let states = Array.from({ length: GALACTIC_JELLYFISH.count }, (_, id) => createJellyfishState(id));
    for (let frame = 0; frame < 4_000; frame++) {
      states = states.map((state) => stepJellyfish(state, 0.05));
      if (frame % 100 !== 0) continue;
      for (const state of states) {
        const extent = jellyfishExtent(state.scale);
        expect(Math.hypot(state.position[0], state.position[2]) - extent).toBeGreaterThanOrEqual(
          WORLD_DIMENSIONS.coastRadius + 11.999,
        );
        expect(state.position[1] - extent).toBeGreaterThanOrEqual(GALACTIC_JELLYFISH.lowerY - 0.001);
        expect(state.position.every(Number.isFinite)).toBe(true);
        if (jellyfishOpacity(state) > 0) {
          expect(Math.hypot(...state.position) + extent).toBeLessThan(GALACTIC_JELLYFISH.outerRadius);
          expect(state.position[1] + extent).toBeLessThan(GALACTIC_JELLYFISH.upperY);
        }
      }
    }
    expect(states.some((state) => state.generation > 0)).toBe(true);
    expect(states).toHaveLength(GALACTIC_JELLYFISH.count);
  });

  it('recycles only after the whole body exits, then enters from an outer edge with zero opacity', () => {
    const state = createJellyfishState(0);
    const extent = jellyfishExtent(state.scale);
    const crossing = atDistance(state, GALACTIC_JELLYFISH.outerRadius + extent - 1);
    expect(jellyfishOutsideEnvelope(crossing)).toBe(false);
    expect(stepJellyfish(crossing, 0.01).generation).toBe(state.generation);
    const outside = {
      ...atDistance(state, GALACTIC_JELLYFISH.outerRadius + extent + 1),
      velocity: [1, 0, 0] as [number, number, number],
    };
    expect(jellyfishOutsideEnvelope(outside)).toBe(true);
    const replacement = stepJellyfish(outside, 0.05);
    expect(replacement.id).toBe(state.id);
    expect(replacement.generation).toBe(state.generation + 1);
    expect(replacement.age).toBe(0);
    expect(jellyfishOpacity(replacement)).toBe(0);
    expect(jellyfishOutsideEnvelope(replacement)).toBe(false);
    expect(
      replacement.position[0] * replacement.velocity[0] + replacement.position[2] * replacement.velocity[2],
    ).toBeLessThan(0);
    expect(stepJellyfish(replacement, 0.05).generation).toBe(replacement.generation);
  });

  it('fades smoothly at a fixed outer boundary and does not fade based on a camera', () => {
    const state = createJellyfishState(2);
    const visibleEdge = GALACTIC_JELLYFISH.outerRadius - jellyfishExtent(state.scale);
    expect(jellyfishOpacity(atDistance(state, visibleEdge + 1))).toBe(0);
    expect(jellyfishOpacity(atDistance(state, visibleEdge - 2))).toBeGreaterThan(0);
    expect(jellyfishOpacity(atDistance(state, visibleEdge - 2))).toBeLessThan(0.1);
    expect(jellyfishOpacity(atDistance(state, visibleEdge - GALACTIC_JELLYFISH.fadeWidth / 2))).toBeCloseTo(0.5);
    expect(jellyfishOpacity(atDistance(state, visibleEdge - GALACTIC_JELLYFISH.fadeWidth))).toBeCloseTo(1);
  });

  it('caps stalled frames and keeps deterministic motion independent of wall-clock time', () => {
    const state = createJellyfishState(4);
    expect(stepJellyfish(state, 1_000)).toEqual(stepJellyfish(state, 0.05));
    expect(stepJellyfish(state, 0)).toBe(state);
    expect(stepJellyfish(state, -1)).toBe(state);
    expect(stepJellyfish(state, Number.NaN)).toBe(state);
    expect(createJellyfishState(4)).toEqual(state);
  });
});

describe('galactic jellyfish renderer', () => {
  it('uses four shared 3D instance pools without fog, shadows or moving frustum bounds', () => {
    const scene = new THREE.Scene();
    const jellyfish = createGalacticJellyfish(scene);
    expect(jellyfish.group.children).toHaveLength(4);
    for (const object of jellyfish.group.children) {
      expect(object).toBeInstanceOf(THREE.InstancedMesh);
      const instance = object as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      expect(instance.count).toBe(GALACTIC_JELLYFISH.count);
      expect(instance.castShadow).toBe(false);
      expect(instance.receiveShadow).toBe(false);
      expect(instance.frustumCulled).toBe(false);
      expect(instance.material.fog).toBe(false);
      expect(instance.material.depthWrite).toBe(false);
      expect(instance.material.depthTest).toBe(true);
      expect(instance.material.blending).toBe(THREE.AdditiveBlending);
      const vertices = instance.geometry.getAttribute('position');
      let furthest = 0;
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        furthest = Math.max(furthest, Math.hypot(vertices.getX(vertex), vertices.getY(vertex), vertices.getZ(vertex)));
      }
      expect(furthest * 1.16).toBeLessThan(GALACTIC_JELLYFISH.unitExtent);
    }
    jellyfish.dispose();
  });

  it('freezes reduced motion and ignores absolute time jumps when resuming', () => {
    const scene = new THREE.Scene();
    const actual = createGalacticJellyfish(scene);
    const control = createGalacticJellyfish(scene);
    const matrices = (group: THREE.Group) =>
      group.children.map((object) => Array.from((object as THREE.InstancedMesh).instanceMatrix.array));
    actual.animate(1, 0.02);
    control.animate(9_000, 0.02);
    expect(matrices(actual.group)).toEqual(matrices(control.group));
    const frozen = matrices(actual.group);
    actual.animate(30_000, 500, true);
    expect(matrices(actual.group)).toEqual(frozen);
    actual.animate(90_000, 0.02, false);
    control.animate(9_001, 0.02, false);
    expect(matrices(actual.group)).toEqual(matrices(control.group));
    actual.dispose();
    control.dispose();
  });

  it('retains GPU resource counts through recycling and releases each owned resource exactly once', () => {
    const scene = new THREE.Scene();
    const jellyfish = createGalacticJellyfish(scene);
    const initial = jellyfish.group.children.map(
      (object) => object as THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>,
    );
    const identities = initial.map((object) => [object, object.geometry, object.material]);
    for (let frame = 0; frame < 3_000; frame++) jellyfish.animate(frame * 0.05, 0.05);
    expect(
      jellyfish.group.children.map((object) => {
        const instance = object as THREE.InstancedMesh;
        return [instance, instance.geometry, instance.material];
      }),
    ).toEqual(identities);
    const releases = initial.flatMap((object) => [
      vi.spyOn(object, 'dispose'),
      vi.spyOn(object.geometry, 'dispose'),
      vi.spyOn(object.material, 'dispose'),
    ]);
    jellyfish.dispose();
    jellyfish.dispose();
    jellyfish.animate(1_000_000, 0.05);
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
    expect(scene.children).toEqual([]);
  });
});
