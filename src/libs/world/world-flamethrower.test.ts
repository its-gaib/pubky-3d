import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWorldFlamethrower,
  createWorldFlamethrowerModel,
  FLAMETHROWER_GRIPS,
  FLAMETHROWER_MUZZLE,
  FLAMETHROWER_PICKUP_DISTANCE,
  FLAMETHROWER_POSITION,
  type WorldToolAction,
} from '@/libs/world/world-flamethrower';
import { disposeObject } from '@/libs/world/world-geometry';
import { PERSONA_RADIUS, WORLD_RADIUS, type WorldObstacle } from '@/libs/world/world-motion';

function resources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let meshes = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) =>
      materials.add(material),
    );
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
  });
  return { geometries, materials, meshes, triangles };
}

describe('discoverable flamethrower', () => {
  const roots: THREE.Object3D[] = [];
  const controllers: ReturnType<typeof createWorldFlamethrower>[] = [];

  function create(existing: WorldObstacle[] = []) {
    const scene = new THREE.Scene();
    const player = { group: new THREE.Group(), toolMount: new THREE.Group() };
    player.group.add(player.toolMount);
    scene.add(player.group);
    const obstacles = [...existing];
    const register = vi.fn<(object: THREE.Object3D, action: WorldToolAction, title: string) => void>();
    const tool = createWorldFlamethrower(scene, player, register, obstacles);
    roots.push(scene);
    controllers.push(tool);
    const equip = () => {
      player.group.position.copy(tool.model.position);
      return tool.equip();
    };
    return { scene, player, obstacles, register, tool, equip };
  }

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.dispose());
    roots.splice(0).forEach(disposeObject);
    vi.restoreAllMocks();
  });

  it('keeps the detailed two-hand prop grounded with finite shared geometry and a bounded draw budget', () => {
    const model = createWorldFlamethrowerModel();
    roots.push(model);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.005);
    expect(bounds.min.y).toBeLessThan(0.02);
    expect(size.y).toBeGreaterThan(1.6);
    expect(size.y).toBeLessThan(1.85);
    expect(size.z).toBeGreaterThan(1.6);
    expect(size.z).toBeLessThan(2);
    expect(model.getObjectByName('flamethrower-stand')).toBeDefined();
    expect(model.getObjectByName('flamethrower-muzzle')!.position.toArray()).toEqual(FLAMETHROWER_MUZZLE);
    expect(FLAMETHROWER_GRIPS).toEqual({ right: [0.3, 1.4, 0.35], left: [-0.25, 1.45, 0.75] });
    const { geometries, materials, meshes, triangles } = resources(model);
    expect(meshes).toBeLessThanOrEqual(16);
    expect(triangles).toBeLessThan(24_000);
    expect(materials.size).toBeLessThanOrEqual(6);
    expect(geometries.size).toBe(meshes);
    for (const geometry of geometries) {
      for (const name of ['position', 'normal', 'color']) {
        const attribute = geometry.getAttribute(name);
        expect(attribute.count).toBeGreaterThan(0);
        expect(attribute.array.every(Number.isFinite)).toBe(true);
      }
      expect(geometry.boundingSphere?.radius).toBeGreaterThan(0);
    }
    for (const material of materials) {
      expect(Object.values(material).some((value) => value instanceof THREE.Texture)).toBe(false);
    }
  });

  it('registers one nearby discovery and keeps its own collision slot clear of existing obstacles', () => {
    const existing: WorldObstacle = { x: FLAMETHROWER_POSITION[0], z: FLAMETHROWER_POSITION[1], radius: 2 };
    const { scene, tool, obstacles, register } = create([existing]);
    expect(obstacles).toHaveLength(2);
    expect(obstacles[0]).toBe(existing);
    expect(obstacles[1]).toBe(tool.obstacle);
    expect(tool.model.parent).toBe(scene);
    expect(register).toHaveBeenCalledExactlyOnceWith(
      tool.model,
      { kind: 'tool', id: 'flamethrower' },
      'Equip flamethrower',
    );
    expect(Math.hypot(tool.model.position.x - existing.x, tool.model.position.z - existing.z)).toBeGreaterThan(
      existing.radius + tool.obstacle.radius,
    );
    expect(tool.obstacle).toMatchObject({ x: tool.model.position.x, z: tool.model.position.z, radius: 0.6 });
    expect(tool.obstacle.height).toBeGreaterThanOrEqual(new THREE.Box3().setFromObject(tool.model).max.y);
  });

  it('equips only from nearby ground and reuses the existing model under the player floor anchor', () => {
    const { scene, player, tool, obstacles } = create();
    expect(tool.equip()).toBe(false);
    expect(tool.isAvailable()).toBe(false);
    player.group.position.copy(tool.model.position);
    player.group.position.y = 1;
    expect(tool.equip()).toBe(false);
    player.group.position.y = 0.15;
    player.group.position.x += FLAMETHROWER_PICKUP_DISTANCE + 0.01;
    expect(tool.equip()).toBe(false);
    player.group.position.x -= 0.02;
    const before = player.group.position.clone();
    expect(tool.isAvailable()).toBe(true);
    expect(tool.equip()).toBe(true);
    expect(tool.active).toBe(true);
    expect(tool.equipped).toBe(true);
    expect(tool.equip()).toBe(false);
    expect(tool.isAvailable()).toBe(false);
    expect(tool.model.parent).toBe(player.toolMount);
    expect(tool.model.position.toArray()).toEqual([0, 0, 0]);
    expect(tool.model.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(tool.model.getObjectByName('flamethrower-stand')!.visible).toBe(false);
    expect(tool.obstacle.enabled).toBe(false);
    expect(player.group.position).toEqual(before);
    expect(obstacles).toHaveLength(1);
    expect(scene.children).toContain(player.group);
  });

  it('projects the muzzle and its direction from the latest player transform without a renderer tick', () => {
    const { tool, player, equip } = create();
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    expect(tool.getNozzle(origin, direction)).toBe(false);
    expect(equip()).toBe(true);
    player.group.position.set(3, 0.15, 7);
    player.group.rotation.y = Math.PI / 2;
    expect(tool.getNozzle(origin, direction)).toBe(true);
    expect(origin.x).toBeCloseTo(4.74, 6);
    expect(origin.y).toBeCloseTo(1.57, 6);
    expect(origin.z).toBeCloseTo(6.88, 6);
    expect(direction.x).toBeCloseTo(1, 6);
    expect(direction.y).toBeCloseTo(0, 6);
    expect(direction.z).toBeCloseTo(0, 6);
    player.group.rotation.y = Math.PI;
    player.group.position.x = 9;
    expect(tool.getNozzle(origin, direction)).toBe(true);
    expect(origin.x).toBeCloseTo(8.88, 6);
    expect(origin.z).toBeCloseTo(5.26, 6);
    expect(direction.z).toBeCloseTo(-1, 6);
    expect(direction.length()).toBeCloseTo(1, 6);
  });

  it('gates firing on held availability and clears fire immediately on input cleanup, drop and burn availability changes', () => {
    const { tool, equip } = create();
    tool.setFiring(true);
    expect(tool.isFiring).toBe(false);
    expect(equip()).toBe(true);
    tool.setFiring(true);
    expect(tool.isFiring).toBe(true);
    tool.clearInput();
    expect(tool.isFiring).toBe(false);
    tool.setFiring(true);
    tool.setAvailable(false);
    expect(tool.isFiring).toBe(false);
    tool.setFiring(true);
    expect(tool.isFiring).toBe(false);
    expect(tool.getNozzle(new THREE.Vector3(), new THREE.Vector3())).toBe(false);
    expect(tool.drop()).toBe(true);
    expect(tool.obstacle.enabled).toBe(false);
    expect(tool.isAvailable()).toBe(false);
    expect(tool.equip()).toBe(false);
    tool.setAvailable(true);
    expect(tool.equip()).toBe(true);
    tool.setFiring(true);
    expect(tool.drop()).toBe(true);
    expect(tool.isFiring).toBe(false);
  });

  it('chooses a clear drop side and reuses the same resources and obstacle across repeated equip and drop cycles', () => {
    const { scene, player, tool, obstacles, equip } = create();
    expect(equip()).toBe(true);
    const blocker: WorldObstacle = { x: player.group.position.x, z: player.group.position.z + 1.9, radius: 0.8 };
    obstacles.push(blocker);
    const original = resources(tool.model);
    const slot = tool.obstacle;
    const playerPosition = player.group.position.clone();
    for (let cycle = 0; cycle < 6; cycle++) {
      expect(tool.drop()).toBe(true);
      expect(tool.model.parent).toBe(scene);
      expect(tool.model.getObjectByName('flamethrower-stand')!.visible).toBe(true);
      expect(tool.obstacle).toBe(slot);
      expect(slot.enabled).toBe(true);
      expect(Math.hypot(slot.x - blocker.x, slot.z - blocker.z)).toBeGreaterThanOrEqual(slot.radius + blocker.radius);
      expect(Math.hypot(slot.x - playerPosition.x, slot.z - playerPosition.z)).toBeGreaterThan(
        PERSONA_RADIUS + slot.radius,
      );
      expect(player.group.position).toEqual(playerPosition);
      expect(resources(tool.model)).toEqual(original);
      expect(obstacles).toHaveLength(2);
      expect(tool.equip()).toBe(true);
    }
  });

  it('refuses airborne or blocked drops and finds an inland side at the coast', () => {
    const { player, tool, obstacles, equip } = create();
    expect(equip()).toBe(true);
    player.group.position.y = 2;
    tool.setFiring(true);
    expect(tool.drop()).toBe(false);
    expect(tool.isFiring).toBe(false);
    expect(tool.equipped).toBe(true);
    player.group.position.y = 0.15;
    obstacles.push({ x: player.group.position.x, z: player.group.position.z, radius: 8 });
    expect(tool.drop()).toBe(false);
    expect(tool.model.parent).toBe(player.toolMount);
    obstacles.pop();
    player.group.position.set(WORLD_RADIUS - 0.1, 0.15, 0);
    player.group.rotation.y = Math.PI / 2;
    expect(tool.drop()).toBe(true);
    expect(tool.obstacle.x).toBeLessThan(player.group.position.x);
    expect(Math.hypot(tool.obstacle.x, tool.obstacle.z)).toBeLessThan(WORLD_RADIUS - tool.obstacle.radius);
  });

  it('detaches a held tool before scene cleanup and disposes every shared GPU resource once', () => {
    const { scene, tool, player, equip } = create();
    expect(equip()).toBe(true);
    tool.setFiring(true);
    const { geometries, materials } = resources(tool.model);
    const disposals = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
    tool.dispose();
    tool.dispose();
    expect(tool.model.parent).toBe(scene);
    expect(player.toolMount.children).toHaveLength(0);
    expect(tool.active).toBe(false);
    expect(tool.isFiring).toBe(false);
    expect(tool.isAvailable()).toBe(false);
    tool.setAvailable(true);
    expect(tool.equip()).toBe(false);
    expect(tool.getNozzle(new THREE.Vector3(), new THREE.Vector3())).toBe(false);
    expect(disposals.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    disposeObject(scene);
    roots.splice(roots.indexOf(scene), 1);
    disposals.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });
});
