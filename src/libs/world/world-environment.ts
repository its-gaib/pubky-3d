import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BANK_POSITION } from '@/libs/world/world-bank';
import { createWorldInstanceBurnTarget, type WorldBurnTarget } from '@/libs/world/world-burning';
import { WORLD_ZONES } from '@/libs/world/world-catalog';
import { CINEMA_DIMENSIONS } from '@/libs/world/world-cinema';
import { mesh } from '@/libs/world/world-geometry';
import { HOT_SAUCE_RADIUS } from '@/libs/world/world-hot-sauce';
import { WORLD_ANCHORS, WORLD_DIMENSIONS, WORLD_PORTALS, WORLD_RADIUS } from '@/libs/world/world-layout';
import { worldMeadowDensity, worldTerrainTexture } from '@/libs/world/world-meadow';
import type { WorldObstacle } from '@/libs/world/world-motion';
import { worldDetail, worldGrainTexture, worldPlanarUv } from '@/libs/world/world-surfaces';

const TAU = Math.PI * 2;
const HOT_SAUCE_CLEARING_RADIUS = HOT_SAUCE_RADIUS + 4.3;

function surface(color: string, roughness = 0.9, metalness = 0.04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function instances(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  name: string,
) {
  const object = new THREE.InstancedMesh(geometry, material, count);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function disposeInstances(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
}

/** Older callers may only record a circle; the scene returns its owned obstacle. */
function retainedObstacle(value: unknown): WorldObstacle[] {
  if (
    typeof value === 'object' &&
    value !== null &&
    'x' in value &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    'z' in value &&
    typeof value.z === 'number' &&
    Number.isFinite(value.z) &&
    'radius' in value &&
    typeof value.radius === 'number' &&
    Number.isFinite(value.radius)
  )
    return [value as WorldObstacle];
  return [];
}

/** A layered basalt coast and quiet, sculpted water; the walkable top stays flat. */
export function createIslandTerrain(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = 'Basalt island and tide';
  scene.add(group);
  const grain = worldGrainTexture('soil');
  const landMaterial = surface('#C5CBCD', 0.98, 0);
  landMaterial.map = worldTerrainTexture();
  landMaterial.bumpMap = grain;
  landMaterial.bumpScale = 0.025;
  const diameter = WORLD_DIMENSIONS.landRadius * 2;
  grain.repeat.set(diameter / 12, diameter / 12);
  const landGeometry = worldPlanarUv(
    new THREE.CylinderGeometry(WORLD_DIMENSIONS.landRadius, WORLD_DIMENSIONS.landRadius + 2, 0.85, 160),
    diameter,
  );
  const landUv = landGeometry.getAttribute('uv');
  for (let index = 0; index < landUv.count; index++)
    landUv.setXY(index, landUv.getX(index) + 0.5, landUv.getY(index) + 0.5);
  const land = mesh(group, landGeometry, landMaterial, [0, -0.425, 0]);
  land.name = 'Flat island walking surface';
  land.castShadow = false;

  const coast = mesh(
    group,
    new THREE.CylinderGeometry(WORLD_DIMENSIONS.coastRadius, WORLD_DIMENSIONS.coastRadius - 5, 5.2, 160),
    surface('#353A3D'),
    [0, -2.85, 0],
  );
  coast.name = 'Basalt foundation';
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  const rockColors = ['#3F494C', '#4E5353', '#303A3E', '#4B4B47', '#394B4C'];
  const rocks = instances(
    group,
    new THREE.DodecahedronGeometry(1, 0),
    surface('#FFFFFF', 0.96),
    180,
    'Layered coastal basalt',
  );
  for (let index = 0; index < rocks.count; index++) {
    const angle = (index / rocks.count) * TAU;
    const radius = WORLD_DIMENSIONS.coastRadius - 0.8 + Math.sin(index * 7.31) * 1.2;
    transform.position.set(Math.cos(angle) * radius, -2.7 + Math.sin(index * 3.17) * 0.5, Math.sin(angle) * radius);
    transform.rotation.set(0.05 * Math.sin(index), angle, 0.12 * Math.sin(index * 4.1));
    transform.scale.set(2.5 + (index % 3) * 0.3, 1.7 + (index % 4) * 0.13, 2.2 + (index % 5) * 0.17);
    transform.updateMatrix();
    rocks.setMatrixAt(index, transform.matrix);
    rocks.setColorAt(index, tint.set(rockColors[index % rockColors.length]));
  }

  const waterGeometry = new THREE.PlaneGeometry(1100, 1100, 72, 72).rotateX(-Math.PI / 2);
  const positions = waterGeometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, Math.sin(x * 0.035 + z * 0.012) * 0.25 + Math.sin(z * 0.066 - x * 0.016) * 0.11);
  }
  waterGeometry.computeVertexNormals();
  const ripples = worldGrainTexture('water');
  ripples.repeat.set(55, 55);
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: '#112027',
    roughness: 0.48,
    metalness: 0.25,
    bumpMap: ripples,
    bumpScale: 0.15,
    envMapIntensity: 0.4,
  });
  const water = mesh(group, waterGeometry, waterMaterial, [0, -4.65, 0]);
  water.name = 'Quiet sea';
  water.castShadow = false;
  water.receiveShadow = false;

  // Broken crescents follow the actual round coastline, avoiding a floating wire halo.
  const waves: THREE.Mesh[] = [];
  const foamMaterial = new THREE.MeshBasicMaterial({
    color: '#90AEB1',
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  for (let ring = 0; ring < 3; ring++) {
    const pieces: THREE.BufferGeometry[] = [];
    for (let arc = 0; arc < 22; arc++) {
      const start = (arc / 22) * TAU + ring * 0.11;
      const radius = WORLD_DIMENSIONS.coastRadius + 2 + ring * 3.2;
      pieces.push(
        new THREE.RingGeometry(radius, radius + 0.25 + (arc % 3) * 0.09, 8, 1, start, TAU / 32).rotateX(-Math.PI / 2),
      );
    }
    const geometry = mergeGeometries(pieces)!;
    pieces.forEach((part) => part.dispose());
    const wave = mesh(group, geometry, foamMaterial, [0, -4.23 - ring * 0.045, 0]);
    wave.name = 'Shoreline foam';
    wave.castShadow = false;
    wave.receiveShadow = false;
    waves.push(wave);
  }
  return {
    group,
    water,
    dispose() {
      disposeInstances(group);
    },
    animate(time: number) {
      waves.forEach((wave, index) => {
        const scale = 1 + Math.sin(time * 0.32 + index * 1.7) * 0.003;
        wave.scale.set(scale, 1, scale);
      });
    },
  };
}

function keepClear(x: number, z: number, paths: readonly THREE.Vector3[], margin = 3.2) {
  if (Math.hypot(x, z - WORLD_ANCHORS.plaza[1]) < 29) return false;
  if (
    WORLD_ZONES.some(
      (zone) =>
        Math.hypot(x - zone.position[0], z - zone.position[1]) <
        (zone.id === 'cinema'
          ? Math.hypot(CINEMA_DIMENSIONS.halfWidth, CINEMA_DIMENSIONS.back) + 3
          : zone.id === 'arena'
            ? 26
            : zone.id === 'chess'
              ? 25
              : 16),
    )
  )
    return false;
  if (Math.hypot(x - BANK_POSITION[0], z - BANK_POSITION[1]) < 13) return false;
  if (Math.hypot(x - WORLD_ANCHORS.hotSauce[0], z - WORLD_ANCHORS.hotSauce[1]) < HOT_SAUCE_CLEARING_RADIUS)
    return false;
  if (Math.hypot(x - WORLD_ANCHORS.tether[0], z - WORLD_ANCHORS.tether[1]) < 13) return false;
  if (Math.hypot(x - WORLD_ANCHORS.runner[0], z - WORLD_ANCHORS.runner[1]) < 14) return false;
  if (Math.hypot(x - WORLD_ANCHORS.duck[0], z - WORLD_ANCHORS.duck[1]) < 9) return false;
  if (Math.hypot(x - WORLD_ANCHORS.trampoline[0], z - WORLD_ANCHORS.trampoline[1]) < 7) return false;
  if (WORLD_PORTALS.some((portal) => Math.hypot(x - portal.position[0], z - portal.position[1]) < 10)) return false;
  return !paths.some((point) => Math.hypot(x - point.x, z - point.z) < margin);
}

function firCanopy() {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const tint = new THREE.Color();
  const sections = [
    [1.2, 0.1],
    [1.25, 1.45],
    [1.85, 1.15],
    [2.03, 0.74],
    [2.05, 1.2],
    [2.65, 0.9],
    [2.87, 0.52],
    [2.9, 0.93],
    [3.5, 0.62],
    [3.68, 0.32],
    [3.7, 0.58],
    [4.55, 0.015],
  ];
  const segments = 24;
  sections.forEach(([y, radius], row) => {
    for (let column = 0; column <= segments; column++) {
      const angle = (column / segments) * TAU;
      const scallop = 1 + Math.sin(angle * 8 + row * 0.9) * 0.075;
      vertices.push(
        Math.cos(angle) * radius * scallop,
        y + Math.sin(angle * 8) * 0.065,
        Math.sin(angle) * radius * scallop,
      );
      tint.set(row % 3 === 1 ? '#859B86' : row % 3 === 0 ? '#536A59' : '#6F8974');
      tint.toArray(colors, colors.length);
      if (row < sections.length - 1 && column < segments) {
        const start = row * (segments + 1) + column;
        indices.push(start, start + segments + 1, start + 1, start + 1, start + segments + 1, start + segments + 2);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Bent leaves are real geometry, so tiny plants still read in world photographs. */
function grassTuft() {
  const points: number[] = [];
  const colors: number[] = [];
  const tint = new THREE.Color();
  for (let blade = 0; blade < 7; blade++) {
    const angle = blade * 2.4;
    const height = 0.28 + (blade % 4) * 0.12;
    const width = 0.035;
    const baseX = Math.cos(angle) * 0.08;
    const baseZ = Math.sin(angle) * 0.08;
    const bendX = Math.cos(angle) * height * 0.35;
    const bendZ = Math.sin(angle) * height * 0.35;
    const sideX = Math.cos(angle + Math.PI / 2) * width;
    const sideZ = Math.sin(angle + Math.PI / 2) * width;
    const left = [baseX - sideX, 0, baseZ - sideZ];
    const right = [baseX + sideX, 0, baseZ + sideZ];
    const midLeft = [baseX + bendX * 0.35 - sideX * 0.65, height * 0.65, baseZ + bendZ * 0.35 - sideZ * 0.65];
    const midRight = [baseX + bendX * 0.35 + sideX * 0.65, height * 0.65, baseZ + bendZ * 0.35 + sideZ * 0.65];
    const tip = [baseX + bendX, height, baseZ + bendZ];
    points.push(...left, ...right, ...midLeft, ...right, ...midRight, ...midLeft, ...midLeft, ...midRight, ...tip);
    tint.set(blade % 3 ? '#7B9C6D' : '#A5AB79');
    for (let vertex = 0; vertex < 9; vertex++) tint.toArray(colors, colors.length);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function flowerHead() {
  const pieces: THREE.BufferGeometry[] = [];
  for (let petal = 0; petal < 5; petal++) {
    const angle = (petal / 5) * TAU;
    pieces.push(
      new THREE.SphereGeometry(1, 6, 4)
        .scale(0.115, 0.025, 0.055)
        .rotateY(angle)
        .translate(Math.cos(angle) * 0.1, 0.51, Math.sin(angle) * 0.1),
    );
  }
  const geometry = mergeGeometries(pieces)!;
  pieces.forEach((part) => part.dispose());
  return geometry;
}

/** Layered trees and planted meadows keep a bounded number of instance batches. */
export function createCoastalNature(
  scene: THREE.Scene,
  paths: readonly THREE.Vector3[],
  obstacle: (x: number, z: number, radius: number) => unknown,
) {
  const group = new THREE.Group();
  group.name = 'Coastal pines and wildflower meadows';
  scene.add(group);
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  const burnTargets: WorldBurnTarget[] = [];
  const treePositions: { seed: number; x: number; z: number; scale: number; angle: number }[] = [];
  for (let index = 0; index < 38; index++) {
    const angle = index * 2.39996;
    const radius = WORLD_RADIUS - 12 + Math.sin(index * 7.1) * 7;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (keepClear(x, z, paths)) treePositions.push({ seed: index, x, z, scale: 1.2 + (index % 4) * 0.25, angle });
  }
  const trunks = instances(
    group,
    new THREE.CylinderGeometry(0.12, 0.28, 1.8, 9).translate(0, 0.9, 0),
    surface('#665446'),
    treePositions.length,
    'Tapered coastal trunks',
  );
  const foliageMaterial = surface('#FFFFFF');
  foliageMaterial.vertexColors = true;
  const canopies = instances(group, firCanopy(), foliageMaterial, treePositions.length, 'Layered pine boughs');
  treePositions.forEach(({ seed, x, z, scale, angle }, index) => {
    transform.position.set(x, 0, z);
    transform.rotation.set(0, angle, 0);
    transform.scale.set(scale, scale, scale);
    transform.updateMatrix();
    trunks.setMatrixAt(index, transform.matrix);
    canopies.setMatrixAt(index, transform.matrix);
    canopies.setColorAt(index, tint.set(index % 3 === 0 ? '#9AAB81' : index % 3 === 1 ? '#78A29C' : '#9CAC98'));
    burnTargets.push(
      createWorldInstanceBurnTarget(
        `nature:pine:${seed}`,
        [trunks, canopies],
        index,
        retainedObstacle(obstacle(x, z, 0.5)),
      ),
    );
  });

  const grassMaterial = surface('#FFFFFF', 1, 0);
  grassMaterial.side = THREE.DoubleSide;
  grassMaterial.vertexColors = true;
  const grass = instances(group, grassTuft(), grassMaterial, 1700, 'Planted meadow grass');
  grass.castShadow = false;
  const pebbles = instances(group, new THREE.IcosahedronGeometry(1, 0), surface('#7F8481'), 240, 'Meadow stones');
  pebbles.castShadow = false;
  let planted = 0;
  let scattered = 0;
  const grassPatches = new Map<string, number[]>();
  const stoneSlots: { seed: number; index: number }[] = [];
  for (let index = 0; index < 6200 && planted < grass.count; index++) {
    const angle = index * 2.39996;
    const radius = 32 + ((Math.sin(index * 16.4) + 1) / 2) * (WORLD_RADIUS - 38);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (!keepClear(x, z, paths, 2.4)) continue;
    const density = worldMeadowDensity(x, z);
    if (density < 0.44 || (Math.sin(index * 31.7) + 1) / 2 > density) continue;
    transform.position.set(x, 0.018, z);
    transform.rotation.set(0, index * 1.17, 0);
    const size = 0.8 + (index % 5) * 0.2;
    transform.scale.set(size, size, size);
    transform.updateMatrix();
    const patchId = `nature:grass:${Math.floor(x / 12)}:${Math.floor(z / 12)}`;
    const patch = grassPatches.get(patchId) ?? [];
    patch.push(planted);
    grassPatches.set(patchId, patch);
    grass.setMatrixAt(planted++, transform.matrix);
    if (index % 5 === 0 && scattered < pebbles.count) {
      transform.position.set(x + 0.7, 0.075, z - 0.4);
      transform.scale.set(0.25 + (index % 3) * 0.08, 0.12, 0.2);
      transform.updateMatrix();
      stoneSlots.push({ seed: index, index: scattered });
      pebbles.setMatrixAt(scattered++, transform.matrix);
    }
  }
  grass.count = planted;
  pebbles.count = scattered;
  for (const [id, slots] of grassPatches) burnTargets.push(createWorldInstanceBurnTarget(id, [grass], slots));
  for (const slot of stoneSlots)
    burnTargets.push(createWorldInstanceBurnTarget(`nature:stone:${slot.seed}`, [pebbles], slot.index));

  // Retain all 160 original flowers, now with stems, petals and contrasting centers.
  const flowers = instances(group, flowerHead(), surface('#FFFFFF'), 160, '160 meadow flowers');
  const stems = instances(
    group,
    new THREE.CylinderGeometry(0.015, 0.025, 0.5, 5).translate(0, 0.25, 0),
    surface('#536D4D'),
    160,
    'Wildflower stems',
  );
  const centers = instances(
    group,
    new THREE.SphereGeometry(0.055, 8, 5).scale(1, 0.5, 1).translate(0, 0.53, 0),
    surface('#DBC57D'),
    160,
    'Wildflower centers',
  );
  for (const item of [flowers, stems, centers]) item.castShadow = false;
  for (let index = 0; index < 160; index++) {
    const angle = index * 2.39996;
    const radius = 40 + ((Math.sin(index * 16.4) + 1) / 2) * (WORLD_RADIUS - 45);
    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;
    const dx = x - WORLD_ANCHORS.hotSauce[0];
    const dz = z - WORLD_ANCHORS.hotSauce[1];
    // Move flowers to the clearing's rim, retaining the complete meadow population.
    if (Math.hypot(dx, dz) < HOT_SAUCE_CLEARING_RADIUS) {
      const clearingAngle = Math.atan2(dz, dx);
      x = WORLD_ANCHORS.hotSauce[0] + Math.cos(clearingAngle) * HOT_SAUCE_CLEARING_RADIUS;
      z = WORLD_ANCHORS.hotSauce[1] + Math.sin(clearingAngle) * HOT_SAUCE_CLEARING_RADIUS;
    }
    transform.position.set(x, 0.13, z);
    transform.rotation.set(0, index, 0);
    const scale = 0.8 + (index % 3) * 0.25;
    transform.scale.set(scale, scale, scale);
    transform.updateMatrix();
    for (const item of [flowers, stems, centers]) item.setMatrixAt(index, transform.matrix);
    flowers.setColorAt(index, tint.set(['#DDD7B1', '#B4BB81', '#C1A9BD', '#AAC4C3'][index % 4]));
    burnTargets.push(createWorldInstanceBurnTarget(`nature:flower:${index}`, [flowers, stems, centers], index));
  }
  return {
    group,
    burnTargets,
    dispose() {
      disposeInstances(group);
    },
  };
}

/** Low path lamps give walking routes a human scale without additional scene lights. */
export function createPathFurniture(
  scene: THREE.Scene,
  paths: readonly THREE.Vector3[],
  obstacle: (x: number, z: number, radius: number) => unknown,
) {
  const group = new THREE.Group();
  group.name = 'Island path lamps';
  scene.add(group);
  const detail = worldDetail(group, 'Cast metal path lamps');
  const locations: THREE.Vector3[] = [];
  const lampObstacles: WorldObstacle[][] = [];
  const lampSeeds: number[] = [];
  for (let index = 9; index < paths.length - 1; index += 9) {
    if (index % 36 === 0) continue;
    const point = paths[index];
    const tangent = paths[index + 1]
      .clone()
      .sub(paths[index - 1])
      .normalize();
    const side = index % 2 ? -1 : 1;
    const x = point.x - tangent.z * 2.4 * side;
    const z = point.z + tangent.x * 2.4 * side;
    if (!keepClear(x, z, []) || locations.some((lamp) => Math.hypot(lamp.x - x, lamp.z - z) < 8)) continue;
    locations.push(new THREE.Vector3(x, 0, z));
    lampSeeds.push(index);
    lampObstacles.push(retainedObstacle(obstacle(x, z, 0.28)));
  }
  // One identical local prototype per surface preserves all detail and colors,
  // while making each base independently removable at the same draw-call count.
  detail.add(new THREE.CylinderGeometry(0.3, 0.36, 0.13, 12), '#555D5A', 'stone', [0, 0.09, 0]);
  detail.add(new THREE.CylinderGeometry(0.12, 0.17, 0.66, 12), '#4E5957', 'metal', [0, 0.48, 0]);
  detail.add(new THREE.CylinderGeometry(0.23, 0.18, 0.08, 16), '#919B8C', 'metal', [0, 0.92, 0]);
  detail.add(new THREE.CylinderGeometry(0.13, 0.15, 0.08, 12), '#2A3535', 'metal', [0, 0.77, 0]);
  detail.finish();
  const bases: THREE.InstancedMesh[] = [];
  for (const original of [...detail.group.children]) {
    if (!(original instanceof THREE.Mesh) || Array.isArray(original.material)) continue;
    bases.push(instances(detail.group, original.geometry, original.material, locations.length, original.name));
    original.removeFromParent();
  }
  const glass = new THREE.MeshStandardMaterial({
    color: '#E4D7A6',
    emissive: '#EDD49B',
    emissiveIntensity: 0.65,
    roughness: 0.36,
    metalness: 0.15,
  });
  const lanterns = instances(
    group,
    new THREE.CylinderGeometry(0.15, 0.15, 0.16, 12),
    glass,
    locations.length,
    'Warm lamp lenses',
  );
  lanterns.castShadow = false;
  const transform = new THREE.Object3D();
  const burnTargets: WorldBurnTarget[] = [];
  locations.forEach((point, index) => {
    transform.position.copy(point);
    transform.updateMatrix();
    for (const base of bases) base.setMatrixAt(index, transform.matrix);
    transform.position.set(point.x, 0.83, point.z);
    transform.updateMatrix();
    lanterns.setMatrixAt(index, transform.matrix);
    burnTargets.push(
      createWorldInstanceBurnTarget(
        `furniture:lamp:${lampSeeds[index]}`,
        [...bases, lanterns],
        index,
        lampObstacles[index],
      ),
    );
  });
  return {
    group,
    burnTargets,
    dispose() {
      disposeInstances(group);
    },
    setNight(value: boolean) {
      glass.emissiveIntensity = value ? 1.8 : 0.65;
    },
  };
}
