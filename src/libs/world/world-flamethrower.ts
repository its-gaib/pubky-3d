import * as THREE from 'three';
import type { Point3 } from '@/libs/world/world-geometry';
import { createLandmarkBuilder, type LandmarkBuilder } from '@/libs/world/world-landmark-details';
import { PERSONA_RADIUS, WORLD_RADIUS, type WorldObstacle } from '@/libs/world/world-motion';
import { resolveRidePosition } from '@/libs/world/world-transport-motion';

export const FLAMETHROWER_POSITION = [-64, -8] as const;
export const FLAMETHROWER_PICKUP_DISTANCE = 3.6;
export const FLAMETHROWER_OBSTACLE_RADIUS = 0.6;
export const FLAMETHROWER_GRIPS = {
  right: [0.3, 1.4, 0.35],
  left: [-0.25, 1.45, 0.75],
} as const;
export const FLAMETHROWER_MUZZLE = [0.12, 1.42, 1.74] as const;

export interface WorldToolAction {
  kind: 'tool';
  id: 'flamethrower';
}

interface FlamethrowerPlayer {
  group: THREE.Group;
  /** A floor-origin anchor; the persona articulates around the exported grips. */
  toolMount: THREE.Group;
}

const C = {
  shell: '#293235',
  rubber: '#141B1E',
  steel: '#A8B4B8',
  darkSteel: '#4A585C',
  orange: '#F47528',
  warning: '#EFDAA1',
  brass: '#B69B58',
} as const;

function hose(builder: LandmarkBuilder, root: THREE.Object3D, points: Point3[], radius: number, color: string) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  builder.add(root, new THREE.TubeGeometry(curve, 32, radius, 8, false), 'rubber', color);
}

