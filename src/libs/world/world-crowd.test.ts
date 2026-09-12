import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorldBurning } from '@/libs/world/world-burning';
import { createWorldCrowd } from '@/libs/world/world-crowd';
import { WORLD_INFECTION, type WorldInfectionPlayer } from '@/libs/world/world-infection';

const cleanups: (() => void)[] = [];
const absentPlayer = (): WorldInfectionPlayer => ({
  position: new THREE.Vector3(0, 100, 0),
  zombie: false,
  canBeBitten: false,
  bite: false,
});
function setup(random = () => 0.2) {
  const scene = new THREE.Scene();
  const burning = createWorldBurning({ ledger: new Set() });
  const crowd = createWorldCrowd(scene, [], burning, { random });
  cleanups.push(() => {
    crowd.dispose();
    burning.dispose();
  });
  return { scene, burning, crowd };
}
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe('world crowd rendering and scenery integration', () => {
  it('creates 100 peaceful visitors and one random zombie in eight shared batches', () => {
    const { crowd } = setup();
    expect(crowd.tick(0, 0, absentPlayer())).toEqual({ playerBitten: false, humans: 100, zombies: 1 });
    const batches = crowd.group.children.filter((object) => object instanceof THREE.InstancedMesh);
    expect(batches).toHaveLength(8);
    expect(batches.every((mesh) => mesh.count === 101)).toBe(true);
    expect(crowd.isZombie('human:crowd-zombie-0')).toBe(true);
    expect(crowd.isZombie('human:crowd-0')).toBe(false);
    const other = setup(() => 0.7);
    expect(other.crowd.group.getObjectByName('crowd-zombie-0')!.position).not.toEqual(
      crowd.group.getObjectByName('crowd-zombie-0')!.position,
    );
  });

  it('registers susceptible scenery, leaves social profiles immune, and isolates shared skin materials', () => {
    const { crowd, scene } = setup();
    const skin = new THREE.MeshStandardMaterial({ color: '#d4a480' });
    const figure = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), skin);
    figure.add(body);
    scene.add(figure);
    const profile = new THREE.Group();
    scene.add(profile);
    const onInfect = vi.fn();
    const pose = vi.fn();
    crowd.registerPerson({ id: 'human:theater-0', group: figure, onInfect, pose });
    crowd.registerPerson({ id: 'person:social-profile', group: profile });
    const player = { ...absentPlayer(), position: new THREE.Vector3(0, 0.15, 0), zombie: true, bite: true };
    const frame = crowd.tick(0.05, 0.05, player);
    expect(frame).toMatchObject({ humans: 100, zombies: 2 });
    expect(onInfect).toHaveBeenCalledOnce();
    expect(pose).toHaveBeenCalled();
    expect(figure.userData.worldZombie).toBe(true);
    expect(profile.userData.worldZombie).toBeUndefined();
    expect(body.material).not.toBe(skin);
    expect(skin.color.getHexString()).toBe('d4a480');
    crowd.dispose();
    expect(body.material).toBe(skin);
    body.geometry.dispose();
    skin.dispose();
  });

  it('brightens healthy people in zombie vision without mutating shared scenery', () => {
    const { crowd, scene } = setup();
    const material = new THREE.MeshStandardMaterial({ color: '#886655' });
    const figure = new THREE.Mesh(new THREE.BoxGeometry(), material);
    scene.add(figure);
    crowd.registerPerson({ id: 'human:halfin', group: figure });
    crowd.setZombieVision(true);
    expect(figure.material.emissiveIntensity).toBeGreaterThan(0.5);
    expect(material.emissive.getHex()).toBe(0);
    expect(material.color.getHexString()).toBe('886655');
    crowd.setZombieVision(false);
    expect(figure.material.color.getHexString()).toBe('886655');
    crowd.dispose();
    figure.geometry.dispose();
    material.dispose();
  });

  it('binds moving physical burn targets and stops burning people from spreading infection', () => {
    const { crowd, burning } = setup();
    const target = crowd.group.getObjectByName('crowd-human-0')!;
    const start = target.position.clone();
    expect(burning.ignite('human:crowd-0')).toBe(true);
    burning.tick(0.1);
    crowd.tick(0.05, 0.1, absentPlayer());
    expect(target.userData.worldBurnPending).toBe(true);
    expect(target.position.distanceTo(start)).toBeGreaterThan(0.5);
    expect(crowd.tick(0.05, 0.15, absentPlayer()).humans).toBe(99);
  });

  it('knocks down only nearby living zombies and removes the inactive corpse after 60 seconds', () => {
    const { crowd, scene } = setup();
    const zombie = scene.getObjectByName('crowd-zombie-0')!;
    zombie.position.set(0, 0.15, 0);
    const human = scene.getObjectByName('crowd-human-0')!;
    human.position.set(0.4, 0.15, 0);
    expect(crowd.knockDownZombies(new THREE.Vector3(0, 0.15, 0))).toBe(1);
    expect(crowd.knockDownZombies(new THREE.Vector3(0, 0.15, 0))).toBe(0);
    expect(human.userData.worldZombieFallen).toBeUndefined();
    for (const child of crowd.group.children) {
      if (child.userData.worldCrowdProxy) child.visible = false;
    }
    for (let frame = 0; frame < 30; frame++) crowd.tick(0.05, frame * 0.05, absentPlayer());
    expect(zombie.visible).toBe(true);
    expect(zombie.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(crowd.tick(0.05, 1.55, absentPlayer()).zombies).toBe(0);
    for (let frame = 31; frame < WORLD_INFECTION.corpseSeconds / 0.05; frame++) {
      crowd.tick(0.05, frame * 0.05, absentPlayer());
    }
    expect(zombie.visible).toBe(false);
  });

  it('rejects knight strikes against zombies at another height or outside its bounded reach', () => {
    const { crowd, scene } = setup();
    const zombie = scene.getObjectByName('crowd-zombie-0')!;
    zombie.position.set(0, 6, 0);
    expect(crowd.knockDownZombies(new THREE.Vector3(0, 0.15, 0))).toBe(0);
    zombie.position.set(10, 0.15, 0);
    expect(crowd.knockDownZombies(new THREE.Vector3(0, 0.15, 0), 100)).toBe(0);
  });

  it('starts each new map with a fresh crowd and disposes its detached burn proxies', () => {
    const { crowd, burning, scene } = setup();
    burning.ignite('human:crowd-zombie-0');
    crowd.dispose();
    expect(scene.getObjectByName('crowd-zombie-0')).toBeUndefined();
    expect(crowd.tick(0.05, 1, absentPlayer()).humans).toBe(0);
    const next = setup();
    expect(next.crowd.tick(0, 0, absentPlayer())).toMatchObject({ humans: 100, zombies: 1 });
    expect(next.burning.isGone('human:crowd-zombie-0')).toBe(false);
  });
});
