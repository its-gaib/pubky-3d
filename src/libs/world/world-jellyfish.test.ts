import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createWorldBurning } from '@/libs/world/world-burning';
import { WORLD_DIMENSIONS } from '@/libs/world/world-layout';
import {
  createGalacticJellyfish,
  createJellyfishState,
  GALACTIC_JELLYFISH,
  type GalacticJellyfishState,
  jellyfishBounds,
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
        const bounds = jellyfishBounds(state);
        expect(Math.hypot(state.position[0], state.position[2]) - extent).toBeGreaterThan(bounds.coastClearance);
        expect(Math.hypot(...state.position) + extent).toBeLessThan(bounds.outerRadius);
        expect(state.position[1] - extent).toBeGreaterThan(GALACTIC_JELLYFISH.lowerY);
        expect(state.position[1] + extent).toBeLessThan(GALACTIC_JELLYFISH.upperY);
        expect(jellyfishOpacity(state)).toBeGreaterThan(0);
      }
    }
  });

  it('keeps five farther out, three in the original near envelope and six near the walking horizon', () => {
    for (let generation = 0; generation < 5; generation++) {
      const states = Array.from({ length: GALACTIC_JELLYFISH.count }, (_, id) => createJellyfishState(id, generation));
      const far = states.filter((state) => jellyfishBounds(state).outerRadius === GALACTIC_JELLYFISH.outerRadius);
      const near = states.filter((state) => jellyfishBounds(state).outerRadius === GALACTIC_JELLYFISH.nearOuterRadius);
      expect(far).toHaveLength(5);
      expect(near).toHaveLength(3);
      for (const state of far)
        expect(Math.hypot(state.position[0], state.position[2]) - jellyfishExtent(state.scale)).toBeGreaterThan(
          WORLD_DIMENSIONS.coastRadius * 1.7,
        );
      for (const state of near)
        expect(Math.hypot(...state.position) + jellyfishExtent(state.scale)).toBeLessThan(
          WORLD_DIMENSIONS.coastRadius * 2,
        );
      expect(states.filter((state) => state.position[1] < 60)).toHaveLength(6);
      expect(states.filter((state) => state.position[1] >= 72)).toHaveLength(2);
    }
  });

  it('keeps every oriented body outside the coast and above the opaque ocean through long motion and recycling', () => {
    let states = Array.from({ length: GALACTIC_JELLYFISH.count }, (_, id) => createJellyfishState(id));
    for (let frame = 0; frame < 4_000; frame++) {
      states = states.map((state) => stepJellyfish(state, 0.05));
      if (frame % 100 !== 0) continue;
      for (const state of states) {
        const extent = jellyfishExtent(state.scale);
        const bounds = jellyfishBounds(state);
        expect(Math.hypot(state.position[0], state.position[2]) - extent).toBeGreaterThanOrEqual(
          bounds.coastClearance - 0.001,
        );
        expect(state.position[1] - extent).toBeGreaterThanOrEqual(GALACTIC_JELLYFISH.lowerY - 0.001);
        expect(state.position.every(Number.isFinite)).toBe(true);
        if (jellyfishOpacity(state) > 0) {
          expect(Math.hypot(...state.position) + extent).toBeLessThan(bounds.outerRadius);
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
  function exposure(group: THREE.Group, index = 0) {
    const bell = group.getObjectByName('Translucent bells') as THREE.InstancedMesh;
    group.updateWorldMatrix(true, true);
    const matrix = new THREE.Matrix4();
    bell.getMatrixAt(index, matrix);
    matrix.premultiply(bell.matrixWorld);
    return {
      origin: new THREE.Vector3(0, 3, 0).applyMatrix4(matrix),
      direction: new THREE.Vector3(0, -1, 0).transformDirection(matrix),
      range: 32,
      halfAngle: 0,
      seconds: 0.1,
    };
  }

  it('uses four shared 3D instance pools without fog, shadows or moving frustum bounds', () => {
    const scene = new THREE.Scene();
    const jellyfish = createGalacticJellyfish(scene);
    expect(jellyfish.group.children).toHaveLength(4);
    let sharedVertices = 0;
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
      sharedVertices += vertices.count;
      const colors = instance.geometry.getAttribute('color');
      expect(colors.itemSize).toBe(4);
      let lowestAlpha = 1;
      let highestAlpha = 0;
      for (let vertex = 0; vertex < colors.count; vertex++) {
        lowestAlpha = Math.min(lowestAlpha, colors.getW(vertex));
        highestAlpha = Math.max(highestAlpha, colors.getW(vertex));
      }
      expect(lowestAlpha).toBeGreaterThanOrEqual(0);
      expect(highestAlpha).toBeLessThanOrEqual(1);
      let furthest = 0;
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        furthest = Math.max(furthest, Math.hypot(vertices.getX(vertex), vertices.getY(vertex), vertices.getZ(vertex)));
      }
      const vertexWave = instance.name === 'Trailing tentacles' ? 0.13 : 0;
      expect((furthest + vertexWave) * 1.16).toBeLessThan(GALACTIC_JELLYFISH.unitExtent);
    }
    expect(sharedVertices).toBeLessThan(35_000);
    jellyfish.dispose();
  });

  it('freezes reduced motion and ignores absolute time jumps when resuming', () => {
    const scene = new THREE.Scene();
    const actual = createGalacticJellyfish(scene);
    const control = createGalacticJellyfish(scene);
    const filamentClock = (group: THREE.Group) => {
      const material = (group.getObjectByName('Trailing tentacles') as THREE.InstancedMesh)
        .material as THREE.MeshBasicMaterial;
      const shader = {
        uniforms: {},
        vertexShader: '#include <begin_vertex>',
        fragmentShader: '',
      } as Parameters<typeof material.onBeforeCompile>[0];
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.vertexShader).toContain('attribute float jellyfishPhase');
      return shader.uniforms.jellyfishTime;
    };
    const actualClock = filamentClock(actual.group);
    const controlClock = filamentClock(control.group);
    const matrices = (group: THREE.Group) =>
      group.children.map((object) => Array.from((object as THREE.InstancedMesh).instanceMatrix.array));
    actual.animate(1, 0.02);
    control.animate(9_000, 0.02);
    expect(matrices(actual.group)).toEqual(matrices(control.group));
    expect(actualClock.value).toEqual(controlClock.value);
    const frozen = matrices(actual.group);
    const frozenClock = actualClock.value;
    actual.animate(30_000, 500, true);
    expect(matrices(actual.group)).toEqual(frozen);
    expect(actualClock.value).toBe(frozenClock);
    actual.animate(90_000, 0.02, false);
    control.animate(9_001, 0.02, false);
    expect(matrices(actual.group)).toEqual(matrices(control.group));
    expect(actualClock.value).toEqual(controlClock.value);
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

  it('exposes eight finite individual burn bounds and raycasts their current moving transforms', () => {
    const jellyfish = createGalacticJellyfish(new THREE.Scene());
    expect(jellyfish.burnTargets.map((target) => target.id)).toEqual(
      Array.from({ length: GALACTIC_JELLYFISH.count }, (_, index) => `prop:jellyfish:${index}`),
    );
    const before = new THREE.Box3();
    jellyfish.burnTargets[0].getBounds(before);
    for (let frame = 0; frame < 100; frame++) jellyfish.animate(frame * 0.05, 0.05);
    const after = new THREE.Box3();
    for (const target of jellyfish.burnTargets) {
      expect(target.getBounds(after)).toBe(true);
      expect([...after.min.toArray(), ...after.max.toArray()].every(Number.isFinite)).toBe(true);
      expect(Math.max(...after.getSize(new THREE.Vector3()).toArray())).toBeLessThan(65);
    }
    jellyfish.burnTargets[0].getBounds(after);
    expect(before.getCenter(new THREE.Vector3()).distanceTo(after.getCenter(new THREE.Vector3()))).toBeGreaterThan(1);
    const aim = exposure(jellyfish.group);
    const ray = new THREE.Raycaster(aim.origin, aim.direction, 0, aim.range);
    expect(jellyfish.burnTargets[0].raycast!(ray)).toBeGreaterThan(0);
    expect(jellyfish.burnTargets[1].raycast!(ray)).toBeNull();
    jellyfish.dispose();
  });

  it('burns one moving body across all four pools without recycling it or changing shared resources', () => {
    const jellyfish = createGalacticJellyfish(new THREE.Scene());
    const burning = createWorldBurning({ ledger: new Set() });
    jellyfish.burnTargets.forEach((target) => burning.bind(target));
    const pools = jellyfish.group.children.map(
      (object) => object as THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>,
    );
    const releases = pools.flatMap((object) => [
      vi.spyOn(object, 'dispose'),
      vi.spyOn(object.geometry, 'dispose'),
      vi.spyOn(object.material, 'dispose'),
    ]);
    const initial = new THREE.Matrix4();
    const neighbor = new THREE.Matrix4();
    pools[0].getMatrixAt(0, initial);
    pools[0].getMatrixAt(1, neighbor);
    const aim = exposure(jellyfish.group);
    burning.expose(aim);
    burning.tick(0.1);
    burning.expose(aim);
    expect(burning.isBurning('prop:jellyfish:0')).toBe(true);
    expect(burning.isBurning('prop:jellyfish:1')).toBe(false);
    for (let frame = 0; frame < 50; frame++) {
      jellyfish.animate(frame * 0.05, 0.05);
      burning.tick(0.05);
    }
    const matrix = new THREE.Matrix4();
    pools[0].getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).toArray()).toEqual(
      new THREE.Vector3().setFromMatrixPosition(initial).toArray(),
    );
    pools[0].getMatrixAt(1, matrix);
    expect(matrix.equals(neighbor)).toBe(false);
    for (let frame = 0; frame < 150; frame++) {
      jellyfish.animate(frame * 0.05, 0.05);
      burning.tick(0.05);
    }
    expect(burning.isGone('prop:jellyfish:0')).toBe(true);
    // Continue ordinary flock recycling without controller ticks: paint itself
    // must preserve the selected body's disappearance.
    for (let frame = 0; frame < 3_000; frame++) jellyfish.animate(frame * 0.05, 0.05);
    for (const pool of pools) {
      pool.getMatrixAt(0, matrix);
      expect(matrix.determinant()).toBeCloseTo(0, 12);
      pool.getMatrixAt(1, matrix);
      expect(matrix.determinant()).toBeGreaterThan(0);
      expect(pool.count).toBe(GALACTIC_JELLYFISH.count);
      expect(pool.visible).toBe(true);
    }
    expect(jellyfish.burnTargets[0].canIgnite!()).toBe(false);
    releases.forEach((release) => expect(release).not.toHaveBeenCalled());
    burning.dispose();
    jellyfish.dispose();
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
  });

  it('keeps late-burning bodies full-sized until explosion and restores gone identities on remount', () => {
    const jellyfish = createGalacticJellyfish(new THREE.Scene());
    const burning = createWorldBurning({ ledger: new Set(['prop:jellyfish:0']) });
    jellyfish.burnTargets.forEach((target) => burning.bind(target));
    const target = jellyfish.burnTargets[1];
    const matrix = new THREE.Matrix4();
    const pool = jellyfish.group.children[0] as THREE.InstancedMesh;
    pool.getMatrixAt(1, matrix);
    const initial = matrix.clone();
    expect(burning.ignite(target.id)).toBe(true);
    for (let frame = 0; frame < 39; frame++) burning.tick(0.1, true);
    jellyfish.animate(99_999, 500, true);
    pool.getMatrixAt(1, matrix);
    expect(matrix.equals(initial)).toBe(true);
    expect(burning.isBurning(target.id)).toBe(true);
    jellyfish.animate(100_000, 0.05);
    for (const object of jellyfish.group.children) {
      const instance = object as THREE.InstancedMesh;
      instance.getMatrixAt(0, matrix);
      expect(matrix.determinant()).toBeCloseTo(0, 12);
      instance.getMatrixAt(1, matrix);
      expect(matrix.determinant()).toBeGreaterThan(0);
    }
    for (let frame = 0; frame < 40; frame++) burning.tick(0.1, true);
    pool.getMatrixAt(1, matrix);
    expect(matrix.determinant()).toBe(0);
    burning.dispose();
    jellyfish.dispose();
  });
});
