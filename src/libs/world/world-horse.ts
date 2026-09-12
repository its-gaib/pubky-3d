import * as THREE from 'three';
import { createWorldKnightArmorStand } from '@/libs/world/world-knight';
import { createLandmarkBuilder } from '@/libs/world/world-landmark-details';

export const WORLD_HORSE = {
  rideSeconds: 60,
  restSeconds: 120,
  saddle: [0, 2.48, -0.12],
  stirrup: [0.72, 1.55, -0.05],
  reins: [0.37, 2.98, 0.95],
} as const;

/** Stamina belongs to this horse, so dismounting, transfer and remounting cannot refill it. */
export function createWorldHorseStamina() {
  let used = 0;
  let rest = 0;
  return {
    step(seconds: number, mounted: boolean) {
      const delta = Number.isFinite(seconds) ? THREE.MathUtils.clamp(seconds, 0, 0.05) : 0;
      if (mounted && rest === 0) used = Math.min(WORLD_HORSE.rideSeconds, used + delta);
      else if (!mounted && rest > 0) {
        rest = Math.max(0, rest - delta);
        if (rest < 1e-8) {
          rest = 0;
          used = 0;
        }
      }
    },
    dismounted() {
      if (used + 1e-8 >= WORLD_HORSE.rideSeconds && rest === 0) rest = WORLD_HORSE.restSeconds;
    },
    canMount: () => used + 1e-8 < WORLD_HORSE.rideSeconds && rest === 0,
    getStatus: () => ({
      remaining: Math.max(0, WORLD_HORSE.rideSeconds - used),
      rest,
      tired: used + 1e-8 >= WORLD_HORSE.rideSeconds || rest > 0,
    }),
  };
}

interface HorseRig {
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  knees: THREE.Group[];
  tail: THREE.Group;
  armor: THREE.Group;
}
const rigs = new WeakMap<THREE.Object3D, HorseRig>();

