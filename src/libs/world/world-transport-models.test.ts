import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeObject } from '@/libs/world/world-geometry';
import { createWorldTransportModel } from '@/libs/world/world-transport-models';
import type { WorldRideableId } from '@/libs/world/world-types';

function resources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let meshes = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((surface) => materials.add(surface));
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
  });
  return { geometries, materials, meshes, triangles };
}

function visibleBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
  });
  return bounds;
}

describe('crafted transport models', () => {
  const models: THREE.Group[] = [];
  const create = (kind: WorldRideableId) => {
    const model = createWorldTransportModel(kind);
    models.push(model);
    return model;
  };

  afterEach(() => {
    models.splice(0).forEach(disposeObject);
    vi.restoreAllMocks();
  });

  it('keeps all five grounded props at avatar scale within a bounded geometry and draw budget', () => {
    const specifications = [
      { kind: 'skateboard', min: [0.5, 0.25, 1.7], max: [0.75, 0.5, 1.9] },
      { kind: 'jetpack', min: [0.75, 0.95, 0.4], max: [1.05, 1.2, 0.65] },
      { kind: 'kart', min: [1.55, 0.95, 2], max: [1.8, 1.3, 2.5] },
      { kind: 'bmx', min: [0.7, 1.55, 2], max: [0.85, 1.75, 2.2] },
      { kind: 'hoverboard', min: [0.69, 0.2, 1.55], max: [0.78, 0.3, 1.7] },
    ] as const;
    let totalDraws = 0;
    let totalTriangles = 0;
    for (const { kind, min, max } of specifications) {
      const model = create(kind);
      const bounds = visibleBounds(model);
      const size = bounds.getSize(new THREE.Vector3()).toArray();
      expect(model.name).toBe(`transport-${kind}`);
      expect(bounds.min.y, `${kind} rests on the floor`).toBeGreaterThanOrEqual(-0.006);
      expect(bounds.min.y, `${kind} rests on the floor`).toBeLessThan(0.035);
      size.forEach((value, axis) => {
        expect(value, `${kind} axis ${axis}`).toBeGreaterThan(min[axis]);
        expect(value, `${kind} axis ${axis}`).toBeLessThan(max[axis]);
      });
      const { geometries, materials, meshes, triangles } = resources(model);
      expect(meshes).toBeLessThanOrEqual(18);
      expect(triangles).toBeLessThan(32_000);
      expect(materials.size).toBeLessThanOrEqual(7);
      for (const geometry of geometries) {
        for (const name of ['position', 'normal']) {
          const attribute = geometry.getAttribute(name);
          expect(attribute.count).toBeGreaterThan(0);
          expect(attribute.array.every(Number.isFinite)).toBe(true);
        }
        expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
      }
      for (const material of materials) {
        expect(Object.values(material).some((value) => value instanceof THREE.Texture)).toBe(false);
      }
      totalDraws += meshes;
      totalTriangles += triangles;
    }
    expect(totalDraws).toBeLessThanOrEqual(70);
    expect(totalTriangles).toBeLessThan(95_000);
  });

  it.each(['skateboard', 'kart', 'bmx'] as const)(
    '%s wheels share buffers and can rotate around their own axles',
    (kind) => {
      const model = create(kind);
      const wheels = model.children.filter((object) => object.userData.transportAnimation === 'wheel');
      expect(wheels).toHaveLength(kind === 'bmx' ? 2 : 4);
      const prototype = resources(wheels[0]);
      for (const wheel of wheels) {
        expect(wheel.name).toMatch(/^wheel-/);
        expect(wheel.userData.rotationAxis).toBe('x');
        expect(wheel.position.y).toBe(wheel.userData.wheelRadius);
        const position = wheel.position.clone();
        wheel.rotation.x = Math.PI * 2.3;
        expect(wheel.position).toEqual(position);
        expect(resources(wheel).geometries).toEqual(prototype.geometries);
        expect(resources(wheel).materials).toEqual(prototype.materials);
      }
      expect(prototype.meshes).toBe(2);
    },
  );

  it('keeps BMX pedal platforms level and at the agreed rider contact points through a complete turn', () => {
    const model = create('bmx');
    const crank = model.getObjectByName('pedal-crank')!;
    const left = model.getObjectByName('pedal-left')!;
    const right = model.getObjectByName('pedal-right')!;
    expect(crank.position.toArray()).toEqual([0, 0.525, -0.117]);
    expect(model.userData.seatHeight).toBe(1.05);
    for (const phase of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      crank.rotation.x = phase;
      for (const [pedal, side] of [
        [left, -1],
        [right, 1],
      ] as const) {
        expect(pedal.parent).toBe(crank);
        expect(pedal.userData.transportAnimation).toBe('pedal-platform');
        pedal.rotation.x = -phase;
        model.updateMatrixWorld(true);
        const up = new THREE.Vector3(0, 1, 0).transformDirection(pedal.matrixWorld);
        expect(up.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-8);
        const expected = new THREE.Vector3(side * 0.207, side * 0.075, side * 0.12)
          .applyAxisAngle(new THREE.Vector3(1, 0, 0), phase)
          .add(crank.position);
        expect(pedal.getWorldPosition(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-8);
        const bounds = visibleBounds(pedal);
        expect(bounds.max.y - expected.y).toBeCloseTo(0.0235, 6);
        expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(expected.z, 6);
      }
    }
  });

  it('exposes steering grips and independently spinning recessed hoverboard fans', () => {
    const kart = create('kart');
    const steering = kart.getObjectByName('steering-wheel')!;
    expect(kart.userData.seatHeight).toBe(0.55);
    expect(steering.position.toArray()).toEqual([0, 1.04, 0.353]);
    const bmx = create('bmx');
    const bars = bmx.getObjectByName('handlebar')!;
    const grip = bars.localToWorld(new THREE.Vector3(0.325, 0.163, 0.076));
    expect(grip.x).toBeCloseTo(0.325);
    expect(grip.y).toBeCloseTo(1.6);
    expect(grip.z).toBeCloseTo(0.516);
    const board = create('hoverboard');
    const front = board.getObjectByName('rotor-front')!;
    const rear = board.getObjectByName('rotor-rear')!;
    expect(front.userData.rotationAxis).toBe('y');
    expect(front.position.toArray()).toEqual([0, 0.141, 0.5]);
    expect(rear.position.toArray()).toEqual([0, 0.141, -0.5]);
    expect(resources(front).geometries).toEqual(resources(rear).geometries);
    front.rotation.y = 1;
    expect(rear.rotation.y).toBe(0);
    expect(visibleBounds(front).max.y).toBeLessThan(0.188);
  });

  it('puts real deck, saddle and footrest surfaces beneath the agreed rider contact points', () => {
    const down = new THREE.Vector3(0, -1, 0);
    const samples = [
      {
        kind: 'skateboard',
        points: [
          [0.09, -0.31],
          [0.09, 0.31],
        ],
        sole: 0.285,
      },
      {
        kind: 'hoverboard',
        points: [
          [-0.183, 0.1],
          [0.183, 0.1],
        ],
        sole: 0.218,
      },
      {
        kind: 'kart',
        points: [
          [-0.165, 0.44],
          [0.165, 0.44],
        ],
        sole: 0.36,
      },
      { kind: 'kart', points: [[0, -0.272]], sole: 0.55 },
      { kind: 'bmx', points: [[0, -0.23]], sole: 1.056 },
    ] as const;
    for (const { kind, points, sole } of samples) {
      const model = create(kind);
      for (const [x, z] of points) {
        const hits = new THREE.Raycaster(new THREE.Vector3(x, sole + 0.04, z), down).intersectObject(model, true);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].point.y, `${kind} contact surface`).toBeCloseTo(sole, 1);
        expect(sole - hits[0].point.y).toBeGreaterThanOrEqual(-0.001);
        expect(sole - hits[0].point.y).toBeLessThan(0.011);
      }
    }
  });

  it('leaves jet exhaust hidden when parked and disposes shared visible and hidden GPU resources exactly once', () => {
    const model = create('jetpack');
    for (const name of ['left', 'right']) {
      const thruster = model.getObjectByName(`thruster-${name}`)!;
      const exhaust = model.getObjectByName(`exhaust-${name}`)!;
      expect(thruster.userData.transportAnimation).toBe('thruster');
      expect(exhaust.userData.transportAnimation).toBe('exhaust');
      expect(exhaust.visible).toBe(false);
      expect(exhaust.children).toHaveLength(3);
      exhaust.visible = true;
      expect(visibleBounds(exhaust).max.y).toBeCloseTo(0.017, 6);
      expect(visibleBounds(exhaust).min.y).toBeLessThan(-1.1);
      exhaust.visible = false;
    }
    const { geometries, materials } = resources(model);
    const disposers = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
    expect(geometries.size).toBeLessThan(resources(model).meshes);
    disposeObject(model);
    models.splice(models.indexOf(model), 1);
    disposers.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
  });
});
