import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { label, mesh } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import type { WorldObstacle } from '@/libs/world/world-motion';
import type { WorldInteraction } from '@/libs/world/world-types';

export const ARENA_DIMENSIONS = {
  halfWidth: 20.5,
  halfDepth: 17,
  floorHalfWidth: 9.8,
  floorHalfDepth: 7.1,
  entranceHalfAngle: 0.32,
  entranceZ: 18,
  height: 11,
} as const;

// Exact symbol-only paths from the inherited PubkyIcon and Synonym components
// in src/libs/icons/icons.tsx. Wordmark paths are intentionally absent.
// Brand references: https://pubky.org/ and https://synonym.to/.
export const ARENA_BRAND_SYMBOLS = [
  {
    name: 'Pubky',
    width: 22,
    height: 33,
    paths: [
      {
        color: '#C8FF00',
        d: 'M10.6133 0L8.04785 3.36154L4.74401 1.28202L3.83457 4.78379L0 3.97891L3.4879 9.67247C5.38937 8.00389 7.88184 6.99219 10.61 6.99137V6.99142H10.6167V6.99137C13.3448 6.9922 15.8373 8.00391 17.7387 9.67248L21.2266 3.97891L17.3921 4.78379L16.4826 1.28202L13.1788 3.36154L10.6167 0.00440823V0.00436164L10.616 0.00351212L10.6133 0ZM10.6133 9.66582C6.12357 9.66582 2.48365 13.3029 2.48365 17.7898C2.48365 19.7315 3.16595 21.5122 4.29976 22.9073L1.18964 32.4116H20.0371L16.9269 22.9073C18.0607 21.5122 18.743 19.7315 18.743 17.7898C18.743 13.3029 15.1031 9.66582 10.6133 9.66582ZM14.9142 17.7899C14.9142 15.4165 12.9888 13.4923 10.6134 13.4923H10.6133C8.23793 13.4923 6.31251 15.4165 6.31251 17.7899C6.31251 19.4347 7.23722 20.8641 8.59649 21.5866L8.73608 21.6608L6.47016 28.5853H14.7565L12.4906 21.6608L12.6302 21.5866C13.9895 20.8641 14.9142 19.4347 14.9142 17.7899Z',
      },
    ],
  },
  {
    name: 'Synonym',
    width: 200,
    height: 200,
    paths: [
      {
        color: '#FFFFFF',
        d: 'M127.394 75.7495H99.9979L107.982 44.26L73.6099 75.5811V94.9463L127.394 95.0305V75.7495ZM93.0227 155.736L127.394 124.415V104.966H73.6099V124.247H100.922L93.0227 155.736Z',
      },
      {
        color: '#FF6600',
        d: 'M110.525 0.563843C165.505 6.37341 205.246 55.6284 199.436 110.525C193.627 165.505 144.372 205.246 89.4754 199.436C34.4951 193.627 -5.24572 144.372 0.563843 89.4754C6.37341 34.4951 55.6284 -5.24572 110.525 0.563843ZM108.335 21.4446C65.1426 16.8138 25.9912 48.4717 21.4446 91.6645C16.8138 134.857 48.4717 174.009 91.6645 178.555C134.857 183.186 174.009 151.528 178.555 108.335C183.186 65.1426 151.528 25.9912 108.335 21.4446Z',
      },
    ],
  },
] as const;

/** The existing circular collision solver gets an annulus, never a solid arena disk. */
export function arenaCollisionObstacles(anchor: readonly [number, number] = WORLD_ANCHORS.arena): WorldObstacle[] {
  const obstacles: WorldObstacle[] = [];
  for (const [radiusX, radiusZ] of [
    [10.9, 8.2],
    [13.5, 10.4],
    [16.1, 12.6],
    [18.5, 14.8],
  ]) {
    const count = Math.ceil((Math.PI * (radiusX + radiusZ)) / 2.2);
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      if (angle < ARENA_DIMENSIONS.entranceHalfAngle || angle > Math.PI * 2 - ARENA_DIMENSIONS.entranceHalfAngle)
        continue;
      const x = Math.sin(angle) * radiusX;
      const z = Math.cos(angle) * radiusZ;
      if (z > 0 && Math.abs(x) < 3.7) continue;
      obstacles.push({ x: anchor[0] + x, z: anchor[1] + z, radius: 1.25 });
    }
  }
  for (const x of [-5.25, 5.25]) obstacles.push({ x: anchor[0] + x, z: anchor[1] + 14.55, radius: 1.3 });
  for (const x of [-4.7, 4.7]) obstacles.push({ x: anchor[0] + x, z: anchor[1] + 16, radius: 0.72 });
  return obstacles;
}