/** A chestnut horse, fitted saddle and a separate discoverable suit of knight armor. */
export function createWorldHorseModel() {
  const root = new THREE.Group();
  root.name = 'transport-horse';
  root.userData.transportKind = 'horse';
  root.userData.saddleHeight = WORLD_HORSE.saddle[1];
  const body = new THREE.Group();
  body.name = 'horse-body';
  root.add(body);
  const builder = createLandmarkBuilder();
  const chestnut = '#845039';
  const shadow = '#61412f';
  const mane = '#2d2828';
  const leather = '#392c25';
  const cream = '#d8cdb4';
  const brass = '#cab375';
  const oval = (
    parent: THREE.Object3D,
    color: string,
    size: [number, number, number],
    position: [number, number, number],
  ) => builder.add(parent, new THREE.SphereGeometry(1, 16, 10).scale(...size), 'rubber', color, position);

  oval(body, chestnut, [0.64, 0.68, 1.35], [0, 2, -0.02]);
  oval(body, shadow, [0.48, 0.59, 0.47], [0, 1.9, 0.98]);
  for (const side of [-1, 1]) {
    oval(body, chestnut, [0.37, 0.56, 0.47], [side * 0.36, 1.82, -0.87]);
    oval(body, chestnut, [0.31, 0.51, 0.41], [side * 0.36, 1.85, 0.79]);
  }
  builder.add(body, new THREE.CylinderGeometry(0.3, 0.48, 1.34, 14).rotateX(0.5), 'rubber', chestnut, [0, 2.6, 1.1]);
  for (let tuft = 0; tuft < 8; tuft++) {
    builder.add(body, new THREE.ConeGeometry(0.12, 0.33, 5).rotateX(-0.4), 'rubber', mane, [
      0,
      2.16 + tuft * 0.125,
      0.56 + tuft * 0.064,
    ]);
  }
  const head = new THREE.Group();
  head.name = 'horse-head';
  head.position.set(0, 3.16, 1.41);
  body.add(head);
  oval(head, chestnut, [0.29, 0.4, 0.49], [0, 0.09, 0.08]);
  oval(head, shadow, [0.27, 0.22, 0.35], [0, -0.11, 0.49]);
  oval(head, cream, [0.066, 0.21, 0.021], [0, 0.15, 0.526]);
  oval(head, cream, [0.052, 0.15, 0.03], [0, -0.04, 0.711]);
  for (const side of [-1, 1]) {
    builder.add(head, new THREE.ConeGeometry(0.115, 0.43, 6).rotateZ(-side * 0.14), 'rubber', chestnut, [
      side * 0.19,
      0.56,
      -0.04,
    ]);
    oval(head, mane, [0.065, 0.115, 0.052], [side * 0.302, 0.18, 0.19]);
    oval(head, cream, [0.018, 0.027, 0.026], [side * 0.352, 0.21, 0.21]);
    oval(head, mane, [0.035, 0.058, 0.051], [side * 0.19, -0.08, 0.746]);
    builder.beam(head, [side * 0.29, 0.4, 0.02], [side * 0.25, -0.04, 0.58], 0.035, 'rubber', leather);
    builder.torus(head, 0.07, 0.016, 'metal', brass, [side * 0.287, -0.06, 0.56], [0, Math.PI / 2, 0]);
    const rein = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.29, 3.1, 1.97),
      new THREE.Vector3(side * 0.4, 2.85, 1.42),
      new THREE.Vector3(side * WORLD_HORSE.reins[0], WORLD_HORSE.reins[1], WORLD_HORSE.reins[2]),
    ]);
    builder.add(body, new THREE.TubeGeometry(rein, 12, 0.024, 5, false), 'rubber', leather);
  }
  builder.beam(head, [-0.24, -0.01, 0.64], [0.24, -0.01, 0.64], 0.032, 'rubber', leather);

  const saddle = new THREE.Group();
  saddle.name = 'horse-saddle';
  saddle.position.set(...WORLD_HORSE.saddle);
  body.add(saddle);
  builder.box(saddle, [1.18, 0.12, 1.12], 'rubber', '#506745', [0, -0.08, 0], 0.035);
  builder.box(saddle, [0.92, 0.16, 0.88], 'rubber', leather, [0, 0.04, 0], 0.06);
  for (const z of [-0.48, 0.44]) {
    builder.add(saddle, new THREE.TorusGeometry(0.41, 0.08, 7, 20, Math.PI), 'rubber', leather, [0, 0.09, z]);
  }
  for (const side of [-1, 1]) {
    builder.box(saddle, [0.06, 0.74, 0.85], 'rubber', '#506745', [side * 0.61, -0.41, -0.02], 0.02);
    builder.box(saddle, [0.067, 0.065, 0.86], 'metal', brass, [side * 0.613, -0.72, -0.02]);
    builder.beam(body, [side * 0.55, 2.47, 0.05], [side * 0.72, 1.65, -0.05], 0.034, 'rubber', leather);
    builder.torus(
      body,
      0.13,
      0.026,
      'metal',
      brass,
      [side * WORLD_HORSE.stirrup[0], WORLD_HORSE.stirrup[1], WORLD_HORSE.stirrup[2]],
      [0, 0, 0],
    );
  }

  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  for (const front of [true, false]) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.name = `horse-${front ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}-leg`;
      leg.position.set(side * 0.44, 1.75, front ? 0.91 : -0.93);
      body.add(leg);
      builder.cylinder(leg, 0.17, 0.115, 0.77, 'rubber', chestnut, [0, -0.38, 0], 10);
      oval(leg, shadow, [0.13, 0.14, 0.14], [0, -0.75, 0]);
      const knee = new THREE.Group();
      knee.name = 'horse-knee';
      knee.position.y = -0.75;
      leg.add(knee);
      builder.cylinder(knee, 0.11, 0.075, 0.7, 'rubber', front ? chestnut : shadow, [0, -0.37, 0], 10);
      builder.cylinder(knee, 0.083, 0.112, 0.16, 'rubber', cream, [0, -0.76, 0.016], 10);
      builder.box(knee, [0.235, 0.19, 0.31], 'rubber', mane, [0, -0.902, 0.047], 0.035);
      legs.push(leg);
      knees.push(knee);
    }
  }
  const tail = new THREE.Group();
  tail.name = 'horse-tail';
  tail.position.set(0, 2.14, -1.25);
  body.add(tail);
  builder.add(tail, new THREE.CylinderGeometry(0.12, 0.065, 1.29, 8).rotateX(0.34), 'rubber', mane, [0, -0.58, -0.18]);
  builder.add(tail, new THREE.ConeGeometry(0.17, 0.37, 7).rotateX(Math.PI + 0.15), 'rubber', mane, [0, -1.14, -0.4]);
  builder.flush();

  const armor = createWorldKnightArmorStand();
  armor.name = 'horse-knight-armor';
  armor.position.set(2.4, 0, -0.4);
  armor.rotation.y = -0.24;
  root.add(armor);
  rigs.set(root, { body, head, legs, knees, tail, armor });
  root.updateMatrixWorld(true);
  return root;
}

export interface WorldHorseAnimation {
  mounted: boolean;
  speed: number;
  time: number;
  reducedMotion?: boolean;
  tired?: boolean;
}

export function animateWorldHorse(model: THREE.Object3D, state: WorldHorseAnimation) {
  const rig = rigs.get(model);
  if (!rig) return;
  const speed = Number.isFinite(state.speed) ? THREE.MathUtils.clamp(state.speed, 0, 32) : 0;
  const time = Number.isFinite(state.time) ? state.time : 0;
  const moving = speed > 0.08 && !state.reducedMotion;
  const pace = time * (3.6 + Math.min(speed, 22) * 0.28);
  rig.armor.visible = !state.mounted && !model.userData.worldBurnPending;
  rig.body.position.y = moving ? Math.abs(Math.sin(pace)) * Math.min(0.11, speed * 0.006) : 0;
  rig.head.rotation.x = state.tired
    ? 0.2
    : moving
      ? Math.sin(pace) * 0.045
      : state.reducedMotion
        ? 0
        : Math.sin(time * 0.6) * 0.018;
  rig.tail.rotation.z = state.reducedMotion ? 0 : Math.sin(time * (moving ? 4 : 1.3)) * (moving ? 0.18 : 0.07);
  for (let index = 0; index < rig.legs.length; index++) {
    const stride = moving ? Math.sin(pace + (index === 0 || index === 3 ? 0 : Math.PI)) : 0;
    rig.legs[index].rotation.x = stride * Math.min(0.58, speed * 0.036);
    rig.knees[index].rotation.x = moving ? -Math.max(0, stride) * 0.65 : 0;
  }
}
