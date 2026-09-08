import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cylinder, label, mesh, sphere, WORLD_PALETTE } from '@/libs/world/world-geometry';

export const RUNNER_TRACK = { radiusX: 8, radiusZ: 5, loopSeconds: 10, maxDelta: 0.05 } as const;

/** A local decorative runner, never a claim that the named account is currently online. */
export function runnerFrame(seconds: number) {
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const angle = ((time % RUNNER_TRACK.loopSeconds) / RUNNER_TRACK.loopSeconds) * Math.PI * 2;
  const stride = Math.sin(time * 11);
  return {
    position: [
      Math.cos(angle) * RUNNER_TRACK.radiusX,
      0.08 + Math.abs(stride) * 0.16,
      Math.sin(angle) * RUNNER_TRACK.radiusZ,
    ] as [number, number, number],
    yaw: Math.atan2(-Math.sin(angle) * RUNNER_TRACK.radiusX, Math.cos(angle) * RUNNER_TRACK.radiusZ),
    stride,
  };
}

/** The moving persona and its mention pill can both be registered by the scene for interaction. */
export function createRunner(scene: THREE.Scene, anchor: readonly [number, number]) {
  const group = new THREE.Group();
  group.name = 'Running Bitcoin track';
  group.position.set(anchor[0], 0, anchor[1]);
  scene.add(group);
  const track = new THREE.RingGeometry(0.88, 1.12, 64)
    .scale(RUNNER_TRACK.radiusX, RUNNER_TRACK.radiusZ, 1)
    .rotateX(-Math.PI / 2);
  mesh(group, track, '#2B2B35', [0, 0.04, 0]).castShadow = false;
  const marks: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 32; index++) {
    const frame = runnerFrame((index / 32) * RUNNER_TRACK.loopSeconds);
    marks.push(
      new THREE.BoxGeometry(0.07, 0.025, 0.34).rotateY(frame.yaw).translate(frame.position[0], 0.06, frame.position[2]),
    );
  }
  const marking = mergeGeometries(marks)!;
  marks.forEach((part) => part.dispose());
  mesh(group, marking, '#858593').castShadow = false;
  label(group, 'RUNNING BITCOIN', [0, 0.8, -6.6], 7.5, WORLD_PALETTE.lime);

  const persona = new THREE.Group();
  persona.name = 'Decorative @halfin runner';
  group.add(persona);
  const body = new THREE.Group();
  body.rotation.x = 0.14;
  persona.add(body);
  cylinder(body, 0.43, 0.37, 0.85, '#16161C', [0, 1.93, 0], 8);
  box(body, [0.58, 0.33, 0.47], '#22222A', [0, 1.39, 0]);
  sphere(body, 0.33, '#BDA995', [0, 2.78, 0]);
  const hair = sphere(body, 0.34, '#25232B', [0, 2.93, -0.02]);
  hair.scale.y = 0.53;
  box(body, [0.52, 0.085, 0.16], '#C8FF03', [0, 2.86, 0.29]);
  box(body, [0.37, 0.4, 0.035], '#DFE4DB', [0, 1.97, 0.41]);
  box(body, [0.22, 0.045, 0.045], '#25252E', [0, 2.03, 0.445]);
  box(body, [0.22, 0.045, 0.045], '#25252E', [0, 1.9, 0.445]);
  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.23, 1.38, 0);
    body.add(leg);
    box(leg, [0.27, 0.65, 0.3], '#25252E', [0, -0.32, 0]);
    const knee = new THREE.Group();
    knee.position.y = -0.63;
    leg.add(knee);
    box(knee, [0.21, 0.58, 0.22], '#BDA995', [0, -0.29, 0]);
    box(knee, [0.27, 0.18, 0.49], '#C8FF03', [0, -0.61, 0.1]);
    legs.push(leg);
    knees.push(knee);
    const arm = new THREE.Group();
    arm.position.set(side * 0.49, 2.27, 0);
    arm.rotation.z = -side * 0.13;
    body.add(arm);
    box(arm, [0.24, 0.46, 0.25], '#16161C', [0, -0.22, 0]);
    const elbow = new THREE.Group();
    elbow.position.y = -0.43;
    elbow.rotation.x = -1.25;
    arm.add(elbow);
    box(elbow, [0.19, 0.42, 0.2], '#BDA995', [0, -0.2, 0]);
    sphere(elbow, 0.12, '#BDA995', [0, -0.44, 0]);
    arms.push(arm);
  }
  const mention = label(persona, '@halfin', [0, 4.5, 0], 7.2, '#05050A', WORLD_PALETTE.lime);
  mention.name = '@halfin mention pill';
  let elapsed = 0;
  let wasReduced = false;

  function paint(still = false) {
    const frame = runnerFrame(elapsed);
    persona.position.set(...frame.position);
    persona.rotation.y = frame.yaw;
    if (still) persona.position.y = 0.08;
    body.rotation.x = still ? 0 : 0.14;
    legs.forEach((leg, index) => {
      const swing = still ? 0 : frame.stride * (index ? 0.88 : -0.88);
      leg.rotation.x = swing;
      knees[index].rotation.x = still ? 0 : 0.15 + Math.max(0, swing) * 1.3;
      arms[index].rotation.x = -swing;
    });
  }
  paint();
  return {
    group,
    persona,
    mention,
    animate(_time: number, delta: number, reducedMotion = false) {
      if (reducedMotion) {
        if (!wasReduced) paint(true);
        wasReduced = true;
        return;
      }
      wasReduced = false;
      if (!Number.isFinite(delta) || delta <= 0) return;
      elapsed += Math.min(delta, RUNNER_TRACK.maxDelta);
      paint();
    },
  };
}