function ovalBand(outerX: number, outerZ: number, innerX: number, innerZ: number, height: number) {
  const shape = new THREE.Shape();
  const gap = ARENA_DIMENSIONS.entranceHalfAngle;
  for (let index = 0; index <= 96; index++) {
    const angle = gap + (index / 96) * (Math.PI * 2 - gap * 2);
    const x = Math.sin(angle) * outerX;
    const z = -Math.cos(angle) * outerZ;
    if (index === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  for (let index = 96; index >= 0; index--) {
    const angle = gap + (index / 96) * (Math.PI * 2 - gap * 2);
    shape.lineTo(Math.sin(angle) * innerX, -Math.cos(angle) * innerZ);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 }).rotateX(
    -Math.PI / 2,
  );
}

function arch(outer: number, inner: number, spring: number, depth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-outer, 0);
  shape.lineTo(-outer, spring);
  shape.absarc(0, spring, outer, Math.PI, 0, true);
  shape.lineTo(outer, 0);
  shape.lineTo(inner, 0);
  shape.lineTo(inner, spring);
  shape.absarc(0, spring, inner, 0, Math.PI, false);
  shape.lineTo(-inner, 0);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -depth / 2);
}

function bannerTexture(brand: (typeof ARENA_BRAND_SYMBOLS)[number]) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 384;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#682F35';
    context.fillRect(0, 0, 256, 384);
    context.strokeStyle = '#AA8650';
    context.lineWidth = 9;
    context.strokeRect(12, 12, 232, 360);
    if (typeof Path2D !== 'undefined') {
      const scale = Math.min(156 / brand.width, 230 / brand.height);
      context.translate((256 - brand.width * scale) / 2, (384 - brand.height * scale) / 2 - 12);
      context.scale(scale, scale);
      for (const path of brand.paths) {
        context.fillStyle = path.color;
        context.fill(new Path2D(path.d), 'evenodd');
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Two local toy performers, never network users or collision obstacles. */
function createGladiatorDuel(parent: THREE.Group, bronze: THREE.Material, iron: THREE.Material) {
  const duel = new THREE.Group();
  duel.name = 'arena-gladiator-duel';
  duel.position.set(0, 0.17, -1.4);
  parent.add(duel);

  const cube = new THREE.BoxGeometry(1, 1, 1);
  const round = new THREE.IcosahedronGeometry(1, 1);
  const cylinder = new THREE.CylinderGeometry(0.85, 1, 1, 12);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.07, 0);
  bladeShape.lineTo(0.07, 0);
  bladeShape.lineTo(0.07, -0.47);
  bladeShape.lineTo(0, -0.69);
  bladeShape.lineTo(-0.07, -0.47);
  bladeShape.closePath();
  const blade = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.035, bevelEnabled: false }).translate(0, 0, -0.0175);
  const steel = new THREE.MeshStandardMaterial({ color: '#D0D8E0', metalness: 0.8, roughness: 0.25 });
  const skin = new THREE.MeshStandardMaterial({ color: '#BA896E', roughness: 0.9 });
  const tunics = ['#A73D46', '#2A8790'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  const part = (
    target: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    surface: THREE.Material,
    size: [number, number, number],
    position: [number, number, number],
  ) => {
    const object = mesh(target, geometry, surface, position);
    object.scale.set(...size);
    return object;
  };

  const fighters = tunics.map((tunic, index) => {
    const fighter = new THREE.Group();
    fighter.name = `arena-gladiator-${index === 0 ? 'crimson' : 'teal'}`;
    duel.add(fighter);
    part(fighter, cube, tunic, [0.47, 0.55, 0.3], [0, 1.05, 0]);
    part(fighter, round, iron, [0.31, 0.34, 0.2], [0, 1.14, 0.03]);
    part(fighter, cylinder, tunic, [0.32, 0.3, 0.3], [0, 0.78, 0]);
    part(fighter, cube, bronze, [0.57, 0.08, 0.37], [0, 0.92, 0]);
    part(fighter, round, skin, [0.23, 0.26, 0.24], [0, 1.5, 0.015]);
    part(fighter, round, bronze, [0.29, 0.19, 0.29], [0, 1.67, -0.025]);
    part(fighter, cube, iron, [0.36, 0.07, 0.045], [0, 1.54, 0.246]);
    part(fighter, cube, bronze, [0.055, 0.23, 0.055], [0, 1.51, 0.265]);
    part(fighter, cube, bronze, [0.15, 0.07, 0.48], [0, 1.82, -0.03]);
    for (const offset of [-1, 0, 1]) {
      const plume = part(
        fighter,
        cube,
        tunic,
        [0.12, 0.17, 0.19],
        [0, 1.91 - Math.abs(offset) * 0.045, offset * 0.16 - 0.03],
      );
      plume.rotation.x = offset * 0.27;
    }

    const legs = [-1, 1].map((side) => {
      const leg = new THREE.Group();
      leg.name = 'gladiator-leg';
      leg.position.set(side * 0.16, 0.66, 0);
      fighter.add(leg);
      part(leg, cube, skin, [0.16, 0.52, 0.18], [0, -0.25, 0]);
      part(leg, cube, bronze, [0.19, 0.3, 0.07], [0, -0.34, 0.1]);
      part(leg, cube, iron, [0.23, 0.12, 0.37], [0, -0.6, 0.085]);
      return leg;
    });
    const arms = [-1, 1].map((side) => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.4, 1.25, 0);
      fighter.add(arm);
      part(arm, round, bronze, [0.18, 0.17, 0.18], [0, -0.035, 0]);
      part(arm, cube, skin, [0.15, 0.36, 0.16], [0, -0.23, 0]);
      return arm;
    });
    const [swordArm, shieldArm] = arms;
    swordArm.name = 'gladiator-sword-arm';
    part(swordArm, cube, iron, [0.07, 0.15, 0.08], [0, -0.41, 0]);
    part(swordArm, cube, bronze, [0.28, 0.055, 0.09], [0, -0.49, 0]);
    mesh(swordArm, blade, steel, [0, -0.52, 0]);
    shieldArm.name = 'gladiator-shield-arm';
    const shield = new THREE.Group();
    shield.position.set(0, -0.43, 0.1);
    shield.rotation.x = 1.02;
    shieldArm.add(shield);
    const rim = part(shield, cylinder, bronze, [0.37, 0.07, 0.47], [0, 0, 0]);
    rim.rotation.x = Math.PI / 2;
    const face = part(shield, cylinder, tunic, [0.32, 0.08, 0.42], [0, 0, 0.035]);
    face.rotation.x = Math.PI / 2;
    part(shield, cube, bronze, [0.055, 0.62, 0.035], [0, 0, 0.1]);
    part(shield, round, steel, [0.09, 0.09, 0.065], [0, 0, 0.125]);
    return { fighter, legs, swordArm, shieldArm };
  });

  // Absolute, bounded phases avoid accumulating drift or allocating per frame.
  // Each six-second exchange swaps attacker and defender; the pair circles once
  // per full twelve-second loop, with a high guard, lunge, parry and retreat.
  const pulse = (phase: number, start: number, end: number) => {
    if (phase <= start || phase >= end) return 0;
    return Math.sin(((phase - start) / (end - start)) * Math.PI) ** 2;
  };
  const animate = (time: number) => {
    const phase = ((time % 12) + 12) % 12;
    const orbit = (phase / 12) * Math.PI * 2;
    for (let index = 0; index < fighters.length; index++) {
      const { fighter, legs, swordArm, shieldArm } = fighters[index];
      const turn = (phase + index * 6) % 12;
      const attacking = turn < 6;
      const beat = turn % 6;
      const approach = pulse(beat, 0.5, 4.8);
      const strike = pulse(beat, 1.9, 2.95);
      const parry = pulse(beat, 1.9, 3.4);
      const angle = orbit + index * Math.PI;
      const radius = 1.1 - (attacking ? 0.7 : -0.15) * approach;
      const step = Math.sin(phase * Math.PI * 4 + index * Math.PI);
      fighter.position.set(Math.sin(angle) * radius, 0.025 * Math.abs(step), Math.cos(angle) * radius);
      fighter.rotation.set(attacking ? approach * 0.09 : -parry * 0.045, angle + Math.PI, 0);
      legs[0].rotation.x = step * 0.23 - (attacking ? approach * 0.15 : 0);
      legs[1].rotation.x = -step * 0.23 + (attacking ? approach * 0.15 : 0);
      swordArm.rotation.set(attacking ? -2.25 + strike * 1.35 : -1.65 - parry * 0.2, 0, -0.12);
      shieldArm.rotation.set(-1.02 - (attacking ? 0.08 : parry * 0.43), 0, 0.12 + parry * 0.08);
    }
  };
  animate(0);
  return animate;
}

