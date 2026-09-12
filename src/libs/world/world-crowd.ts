import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createWorldHumanBurnTarget } from '@/libs/world/world-burn-escape';
import type { createWorldBurning } from '@/libs/world/world-burning';
import {
  createWorldInfection,
  createWorldInfectionPerson,
  WORLD_INFECTION,
  worldCrowdRandom,
  worldCrowdSpawn,
  worldInfectionCanSee,
  type WorldInfectionPerson,
  type WorldInfectionPlayer,
} from '@/libs/world/world-infection';
import type { WorldObstacle } from '@/libs/world/world-motion';

export interface WorldCrowdPerson {
  /** Only local human actors are eligible; social profile IDs are never registered. */
  id: string;
  group: THREE.Object3D;
  onInfect?: () => void;
  pose?: (stride: number, zombie: boolean, reducedMotion: boolean) => void;
}

type ColoredMaterial = THREE.Material & { color: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number };
type MaterialOwner = THREE.Mesh | THREE.Sprite;

function isColored(material: THREE.Material): material is ColoredMaterial {
  return 'color' in material && material.color instanceof THREE.Color;
}

/** Every cast member owns its tint; shared scenery skins must never turn green. */
function personMaterials(group: THREE.Object3D) {
  const owners: { object: MaterialOwner; original: THREE.Material | THREE.Material[] }[] = [];
  const copies = new Map<
    THREE.Material,
    { material: THREE.Material; color?: THREE.Color; emissive?: THREE.Color; intensity?: number }
  >();
  function clone(original: THREE.Material) {
    let copy = copies.get(original);
    if (!copy) {
      const material = original.clone();
      copy = {
        material,
        color: isColored(material) ? material.color.clone() : undefined,
        emissive: isColored(material) ? material.emissive?.clone() : undefined,
        intensity: isColored(material) ? material.emissiveIntensity : undefined,
      };
      copies.set(original, copy);
    }
    return copy.material;
  }
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return;
    const original = object.material;
    owners.push({ object, original });
    object.material = Array.isArray(original) ? original.map(clone) : clone(original);
  });
  const zombieColor = new THREE.Color('#6d9360');
  const preyColor = new THREE.Color('#fff0c1');
  return {
    paint(zombie: boolean, vision: boolean) {
      for (const copy of copies.values()) {
        if (!isColored(copy.material) || !copy.color) continue;
        copy.material.color.copy(copy.color);
        if (zombie) copy.material.color.lerp(zombieColor, 0.65).multiplyScalar(vision ? 0.65 : 0.88);
        else if (vision) copy.material.color.lerp(preyColor, 0.6);
        if (copy.material.emissive) {
          if (zombie) copy.material.emissive.set('#254a1b');
          else if (vision) copy.material.emissive.set('#fff0c1');
          else copy.material.emissive.copy(copy.emissive ?? new THREE.Color(0));
          copy.material.emissiveIntensity = zombie ? 0.22 : vision ? 0.9 : copy.intensity;
        }
      }
    },
    dispose() {
      for (const { object, original } of owners) object.material = original;
      for (const copy of copies.values()) copy.material.dispose();
      copies.clear();
      owners.length = 0;
    },
  };
}

interface CrowdRecord extends WorldCrowdPerson {
  agent: WorldInfectionPerson;
  materials?: ReturnType<typeof personMaterials>;
  slot?: number;
  unbind?: () => void;
  defeated?: { elapsed: number; position: THREE.Vector3; yaw: number };
}

function visibleInWorld(object: THREE.Object3D) {
  for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
    if (!parent.visible) return false;
  }
  return true;
}