/** Detailed original prop; merged surfaces share resources without external textures. */
export function createWorldFlamethrowerModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'tool-flamethrower';
  root.userData.toolKind = 'flamethrower';
  const weapon = new THREE.Group();
  weapon.name = 'flamethrower-body';
  const stand = new THREE.Group();
  stand.name = 'flamethrower-stand';
  root.add(weapon, stand);
  const builder = createLandmarkBuilder();

  builder.box(weapon, [0.34, 0.25, 0.65], 'paint', C.shell, [0.12, 1.48, 0.58], 0.034);
  builder.box(weapon, [0.23, 0.07, 0.56], 'metal', C.darkSteel, [0.12, 1.64, 0.58], 0.012);
  builder.box(weapon, [0.2, 0.15, 0.26], 'paint', C.orange, [0.12, 1.49, 0.16], 0.025);
  for (const side of [-1, 1]) {
    builder.box(weapon, [0.012, 0.17, 0.32], 'metal', C.darkSteel, [0.12 + side * 0.174, 1.48, 0.57], 0.004);
    for (const z of [0.45, 0.7]) {
      builder.cylinder(weapon, 0.016, 0.016, 0.018, 'metal', C.steel, [0.12 + side * 0.185, 1.53, z], 12, [
        0,
        0,
        Math.PI / 2,
      ]);
    }
    for (let vent = 0; vent < 5; vent++) {
      builder.box(weapon, [0.009, 0.055, 0.019], 'rubber', C.rubber, [0.12 + side * 0.183, 1.45, 0.445 + vent * 0.058]);
    }
  }

  // Exposed inner barrel and longitudinal cage ribs leave real gaps between vents.
  builder.cylinder(weapon, 0.077, 0.077, 0.82, 'metal', C.darkSteel, [0.12, 1.42, 1.19], 32, [Math.PI / 2, 0, 0]);
  for (const z of [0.83, 1.14, 1.44]) {
    builder.torus(weapon, 0.137, 0.021, 'metal', C.steel, [0.12, 1.42, z], [0, 0, 0]);
  }
  for (let rib = 0; rib < 10; rib++) {
    const angle = (rib / 10) * Math.PI * 2;
    builder.box(
      weapon,
      [0.03, 0.023, 0.61],
      'metal',
      rib % 2 ? C.darkSteel : C.steel,
      [0.12 + Math.sin(angle) * 0.133, 1.42 + Math.cos(angle) * 0.133, 1.135],
      0.004,
      [0, 0, -angle],
    );
  }
  builder.add(
    weapon,
    new THREE.CylinderGeometry(0.161, 0.12, 0.15, 32, 1, true),
    'metal',
    C.darkSteel,
    [0.12, 1.42, 1.605],
    [Math.PI / 2, 0, 0],
  );
  builder.torus(weapon, 0.159, 0.022, 'metal', C.steel, [0.12, 1.42, 1.68], [0, 0, 0]);
  builder.cylinder(weapon, 0.094, 0.094, 0.012, 'rubber', C.rubber, [0.12, 1.42, 1.595], 24, [Math.PI / 2, 0, 0]);
  builder.beam(weapon, [0.26, 1.31, 1.32], [0.26, 1.35, 1.67], 0.017, 'metal', C.brass);
  builder.torus(weapon, 0.022, 0.007, 'light:#FFAC54', '#FFC786', [0.26, 1.35, 1.68], [0, 0, 0]);

  // A visible orange pressure canister, retaining straps and a mechanical gauge.
  builder.cylinder(weapon, 0.157, 0.157, 0.53, 'paint', C.orange, [-0.39, 1.31, 0.12], 32);
  for (const y of [1.045, 1.575]) {
    builder.oval(weapon, [0.157, 0.055, 0.157], 'paint', C.orange, [-0.39, y, 0.12]);
  }
  for (const y of [1.15, 1.48]) {
    builder.cylinder(weapon, 0.162, 0.162, 0.05, 'metal', C.darkSteel, [-0.39, y, 0.12], 32);
    builder.box(weapon, [0.27, 0.05, 0.04], 'metal', C.darkSteel, [-0.19, y, 0.12]);
  }
  builder.cylinder(weapon, 0.04, 0.04, 0.085, 'metal', C.brass, [-0.39, 1.66, 0.12], 12);
  builder.torus(weapon, 0.083, 0.014, 'metal', C.darkSteel, [-0.39, 1.705, 0.12]);
  for (const angle of [0, Math.PI / 2]) {
    builder.box(weapon, [0.13, 0.013, 0.017], 'metal', C.darkSteel, [-0.39, 1.705, 0.12], 0.004, [0, angle, 0]);
  }
  builder.cylinder(weapon, 0.07, 0.07, 0.034, 'metal', C.steel, [-0.39, 1.41, 0.294], 24, [Math.PI / 2, 0, 0]);
  builder.cylinder(weapon, 0.054, 0.054, 0.008, 'paint', C.warning, [-0.39, 1.41, 0.314], 24, [Math.PI / 2, 0, 0]);
  builder.box(weapon, [0.01, 0.045, 0.006], 'rubber', C.rubber, [-0.402, 1.425, 0.32], 0, [0, 0, -0.7]);
  for (let stripe = 0; stripe < 3; stripe++) {
    builder.box(
      weapon,
      [0.028, 0.12, 0.006],
      'rubber',
      C.rubber,
      [-0.465 + stripe * 0.071, 1.265, 0.279],
      0,
      [0, 0, -0.35],
    );
  }
  hose(
    builder,
    weapon,
    [
      [-0.43, 1.63, 0.12],
      [-0.61, 1.42, 0.3],
      [-0.49, 1.0, 0.57],
      [-0.1, 1.14, 0.6],
      [0.05, 1.37, 0.71],
    ],
    0.031,
    C.rubber,
  );
  hose(
    builder,
    weapon,
    [
      [0.01, 1.35, 0.52],
      [-0.03, 1.23, 0.8],
      [0.23, 1.25, 1.03],
      [0.26, 1.31, 1.35],
    ],
    0.014,
    C.orange,
  );
  for (const point of [
    [-0.43, 1.61, 0.12],
    [0.05, 1.37, 0.71],
  ] as const) {
    builder.cylinder(weapon, 0.046, 0.046, 0.06, 'metal', C.brass, [...point], 12);
  }

  const right: Point3 = [...FLAMETHROWER_GRIPS.right];
  const left: Point3 = [...FLAMETHROWER_GRIPS.left];
  builder.box(weapon, [0.103, 0.255, 0.11], 'rubber', C.rubber, right, 0.018, [-0.16, 0, 0]);
  for (let groove = 0; groove < 5; groove++) {
    builder.box(weapon, [0.107, 0.007, 0.012], 'metal', C.darkSteel, [
      right[0],
      right[1] - 0.08 + groove * 0.035,
      right[2] + 0.056,
    ]);
  }
  builder.beam(weapon, [0.23, 1.58, 0.35], [0.3, 1.51, 0.35], 0.029, 'metal', C.steel);
  builder.torus(weapon, 0.084, 0.012, 'metal', C.darkSteel, [0.3, 1.42, 0.47], [0, Math.PI / 2, 0], Math.PI * 1.45);
  builder.beam(weapon, [0.3, 1.47, 0.405], [0.3, 1.41, 0.44], 0.012, 'metal', C.orange);
  builder.beam(weapon, left, [0.12, 1.47, 0.75], 0.03, 'metal', C.steel);
  builder.cylinder(weapon, 0.046, 0.046, 0.24, 'rubber', C.rubber, left, 20, [0, 0, Math.PI / 2]);
  for (const x of [-0.37, -0.13]) {
    builder.cylinder(weapon, 0.054, 0.054, 0.018, 'metal', C.darkSteel, [x, left[1], left[2]], 20, [0, 0, Math.PI / 2]);
  }

  builder.box(stand, [0.71, 0.07, 0.7], 'metal', C.darkSteel, [0.06, 0.08, 0.46], 0.025);
  for (const x of [-0.23, 0.35]) {
    for (const z of [0.18, 0.74]) {
      builder.cylinder(stand, 0.085, 0.1, 0.065, 'rubber', C.rubber, [x, 0.0325, z], 20);
    }
  }
  builder.cylinder(stand, 0.038, 0.054, 1.18, 'metal', C.steel, [0.06, 0.69, 0.46], 20);
  for (const x of [-0.11, 0.23]) {
    builder.beam(stand, [0.06, 1.2, 0.46], [x, 1.365, 0.46], 0.026, 'metal', C.darkSteel);
    builder.oval(stand, [0.048, 0.037, 0.058], 'rubber', C.rubber, [x, 1.36, 0.46]);
  }
  builder.flush();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.name = object.name.replace('landmark-batch-', 'flamethrower-surface-');
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
  });
  const muzzle = new THREE.Object3D();
  muzzle.name = 'flamethrower-muzzle';
  muzzle.position.set(...FLAMETHROWER_MUZZLE);
  root.add(muzzle);
  root.updateMatrixWorld(true);
  return root;
}

