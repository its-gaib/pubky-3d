import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARENA_BRAND_SYMBOLS, ARENA_DIMENSIONS, arenaCollisionObstacles, createArena } from '@/libs/world/world-arena';
import { disposeObject } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import { PERSONA_RADIUS, resolvePosition } from '@/libs/world/world-motion';

describe('Roman arena', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the center and a continuous front entrance walkable while blocking the seating', () => {
    const obstacles = arenaCollisionObstacles([0, 0]);
    expect(obstacles.length).toBeLessThan(200);
    for (let z = 20; z >= 0; z -= 0.25) {
      for (const x of [-1.5, 0, 1.5]) expect(resolvePosition(x, z, obstacles)).toEqual({ x, z });
    }
    for (const [x, z] of [
      [13.5, 0],
      [-13.5, 0],
      [0, -10.4],
    ]) {
      expect(obstacles.some((item) => Math.hypot(item.x - x, item.z - z) < item.radius + PERSONA_RADIUS)).toBe(true);
    }
    expect(obstacles.every((item) => Math.hypot(item.x, item.z) > item.radius + 5)).toBe(true);
  });

  it('places collision boundaries at the same shared arena anchor used by the mesh', () => {
    const local = arenaCollisionObstacles([0, 0]);
    const placed = arenaCollisionObstacles();
    expect(placed).toEqual(
      local.map((item) => ({
        x: item.x + WORLD_ANCHORS.arena[0],
        z: item.z + WORLD_ANCHORS.arena[1],
        radius: item.radius,
      })),
    );
  });

  it('keeps the official symbol paths and excludes the wordmark paths', () => {
    const officialIcons = readFileSync('src/libs/icons/icons.tsx', 'utf8');
    expect(ARENA_BRAND_SYMBOLS.map((brand) => brand.name)).toEqual(['Pubky', 'Synonym']);
    expect(ARENA_BRAND_SYMBOLS.map((brand) => brand.paths.length)).toEqual([1, 2]);
    for (const brand of ARENA_BRAND_SYMBOLS) {
      for (const path of brand.paths) expect(officialIcons).toContain(path.d);
    }
  });

  it('builds the larger landmark within its reserved footprint and batches repeated details into few draw calls', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const scene = new THREE.Scene();
    const register = vi.fn();
    const obstacle = vi.fn();
    const arena = createArena(scene, register, obstacle);
    const box = new THREE.Box3();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    arena.group.updateMatrixWorld(true);
    const worldToArena = new THREE.Matrix4().copy(arena.group.matrixWorld).invert();
    arena.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld).applyMatrix4(worldToArena);
      box.union(bounds);
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((surface) =>
        materials.add(surface),
      );
    });
    expect(register).toHaveBeenCalledExactlyOnceWith(
      arena.group,
      { kind: 'zone', id: 'arena' },
      'Enter the Roman Arena',
    );
    expect(obstacle).toHaveBeenCalledTimes(arenaCollisionObstacles().length);
    expect(box.min.x).toBeGreaterThanOrEqual(-ARENA_DIMENSIONS.halfWidth - 0.01);
    expect(box.max.x).toBeLessThanOrEqual(ARENA_DIMENSIONS.halfWidth + 0.01);
    expect(box.min.z).toBeGreaterThanOrEqual(-ARENA_DIMENSIONS.halfDepth - 0.01);
    expect(box.max.z).toBeLessThanOrEqual(ARENA_DIMENSIONS.halfDepth + 0.01);
    expect(box.max.y).toBeGreaterThan(10);
    expect(geometries.size).toBeLessThan(20);
    expect(materials.size).toBeLessThan(20);
    const canvasTextures = [...materials].flatMap((surface) =>
      'map' in surface && surface.map instanceof THREE.CanvasTexture ? [surface.map] : [],
    );
    expect(canvasTextures).toHaveLength(2);
    const releases = canvasTextures.map((texture) => vi.spyOn(texture, 'dispose'));
    arena.animate(10);
    disposeObject(arena.group);
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
    expect(scene.children).toEqual([]);
  });

  it('keeps two small gladiators inside the sand through a complete duel without adding scene resources', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const arena = createArena(new THREE.Scene(), vi.fn(), vi.fn());
    const duel = arena.group.getObjectByName('arena-gladiator-duel')!;
    expect(duel.children).toHaveLength(2);
    const resourceIds = () => {
      const ids: string[] = [];
      arena.group.traverse((object) => {
        ids.push(object.uuid);
        if (object instanceof THREE.Mesh) {
          ids.push(object.geometry.uuid);
          for (const surface of Array.isArray(object.material) ? object.material : [object.material]) {
            ids.push(surface.uuid);
          }
        }
      });
      return ids;
    };
    const initialResources = resourceIds();
    for (let frame = 0; frame <= 120; frame++) {
      arena.animate(frame / 10);
      arena.group.updateMatrixWorld(true);
      for (const fighter of duel.children) {
        const bounds = new THREE.Box3().setFromObject(fighter);
        bounds.min.sub(arena.group.position);
        bounds.max.sub(arena.group.position);
        expect(bounds.min.y).toBeGreaterThan(0.04);
        expect(bounds.max.y).toBeLessThan(2.5);
        for (const x of [bounds.min.x, bounds.max.x]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            expect(
              (x / ARENA_DIMENSIONS.floorHalfWidth) ** 2 + (z / ARENA_DIMENSIONS.floorHalfDepth) ** 2,
            ).toBeLessThan(1);
          }
        }
      }
    }
    expect(resourceIds()).toEqual(initialResources);
    disposeObject(arena.group);
  });

  it('alternates the lunge and shield parry and replays the same absolute-time poses', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const arena = createArena(new THREE.Scene(), vi.fn(), vi.fn());
    const [crimson, teal] = arena.group.getObjectByName('arena-gladiator-duel')!.children;
    const sword = crimson.getObjectByName('gladiator-sword-arm')!;
    const shield = teal.getObjectByName('gladiator-shield-arm')!;
    const guard = { sword: sword.rotation.x, shield: shield.rotation.x };
    arena.animate(2.45);
    expect(crimson.position.length()).toBeLessThan(teal.position.length());
    expect(sword.rotation.x).toBeGreaterThan(guard.sword + 1);
    expect(shield.rotation.x).toBeLessThan(guard.shield - 0.3);
    const pose = [...crimson.position.toArray(), ...crimson.quaternion.toArray(), sword.rotation.x];
    arena.animate(8.45);
    expect(teal.position.length()).toBeLessThan(crimson.position.length());
    arena.animate(14.45);
    const replay = [...crimson.position.toArray(), ...crimson.quaternion.toArray(), sword.rotation.x];
    replay.forEach((value, index) => expect(value).toBeCloseTo(pose[index], 10));
    arena.animate(Number.NaN);
    expect([...crimson.position.toArray(), ...crimson.quaternion.toArray(), sword.rotation.x]).toEqual(replay);
    disposeObject(arena.group);
  });
});
