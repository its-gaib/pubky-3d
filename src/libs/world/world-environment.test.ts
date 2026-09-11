import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorldBurning } from '@/libs/world/world-burning';
import { createCoastalNature, createPathFurniture } from '@/libs/world/world-environment';
import { disposeObject } from '@/libs/world/world-geometry';
import type { WorldObstacle } from '@/libs/world/world-motion';

describe('individually burnable environmental detail', () => {
  const scenes: THREE.Scene[] = [];
  const disposals: (() => void)[] = [];

  afterEach(() => {
    disposals.forEach((dispose) => dispose());
    scenes.forEach(disposeObject);
    scenes.length = 0;
    disposals.length = 0;
    vi.restoreAllMocks();
  });

  function environment() {
    const scene = new THREE.Scene();
    scenes.push(scene);
    const obstacles: WorldObstacle[] = [];
    const obstacle = (x: number, z: number, radius: number) => {
      const entry = { x, z, radius, enabled: true };
      obstacles.push(entry);
      return entry;
    };
    return { scene, obstacles, obstacle };
  }

  function batches(group: THREE.Object3D) {
    const result: THREE.InstancedMesh[] = [];
    group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) result.push(object);
    });
    return result;
  }

  function matrixAt(batch: THREE.InstancedMesh, index: number) {
    const matrix = new THREE.Matrix4();
    batch.getMatrixAt(index, matrix);
    return matrix;
  }

  it('keeps every plant/stone slot owned while preserving flower counts and seven shared batches', () => {
    const { scene, obstacle, obstacles } = environment();
    const nature = createCoastalNature(scene, [], obstacle);
    disposals.push(nature.dispose);
    const meshes = batches(nature.group);
    expect(meshes).toHaveLength(7);
    for (const name of ['160 meadow flowers', 'Wildflower stems', 'Wildflower centers'])
      expect(meshes.find((batch) => batch.name === name)!.count).toBe(160);
    const trunks = meshes.find((batch) => batch.name === 'Tapered coastal trunks')!;
    const grass = meshes.find((batch) => batch.name === 'Planted meadow grass')!;
    const stones = meshes.find((batch) => batch.name === 'Meadow stones')!;
    expect(trunks.count).toBe(obstacles.length);
    expect(trunks.count).toBeGreaterThan(30);
    expect(grass.count).toBeGreaterThan(500);
    expect(grass.count).toBeLessThanOrEqual(1700);
    expect(stones.count).toBeGreaterThan(100);
    expect(stones.count).toBeLessThanOrEqual(240);
    expect(new Set(nature.burnTargets.map((target) => target.id)).size).toBe(nature.burnTargets.length);
    expect(nature.burnTargets.filter((target) => target.id.startsWith('nature:flower:'))).toHaveLength(160);
    expect(nature.burnTargets.filter((target) => target.id.startsWith('nature:stone:'))).toHaveLength(stones.count);
    const counts = meshes.map((batch) => batch.count);
    const disposeGeometry = meshes.map((batch) => vi.spyOn(batch.geometry, 'dispose'));
    nature.burnTargets.forEach((target) => target.hide());
    for (const batch of meshes) {
      for (let index = 0; index < batch.count; index++) expect(matrixAt(batch, index).determinant()).toBeCloseTo(0, 12);
      expect(batch.visible).toBe(true);
    }
    expect(meshes.map((batch) => batch.count)).toEqual(counts);
    expect(nature.group.visible).toBe(true);
    expect(obstacles.every((entry) => entry.enabled === false)).toBe(true);
    disposeGeometry.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
  });

  it('hides all parts of one pine or flower while neighboring instances remain untouched', () => {
    const { scene, obstacle, obstacles } = environment();
    const nature = createCoastalNature(scene, [], obstacle);
    disposals.push(nature.dispose);
    const pine = nature.burnTargets.find((target) => target.id.startsWith('nature:pine:'))!;
    const flower = nature.burnTargets.find((target) => target.id === 'nature:flower:0')!;
    const selected = batches(nature.group).filter((batch) =>
      [
        'Tapered coastal trunks',
        'Layered pine boughs',
        '160 meadow flowers',
        'Wildflower stems',
        'Wildflower centers',
      ].includes(batch.name),
    );
    const neighbors = selected.map((batch) => matrixAt(batch, 1));
    pine.hide();
    flower.hide();
    selected.forEach((batch, index) => {
      expect(matrixAt(batch, 0).determinant()).toBe(0);
      expect(matrixAt(batch, 1).equals(neighbors[index])).toBe(true);
    });
    expect(obstacles[0].enabled).toBe(false);
    expect(obstacles[1].enabled).toBe(true);
  });

  it('uses stable nature identities across regeneration and keeps structural ground outside the adapters', () => {
    const { scene, obstacle } = environment();
    const first = createCoastalNature(scene, [], obstacle);
    const second = createCoastalNature(scene, [], obstacle);
    disposals.push(first.dispose, second.dispose);
    expect(first.burnTargets.map((target) => target.id)).toEqual(second.burnTargets.map((target) => target.id));
    const ledger = new Set(
      first.burnTargets.filter((target) => target.id.startsWith('nature:grass:')).map((target) => target.id),
    );
    const burning = createWorldBurning({ ledger });
    second.burnTargets.forEach((target) => burning.bind(target));
    const grass = batches(second.group).find((batch) => batch.name === 'Planted meadow grass')!;
    for (let index = 0; index < grass.count; index++) expect(matrixAt(grass, index).determinant()).toBeCloseTo(0, 12);
    const flower = batches(second.group).find((batch) => batch.name === '160 meadow flowers')!;
    expect(matrixAt(flower, 0).determinant()).toBeGreaterThan(0);
    expect(second.group.visible).toBe(true);
    burning.dispose();
  });

  it('uses three detailed lamp batches and removes one entire fixture with its exact collision', () => {
    const { scene, obstacle, obstacles } = environment();
    const paths = Array.from({ length: 181 }, (_, index) => new THREE.Vector3(index - 90, 0, 145));
    const lamps = createPathFurniture(scene, paths, obstacle);
    disposals.push(lamps.dispose);
    const meshes = batches(lamps.group);
    expect(meshes).toHaveLength(3);
    expect(lamps.burnTargets.length).toBeGreaterThan(5);
    expect(obstacles).toHaveLength(lamps.burnTargets.length);
    expect(meshes.every((batch) => batch.count === obstacles.length)).toBe(true);
    const base = meshes.find((batch) => batch.name.endsWith('stone'))!;
    const metal = meshes.find((batch) => batch.name.endsWith('metal'))!;
    const lenses = meshes.find((batch) => batch.name === 'Warm lamp lenses')!;
    expect(base.geometry.hasAttribute('color')).toBe(true);
    expect(metal.geometry.hasAttribute('color')).toBe(true);
    const bounds = new THREE.Box3();
    lamps.burnTargets[0].getBounds(bounds);
    expect(bounds.min.x).toBeCloseTo(obstacles[0].x - 0.36, 5);
    expect(bounds.max.x).toBeCloseTo(obstacles[0].x + 0.36, 5);
    expect(bounds.min.y).toBeCloseTo(0.025, 5);
    expect(bounds.max.y).toBeCloseTo(0.96, 5);
    const glass = lenses.material as THREE.MeshStandardMaterial;
    lamps.setNight(true);
    expect(glass.emissiveIntensity).toBe(1.8);
    const neighbors = meshes.map((batch) => matrixAt(batch, 1));
    lamps.burnTargets[0].hide();
    meshes.forEach((batch, index) => {
      expect(matrixAt(batch, 0).determinant()).toBe(0);
      expect(matrixAt(batch, 1).equals(neighbors[index])).toBe(true);
      expect(batch.count).toBe(obstacles.length);
    });
    expect(obstacles[0].enabled).toBe(false);
    expect(obstacles[1].enabled).toBe(true);
    lamps.setNight(false);
    expect(glass.emissiveIntensity).toBe(0.65);
  });
});