/** One scene-owned tool. Firing has no effects here; the scene owns the shared stream and burn registry. */
export function createWorldFlamethrower(
  scene: THREE.Scene,
  player: FlamethrowerPlayer,
  register: (object: THREE.Object3D, action: WorldToolAction, title: string) => void,
  obstacles: WorldObstacle[],
) {
  const model = createWorldFlamethrowerModel();
  const stand = model.getObjectByName('flamethrower-stand')!;
  const home = resolveRidePosition(...FLAMETHROWER_POSITION, FLAMETHROWER_OBSTACLE_RADIUS + 0.4, obstacles);
  model.position.set(home.x, 0.15, home.z);
  model.rotation.y = -0.6;
  scene.add(model);
  const obstacle: WorldObstacle = {
    x: home.x,
    z: home.z,
    radius: FLAMETHROWER_OBSTACLE_RADIUS,
    height: new THREE.Box3().setFromObject(model).max.y,
  };
  obstacles.push(obstacle);
  register(model, { kind: 'tool', id: 'flamethrower' }, 'Equip flamethrower');
  let equipped = false;
  let firing = false;
  let available = true;
  let disposed = false;

  const nearby = () =>
    player.group.position.y < 0.7 &&
    Math.hypot(player.group.position.x - model.position.x, player.group.position.z - model.position.z) <=
      FLAMETHROWER_PICKUP_DISTANCE;

  const park = (x: number, z: number, rotation: number) => {
    scene.add(model);
    model.position.set(x, 0.15, z);
    model.rotation.set(0, rotation, 0);
    stand.visible = true;
    obstacle.x = x;
    obstacle.z = z;
    obstacle.enabled = available;
    equipped = false;
    firing = false;
  };

  return {
    model,
    obstacle,
    get active() {
      return equipped;
    },
    get equipped() {
      return equipped;
    },
    get isFiring() {
      return equipped && firing && available && !disposed;
    },
    isAvailable() {
      return !equipped && available && !disposed && nearby();
    },
    equip() {
      if (equipped || !available || disposed || !nearby()) return false;
      equipped = true;
      firing = false;
      obstacle.enabled = false;
      stand.visible = false;
      player.toolMount.add(model);
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      return true;
    },
    drop() {
      firing = false;
      if (!equipped || disposed || player.group.position.y >= 0.7) return false;
      for (const offset of [
        0,
        Math.PI / 2,
        -Math.PI / 2,
        Math.PI,
        Math.PI / 4,
        -Math.PI / 4,
        Math.PI * 0.75,
        -Math.PI * 0.75,
      ]) {
        const rotation = player.group.rotation.y + offset;
        const x = player.group.position.x + Math.sin(rotation) * 1.9;
        const z = player.group.position.z + Math.cos(rotation) * 1.9;
        if (Math.hypot(x, z) > WORLD_RADIUS - FLAMETHROWER_OBSTACLE_RADIUS - 0.4) continue;
        if (
          obstacles.some(
            (entry) =>
              entry.enabled !== false &&
              (entry.minHeight ?? 0) <= 0 &&
              Math.hypot(x - entry.x, z - entry.z) < entry.radius + FLAMETHROWER_OBSTACLE_RADIUS + 0.1,
          )
        )
          continue;
        if (
          Math.hypot(x - player.group.position.x, z - player.group.position.z) <
          PERSONA_RADIUS + FLAMETHROWER_OBSTACLE_RADIUS
        )
          continue;
        park(x, z, player.group.rotation.y);
        return true;
      }
      return false;
    },
    setFiring(value: boolean) {
      firing = value && equipped && available && !disposed;
    },
    clearInput() {
      firing = false;
    },
    setAvailable(value: boolean) {
      available = value;
      obstacle.enabled = value && !equipped && !disposed;
      if (!available) firing = false;
    },
    getNozzle(origin: THREE.Vector3, direction: THREE.Vector3) {
      if (!equipped || !available || disposed) return false;
      model.updateWorldMatrix(true, false);
      origin.set(...FLAMETHROWER_MUZZLE).applyMatrix4(model.matrixWorld);
      direction.set(0, 0, 1).transformDirection(model.matrixWorld);
      return true;
    },
    /** Reparent held geometry before the scene disposes its shared resources. */
    dispose() {
      if (disposed) return;
      if (equipped) park(player.group.position.x, player.group.position.z, player.group.rotation.y);
      firing = false;
      available = false;
      disposed = true;
    },
  };
}
