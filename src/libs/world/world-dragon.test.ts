import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  animateWorldDragon,
  createWorldDragonModel,
  type DragonAnimationState,
  getWorldDragonMouth,
} from '@/libs/world/world-dragon';
import { disposeObject } from '@/libs/world/world-geometry';

function bounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    const point = new THREE.Vector3();
    for (let index = 0; index < positions.count; index++) {
      box.expandByPoint(point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld));
    }
  });
  return box;
}

function resources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let meshes = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      materials.add(material);
  });
  return { geometries, materials, meshes, triangles };
}

const sleep: DragonAnimationState = {
  mounted: false,
  airborne: false,
  speed: 0,
  seconds: 0.05,
  time: 0,
  reducedMotion: true,
};

function snapshot(root: THREE.Object3D) {
  const values: number[] = [];
  root.traverse((object) =>
    values.push(
      ...object.position.toArray(),
      ...object.quaternion.toArray(),
      ...object.scale.toArray(),
      Number(object.visible),
    ),
  );
  return values;
}

describe('sleeping rideable dragon', () => {
  const models: THREE.Group[] = [];
  const create = () => {
    const model = createWorldDragonModel();
    models.push(model);
    return model;
  };

  afterEach(() => {
    models.splice(0).forEach(disposeObject);
    vi.restoreAllMocks();
  });

  it('rests above the floor with closed eyes, unfolds to flight and restores its sleeping footprint', () => {
    const dragon = create();
    const asleep = bounds(dragon);
    expect(dragon.userData.dragonSleeping).toBe(true);
    expect(dragon.getObjectByName('dragon-open-eyes')!.visible).toBe(false);
    expect(dragon.getObjectByName('dragon-sleeping-eyelids')!.visible).toBe(true);
    expect(asleep.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(asleep.min.y).toBeLessThan(0.07);
    expect(asleep.getSize(new THREE.Vector3()).x).toBeLessThan(4.5);
    let parkedRadius = 0;
    dragon.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const attribute = object.geometry.getAttribute('position');
      const point = new THREE.Vector3();
      for (let index = 0; index < attribute.count; index++) {
        point.fromBufferAttribute(attribute, index).applyMatrix4(object.matrixWorld);
        parkedRadius = Math.max(parkedRadius, Math.hypot(point.x, point.z));
      }
    });
    expect(parkedRadius).toBeLessThan(4.1);
    const saddle = dragon.getObjectByName('dragon-saddle')!.getWorldPosition(new THREE.Vector3());
    const neck = dragon.getObjectByName('dragon-neck')!.rotation.x;
    animateWorldDragon(dragon, { ...sleep, mounted: true, airborne: true, speed: 25 });
    const flying = bounds(dragon);
    expect(dragon.getObjectByName('dragon-open-eyes')!.visible).toBe(true);
    expect(dragon.getObjectByName('dragon-sleeping-eyelids')!.visible).toBe(false);
    expect(dragon.getObjectByName('dragon-neck')!.rotation.x).toBeLessThan(neck - 0.8);
    expect(flying.getSize(new THREE.Vector3()).x).toBeGreaterThan(8);
    expect(flying.max.y).toBeLessThan(4.5);
    expect(dragon.getObjectByName('dragon-saddle')!.getWorldPosition(new THREE.Vector3())).toEqual(saddle);
    animateWorldDragon(dragon, sleep);
    expect(bounds(dragon).equals(asleep)).toBe(true);
  });

  it('keeps reduced-motion sleep and flight still while normal flight articulates the wings', () => {
    const dragon = create();
    animateWorldDragon(dragon, sleep);
    const resting = snapshot(dragon);
    animateWorldDragon(dragon, { ...sleep, time: 847 });
    expect(snapshot(dragon)).toEqual(resting);
    const flight = { ...sleep, mounted: true, airborne: true, speed: 18 };
    animateWorldDragon(dragon, flight);
    const stillFlight = snapshot(dragon);
    animateWorldDragon(dragon, { ...flight, time: 962 });
    expect(snapshot(dragon)).toEqual(stillFlight);
    const wing = dragon.getObjectByName('dragon-wing-left')!;
    const angle = wing.rotation.z;
    animateWorldDragon(dragon, { ...flight, reducedMotion: false, time: 0.4 });
    expect(Math.abs(wing.rotation.z - angle)).toBeGreaterThan(0.2);
    expect(bounds(dragon).max.y).toBeLessThan(4.5);
    animateWorldDragon(dragon, { ...sleep, mounted: true });
    for (let sample = 0; sample < 12; sample++) {
      animateWorldDragon(dragon, { ...sleep, mounted: true, reducedMotion: false, speed: 12, time: sample * 0.16 });
      expect(bounds(dragon).min.y, 'walking paws stay above the ground').toBeGreaterThanOrEqual(-0.005);
    }
    animateWorldDragon(dragon, { ...flight, seconds: Number.NaN, time: Number.NaN, speed: Number.POSITIVE_INFINITY });
    expect(snapshot(dragon).every(Number.isFinite)).toBe(true);
  });

  it('provides physical saddle and stirrup surfaces at the rider contact points', () => {
    const dragon = create();
    animateWorldDragon(dragon, { ...sleep, mounted: true });
    dragon.updateMatrixWorld(true);
    const down = new THREE.Vector3(0, -1, 0);
    const points = [dragon.userData.riderSeat, ...dragon.userData.riderFootrests] as number[][];
    for (const [x, y, z] of points) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y + 0.025, z), down);
      const intersection = ray.intersectObject(dragon, true)[0];
      expect(intersection).toBeDefined();
      expect(
        y - intersection.point.y,
        `contact ${x}, ${y}, ${z}: surface ${intersection.point.y}`,
      ).toBeGreaterThanOrEqual(-0.005);
      expect(y - intersection.point.y).toBeLessThan(0.018);
    }
    expect(dragon.userData.riderGrips).toEqual([
      [-0.3, 2.05, 0.5],
      [0.3, 2.05, 0.5],
    ]);
  });

  it('keeps the fire nozzle attached to the waking head and rider roll', () => {
    const dragon = create();
    const mouth = getWorldDragonMouth(dragon)!;
    expect(mouth.name).toBe('dragon-mouth-emitter');
    const sleepingHeight = mouth.getWorldPosition(new THREE.Vector3()).y;
    animateWorldDragon(dragon, { ...sleep, mounted: true, airborne: true });
    expect(mouth.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(sleepingHeight + 1.5);
    const closed = mouth.getWorldDirection(new THREE.Vector3());
    animateWorldDragon(dragon, { ...sleep, mounted: true, airborne: true, breathingFire: true });
    expect(dragon.getObjectByName('dragon-lower-jaw')!.rotation.x).toBeGreaterThan(0.3);
    expect(mouth.getWorldDirection(new THREE.Vector3()).distanceTo(closed)).toBeGreaterThan(0.25);
    dragon.rotation.z = Math.PI / 3;
    dragon.position.set(12, 25, -7);
    dragon.updateMatrixWorld(true);
    const expected = new THREE.Vector3(0, 0, 1).applyQuaternion(
      mouth.parent!.getWorldQuaternion(new THREE.Quaternion()),
    );
    expect(mouth.getWorldDirection(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-8);
    expect(mouth.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(25);
    expect(getWorldDragonMouth(new THREE.Group())).toBeNull();
  });

  it('batches detailed geometry into a bounded draw budget and disposes every shared GPU resource once', () => {
    const dragon = create();
    const { geometries, materials, meshes, triangles } = resources(dragon);
    expect(meshes).toBeLessThanOrEqual(34);
    expect(triangles).toBeLessThan(45_000);
    expect(materials.size).toBeLessThanOrEqual(5);
    expect(materials.size).toBeLessThan(meshes);
    for (const geometry of geometries) {
      for (const key of ['position', 'normal', 'uv']) {
        expect(geometry.getAttribute(key).array.every(Number.isFinite)).toBe(true);
      }
      expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
    }
    for (const material of materials) {
      expect(Object.values(material).some((value) => value instanceof THREE.Texture)).toBe(false);
    }
    const dispose = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
    disposeObject(dragon);
    models.splice(models.indexOf(dragon), 1);
    dispose.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
  });
});