/** A walkable Roman amphitheater with shared draw calls and no external assets or IO. */
export function createArena(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
) {
  const group = new THREE.Group();
  group.name = 'Roman amphitheater';
  group.position.set(WORLD_ANCHORS.arena[0], 0, WORLD_ANCHORS.arena[1]);
  scene.add(group);
  const colors = {
    stone: '#666268',
    shadowStone: '#454248',
    trim: '#A39B8B',
    seats: '#6C6056',
    darkSeats: '#564E49',
    sand: '#8B7961',
    chalk: '#BEB097',
    bronze: '#9A7944',
    iron: '#29272A',
  };
  const surfaces = Object.fromEntries(
    Object.entries(colors).map(([name, color]) => [
      name,
      new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: name === 'bronze' ? 0.45 : 0.03 }),
    ]),
  ) as Record<keyof typeof colors, THREE.MeshStandardMaterial>;
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const add = (
    geometry: THREE.BufferGeometry,
    surface: THREE.Material,
    position: [number, number, number] = [0, 0, 0],
    yaw = 0,
  ) => {
    geometry.rotateY(yaw).translate(...position);
    const parts = batches.get(surface) ?? [];
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
    batches.set(surface, parts);
  };
  const block = (
    size: [number, number, number],
    surface: THREE.Material,
    position: [number, number, number],
    yaw = 0,
  ) => add(new THREE.BoxGeometry(...size), surface, position, yaw);

  add(new THREE.CylinderGeometry(1, 1, 0.1, 96).scale(20.5, 1, 17), surfaces.shadowStone, [0, 0.035, 0]);
  add(new THREE.CylinderGeometry(1, 1, 0.08, 72).scale(10.1, 1, 7.5), surfaces.sand, [0, 0.12, 0]);
  for (const [radiusX, radiusZ] of [
    [6, 4.3],
    [9.3, 6.6],
  ]) {
    add(
      new THREE.TorusGeometry(1, 0.014, 4, 72).rotateX(Math.PI / 2).scale(radiusX, 1, radiusZ),
      surfaces.chalk,
      [0, 0.18, 0],
    );
  }

  // Five rising seating tiers leave the full +Z aisle and the sandy floor open.
  for (let tier = 0; tier < 5; tier++) {
    const innerX = 9.8 + tier * 1.65;
    const innerZ = 7.1 + tier * 1.5;
    const height = 0.58 + tier * 0.62;
    add(
      ovalBand(innerX + 1.65, innerZ + 1.5, innerX, innerZ, height),
      tier % 2 ? surfaces.darkSeats : surfaces.seats,
      [0, 0.15, 0],
    );
    add(ovalBand(innerX + 1.62, innerZ + 1.47, innerX + 1.36, innerZ + 1.24, 0.09), surfaces.trim, [
      0,
      height + 0.15,
      0,
    ]);
  }
  // Radial stair aisles visually divide the cavea into Roman seating wedges.
  for (let aisle = 1; aisle <= 11; aisle++) {
    const angle = (aisle / 12) * Math.PI * 2;
    for (let tier = 0; tier < 5; tier++) {
      block(
        [0.45, 0.13, 1.5],
        surfaces.shadowStone,
        [Math.sin(angle) * (10.65 + tier * 1.65), 0.79 + tier * 0.62, Math.cos(angle) * (7.85 + tier * 1.5)],
        angle,
      );
    }
  }

  // Repeated two-story stone arcades, pilasters, capitals and cornices give the
  // outer silhouette the recognisable rhythm of a Roman amphitheater.
  for (const [base, spring, outer, inner] of [
    [0.3, 2.63, 1.32, 0.95],
    [5.05, 2.15, 1.24, 0.91],
  ]) {
    for (let index = 0; index < 34; index++) {
      const angle = 0.37 + (index / 33) * (Math.PI * 2 - 0.74);
      const x = Math.sin(angle) * 18.35;
      const z = Math.cos(angle) * 14.7;
      const yaw = Math.atan2(Math.sin(angle) / 18.35, Math.cos(angle) / 14.7);
      add(arch(outer, inner, spring, 0.75), index % 3 ? surfaces.stone : surfaces.shadowStone, [x, base, z], yaw);
      block(
        [0.36, spring + outer + 0.14, 0.3],
        surfaces.trim,
        [x + Math.cos(yaw) * 1.34, base + (spring + outer) / 2, z - Math.sin(yaw) * 1.34],
        yaw,
      );
      block([2.68, 0.27, 1.05], surfaces.trim, [x, base + spring + outer + 0.16, z], yaw);
    }
  }
  for (const y of [0.22, 4.55, 4.88, 8.7, 9.1]) {
    add(ovalBand(19.05, 15.35, 17.85, 14.15, 0.23), y === 4.55 || y === 8.7 ? surfaces.shadowStone : surfaces.trim, [
      0,
      y,
      0,
    ]);
  }
  add(ovalBand(18.75, 15.05, 18.02, 14.32, 0.72), surfaces.stone, [0, 9.32, 0]);

  // The monumental entrance is a real opening, with no collision disk across it.
  add(arch(4.5, 3.75, 4.1, 1.05), surfaces.trim, [0, 0.16, 14.85]);
  for (const x of [-5.25, 5.25]) {
    block([2.1, 9.5, 2.05], surfaces.stone, [x, 4.9, 14.35]);
    block([2.5, 0.42, 2.45], surfaces.trim, [x, 9.76, 14.35]);
    block([2.16, 0.25, 2.1], surfaces.bronze, [x, 10.08, 14.35]);
    for (const offset of [-0.68, 0.68]) {
      add(new THREE.CylinderGeometry(0.19, 0.23, 8.1, 8), surfaces.trim, [x + offset, 4.47, 15.47]);
    }
  }

  const bannerSurfaces = ARENA_BRAND_SYMBOLS.map(
    (brand) =>
      new THREE.MeshStandardMaterial({
        map: bannerTexture(brand),
        side: THREE.DoubleSide,
        roughness: 0.96,
        metalness: 0,
      }),
  );
  for (let index = 0; index < 14; index++) {
    const angle = 0.45 + (index / 13) * (Math.PI * 2 - 0.9);
    const x = Math.sin(angle) * 19.12;
    const z = Math.cos(angle) * 15.49;
    const yaw = Math.atan2(Math.sin(angle) / 19.12, Math.cos(angle) / 15.49);
    block([1.95, 0.1, 0.16], surfaces.bronze, [x, 8.45, z], yaw);
    add(new THREE.PlaneGeometry(1.75, 2.7), bannerSurfaces[index % 2], [x, 6.98, z], yaw);
  }

  const flames: THREE.Mesh[] = [];
  const fire = new THREE.MeshBasicMaterial({ color: '#F4A547', toneMapped: false });
  for (const x of [-4.7, 4.7]) {
    add(new THREE.CylinderGeometry(0.65, 0.85, 0.3, 12), surfaces.shadowStone, [x, 0.3, 16]);
    add(new THREE.CylinderGeometry(0.18, 0.35, 1.7, 10), surfaces.bronze, [x, 1.22, 16]);
    add(new THREE.CylinderGeometry(0.8, 0.3, 0.55, 12, 1, true), surfaces.iron, [x, 2.18, 16]);
    const flame = mesh(group, new THREE.IcosahedronGeometry(0.5, 0), fire, [x, 2.68, 16]);
    flame.scale.set(0.55, 1.6, 0.55);
    flames.push(flame);
  }

  for (const [surface, parts] of batches) {
    const geometry = mergeGeometries(parts);
    if (geometry) mesh(group, geometry, surface);
    parts.forEach((part) => part.dispose());
  }
  const animateGladiators = createGladiatorDuel(group, surfaces.bronze, surfaces.iron);
  label(group, 'VENI. VIDI. TINY VICTORIES.', [0, 9.3, 15.2], 8.7, '#DCC7A0');
  register(group, { kind: 'zone', id: 'arena' }, 'Enter the Roman Arena');
  arenaCollisionObstacles().forEach((item) => obstacle(item.x, item.z, item.radius));

  // Geometry, materials and both local canvas textures are released by the
  // scene's existing disposeObject lifecycle. This module owns no timers or IO.
  return {
    group,
    animate(time: number) {
      if (!Number.isFinite(time)) return;
      flames.forEach((flame, index) => {
        flame.scale.y = 1.55 + Math.sin(time * 7.5 + index * 2.4) * 0.17;
        flame.rotation.y = time * 0.6 + index;
      });
      animateGladiators(time);
    },
  };
}
