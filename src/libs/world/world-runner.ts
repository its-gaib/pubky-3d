import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createWorldHumanBurnTarget } from '@/libs/world/world-burn-escape';
import { label, mesh, WORLD_PALETTE } from '@/libs/world/world-geometry';

export const RUNNER_TRACK = { radiusX: 8, radiusZ: 5, loopSeconds: 10, maxDelta: 0.05 } as const;

type RunnerFrame = { position: [number, number, number]; yaw: number; stride: number };

function writeRunnerFrame(seconds: number, frame: RunnerFrame) {
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const angle = ((time % RUNNER_TRACK.loopSeconds) / RUNNER_TRACK.loopSeconds) * Math.PI * 2;
  frame.stride = Math.sin(time * 11);
  frame.position[0] = Math.cos(angle) * RUNNER_TRACK.radiusX;
  frame.position[1] = 0.08 + Math.abs(frame.stride) * 0.16;
  frame.position[2] = Math.sin(angle) * RUNNER_TRACK.radiusZ;
  frame.yaw = Math.atan2(-Math.sin(angle) * RUNNER_TRACK.radiusX, Math.cos(angle) * RUNNER_TRACK.radiusZ);
  return frame;
}

/** A local decorative runner, never a claim that the named account is currently online. */
export function runnerFrame(seconds: number) {
  return writeRunnerFrame(seconds, { position: [0, 0, 0], yaw: 0, stride: 0 });
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
  const trackLabel = label(group, 'RUNNING BITCOIN', [0, 0.8, -6.6], 7.5, WORLD_PALETTE.lime);
  trackLabel.material.depthTest = true;

  const persona = new THREE.Group();
  persona.name = 'Decorative @halfin runner';
  group.add(persona);
  const body = new THREE.Group();
  body.name = 'runner-athletic-rig';
  body.position.y = -0.08;
  persona.add(body);
  // Small surface families keep the sculpted pieces merged inside each moving
  // joint. Vertex colors give every garment panel its own color without adding
  // a draw call, material or texture for each seam, eye and shoelace.
  const fabric = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.91, metalness: 0 });
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  const detail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.16 });
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
    parts.push(geometry);
    surfaces.set(surface, parts);
    batches.set(target, surfaces);
  };
  const oval = (
    target: THREE.Object3D,
    surface: THREE.Material,
    color: string,
    size: [number, number, number],
    position: [number, number, number],
  ) => {
    const smallDetail = Math.max(...size) <= 0.065;
    add(
      target,
      new THREE.SphereGeometry(1, smallDetail ? 12 : 16, smallDetail ? 8 : 10).scale(...size),
      surface,
      color,
      position,
    );
  };
  const limb = (
    target: THREE.Object3D,
    surface: THREE.Material,
    color: string,
    radius: number,
    length: number,
    position: [number, number, number],
    depth = 1,
  ) =>
    add(
      target,
      new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 12).scale(1, 1, depth),
      surface,
      color,
      position,
    );
  const stripe = (
    target: THREE.Object3D,
    surface: THREE.Material,
    color: string,
    size: [number, number, number],
    position: [number, number, number],
    angle = 0,
  ) => add(target, new THREE.BoxGeometry(...size).rotateZ(angle), surface, color, position);

  const complexion = '#D0A084';
  const ink = '#171C23';
  const lime = WORLD_PALETTE.lime;
  // A tapered technical jersey: broader across the shoulders, narrow at the
  // waist, with a rounded ribcage instead of a box/cylinder silhouette.
  const torso = new THREE.LatheGeometry(
    [
      [0, 1.47],
      [0.3, 1.47],
      [0.34, 1.56],
      [0.36, 1.81],
      [0.43, 2.08],
      [0.45, 2.22],
      [0.38, 2.34],
      [0.2, 2.41],
      [0, 2.41],
    ].map(([radius, y]) => new THREE.Vector2(radius, y)),
    24,
  ).scale(1, 1, 0.66);
  add(body, torso, fabric, ink);
  oval(body, fabric, '#282F35', [0.34, 0.23, 0.23], [0, 1.44, -0.005]);
  add(
    body,
    new THREE.TorusGeometry(0.326, 0.025, 5, 24).rotateX(Math.PI / 2).scale(1, 1, 0.69),
    fabric,
    '#3D454C',
    [0, 1.54, 0],
  );
  limb(body, skin, complexion, 0.135, 0.29, [0, 2.47, 0]);
  add(
    body,
    new THREE.TorusGeometry(0.16, 0.025, 6, 24).rotateX(Math.PI / 2).scale(1, 1, 0.78),
    fabric,
    '#464E53',
    [0, 2.38, 0],
  );
  for (const side of [-1, 1]) {
    oval(body, fabric, '#35423E', [0.075, 0.34, 0.065], [side * 0.326, 1.86, 0.07]);
    stripe(body, detail, lime, [0.035, 0.54, 0.025], [side * 0.302, 1.89, 0.178], -side * 0.12);
    oval(body, fabric, '#454F51', [0.17, 0.026, 0.25], [side * 0.267, 2.285, -0.008]);
  }
  // An inset race bib with a tiny geometric 21, held down by four metal pins.
  stripe(body, fabric, '#E3E7DE', [0.35, 0.36, 0.018], [0, 1.99, 0.292]);
  stripe(body, detail, lime, [0.35, 0.045, 0.02], [0, 2.147, 0.307]);
  for (const [x, y, width, height] of [
    [-0.055, 2.065, 0.09, 0.027],
    [-0.01, 2.025, 0.026, 0.08],
    [-0.055, 1.986, 0.09, 0.027],
    [-0.1, 1.947, 0.026, 0.08],
    [-0.055, 1.908, 0.09, 0.027],
    [0.09, 1.986, 0.028, 0.185],
  ])
    stripe(body, fabric, ink, [width, height, 0.014], [x, y, 0.308]);
  for (const x of [-0.14, 0.14])
    for (const y of [1.84, 2.11]) oval(body, detail, '#8E999A', [0.012, 0.012, 0.007], [x, y, 0.311]);

  const head = new THREE.Group();
  head.name = 'runner-face-and-headband';
  head.position.set(0, 2.82, 0.035);
  body.add(head);
  // Young-adult Hal reference: a broad forehead and cheek line, a substantial
  // nose bridge, a softly squared chin and a swept, wavy side part. The source
  // photographs and the limits of this hand-modeled likeness are documented in
  // docs/world/hal-finney-reference.md; no photograph is loaded into the world.
  const face = new THREE.SplineCurve(
    [
      [0, -0.35],
      [0.167, -0.333],
      [0.245, -0.256],
      [0.293, -0.097],
      [0.3, 0.056],
      [0.281, 0.234],
      [0.18, 0.348],
      [0, 0.381],
    ].map(([radius, y]) => new THREE.Vector2(radius, y)),
  );
  const faceGeometry = new THREE.LatheGeometry(face.getPoints(36), 40).scale(1, 1, 0.895);
  const facePositions = faceGeometry.getAttribute('position');
  for (let vertex = 0; vertex < facePositions.count; vertex++) {
    const x = facePositions.getX(vertex);
    const y = facePositions.getY(vertex);
    const z = facePositions.getZ(vertex);
    // The covered scalp stays inside the separate hair shell. The transition
    // starts behind the sweatband so its edge cannot reveal an inset forehead.
    const scalpInset = 1 - THREE.MathUtils.smoothstep(y, 0.176, 0.217) * 0.085;
    facePositions.setX(vertex, x * scalpInset);
    facePositions.setZ(vertex, z * scalpInset);
    if (z <= 0) continue;
    const cheeks = 0.022 * Math.exp(-(((Math.abs(x) - 0.173) / 0.068) ** 2) - ((y + 0.063) / 0.086) ** 2);
    const eyeSockets = 0.013 * Math.exp(-(((Math.abs(x) - 0.114) / 0.058) ** 2) - ((y - 0.059) / 0.04) ** 2);
    const chin = 0.022 * Math.exp(-((x / 0.133) ** 2) - ((y + 0.274) / 0.066) ** 2);
    const mouth = 0.012 * Math.exp(-((x / 0.126) ** 2) - ((y + 0.167) / 0.068) ** 2);
    facePositions.setZ(vertex, z * scalpInset + cheeks + chin + mouth - eyeSockets);
  }
  faceGeometry.computeVertexNormals();
  add(head, faceGeometry, skin, complexion);
  const contour = (color: string, points: [number, number, number][], radius: number, segments = 12) =>
    add(
      head,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))),
        segments,
        radius,
        5,
        false,
      ),
      skin,
      color,
    );
  for (const side of [-1, 1]) {
    oval(head, skin, complexion, [0.058, 0.105, 0.058], [side * 0.299, -0.013, -0.002]);
    oval(head, skin, '#B87F68', [0.026, 0.054, 0.023], [side * 0.325, -0.01, 0.035]);
    oval(head, skin, '#DBAE91', [0.018, 0.034, 0.017], [side * 0.33, -0.025, 0.045]);

    // Small almond-shaped eyes sit under relaxed arches. Their upper lids
    // supply focus without the inward-sloping brows of the generic character.
    oval(head, skin, '#DFD8CB', [0.05, 0.021, 0.012], [side * 0.114, 0.06, 0.254]);
    oval(head, skin, '#565743', [0.018, 0.018, 0.008], [side * 0.114, 0.06, 0.267]);
    oval(head, skin, '#242721', [0.009, 0.013, 0.004], [side * 0.114, 0.06, 0.274]);
    oval(head, skin, '#F0E6D4', [0.003, 0.003, 0.002], [side * 0.114 - 0.005, 0.066, 0.278]);
    contour(
      '#A8745E',
      [
        [side * 0.063, 0.06, 0.263],
        [side * 0.096, 0.077, 0.268],
        [side * 0.13, 0.078, 0.261],
        [side * 0.162, 0.063, 0.243],
      ],
      0.006,
      10,
    );
    contour(
      '#382820',
      [
        [side * 0.062, 0.111, 0.266],
        [side * 0.101, 0.126, 0.26],
        [side * 0.14, 0.125, 0.244],
        [side * 0.179, 0.11, 0.219],
      ],
      0.012,
    );
  }
  // A longer bridge and rounded projecting tip carry the likeness in profile.
  oval(head, skin, complexion, [0.037, 0.099, 0.041], [0, 0.013, 0.281]);
  oval(head, skin, '#D8A68A', [0.048, 0.039, 0.061], [0, -0.054, 0.317]);
  for (const side of [-1, 1]) {
    oval(head, skin, complexion, [0.024, 0.023, 0.029], [side * 0.043, -0.068, 0.294]);
    oval(head, skin, '#9B6B58', [0.011, 0.005, 0.009], [side * 0.036, -0.086, 0.315]);
  }
  oval(head, skin, '#C28A76', [0.083, 0.01, 0.013], [0, -0.184, 0.248]);
  contour(
    '#8C5E4F',
    [
      [-0.112, -0.166, 0.239],
      [-0.061, -0.171, 0.262],
      [0, -0.17, 0.27],
      [0.061, -0.169, 0.262],
      [0.112, -0.162, 0.239],
    ],
    0.006,
    16,
  );

  const hair = '#30241E';
  add(
    head,
    new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, 1.29).scale(0.325, 0.35, 0.301),
    skin,
    hair,
    [0, 0.095, -0.026],
  );
  // The broad sweep follows the young-adult reference's side part. Restrained
  // chestnut variation describes actual locks, including the sides and nape.
  for (let lock = 0; lock < 5; lock++) {
    const offset = lock * 0.033;
    contour(
      lock % 2 ? '#423027' : '#35261F',
      [
        [0.092 + offset * 0.45, 0.385 - offset * 0.32, 0.115 + offset],
        [0.015 - offset * 0.2, 0.435 - offset * 0.47, 0.109 + offset],
        [-0.114 - offset * 0.35, 0.395 - offset * 0.58, 0.125 + offset],
        [-0.241 - offset * 0.16, 0.301 - offset * 0.73, 0.132 + offset * 0.6],
        [-0.292, 0.176 - offset * 0.22, 0.065 + offset * 0.38],
      ],
      0.034,
      14,
    );
  }
  for (let lock = 0; lock < 3; lock++) {
    const offset = lock * 0.042;
    contour(
      lock % 2 ? '#423027' : '#35261F',
      [
        [0.14, 0.378 - offset * 0.25, 0.131 + offset],
        [0.231, 0.346 - offset * 0.48, 0.127 + offset],
        [0.289, 0.26 - offset * 0.57, 0.09 + offset * 0.55],
        [0.305, 0.154 - offset * 0.2, 0.011 + offset * 0.3],
      ],
      0.031,
      12,
    );
  }
  for (const side of [-1, 1]) {
    add(head, new THREE.SphereGeometry(1, 14, 10).scale(0.044, 0.129, 0.107).rotateZ(-side * 0.08), skin, hair, [
      side * 0.283,
      0.079,
      -0.071,
    ]);
  }
  add(head, new THREE.CylinderGeometry(0.31, 0.318, 0.077, 32).scale(1, 1, 0.916), fabric, lime, [0, 0.158, -0.014]);
  add(
    head,
    new THREE.TorusGeometry(0.314, 0.01, 4, 32).rotateX(Math.PI / 2).scale(1, 1, 0.916),
    detail,
    '#E3F5A7',
    [0, 0.185, -0.014],
  );
  oval(head, fabric, lime, [0.08, 0.048, 0.03], [0.035, 0.15, -0.31]);
  stripe(head, fabric, lime, [0.045, 0.15, 0.019], [0.06, 0.065, -0.316], -0.2);

  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];
  const arms: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = `runner-${side < 0 ? 'left' : 'right'}-thigh`;
    leg.position.set(side * 0.215, 1.41, 0);
    body.add(leg);
    limb(leg, fabric, '#252C34', 0.17, 0.46, [0, -0.155, 0], 0.94);
    limb(leg, skin, complexion, 0.135, 0.39, [0, -0.405, 0]);
    add(
      leg,
      new THREE.TorusGeometry(0.16, 0.015, 4, 16).rotateX(Math.PI / 2).scale(1, 1, 0.94),
      fabric,
      '#485255',
      [0, -0.32, 0],
    );
    stripe(leg, detail, lime, [0.019, 0.24, 0.06], [side * 0.165, -0.185, 0.027]);
    const knee = new THREE.Group();
    knee.name = 'runner-knee';
    knee.position.y = -0.59;
    leg.add(knee);
    oval(knee, skin, complexion, [0.112, 0.104, 0.107], [0, 0, 0]);
    const calf = new THREE.SplineCurve(
      [
        [0, -0.54],
        [0.079, -0.515],
        [0.09, -0.353],
        [0.122, -0.191],
        [0.117, -0.075],
        [0.097, 0.009],
        [0, 0.036],
      ].map(([radius, y]) => new THREE.Vector2(radius, y)),
    );
    add(knee, new THREE.LatheGeometry(calf.getPoints(22), 16).scale(1, 1, 0.91), skin, complexion, [0, 0, -0.018]);
    limb(knee, fabric, '#D7DCD7', 0.109, 0.25, [0, -0.46, -0.006]);
    add(
      knee,
      new THREE.TorusGeometry(0.109, 0.012, 4, 16).rotateX(Math.PI / 2),
      fabric,
      '#50595C',
      [0, -0.365, -0.006],
    );
    // Rockered running shoes have separate outsole, foam, heel cage, toe box,
    // tongue and laces; the lime is a panel color rather than a solid brick.
    oval(knee, fabric, '#171E25', [0.156, 0.064, 0.283], [0, -0.693, 0.109]);
    oval(knee, fabric, '#E2E5DA', [0.159, 0.076, 0.282], [0, -0.656, 0.103]);
    oval(knee, fabric, '#677C36', [0.144, 0.112, 0.248], [0, -0.589, 0.102]);
    oval(knee, detail, lime, [0.143, 0.088, 0.174], [0, -0.599, 0.212]);
    oval(knee, fabric, '#252F32', [0.132, 0.092, 0.095], [0, -0.565, -0.078]);
    oval(knee, fabric, '#363F39', [0.078, 0.035, 0.115], [0, -0.495, 0.082]);
    stripe(knee, fabric, lime, [0.042, 0.105, 0.022], [0, -0.487, -0.145]);
    for (let lace = 0; lace < 3; lace++)
      stripe(knee, detail, '#F0F4E5', [0.122, 0.015, 0.016], [0, -0.479 - lace * 0.014, 0.019 + lace * 0.046]);
    for (const offset of [-1, 1]) stripe(knee, detail, '#B5D279', [0.018, 0.021, 0.16], [offset * 0.141, -0.583, 0.09]);
    legs.push(leg);
    knees.push(knee);

    const arm = new THREE.Group();
    arm.name = `runner-${side < 0 ? 'left' : 'right'}-upper-arm`;
    arm.position.set(side * 0.44, 2.245, -0.014);
    arm.rotation.z = -side * 0.12;
    body.add(arm);
    limb(arm, fabric, ink, 0.153, 0.35, [0, -0.055, 0], 0.94);
    limb(arm, skin, complexion, 0.11, 0.385, [0, -0.295, 0]);
    add(
      arm,
      new THREE.TorusGeometry(0.136, 0.014, 4, 16).rotateX(Math.PI / 2).scale(1, 1, 0.95),
      fabric,
      '#495455',
      [0, -0.17, 0],
    );
    const elbow = new THREE.Group();
    elbow.name = 'runner-elbow';
    elbow.position.y = -0.475;
    arm.add(elbow);
    limb(elbow, skin, complexion, 0.096, 0.43, [0, -0.18, 0]);
    oval(elbow, skin, complexion, [0.096, 0.12, 0.074], [0, -0.424, 0.014]);
    oval(elbow, skin, complexion, [0.046, 0.073, 0.053], [-side * 0.072, -0.415, 0.045]);
    for (let finger = 0; finger < 3; finger++)
      stripe(elbow, skin, '#AE7D60', [0.108, 0.008, 0.011], [0, -0.402 - finger * 0.034, 0.081]);
    if (side < 0) {
      limb(elbow, fabric, '#DDE2D6', 0.102, 0.23, [0, -0.301, 0]);
      oval(elbow, detail, '#222C30', [0.079, 0.06, 0.032], [0, -0.301, 0.092]);
      oval(elbow, detail, '#B6D46B', [0.048, 0.035, 0.006], [0, -0.301, 0.123]);
    }
    arms.push(arm);
    elbows.push(elbow);
  }
  for (const [target, surfaces] of batches) {
    for (const [surface, parts] of surfaces) {
      const geometry = mergeGeometries(parts);
      parts.forEach((part) => part.dispose());
      if (geometry) mesh(target, geometry, surface);
    }
  }
  const mention = label(persona, '@halfin', [0, 4.5, 0], 7.2, '#05050A', WORLD_PALETTE.lime);
  mention.name = '@halfin mention pill';
  let elapsed = 0;
  let wasReduced = false;
  let escaping = false;
  const currentFrame = runnerFrame(0);

  function poseLimbs(stride: number, still: boolean, falling = false) {
    body.rotation.x = still ? 0 : falling ? -0.18 : 0.14;
    for (let index = 0; index < legs.length; index++) {
      const leg = legs[index];
      const swing = still ? 0 : stride * (index ? 0.88 : -0.88);
      leg.rotation.x = swing;
      knees[index].rotation.x = still ? 0 : 0.15 + Math.max(0, swing) * 1.3;
      arms[index].rotation.x = falling && !still ? -2.3 : -swing;
      elbows[index].rotation.x = still ? -0.18 : -1.22 + Math.max(0, -swing) * 0.18;
    }
  }
  function paint(still = false) {
    const frame = writeRunnerFrame(elapsed, currentFrame);
    persona.position.set(...frame.position);
    persona.rotation.y = frame.yaw;
    if (still) persona.position.y = 0.08;
    poseLimbs(frame.stride, still);
  }
  const burnTarget = createWorldHumanBurnTarget('human:halfin', persona, scene, (frame, reducedMotion) => {
    escaping = true;
    poseLimbs(frame.stride, reducedMotion, frame.falling);
  });
  paint();
  return {
    group,
    persona,
    mention,
    burnTarget,
    setZombiePose(stride: number, reducedMotion: boolean) {
      const step = reducedMotion ? 0 : stride * 0.22;
      body.rotation.x = 0.23;
      for (let index = 0; index < legs.length; index++) {
        legs[index].rotation.x = (index ? -step * 0.7 : step) - 0.03;
        knees[index].rotation.x = 0.15 + Math.max(0, index ? -step : step) * 0.7;
        arms[index].rotation.x = -1.28 + (index ? step : -step) * 0.15;
        elbows[index].rotation.x = -0.25;
      }
    },
    animate(_time: number, delta: number, reducedMotion = false) {
      if (escaping || persona.userData.worldZombie || persona.userData.worldBurnPending || !persona.visible) return;
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
