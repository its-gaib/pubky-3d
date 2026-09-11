import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disposeObject } from '@/libs/world/world-geometry';
import { createHotSauce, HOT_SAUCE_HEIGHT, HOT_SAUCE_POSITION, HOT_SAUCE_RADIUS } from '@/libs/world/world-hot-sauce';
import { WORLD_ANCHORS, WORLD_RADIUS } from '@/libs/world/world-layout';
import { asOpaque } from '@/test-utils/type-assertions';

describe('Bitkit giant chili monument', () => {
  const scenes: THREE.Scene[] = [];
  let lettering: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    lettering = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      asOpaque<CanvasRenderingContext2D>({
        fillRect: vi.fn(),
        fillText: lettering,
      }),
    );
  });

  afterEach(() => {
    scenes.forEach((scene) => disposeObject(scene));
    scenes.length = 0;
    vi.restoreAllMocks();
  });

  function build() {
    const scene = new THREE.Scene();
    scenes.push(scene);
    const register = vi.fn();
    const obstacle = vi.fn();
    const { group } = createHotSauce(scene, register, obstacle);
    scene.updateMatrixWorld(true);
    const body = group.getObjectByName('hot-sauce-lobed-red-chili') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshPhysicalMaterial
    >;
    const sculpture = group.getObjectByName('hot-sauce-grounded-chili')!;
    return { scene, group, register, obstacle, body, sculpture };
  }

  it('keeps the northwest landmark and its low plaque reachable from the inward path', () => {
    const { group, register, obstacle } = build();
    const plaque = group.getObjectByName('BITKIT HOT SAUCE plaque')!;
    expect(group.position.toArray()).toEqual([-108, 0, -103]);
    expect(register).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenCalledWith(group, { kind: 'fun', id: 'hot-sauce' }, 'BITKIT HOT SAUCE');
    expect(register).toHaveBeenCalledWith(plaque, { kind: 'fun', id: 'hot-sauce' }, 'BITKIT HOT SAUCE');
    expect(obstacle).toHaveBeenCalledExactlyOnceWith(...HOT_SAUCE_POSITION, HOT_SAUCE_RADIUS);
    const plaquePosition = plaque.getWorldPosition(new THREE.Vector3());
    const inward = new THREE.Vector3(-HOT_SAUCE_POSITION[0], 0, -HOT_SAUCE_POSITION[1]).normalize();
    const approach = group.position.clone().addScaledVector(inward, HOT_SAUCE_RADIUS + 1.5);
    expect(approach.distanceTo(group.position)).toBeGreaterThan(HOT_SAUCE_RADIUS);
    expect(approach.distanceTo(group.position)).toBeGreaterThan(7);
    expect(approach.distanceTo(plaquePosition)).toBeLessThan(7);
    const plaqueNormal = plaque.getWorldDirection(new THREE.Vector3());
    expect(plaqueNormal.dot(inward)).toBeGreaterThan(0.5);
    expect(plaqueNormal.y).toBeGreaterThan(0.8);
    expect(new THREE.Box3().setFromObject(group.getObjectByName('hot-sauce-ground-plaque')!, true).max.y).toBeLessThan(
      1,
    );
    expect(Math.hypot(...HOT_SAUCE_POSITION) + HOT_SAUCE_RADIUS + 8).toBeLessThan(WORLD_RADIUS);
    for (const neighbor of [WORLD_ANCHORS.bitkit, WORLD_ANCHORS.cinema])
      expect(Math.hypot(HOT_SAUCE_POSITION[0] - neighbor[0], HOT_SAUCE_POSITION[1] - neighbor[1])).toBeGreaterThan(190);
  });

  it('rests the complete building-length chili on the ground within a centered drive-around footprint', () => {
    const { group, body, sculpture } = build();
    const bounds = new THREE.Box3().setFromObject(sculpture, true);
    const size = bounds.getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.z)).toBeGreaterThan(34);
    expect(size.y).toBeGreaterThan(9);
    expect(bounds.max.y).toBeLessThan(HOT_SAUCE_HEIGHT);
    expect(bounds.min.y).toBeCloseTo(0, 8);
    expect(new THREE.Box3().setFromObject(body, true).min.y).toBeCloseTo(0, 8);
    const center = bounds.getCenter(new THREE.Vector3());
    expect(center.x).toBeCloseTo(group.position.x, 8);
    expect(center.z).toBeCloseTo(group.position.z, 8);
    expect(group.getObjectByName('hot-sauce-textured-basalt-pedestal')).toBeUndefined();
    const point = new THREE.Vector3();
    let farthest = 0;
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const positions = object.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).sub(group.position);
        farthest = Math.max(farthest, Math.hypot(point.x, point.z));
      }
    });
    expect(farthest).toBeLessThanOrEqual(HOT_SAUCE_RADIUS);
  });

  it('preserves the hooked silhouette and rotates all detailed red and green parts together', () => {
    const { group, body, sculpture } = build();
    const positions = body.geometry.getAttribute('position');
    const shoulders: number[] = [];
    const lowerBody: number[] = [];
    let lowest = Infinity;
    let hookedTip = Infinity;
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      lowest = Math.min(lowest, y);
      if (Math.abs(y - 21) < 0.35) shoulders.push(x);
      if (Math.abs(y - 7) < 0.35) lowerBody.push(x);
      if (x < -8.3) hookedTip = Math.min(hookedTip, y);
    }
    expect(shoulders.length).toBeGreaterThan(16);
    expect(lowerBody.length).toBeGreaterThan(16);
    expect(Math.max(...shoulders) - Math.min(...shoulders)).toBeGreaterThan(9);
    expect(Math.max(...lowerBody) - Math.min(...lowerBody)).toBeLessThan(5);
    expect(hookedTip - lowest).toBeGreaterThan(1);
    for (const name of [
      'hot-sauce-six-pointed-green-calyx',
      'hot-sauce-curved-green-stem',
      'hot-sauce-ground-plaque-base',
      'BITKIT HOT SAUCE plaque',
    ])
      expect(group.getObjectByName(name)).toBeInstanceOf(THREE.Mesh);
    expect(lettering).toHaveBeenCalledExactlyOnceWith('BITKIT HOT SAUCE', 768, 102, 1456);
    expect(group.children.some((object) => object instanceof THREE.Sprite)).toBe(false);
    expect(body.parent).toBe(sculpture);
    expect(group.getObjectByName('hot-sauce-curved-green-stem')!.parent).toBe(sculpture);
    expect(group.getObjectByName('hot-sauce-six-pointed-green-calyx')!.parent).toBe(sculpture);
    const aim = new THREE.Box3().setFromObject(body, true).getCenter(new THREE.Vector3());
    aim.y = HOT_SAUCE_HEIGHT + 5;
    const ray = new THREE.Raycaster(aim, new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(body).length).toBeGreaterThan(0);
  });

  it('uses glossy skin, shared green materials, and bounded local surface maps', () => {
    const { group, body } = build();
    const stem = group.getObjectByName('hot-sauce-curved-green-stem') as THREE.Mesh;
    const calyx = group.getObjectByName('hot-sauce-six-pointed-green-calyx') as THREE.Mesh;
    const base = group.getObjectByName('hot-sauce-ground-plaque-base') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshStandardMaterial
    >;
    expect(body.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(body.material.clearcoat).toBeGreaterThan(0.6);
    expect(body.material.roughness).toBeLessThan(0.4);
    expect(body.material.vertexColors).toBe(true);
    expect(body.material.bumpMap).toBe(body.material.roughnessMap);
    expect(body.material.bumpMap).toBeInstanceOf(THREE.DataTexture);
    expect(stem.material).toBe(calyx.material);
    expect(base.material.map).toBe(base.material.bumpMap);
    expect(base.material.bumpMap!.image.width).toBe(128);
    expect(base.material.bumpMap!.image.height).toBe(128);
    expect(body.castShadow && body.receiveShadow && base.receiveShadow).toBe(true);
  });

  it('keeps geometry finite and rendering inside a fixed static budget', () => {
    const { group } = build();
    let meshes = 0;
    let triangles = 0;
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes++;
      const positions = object.geometry.getAttribute('position');
      triangles += (object.geometry.index?.count ?? positions.count) / 3;
      for (const attribute of Object.values(object.geometry.attributes)) {
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      }
      if (object.geometry.index)
        expect(Array.from(object.geometry.index.array).every((index) => index >= 0 && index < positions.count)).toBe(
          true,
        );
      expect(object.position.toArray().every(Number.isFinite)).toBe(true);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    expect(meshes).toBeLessThanOrEqual(7);
    expect(triangles).toBeLessThan(22_000);
    expect(materials.size).toBeLessThanOrEqual(5);
    expect(textures.size).toBe(3);
    for (const texture of textures) {
      expect(texture.image.width).toBeLessThanOrEqual(1536);
      expect(texture.image.height).toBeLessThanOrEqual(192);
    }
  });

  it('releases every shared geometry, material and texture exactly once through scene ownership', () => {
    const { scene, group } = build();
    const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        resources.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
      }
    });
    const disposals = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
    disposeObject(group);
    expect(scene.children).not.toContain(group);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledOnce();
  });
});
