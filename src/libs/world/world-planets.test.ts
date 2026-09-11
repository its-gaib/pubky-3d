import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WORLD_DIMENSIONS } from '@/libs/world/world-layout';
import { createWorldPlanets, WORLD_PLANET_ENVELOPE, WORLD_PLANETS } from './world-planets';

function meshes(group: THREE.Group) {
  const result: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) result.push(object);
  });
  return result;
}

describe('seven world-space planets', () => {
  it('puts complete bodies and rings outside the expanded coast at clearly different depths', () => {
    expect(WORLD_PLANETS).toHaveLength(7);
    expect(WORLD_PLANETS.filter((planet) => planet.ring)).toHaveLength(3);
    expect(new Set(WORLD_PLANETS.map((planet) => planet.surface)).size).toBe(7);
    const distances = WORLD_PLANETS.map((planet) => Math.hypot(planet.position[0], planet.position[2]));
    expect(Math.max(...distances) - Math.min(...distances)).toBeGreaterThan(WORLD_DIMENSIONS.coastRadius);
    const heights = WORLD_PLANETS.map((planet) => planet.position[1]);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(WORLD_DIMENSIONS.coastRadius * 0.5);
    expect(heights.filter((height) => height < WORLD_DIMENSIONS.coastRadius * 0.4)).toHaveLength(5);
    for (const planet of WORLD_PLANETS) {
      expect(Math.hypot(planet.position[0], planet.position[2]) - planet.extent).toBeGreaterThan(
        WORLD_DIMENSIONS.coastRadius + 12,
      );
      expect(planet.position[1] - planet.extent).toBeGreaterThan(4);
      expect(Math.hypot(...planet.position) + planet.extent).toBeLessThanOrEqual(WORLD_PLANET_ENVELOPE);
    }
  });

  it('renders varied solid geometry with correctly bounded tilted rings and a modest fixed resource count', () => {
    const scene = new THREE.Scene();
    const planets = createWorldPlanets(scene);
    expect(planets.group.children).toHaveLength(7);
    const objects = meshes(planets.group);
    expect(objects).toHaveLength(13);
    expect(new Set(objects.map((object) => object.geometry.type)).size).toBeGreaterThanOrEqual(4);
    expect(objects.reduce((total, object) => total + object.geometry.getAttribute('position').count, 0)).toBeLessThan(
      25_000,
    );
    planets.group.updateMatrixWorld(true);
    const point = new THREE.Vector3();
    for (const object of objects) {
      expect(object.castShadow).toBe(false);
      expect(object.receiveShadow).toBe(false);
      expect((object.material as THREE.MeshBasicMaterial).fog).toBe(false);
      const vertices = object.geometry.getAttribute('position');
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        point.fromBufferAttribute(vertices, vertex).applyMatrix4(object.matrixWorld);
        expect(Math.hypot(point.x, point.z)).toBeGreaterThan(WORLD_DIMENSIONS.coastRadius + 12);
        expect(point.y).toBeGreaterThan(4);
        expect(point.length()).toBeLessThanOrEqual(WORLD_PLANET_ENVELOPE);
      }
    }
    planets.dispose();
  });

  it('paints bounded seamless surfaces with separate weather and lava emission', () => {
    const planets = createWorldPlanets(new THREE.Scene());
    const objects = meshes(planets.group);
    const textures = new Set<THREE.DataTexture>();
    for (const object of objects) {
      const material = object.material as THREE.MeshStandardMaterial;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.DataTexture) textures.add(value);
      }
      if (!object.name.endsWith(' body')) continue;
      expect(material.map).toBeInstanceOf(THREE.DataTexture);
      expect(material.bumpMap).toBe(material.roughnessMap);
      const surface = material.map as THREE.DataTexture;
      expect(surface.image.width).toBeGreaterThanOrEqual(512);
      expect(surface.image.width).toBeLessThanOrEqual(1024);
      expect(surface.image.width).toBe(surface.image.height * 2);
      expect(surface.generateMipmaps).toBe(true);
      const { data, width, height } = surface.image;
      for (let row = 0; row < height; row++) {
        for (let channel = 0; channel < 3; channel++) {
          expect(
            Math.abs(data[row * width * 4 + channel] - data[(row * width + width - 1) * 4 + channel]),
          ).toBeLessThanOrEqual(1);
        }
      }
    }
    expect([...textures].reduce((total, value) => total + value.image.data.byteLength, 0)).toBeLessThan(17_000_000);
    const ocean = objects.find((object) => object.name === 'Cobalt garden cloud layer')!;
    expect((ocean.material as THREE.MeshStandardMaterial).transparent).toBe(true);
    const ember = objects.find((object) => object.name === 'Ember body')!;
    expect((ember.material as THREE.MeshStandardMaterial).emissiveMap).toBeInstanceOf(THREE.DataTexture);
    planets.dispose();
  });

  it('holds positions fixed, freezes reduced motion and resumes without wall-clock jumps', () => {
    const scene = new THREE.Scene();
    const actual = createWorldPlanets(scene);
    const control = createWorldPlanets(scene);
    const state = (group: THREE.Group) =>
      meshes(group).map((object) => [...object.position.toArray(), ...object.rotation.toArray()]);
    const centers = actual.group.children.map((system) => system.position.toArray());
    const initial = state(actual.group);
    actual.animate(1, 0.02);
    control.animate(50_000, 0.02);
    expect(state(actual.group)).not.toEqual(initial);
    expect(state(actual.group)).toEqual(state(control.group));
    const frozen = state(actual.group);
    actual.animate(80_000, 10, true);
    actual.animate(90_000, Number.NaN);
    actual.animate(90_000, -1);
    expect(state(actual.group)).toEqual(frozen);
    actual.animate(100_000, 500);
    control.animate(1, 0.05);
    expect(state(actual.group)).toEqual(state(control.group));
    expect(actual.group.children.map((system) => system.position.toArray())).toEqual(centers);
    actual.dispose();
    control.dispose();
  });

  it('keeps resources fixed throughout animation and releases shared resources exactly once', () => {
    const scene = new THREE.Scene();
    const planets = createWorldPlanets(scene);
    const objects = meshes(planets.group);
    const identities = objects.map((object) => [object, object.geometry, object.material]);
    const geometries = new Set(objects.map((object) => object.geometry));
    const materials = new Set(objects.map((object) => object.material));
    const textures = new Set<THREE.Texture>();
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
    });
    const versions = [...textures].map((value) => value.version);
    const disposals = [...geometries, ...materials, ...textures].map((resource) => vi.spyOn(resource, 'dispose'));
    for (let frame = 0; frame < 1_000; frame++) planets.animate(frame, 0.03);
    expect(meshes(planets.group).map((object) => [object, object.geometry, object.material])).toEqual(identities);
    expect([...textures].map((value) => value.version)).toEqual(versions);
    planets.dispose();
    planets.dispose();
    planets.animate(10_000, 0.05);
    expect(scene.children).toEqual([]);
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
