import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WorldBurnEscapeFrame } from '@/libs/world/world-burn-escape';
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

/** Two local sculpted performers, never network users or collision obstacles. */
function createGladiatorDuel(parent: THREE.Group) {
  const duel = new THREE.Group();
  duel.name = 'arena-gladiator-duel';
  duel.position.set(0, 0.17, -1.4);
  parent.add(duel);
  const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  const bronze = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.43, metalness: 0.72 });
  const steel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.29, metalness: 0.8 });
  const batches = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
  const add = (
    target: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    surface: THREE.Material,
    color: string,
    position: [number, number, number] = [0, 0, 0],
  ) => {
    geometry.translate(...position);
    const tint = new THREE.Color(color);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let vertex = 0; vertex < colors.length; vertex += 3) tint.toArray(colors, vertex);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const surfaces = batches.get(target) ?? new Map<THREE.Material, THREE.BufferGeometry[]>();
    const parts = surfaces.get(surface) ?? [];
    // The beveled sword is non-indexed; normalize the other primitives once at
    // creation so each joint/material can still become a single draw call.
    parts.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
    surfaces.set(surface, parts);
    batches.set(target, surfaces);
  };
  const oval = (
    target: THREE.Object3D,
    surface: THREE.Material,
    color: string,
    size: [number, number, number],
    position: [number, number, number],
  ) => add(target, new THREE.SphereGeometry(1, 16, 10).scale(...size), surface, color, position);
  const limb = (
    target: THREE.Object3D,
    color: string,
    radius: number,
    length: number,
    position: [number, number, number],
  ) => add(target, new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 12), cloth, color, position);
  const band = (
    target: THREE.Object3D,
    surface: THREE.Material,
    color: string,
    radius: number,
    height: number,
    position: [number, number, number],
    depth = 1,
  ) => add(target, new THREE.CylinderGeometry(radius, radius, height, 20).scale(1, 1, depth), surface, color, position);
  const strip = (
    target: THREE.Object3D,
    surface: THREE.Material,
    color: string,
    size: [number, number, number],
    position: [number, number, number],
  ) => add(target, new THREE.BoxGeometry(...size), surface, color, position);
  const gold = '#B28A50';
  const edge = '#D4B27B';
  const leather = '#4F3930';
  const iron = '#343B40';

  const fighters = ['#A84450', '#397F86'].map((tunic, index) => {
    const complexion = index ? '#A57154' : '#C59170';
    const fighter = new THREE.Group();
    fighter.name = `arena-gladiator-${index === 0 ? 'crimson' : 'teal'}`;
    duel.add(fighter);
    add(
      fighter,
      new THREE.LatheGeometry(
        [
          [0, 0.81],
          [0.21, 0.81],
          [0.225, 0.94],
          [0.26, 1.16],
          [0.275, 1.25],
          [0.17, 1.355],
          [0, 1.37],
        ].map(([radius, y]) => new THREE.Vector2(radius, y)),
        20,
      ).scale(1, 1, 0.68),
      cloth,
      tunic,
    );
    oval(fighter, bronze, iron, [0.27, 0.268, 0.157], [0, 1.135, 0.018]);
    oval(fighter, bronze, '#434B4C', [0.239, 0.226, 0.034], [0, 1.137, -0.178]);
    strip(fighter, bronze, '#67716E', [0.019, 0.27, 0.013], [0, 1.149, -0.212]);
    for (const side of [-1, 1]) {
      strip(fighter, bronze, gold, [0.046, 0.143, 0.036], [side * 0.173, 1.32, -0.108]);
      oval(fighter, bronze, edge, [0.016, 0.016, 0.011], [side * 0.165, 1.257, -0.2]);
    }
    // Cuirass plates have a raised sternum and overlapping abdominal bands;
    // bronze rivets and leather pteruges make the miniature read as constructed.
    for (const side of [-1, 1]) {
      oval(fighter, bronze, '#555B5C', [0.127, 0.131, 0.036], [side * 0.126, 1.217, 0.147]);
      strip(fighter, bronze, gold, [0.053, 0.153, 0.041], [side * 0.176, 1.328, 0.083]);
      oval(fighter, bronze, edge, [0.017, 0.017, 0.014], [side * 0.178, 1.268, 0.176]);
    }
    for (let plate = 0; plate < 3; plate++) {
      oval(
        fighter,
        bronze,
        plate % 2 ? '#475052' : '#596162',
        [0.214 - plate * 0.01, 0.07, 0.025],
        [0, 1.082 - plate * 0.079, 0.161 - plate * 0.008],
      );
      for (const side of [-1, 1])
        oval(
          fighter,
          bronze,
          gold,
          [0.011, 0.011, 0.012],
          [side * (0.172 - plate * 0.009), 1.086 - plate * 0.079, 0.18 - plate * 0.008],
        );
    }
    add(fighter, new THREE.CylinderGeometry(0.255, 0.322, 0.28, 20).scale(1, 1, 0.76), cloth, tunic, [0, 0.78, 0]);
    for (let panel = 0; panel < 12; panel++) {
      const angle = (panel / 12) * Math.PI * 2;
      add(
        fighter,
        new THREE.CapsuleGeometry(0.042, 0.165, 3, 8).scale(1, 1, 0.24).rotateY(angle),
        cloth,
        panel % 2 ? '#634739' : leather,
        [Math.sin(angle) * 0.293, 0.78, Math.cos(angle) * 0.229],
      );
      oval(fighter, bronze, gold, [0.012, 0.012, 0.012], [Math.sin(angle) * 0.297, 0.877, Math.cos(angle) * 0.233]);
    }
    band(fighter, cloth, leather, 0.255, 0.074, [0, 0.918, 0], 0.74);
    for (const y of [0.889, 0.948])
      add(fighter, new THREE.TorusGeometry(0.254, 0.011, 4, 24).rotateX(Math.PI / 2).scale(1, 1, 0.745), bronze, gold, [
        0,
        y,
        0,
      ]);
    strip(fighter, bronze, edge, [0.101, 0.069, 0.026], [0, 0.918, 0.204]);
    strip(fighter, cloth, leather, [0.062, 0.037, 0.028], [0, 0.918, 0.219]);
    limb(fighter, complexion, 0.086, 0.18, [0, 1.39, 0]);
    oval(fighter, cloth, complexion, [0.214, 0.257, 0.21], [0, 1.592, 0.012]);
    oval(fighter, cloth, complexion, [0.171, 0.113, 0.166], [0, 1.453, 0.035]);
    for (const side of [-1, 1]) {
      oval(fighter, cloth, '#D7CCB9', [0.034, 0.012, 0.01], [side * 0.087, 1.592, 0.208]);
      oval(fighter, cloth, '#2C2623', [0.013, 0.011, 0.009], [side * 0.087, 1.591, 0.219]);
      oval(fighter, cloth, '#DAD2BD', [0.0025, 0.0025, 0.002], [side * 0.087 - 0.004, 1.595, 0.227]);
      add(fighter, new THREE.BoxGeometry(0.067, 0.022, 0.017).rotateZ(side * 0.15), cloth, '#3A291F', [
        side * 0.086,
        1.621,
        0.21,
      ]);
      // Curved cheek guards leave the face and chin open below a domed helmet.
      oval(fighter, bronze, gold, [0.074, 0.135, 0.047], [side * 0.187, 1.509, 0.133]);
      oval(fighter, bronze, edge, [0.04, 0.092, 0.012], [side * 0.19, 1.503, 0.172]);
      for (const y of [1.451, 1.567]) oval(fighter, bronze, '#E0C48F', [0.01, 0.01, 0.009], [side * 0.19, y, 0.186]);
    }
    oval(fighter, cloth, complexion, [0.032, 0.052, 0.049], [0, 1.547, 0.22]);
    strip(fighter, cloth, '#7F5442', [0.079, 0.009, 0.013], [0, 1.459, 0.202]);
    add(
      fighter,
      new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, 1.74).scale(0.264, 0.211, 0.256),
      bronze,
      gold,
      [0, 1.681, -0.016],
    );
    add(
      fighter,
      new THREE.TorusGeometry(0.26, 0.018, 6, 32).rotateX(Math.PI / 2).scale(1, 1, 0.976),
      bronze,
      edge,
      [0, 1.647, -0.016],
    );
    for (let rivet = 0; rivet < 10; rivet++) {
      const angle = (rivet / 10) * Math.PI * 2;
      oval(
        fighter,
        bronze,
        '#E0C48F',
        [0.011, 0.011, 0.011],
        [Math.sin(angle) * 0.256, 1.674, Math.cos(angle) * 0.252 - 0.016],
      );
    }
    add(fighter, new THREE.CapsuleGeometry(0.02, 0.15, 4, 8).scale(1, 1, 0.65), bronze, edge, [0, 1.561, 0.241]);
    strip(fighter, bronze, '#795A35', [0.091, 0.041, 0.404], [0, 1.878, -0.033]);
    for (let tuft = 0; tuft < 7; tuft++) {
      const offset = tuft - 3;
      add(
        fighter,
        new THREE.SphereGeometry(1, 12, 8).scale(0.041, 0.115, 0.054).rotateX(offset * 0.09),
        cloth,
        tuft % 2 ? tunic : index ? '#64A2A4' : '#CC6370',
        [0, 1.965 - Math.abs(offset) * 0.02, offset * 0.062 - 0.032],
      );
    }

    const knees: THREE.Group[] = [];
    const legs = [-1, 1].map((side) => {
      const leg = new THREE.Group();
      leg.name = 'gladiator-leg';
      leg.position.set(side * 0.16, 0.748, 0);
      fighter.add(leg);
      limb(leg, complexion, 0.095, 0.365, [0, -0.143, 0]);
      const knee = new THREE.Group();
      knee.name = 'gladiator-knee';
      knee.position.y = -0.325;
      leg.add(knee);
      oval(knee, cloth, complexion, [0.089, 0.093, 0.081], [0, 0, 0]);
      limb(knee, complexion, 0.072, 0.315, [0, -0.156, 0]);
      oval(knee, bronze, gold, [0.094, 0.097, 0.038], [0, -0.006, 0.071]);
      oval(knee, bronze, gold, [0.085, 0.136, 0.032], [0, -0.181, 0.064]);
      strip(knee, bronze, edge, [0.014, 0.188, 0.013], [0, -0.178, 0.097]);
      for (const y of [-0.082, -0.258]) band(knee, cloth, leather, 0.076, 0.03, [0, y, 0]);
      oval(knee, cloth, complexion, [0.089, 0.058, 0.161], [0, -0.321, 0.064]);
      oval(knee, cloth, '#292B2C', [0.107, 0.029, 0.188], [0, -0.37, 0.069]);
      oval(knee, cloth, leather, [0.105, 0.019, 0.186], [0, -0.347, 0.069]);
      for (let strap = 0; strap < 3; strap++) {
        strip(knee, cloth, leather, [0.182, 0.028, 0.027], [0, -0.275 - strap * 0.006, 0.03 + strap * 0.057]);
        oval(knee, bronze, gold, [0.011, 0.011, 0.012], [side * 0.07, -0.257 - strap * 0.006, 0.03 + strap * 0.057]);
      }
      band(knee, cloth, leather, 0.074, 0.034, [0, -0.275, 0]);
      knees.push(knee);
      return leg;
    });
    const elbows: THREE.Group[] = [];
    const arms = [-1, 1].map((side) => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.355, 1.29, 0);
      fighter.add(arm);
      limb(arm, complexion, 0.087, 0.335, [0, -0.116, 0]);
      for (let plate = 0; plate < 3; plate++) {
        add(
          arm,
          new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, 1.75).scale(
            0.155 - plate * 0.011,
            0.104,
            0.143 - plate * 0.01,
          ),
          bronze,
          plate % 2 ? '#96713E' : gold,
          [side * 0.011, 0.024 - plate * 0.065, 0],
        );
        oval(arm, bronze, edge, [0.012, 0.012, 0.012], [side * (0.145 - plate * 0.01), 0.025 - plate * 0.065, 0.007]);
      }
      const elbow = new THREE.Group();
      elbow.name = 'gladiator-elbow';
      elbow.position.y = -0.281;
      arm.add(elbow);
      limb(elbow, complexion, 0.071, 0.303, [0, -0.12, 0]);
      oval(elbow, bronze, gold, [0.078, 0.106, 0.022], [0, -0.126, 0.059]);
      for (const y of [-0.053, -0.203]) band(elbow, bronze, gold, 0.075, 0.026, [0, y, 0]);
      oval(elbow, cloth, complexion, [0.078, 0.088, 0.063], [0, -0.285, 0.006]);
      oval(elbow, cloth, complexion, [0.031, 0.049, 0.037], [-side * 0.062, -0.287, 0.037]);
      for (let finger = 0; finger < 3; finger++)
        strip(elbow, cloth, '#99664D', [0.095, 0.007, 0.008], [0, -0.262 - finger * 0.027, 0.067]);
      elbows.push(elbow);
      return arm;
    });
    const [swordArm, shieldArm] = arms;
    const [swordElbow, shieldElbow] = elbows;
    swordArm.name = 'gladiator-sword-arm';
    shieldArm.name = 'gladiator-shield-arm';
    band(swordElbow, cloth, leather, 0.031, 0.159, [0, -0.298, 0]);
    for (let wrap = 0; wrap < 4; wrap++)
      band(swordElbow, bronze, '#89683F', 0.033, 0.008, [0, -0.23 - wrap * 0.043, 0]);
    oval(swordElbow, bronze, edge, [0.055, 0.046, 0.045], [0, -0.202, 0]);
    add(swordElbow, new THREE.CapsuleGeometry(0.024, 0.205, 4, 12).rotateZ(Math.PI / 2), bronze, edge, [0, -0.401, 0]);
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.054, 0);
    bladeShape.lineTo(0.054, 0);
    bladeShape.lineTo(0.061, -0.325);
    bladeShape.quadraticCurveTo(0.035, -0.419, 0, -0.459);
    bladeShape.quadraticCurveTo(-0.035, -0.419, -0.061, -0.325);
    bladeShape.closePath();
    add(
      swordElbow,
      new THREE.ExtrudeGeometry(bladeShape, {
        depth: 0.023,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.008,
        bevelThickness: 0.006,
        curveSegments: 5,
      }).translate(0, 0, -0.0115),
      steel,
      '#CDD6D8',
      [0, -0.438, 0],
    );
    strip(swordElbow, steel, '#8A9CA3', [0.012, 0.365, 0.006], [0, -0.65, 0.02]);
    const shield = new THREE.Group();
    shield.name = 'gladiator-riveted-shield';
    shield.position.set(0, -0.299, 0.077);
    shield.rotation.x = 1.24;
    shieldElbow.add(shield);
    oval(shield, bronze, '#745633', [0.358, 0.455, 0.06], [0, 0, 0]);
    oval(shield, cloth, tunic, [0.324, 0.42, 0.064], [0, 0, 0.025]);
    add(shield, new THREE.TorusGeometry(0.338, 0.02, 6, 36).scale(1, 1.277, 1), bronze, edge, [0, 0, 0.031]);
    strip(shield, bronze, gold, [0.037, 0.708, 0.019], [0, 0, 0.091]);
    strip(shield, bronze, gold, [0.469, 0.028, 0.022], [0, 0, 0.091]);
    for (let rivet = 0; rivet < 12; rivet++) {
      const angle = (rivet / 12) * Math.PI * 2;
      oval(shield, bronze, '#E3C28C', [0.013, 0.013, 0.013], [Math.sin(angle) * 0.299, Math.cos(angle) * 0.387, 0.062]);
    }
    oval(shield, bronze, gold, [0.097, 0.097, 0.027], [0, 0, 0.108]);
    oval(shield, steel, '#C6CECC', [0.073, 0.073, 0.053], [0, 0, 0.126]);
    return { fighter, legs, knees, swordArm, shieldArm, swordElbow, shieldElbow };
  });
  for (const [target, surfaces] of batches) {
    for (const [surface, parts] of surfaces) {
      const geometry = mergeGeometries(parts);
      parts.forEach((part) => part.dispose());
      if (geometry) mesh(target, geometry, surface);
    }
  }

  // Keep the existing twelve-second duel exactly: each six-second exchange
  // swaps attacker and defender through the same orbit, lunge, parry and retreat.
  // Extra knee/elbow articulation is a bounded, allocation-free part of that pose.
  const pulse = (phase: number, start: number, end: number) => {
    if (phase <= start || phase >= end) return 0;
    return Math.sin(((phase - start) / (end - start)) * Math.PI) ** 2;
  };
  const animate = (time: number) => {
    const phase = ((time % 12) + 12) % 12;
    const orbit = (phase / 12) * Math.PI * 2;
    for (let index = 0; index < fighters.length; index++) {
      const { fighter, legs, knees, swordArm, shieldArm, swordElbow, shieldElbow } = fighters[index];
      if (fighter.parent !== duel || fighter.userData.worldBurnPending === true || !fighter.visible) continue;
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
      knees[0].rotation.x = 0.06 + Math.max(0, step) * 0.2 + approach * 0.08;
      knees[1].rotation.x = 0.06 + Math.max(0, -step) * 0.2 + approach * 0.08;
      swordArm.rotation.set(attacking ? -2.25 + strike * 1.35 : -1.65 - parry * 0.2, 0, -0.12);
      shieldArm.rotation.set(-1.02 - (attacking ? 0.08 : parry * 0.43), 0, 0.12 + parry * 0.08);
      swordElbow.rotation.x = attacking ? -0.28 + strike * 0.25 : -0.23 - parry * 0.1;
      shieldElbow.rotation.x = -0.22 - (attacking ? 0 : parry * 0.14);
    }
  };
  animate(0);
  return {
    animate,
    gladiators: fighters.map(({ fighter, legs, knees, swordArm, shieldArm, swordElbow, shieldElbow }) => ({
      group: fighter,
      setEscapePose(frame: WorldBurnEscapeFrame, reducedMotion: boolean) {
        const stride = reducedMotion ? 0 : frame.stride;
        const falling = frame.falling && !reducedMotion;
        for (let index = 0; index < legs.length; index++) {
          const swing = stride * (index ? 0.88 : -0.88);
          legs[index].rotation.set(falling ? 0.2 : swing, 0, 0);
          knees[index].rotation.x = reducedMotion ? 0 : 0.16 + Math.max(0, swing) * 1.25;
        }
        swordArm.rotation.set(falling ? -2.2 : stride * 0.7, 0, falling ? -0.7 : -0.18);
        shieldArm.rotation.set(falling ? -2.2 : -stride * 0.7, 0, falling ? 0.7 : 0.18);
        swordElbow.rotation.x = reducedMotion ? -0.3 : -1.1;
        shieldElbow.rotation.x = reducedMotion ? -0.3 : -0.9;
      },
    })),
  };
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
  const duel = createGladiatorDuel(group);
  label(group, 'VENI. VIDI. TINY VICTORIES.', [0, 9.3, 15.2], 8.7, '#DCC7A0');
  register(group, { kind: 'zone', id: 'arena' }, 'Enter the Roman Arena');
  arenaCollisionObstacles().forEach((item) => obstacle(item.x, item.z, item.radius));

  // Geometry, materials and both local canvas textures are released by the
  // scene's existing disposeObject lifecycle. This module owns no timers or IO.
  return {
    group,
    gladiators: duel.gladiators,
    animate(time: number) {
      if (!Number.isFinite(time)) return;
      flames.forEach((flame, index) => {
        flame.scale.y = 1.55 + Math.sin(time * 7.5 + index * 2.4) * 0.17;
        flame.rotation.y = time * 0.6 + index;
      });
      duel.animate(time);
    },
  };
}
