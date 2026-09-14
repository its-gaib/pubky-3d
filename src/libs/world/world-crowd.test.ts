import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORLD_ANIME_SHIRTS } from '@/libs/world/world-anime-shirt';
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
beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null));
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

describe('world crowd rendering and scenery integration', () => {
  it('creates 100 peaceful visitors and one random zombie with only one extra draw for 20 anime shirts', () => {
    const { crowd } = setup();
    expect(crowd.tick(0, 0, absentPlayer())).toEqual({ playerBitten: false, humans: 100, zombies: 1 });
    const batches = crowd.group.children.filter((object) => object instanceof THREE.InstancedMesh);
    expect(batches).toHaveLength(9);
    expect(batches.filter((mesh) => mesh.count === 101)).toHaveLength(8);
    expect(batches.filter((mesh) => mesh.count === WORLD_ANIME_SHIRTS.count)).toHaveLength(1);
    expect(crowd.isZombie('human:crowd-zombie-0')).toBe(true);
    expect(crowd.isZombie('human:crowd-0')).toBe(false);
    const other = setup(() => 0.7);
    expect(other.crowd.group.getObjectByName('crowd-zombie-0')!.position).not.toEqual(
      crowd.group.getObjectByName('crowd-zombie-0')!.position,
    );
  });

  it('gives exactly 20 original walkers a shared anime print while preserving the other 80 shirts', () => {
    const { crowd } = setup();
    const wearers = crowd.group.children.filter((object) => object.userData.worldAnimeShirt);
    expect(wearers).toHaveLength(20);
    expect(wearers.every((object) => object.name.startsWith('crowd-human-'))).toBe(true);
    expect(crowd.group.getObjectByName('crowd-zombie-0')!.userData.worldAnimeShirt).toBeUndefined();
    const torsos = crowd.group.getObjectByName('crowd-shirts') as THREE.InstancedMesh;
    const prints = crowd.group.getObjectByName('crowd-anime-shirt-prints') as THREE.InstancedMesh;
    expect(prints.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const material = prints.material as THREE.MeshStandardMaterial;
    expect(material.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(material.emissiveMap).toBe(material.map);
    const originalShirts = ['#8f94cd', '#e4b965', '#85b7ac', '#cd857a', '#91a8c8', '#b59ac6'];
    const tint = new THREE.Color();
    for (let index = 0; index < 100; index++) {
      const wearer = crowd.group.getObjectByName(`crowd-human-${index}`)!;
      torsos.getColorAt(index, tint);
      expect(tint.getHexString()).toBe(
        wearer.userData.worldAnimeShirt
          ? WORLD_ANIME_SHIRTS.fabric.slice(1).toLowerCase()
          : originalShirts[index % 6].slice(1),
      );
    }
    const shirtMatrix = new THREE.Matrix4();
    const torsoMatrix = new THREE.Matrix4();
    for (const [slot, wearer] of wearers.entries()) {
      const index = Number(wearer.name.slice('crowd-human-'.length));
      prints.getMatrixAt(slot, shirtMatrix);
      torsos.getMatrixAt(index, torsoMatrix);
      expect(shirtMatrix.elements).toEqual(torsoMatrix.elements);
    }
  });

  it('reports a nearby shirt only for a living player within four world units of a visible living wearer', () => {
    const { crowd, scene } = setup();
    for (const object of crowd.group.children) {
      if (object.userData.worldCrowdProxy) object.visible = false;
    }
    const wearer = scene.getObjectByName('crowd-human-0')!;
    wearer.position.set(0, 0.15, 0);
    wearer.visible = true;
    const player = { ...absentPlayer(), position: new THREE.Vector3(3.9, 0.15, 0) };
    expect(crowd.tick(0, 0, player).shirtNearby).toBe(true);
    player.position.x = 4.1;
    expect(crowd.tick(0, 0, player).shirtNearby).toBeUndefined();
    player.position.set(0, 4.3, 0);
    expect(crowd.tick(0, 0, player).shirtNearby).toBeUndefined();
    player.position.copy(wearer.position);
    expect(crowd.tick(0, 0, { ...player, alive: false }).shirtNearby).toBeUndefined();
    expect(crowd.tick(0, 0, { ...player, zombie: true }).shirtNearby).toBeUndefined();
    crowd.group.visible = false;
    expect(crowd.tick(0, 0, player).shirtNearby).toBeUndefined();
    crowd.group.visible = true;
    wearer.visible = false;
    const ordinary = scene.getObjectByName('crowd-human-1')!;
    ordinary.position.copy(player.position);
    ordinary.visible = true;
    expect(crowd.tick(0, 0, player).shirtNearby).toBeUndefined();
  });

  it('keeps the printed shirt on a bitten and fallen wearer without advertising from their corpse', () => {
    const { crowd, scene } = setup();
    for (const object of crowd.group.children) {
      if (object.userData.worldCrowdProxy) object.visible = false;
    }
    const wearer = scene.getObjectByName('crowd-human-0')!;
    wearer.position.set(0, 0.15, 0);
    wearer.visible = true;
    const player = { ...absentPlayer(), position: wearer.position.clone() };
    crowd.tick(0.05, 0.05, { ...player, zombie: true, bite: true });
    expect(crowd.isZombie('human:crowd-0')).toBe(true);
    expect(crowd.tick(0, 0.05, player).shirtNearby).toBeUndefined();
    expect(crowd.knockDownZombies(player.position)).toBe(1);
    crowd.tick(0.05, 1, player, true);
    expect(crowd.tick(0, 1, player).shirtNearby).toBeUndefined();
    const torsoMatrix = new THREE.Matrix4();
    const printMatrix = new THREE.Matrix4();
    (crowd.group.getObjectByName('crowd-shirts') as THREE.InstancedMesh).getMatrixAt(0, torsoMatrix);
    (crowd.group.getObjectByName('crowd-anime-shirt-prints') as THREE.InstancedMesh).getMatrixAt(0, printMatrix);
    expect(printMatrix.elements).toEqual(torsoMatrix.elements);
    expect(printMatrix.determinant()).toBeGreaterThan(0);
    wearer.visible = false;
    crowd.tick(0, 1, player);
    (crowd.group.getObjectByName('crowd-anime-shirt-prints') as THREE.InstancedMesh).getMatrixAt(0, printMatrix);
    expect(printMatrix.determinant()).toBe(0);
  });

  it('identifies the nearest wearer and keeps their speech anchored to their moving head', () => {
    const { crowd, burning, scene } = setup();
    for (const object of crowd.group.children) {
      if (object.userData.worldCrowdProxy) object.visible = false;
    }
    const wearers = crowd.group.children.filter((object) => object.userData.worldAnimeShirt).slice(0, 2);
    wearers[0].visible = true;
    wearers[0].position.set(0, 0.15, 0);
    wearers[1].visible = true;
    wearers[1].position.set(3, 0.15, 0);
    const player = { ...absentPlayer(), position: new THREE.Vector3(2.8, 0.15, 0) };
    const speakerId = crowd.tick(0, 0, player).shirtSpeakerId!;
    expect(speakerId).not.toBe('human:crowd-0');
    const point = new THREE.Vector3();
    expect(crowd.getShirtSpeakerPosition(speakerId, point)).toBe(point);
    expect(point.x).toBe(3);
    expect(point.y).toBeCloseTo(wearers[1].position.y + 2.9 * wearers[1].scale.y);

    // The six-second message follows its original speaker even after they leave proximity.
    wearers[1].position.set(12, 0.15, 7);
    expect(crowd.tick(0, 0, player).shirtSpeakerId).toBe('human:crowd-0');
    crowd.getShirtSpeakerPosition(speakerId, point);
    expect(point.x).toBe(12);
    expect(point.z).toBe(7);

    wearers[1].visible = false;
    expect(crowd.getShirtSpeakerPosition(speakerId, point)).toBeNull();
    wearers[1].visible = true;
    crowd.group.visible = false;
    expect(crowd.getShirtSpeakerPosition(speakerId, point)).toBeNull();
    crowd.group.visible = true;
    expect(crowd.getShirtSpeakerPosition('human:crowd-1', point)).toBeNull();
    expect(crowd.getShirtSpeakerPosition('unknown', point)).toBeNull();
    expect(burning.ignite(speakerId)).toBe(true);
    expect(crowd.getShirtSpeakerPosition(speakerId, point)).toBeNull();
    expect(scene.getObjectByName('crowd-human-0')).toBe(wearers[0]);
  });

  it('never advertises a burning shirt and releases its shared print resources exactly once', () => {
    const { crowd, burning, scene } = setup();
    for (const object of crowd.group.children) {
      if (object.userData.worldCrowdProxy) object.visible = false;
    }
    const wearer = scene.getObjectByName('crowd-human-0')!;
    wearer.position.set(0, 0.15, 0);
    wearer.visible = true;
    const player = { ...absentPlayer(), position: wearer.position.clone() };
    expect(burning.ignite('human:crowd-0')).toBe(true);
    expect(crowd.tick(0, 0, player).shirtNearby).toBeUndefined();
    const prints = crowd.group.getObjectByName('crowd-anime-shirt-prints') as THREE.InstancedMesh;
    const normal = prints.material as THREE.MeshStandardMaterial;
    const disposeTexture = vi.spyOn(normal.map!, 'dispose');
    const disposeGeometry = vi.spyOn(prints.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(normal, 'dispose');
    crowd.setZombieVision(true);
    expect((prints.material as THREE.MeshBasicMaterial).map).toBe(normal.map);
    const disposeVisionMaterial = vi.spyOn(prints.material as THREE.Material, 'dispose');
    crowd.setZombieVision(false);
    expect(prints.material).toBe(normal);
    crowd.dispose();
    crowd.dispose();
    for (const dispose of [disposeTexture, disposeGeometry, disposeMaterial, disposeVisionMaterial]) {
      expect(dispose).toHaveBeenCalledExactlyOnceWith();
    }
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