/** Eight shared low-poly batches animate 101 articulated visitors without per-frame React state. */
export function createWorldCrowd(
  scene: THREE.Scene,
  obstacles: readonly WorldObstacle[],
  burning: ReturnType<typeof createWorldBurning>,
  options: { random?: () => number } = {},
) {
  const random = options.random ?? Math.random;
  const infection = createWorldInfection(obstacles, random);
  const records = new Map<string, CrowdRecord>();
  const walkers: CrowdRecord[] = [];
  const group = new THREE.Group();
  group.name = 'Island visitors and wandering zombies';
  group.userData.worldCrowd = true;
  scene.add(group);

  const count = WORLD_INFECTION.humans + 1;
  const normalMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0 });
  const faceMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const visionMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const proxyMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const proxyGeometry = new THREE.CapsuleGeometry(0.49, 1.67, 3, 6).translate(0, 1.325, 0);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const headGeometry = new THREE.SphereGeometry(1, 8, 6);
  const hairGeometry = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const faceParts = [-1, 1].map((side) =>
    new THREE.BoxGeometry(0.07, 0.043, 0.024).translate(side * 0.12, 0.065, 0.278),
  );
  faceParts.push(new THREE.BoxGeometry(0.12, 0.019, 0.018).translate(0, -0.12, 0.279));
  const faceGeometry = mergeGeometries(faceParts)!;
  faceParts.forEach((part) => part.dispose());

  const batch = (
    name: string,
    geometry: THREE.BufferGeometry = boxGeometry,
    material: THREE.Material = normalMaterial,
  ) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `crowd-${name}`;
    mesh.userData.worldCrowd = true;
    mesh.frustumCulled = false;
    mesh.castShadow = name !== 'faces';
    mesh.receiveShadow = name !== 'faces';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  };
  const torso = batch('shirts');
  const heads = batch('heads', headGeometry);
  const hair = batch('hair', hairGeometry);
  const leftArm = batch('left-arms');
  const rightArm = batch('right-arms');
  const leftLeg = batch('left-legs');
  const rightLeg = batch('right-legs');
  const faces = batch('faces', faceGeometry, faceMaterial);
  const batches = [torso, heads, hair, leftArm, rightArm, leftLeg, rightLeg, faces];
  const dummy = new THREE.Object3D();
  const matrix = new THREE.Matrix4();
  const headMatrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const tint = new THREE.Color();
  const shirts = ['#8f94cd', '#e4b965', '#85b7ac', '#cd857a', '#91a8c8', '#b59ac6'];
  const complexions = ['#c78f68', '#f0c4a5', '#8b5e49', '#d0a578', '#b9806c'];
  const pants = ['#33424b', '#485356', '#505d6b'];
  const hairColors = ['#312b29', '#5d4938', '#a99369', '#27292a', '#77716b'];
  let vision = false;
  let disposed = false;

  function paintColors(record: CrowdRecord) {
    const index = record.slot;
    if (index === undefined) return;
    const zombie = record.agent.zombie;
    const burned = !!record.group.userData.worldBurnPending;
    const color = (mesh: THREE.InstancedMesh, original: string, zombieTint: string) => {
      tint.set(burned ? '#322921' : zombie ? zombieTint : original);
      if (vision && !zombie && !burned) tint.lerp(new THREE.Color('#fff0c1'), 0.68);
      mesh.setColorAt(index, tint);
    };
    color(torso, shirts[index % shirts.length], '#586345');
    color(heads, complexions[index % complexions.length], '#7e9d68');
    color(hair, hairColors[index % hairColors.length], '#354031');
    color(leftArm, complexions[index % complexions.length], '#7e9d68');
    color(rightArm, complexions[index % complexions.length], '#7e9d68');
    color(leftLeg, pants[index % pants.length], '#374139');
    color(rightLeg, pants[index % pants.length], '#374139');
    color(faces, '#272c30', '#d3e787');
    for (const mesh of batches) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  function register(person: WorldCrowdPerson, agent?: WorldInfectionPerson, slot?: number) {
    if (disposed || !person.id.startsWith('human:') || records.has(person.id)) return () => {};
    const position = person.group.getWorldPosition(new THREE.Vector3());
    const state = agent ?? createWorldInfectionPerson(person.id, position, { random });
    if (!infection.add(state)) return () => {};
    person.group.userData.worldPerson = true;
    person.group.userData.worldZombie = state.zombie;
    const record: CrowdRecord = {
      ...person,
      agent: state,
      slot,
      materials: slot === undefined ? personMaterials(person.group) : undefined,
    };
    records.set(person.id, record);
    record.materials?.paint(state.zombie, vision);
    return () => {
      if (records.get(person.id) !== record) return;
      record.unbind?.();
      record.materials?.dispose();
      records.delete(person.id);
      infection.remove(person.id);
    };
  }

  const positions: THREE.Vector3[] = [];
  for (let index = 0; index < count; index++) {
    const zombie = index === WORLD_INFECTION.humans;
    const id = zombie ? 'human:crowd-zombie-0' : `human:crowd-${index}`;
    const root = new THREE.Group();
    root.name = zombie ? 'crowd-zombie-0' : `crowd-human-${index}`;
    root.userData.worldCrowdProxy = true;
    root.position.copy(worldCrowdSpawn(index, positions, obstacles, random));
    root.scale.setScalar(0.94 + worldCrowdRandom(random) * 0.14);
    positions.push(root.position.clone());
    const physical = new THREE.Mesh(proxyGeometry, proxyMaterial);
    physical.name = 'crowd-physical-body';
    root.add(physical);
    group.add(root);
    const agent = createWorldInfectionPerson(id, root.position.clone(), { random, wandering: true, zombie });
    root.rotation.y = agent.yaw;
    register({ id, group: root }, agent, index);
    const record = records.get(id)!;
    record.unbind = burning.bind(
      createWorldHumanBurnTarget(id, root, scene, (frame) => {
        agent.stride = frame.stride;
      }),
    );
    walkers.push(record);
    paintColors(record);
  }

  function part(
    mesh: THREE.InstancedMesh,
    index: number,
    parent: THREE.Matrix4,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(rx, ry, rz);
    dummy.updateMatrix();
    matrix.multiplyMatrices(parent, dummy.matrix);
    mesh.setMatrixAt(index, matrix);
  }

  function render(time: number, reducedMotion: boolean) {
    for (const record of walkers) {
      const { agent, group: root } = record;
      const index = record.slot!;
      if (!visibleInWorld(root) || burning.isGone(record.id)) {
        for (const mesh of batches) mesh.setMatrixAt(index, hidden);
        continue;
      }
      root.updateWorldMatrix(true, false);
      const transform = root.matrixWorld;
      const stride = reducedMotion ? 0 : agent.stride;
      const zombie = agent.zombie;
      const panic = !!root.userData.worldBurnPending && !zombie;
      const lean = zombie ? 0.13 : 0;
      const bob = reducedMotion || !agent.active ? 0 : Math.abs(stride) * (zombie ? 0.024 : 0.035);
      part(torso, index, transform, 0, 1.47 + bob, zombie ? 0.07 : 0, 0.77, 0.91, 0.43, lean);
      const legSwing = stride * (zombie ? 0.22 : 0.52);
      for (const [mesh, side] of [
        [leftLeg, -1],
        [rightLeg, 1],
      ] as const) {
        const swing = legSwing * side + (zombie && side > 0 ? 0.1 : 0);
        part(
          mesh,
          index,
          transform,
          side * 0.205,
          1.04 - Math.cos(swing) * 0.49,
          -Math.sin(swing) * 0.49,
          0.3,
          1,
          0.34,
          swing,
        );
      }
      for (const [mesh, side] of [
        [leftArm, -1],
        [rightArm, 1],
      ] as const) {
        const swing = panic ? -2.2 + stride * side * 0.3 : zombie ? -1.18 + stride * side * 0.12 : -legSwing * side;
        part(
          mesh,
          index,
          transform,
          side * 0.49,
          1.83 - Math.cos(swing) * 0.42 + bob,
          -Math.sin(swing) * 0.42,
          0.23,
          0.85,
          0.25,
          swing,
          0,
          -side * 0.08,
        );
      }
      dummy.position.set(0, 2.28 + bob, zombie ? 0.2 : 0.025);
      dummy.rotation.set(
        zombie ? 0.12 : 0,
        reducedMotion ? 0 : Math.sin(time * 0.8 + agent.phase) * (agent.waiting ? 0.45 : 0.12),
        zombie ? 0.12 : 0,
      );
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      headMatrix.multiplyMatrices(transform, dummy.matrix);
      part(heads, index, headMatrix, 0, 0, 0, 0.33, 0.39, 0.3);
      part(hair, index, headMatrix, 0, 0.075, -0.015, 0.342, 0.35, 0.312);
      part(faces, index, headMatrix, 0, 0, 0, 1, 1, 1);
      const burned = !!root.userData.worldBurnPending;
      if (root.userData.worldCrowdPaintedBurn !== burned) {
        root.userData.worldCrowdPaintedBurn = burned;
        paintColors(record);
      }
    }
    for (const mesh of batches) mesh.instanceMatrix.needsUpdate = true;
  }

  render(0, false);
  return {
    group,
    registerPerson: (person: WorldCrowdPerson) => register(person),
    isZombie: (id: string) => records.get(id)?.agent.zombie ?? false,
    /** The mounted knight's sword/trampling only reaches nearby, living zombies. */
    knockDownZombies(position: THREE.Vector3, radius = 2.5) {
      if (disposed || !Number.isFinite(radius) || radius <= 0) return 0;
      const reach = Math.min(6, radius);
      let fallen = 0;
      for (const record of records.values()) {
        const { group: root, agent } = record;
        if (
          !agent.zombie ||
          record.defeated ||
          root.userData.worldBurnPending ||
          !visibleInWorld(root) ||
          burning.isBurning(record.id) ||
          burning.isGone(record.id)
        )
          continue;
        root.getWorldPosition(agent.position);
        if (
          Math.abs(agent.position.y - position.y) > WORLD_INFECTION.biteHeight ||
          Math.hypot(agent.position.x - position.x, agent.position.z - position.z) > reach ||
          !worldInfectionCanSee(position, agent.position, obstacles)
        )
          continue;
        scene.attach(root);
        root.userData.worldZombieFallen = true;
        agent.active = false;
        agent.stride = 0;
        record.defeated = { elapsed: 0, position: root.position.clone(), yaw: root.rotation.y };
        record.pose?.(0, true, true);
        fallen++;
      }
      return fallen;
    },
    setZombieVision(enabled: boolean) {
      if (disposed || vision === enabled) return;
      vision = enabled;
      for (const mesh of batches)
        mesh.material = vision ? visionMaterial : mesh === faces ? faceMaterial : normalMaterial;
      for (const record of records.values()) {
        record.materials?.paint(record.agent.zombie, vision);
        paintColors(record);
      }
    },
    tick(delta: number, time: number, player: WorldInfectionPlayer, reducedMotion = false) {
      if (disposed) return { playerBitten: false, humans: 0, zombies: 0 };
      for (const record of records.values()) {
        const { agent, group: root } = record;
        if (record.defeated) {
          record.defeated.elapsed += Number.isFinite(delta)
            ? THREE.MathUtils.clamp(delta, 0, WORLD_INFECTION.maxStep)
            : 0;
          const progress = Math.min(1, record.defeated.elapsed / WORLD_INFECTION.collapseSeconds);
          root.position.copy(record.defeated.position);
          root.position.y = THREE.MathUtils.lerp(record.defeated.position.y, 0.34, progress);
          root.rotation.set((Math.PI / 2) * (reducedMotion ? 1 : progress), record.defeated.yaw, 0);
          if (record.defeated.elapsed + 1e-8 >= WORLD_INFECTION.corpseSeconds) root.visible = false;
        }
        agent.active =
          visibleInWorld(root) &&
          !record.defeated &&
          !root.userData.worldBurnPending &&
          !burning.isBurning(record.id) &&
          !burning.isGone(record.id);
        root.getWorldPosition(agent.position);
      }
      const frame = infection.tick(delta, player);
      for (const id of frame.infected) {
        const record = records.get(id)!;
        record.group.userData.worldZombie = true;
        record.onInfect?.();
        scene.attach(record.group);
        record.group.rotation.x = 0;
        record.group.traverse((object) => {
          if (object instanceof THREE.Sprite) object.visible = false;
        });
        record.materials?.paint(true, vision);
        paintColors(record);
      }
      for (const record of records.values()) {
        const { agent, group: root } = record;
        if (!agent.active || (!agent.zombie && record.slot === undefined)) continue;
        root.position.copy(agent.position);
        root.rotation.y = agent.yaw;
        root.rotation.z = agent.zombie && !reducedMotion ? Math.sin(agent.phase * 0.5) * 0.055 : 0;
        record.pose?.(reducedMotion ? 0 : agent.stride, agent.zombie, reducedMotion);
      }
      render(Number.isFinite(time) ? time : 0, reducedMotion);
      return { playerBitten: frame.playerBitten, humans: frame.humans, zombies: frame.zombies };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const record of records.values()) {
        record.unbind?.();
        record.materials?.dispose();
        if (record.slot !== undefined) record.group.removeFromParent();
      }
      infection.dispose();
      records.clear();
      walkers.length = 0;
      group.removeFromParent();
      for (const geometry of [proxyGeometry, boxGeometry, headGeometry, hairGeometry, faceGeometry]) geometry.dispose();
      for (const material of [normalMaterial, faceMaterial, visionMaterial, proxyMaterial]) material.dispose();
      for (const mesh of batches) mesh.dispose();
    },
  };
}
