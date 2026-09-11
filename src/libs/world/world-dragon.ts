import * as THREE from 'three';
import type { Point3 } from '@/libs/world/world-geometry';
import { createLandmarkBuilder, type LandmarkBuilder, type LandmarkSurface } from '@/libs/world/world-landmark-details';

const C = {
  skin: '#283638',
  shadow: '#162024',
  ridge: '#435552',
  scale: '#364944',
  belly: '#69644B',
  horn: '#D3BF86',
  hornRoot: '#786F56',
  membrane: '#6C3825',
  membraneEdge: '#A36436',
  leather: '#342B26',
  metal: '#BBA36A',
  eye: '#FFAC36',
} as const;

export interface DragonAnimationState {
  mounted: boolean;
  airborne: boolean;
  speed: number;
  seconds: number;
  time: number;
  reducedMotion: boolean;
  breathingFire?: boolean;
}

interface DragonRig {
  torso: THREE.Group;
  neck: THREE.Group;
  tail: THREE.Group;
  wings: THREE.Group[];
  legs: THREE.Group[];
  eyes: THREE.Group;
  lids: THREE.Group;
  mouth: THREE.Group;
  jaw: THREE.Group;
  fire: number;
  awake: number;
  flight: number;
}

const rigs = new WeakMap<THREE.Group, DragonRig>();

function group(parent: THREE.Group, name: string, position: Point3): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
  result.position.set(...position);
  parent.add(result);
  return result;
}

function oval(
  builder: LandmarkBuilder,
  parent: THREE.Object3D,
  size: Point3,
  position: Point3,
  color = C.skin as string,
  surface: LandmarkSurface = 'paint',
  rotation: Point3 = [0, 0, 0],
) {
  builder.add(parent, new THREE.SphereGeometry(1, 20, 12).scale(...size), surface, color, position, rotation);
}

/** A closed tapered sweep gives necks, horns and tails a smooth organic silhouette. */
function taper(points: Point3[], radii: number[], divisions = 28, radial = 10): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const frames = curve.computeFrenetFrames(divisions, false);
  const vertices: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= divisions; row++) {
    const t = row / divisions;
    const center = curve.getPointAt(t);
    const segment = Math.min(radii.length - 2, Math.floor(t * (radii.length - 1)));
    const radius = THREE.MathUtils.lerp(radii[segment], radii[segment + 1], t * (radii.length - 1) - segment);
    for (let column = 0; column <= radial; column++) {
      const angle = (column / radial) * Math.PI * 2;
      const point = center
        .clone()
        .addScaledVector(frames.normals[row], Math.cos(angle) * radius)
        .addScaledVector(frames.binormals[row], Math.sin(angle) * radius);
      vertices.push(...point.toArray());
      uv.push(column / radial, t);
      if (row < divisions && column < radial) {
        const at = row * (radial + 1) + column;
        indices.push(at, at + 1, at + radial + 1, at + 1, at + radial + 2, at + radial + 1);
      }
    }
  }
  for (const end of [0, divisions]) {
    const centerIndex = vertices.length / 3;
    vertices.push(...curve.getPointAt(end / divisions).toArray());
    uv.push(0.5, end / divisions);
    for (let column = 0; column < radial; column++) {
      const at = end * (radial + 1) + column;
      if (end === 0) indices.push(centerIndex, at + 1, at);
      else indices.push(centerIndex, at, at + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sweep(
  builder: LandmarkBuilder,
  parent: THREE.Object3D,
  points: Point3[],
  radii: number[],
  color: string,
  surface: LandmarkSurface = 'paint',
  divisions = 28,
) {
  builder.add(parent, taper(points, radii, divisions), surface, color);
}

/** Raised overlapping shields read as scales without a texture or individual draw calls. */
function scale(width: number, length: number, lift: number): THREE.BufferGeometry {
  const outline = [
    [-0.42, -0.43],
    [-0.55, 0.06],
    [0, 0.63],
    [0.55, 0.06],
    [0.42, -0.43],
    [0, -0.55],
  ];
  const vertices = [0, lift, 0];
  const uv = [0.5, 0.5];
  for (const [x, z] of outline) {
    vertices.push(x * width, 0, z * length);
    uv.push(x + 0.5, z + 0.5);
  }
  const indices: number[] = [];
  for (let index = 0; index < outline.length; index++) indices.push(0, index + 1, ((index + 1) % outline.length) + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function body(builder: LandmarkBuilder, root: THREE.Group) {
  const torso = group(root, 'dragon-breathing-body', [0, 0.83, -0.19]);
  oval(builder, torso, [0.7, 0.62, 1.29], [0, 0, 0]);
  oval(builder, torso, [0.56, 0.51, 0.73], [0, 0.08, 0.74], C.ridge);
  oval(builder, torso, [0.57, 0.21, 1.14], [0, -0.43, 0.06], C.belly);
  for (let row = 0; row < 9; row++) {
    const z = -1.08 + row * 0.251;
    const radius = Math.sqrt(Math.max(0.1, 1 - (z / 1.45) ** 2));
    for (let column = 0; column < 11; column++) {
      const angle = 0.07 + (column / 10) * (Math.PI - 0.14);
      builder.add(
        torso,
        scale(0.225, 0.285, 0.043),
        'ceramic',
        (row + column) % 3 === 0 ? C.scale : C.skin,
        [Math.cos(angle) * 0.709 * radius, Math.sin(angle) * 0.625 * radius, z],
        [0, (row % 2 ? 1 : -1) * 0.07, angle - Math.PI / 2],
      );
    }
  }
  for (let index = 0; index < 3; index++) {
    const z = -1.15 + index * 0.23;
    const y = 0.83 + 0.63 * Math.sqrt(1 - ((z + 0.19) / 1.5) ** 2);
    sweep(
      builder,
      root,
      [
        [0, y, z],
        [0, y + 0.2, z - 0.035],
        [0, y + 0.38, z - 0.19],
      ],
      [0.1, 0.085, 0.004],
      C.hornRoot,
      'ceramic',
      10,
    );
  }
  return torso;
}

function tail(builder: LandmarkBuilder, root: THREE.Group) {
  const result = group(root, 'dragon-tail', [0, 0.68, -1.19]);
  const path: Point3[] = [
    [0, 0, 0],
    [0.13, -0.17, -0.76],
    [0.7, -0.34, -1.52],
    [1.51, -0.39, -1.55],
    [1.98, -0.32, -1.06],
    [1.96, -0.23, -0.63],
  ];
  sweep(builder, result, path, [0.36, 0.3, 0.2, 0.12, 0.064, 0.011], C.skin, 'paint', 42);
  const curve = new THREE.CatmullRomCurve3(path.map((point) => new THREE.Vector3(...point)));
  for (let index = 0; index < 13; index++) {
    const t = index / 15;
    const point = curve.getPointAt(t);
    const radius = 0.32 * (1 - t) + 0.035;
    builder.add(result, scale(radius * 1.5, 0.23, 0.043), 'ceramic', C.scale, [point.x, point.y + radius, point.z]);
    if (index % 2 === 0) {
      const height = 0.22 * (1 - t);
      sweep(
        builder,
        result,
        [
          [point.x, point.y + radius, point.z],
          [point.x + 0.025, point.y + radius + height, point.z - 0.06],
          [point.x + 0.05, point.y + radius + height * 1.2, point.z - 0.13],
        ],
        [radius * 0.27, radius * 0.16, 0.003],
        C.hornRoot,
        'ceramic',
        8,
      );
    }
  }
  return result;
}

function headAndNeck(builder: LandmarkBuilder, root: THREE.Group) {
  const neck = group(root, 'dragon-neck', [0, 0.84, 1.08]);
  sweep(
    builder,
    neck,
    [
      [0, 0, 0],
      [0, 0.26, 0.36],
      [0, 0.65, 0.7],
      [0, 0.95, 1.04],
    ],
    [0.46, 0.38, 0.3, 0.28],
    C.skin,
  );
  for (let index = 0; index < 7; index++) {
    const t = index / 6;
    oval(
      builder,
      neck,
      [0.275 - t * 0.06, 0.06, 0.115],
      [0, t * 0.84 - 0.19, t * 0.96 + 0.09],
      C.belly,
      'paint',
      [0.82, 0, 0],
    );
    for (const side of [-1, 1]) {
      builder.add(
        neck,
        scale(0.23 - t * 0.07, 0.255, 0.036),
        'ceramic',
        index % 2 ? C.ridge : C.scale,
        [side * (0.34 - t * 0.1), t * 0.87 + 0.035, t * 0.94],
        [0.6, 0, -side * 1.28],
      );
    }
  }
  const head = group(neck, 'dragon-head', [0, 0.95, 1.05]);
  oval(builder, head, [0.44, 0.33, 0.51], [0, 0, 0], C.ridge);
  // A broad forehead, narrow long muzzle and blade-like cheek guards avoid a round pet-like face.
  oval(builder, head, [0.323, 0.23, 0.63], [0, -0.073, 0.51], C.skin);
  oval(builder, head, [0.255, 0.06, 0.52], [0, -0.145, 0.48], C.shadow, 'rubber');
  const jaw = group(head, 'dragon-lower-jaw', [0, -0.16, 0.11]);
  oval(builder, jaw, [0.34, 0.105, 0.575], [0, -0.075, 0.4], C.shadow);
  oval(builder, jaw, [0.28, 0.061, 0.514], [0, -0.126, 0.425], C.belly);
  oval(builder, jaw, [0.185, 0.025, 0.4], [0, 0.03, 0.43], '#793B2A', 'ceramic');
  for (const side of [-1, 1]) {
    builder.cylinder(jaw, 0.003, 0.036, 0.085, 'ceramic', C.horn, [side * 0.25, 0.023, 0.7], 10);
  }
  for (const side of [-1, 1]) {
    oval(builder, head, [0.063, 0.038, 0.102], [side * 0.225, 0.042, 0.91], C.shadow, 'rubber', [
      0,
      side * 0.2,
      -side * 0.3,
    ]);
    sweep(
      builder,
      head,
      [
        [side * 0.28, -0.06, 0.05],
        [side * 0.51, -0.005, -0.21],
        [side * 0.61, 0.14, -0.47],
      ],
      [0.16, 0.105, 0.004],
      C.ridge,
      'ceramic',
      14,
    );
    sweep(
      builder,
      head,
      [
        [side * 0.29, 0.215, -0.13],
        [side * 0.36, 0.49, -0.28],
        [side * 0.42, 0.65, -0.64],
        [side * 0.46, 0.7, -0.99],
      ],
      [0.16, 0.12, 0.055, 0.004],
      C.horn,
      'ceramic',
      22,
    );
    sweep(
      builder,
      head,
      [
        [side * 0.2, 0.22, 0.19],
        [side * 0.35, 0.2, 0.16],
        [side * 0.47, 0.14, -0.03],
      ],
      [0.095, 0.08, 0.028],
      C.shadow,
      'ceramic',
      12,
    );
    // The closed mouth still shows two small ivory fangs and a long clean jaw seam.
    for (const z of [0.69, 0.98]) {
      builder.cylinder(head, 0.042, 0.004, 0.13, 'ceramic', C.horn, [side * 0.275, -0.223, z], 10);
    }
  }
  for (let index = 0; index < 4; index++) {
    builder.add(head, scale(0.42 - index * 0.057, 0.23, 0.055), 'ceramic', C.scale, [
      0,
      0.28 - index * 0.044,
      index * 0.21,
    ]);
  }
  const eyes = group(head, 'dragon-open-eyes', [0, 0, 0]);
  const lids = group(head, 'dragon-sleeping-eyelids', [0, 0, 0]);
  for (const side of [-1, 1]) {
    oval(builder, eyes, [0.055, 0.056, 0.13], [side * 0.381, 0.092, 0.185], C.eye, `light:${C.eye}`, [
      0,
      side * 0.32,
      0,
    ]);
    oval(builder, eyes, [0.01, 0.047, 0.023], [side * 0.426, 0.099, 0.198], C.shadow, 'rubber');
    sweep(
      builder,
      lids,
      [
        [side * 0.358, 0.093, 0.29],
        [side * 0.402, 0.064, 0.191],
        [side * 0.435, 0.078, 0.085],
      ],
      [0.023, 0.026, 0.021],
      C.shadow,
      'rubber',
      12,
    );
    oval(builder, lids, [0.046, 0.046, 0.126], [side * 0.371, 0.107, 0.185], C.skin, 'paint');
  }
  const mouth = group(jaw, 'dragon-mouth-emitter', [0, 0.01, 1.06]);
  return { neck, eyes, lids, mouth, jaw };
}

/** A subtly bowed sail with a scalloped edge and a real back face. */
function membrane(from: Point3, to: Point3, wrist: Point3, droop: number): THREE.BufferGeometry {
  const vertices: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const rows = 6;
  const columns = 10;
  for (let row = 0; row <= rows; row++) {
    const radial = row / rows;
    for (let column = 0; column <= columns; column++) {
      const along = column / columns;
      const edge = new THREE.Vector3(...from).lerp(new THREE.Vector3(...to), along);
      edge.lerp(new THREE.Vector3(...wrist), Math.sin(along * Math.PI) * 0.22);
      const point = new THREE.Vector3(...wrist).lerp(edge, radial);
      point.y -= Math.sin(along * Math.PI) * Math.sin(radial * Math.PI) * droop;
      vertices.push(...point.toArray());
      uv.push(along, radial);
      if (row < rows && column < columns) {
        const at = row * (columns + 1) + column;
        indices.push(at, at + 1, at + columns + 1, at + 1, at + columns + 2, at + columns + 1);
      }
    }
  }
  const vertexCount = vertices.length / 3;
  const frontIndices = [...indices];
  for (let index = 0; index < vertexCount; index++) {
    vertices.push(vertices[index * 3], vertices[index * 3 + 1] - 0.014, vertices[index * 3 + 2]);
    uv.push(uv[index * 2], uv[index * 2 + 1]);
  }
  for (let index = 0; index < frontIndices.length; index += 3) {
    indices.push(
      frontIndices[index] + vertexCount,
      frontIndices[index + 2] + vertexCount,
      frontIndices[index + 1] + vertexCount,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function wings(builder: LandmarkBuilder, root: THREE.Group) {
  const result: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const wing = group(root, side < 0 ? 'dragon-wing-left' : 'dragon-wing-right', [side * 0.59, 1.19, 0.24]);
    wing.userData.dragonSide = side;
    const points: Point3[] = [
      [side * 4.15, 0.05, 1.1],
      [side * 3.9, -0.01, -0.56],
      [side * 3.07, -0.12, -1.77],
      [side * 1.58, -0.16, -2.17],
      [side * 0.1, -0.05, -1.36],
    ];
    const wrist: Point3 = [side * 2.04, 0.43, 0.68];
    for (let panel = 0; panel < points.length - 1; panel++) {
      builder.add(
        wing,
        membrane(points[panel], points[panel + 1], wrist, 0.17),
        'paint',
        panel % 2 ? C.membrane : '#774329',
      );
      for (let vein = 1; vein <= 2; vein++) {
        const destination = new THREE.Vector3(...points[panel]).lerp(new THREE.Vector3(...points[panel + 1]), vein / 3);
        destination.lerp(new THREE.Vector3(...wrist), 0.17);
        const middle = new THREE.Vector3(...wrist).lerp(destination, 0.63);
        middle.y -= 0.12;
        sweep(
          builder,
          wing,
          [wrist, middle.toArray() as Point3, destination.toArray() as Point3],
          [0.012, 0.009, 0.003],
          C.membraneEdge,
          'paint',
          10,
        );
      }
    }
    sweep(
      builder,
      wing,
      [[0, 0, 0], [side * 0.98, 0.4, 0.24], wrist, points[0]],
      [0.16, 0.13, 0.095, 0.007],
      C.ridge,
      'paint',
      32,
    );
    for (let index = 1; index < points.length; index++) {
      const middle = new THREE.Vector3(...wrist).lerp(new THREE.Vector3(...points[index]), 0.55);
      middle.y += 0.025;
      sweep(
        builder,
        wing,
        [wrist, middle.toArray() as Point3, points[index]],
        [0.074, 0.048, 0.005],
        C.skin,
        'paint',
        20,
      );
    }
    sweep(
      builder,
      wing,
      [wrist, [side * 2.11, 0.63, 0.79], [side * 2.33, 0.7, 0.83]],
      [0.07, 0.052, 0.002],
      C.horn,
      'ceramic',
      12,
    );
    result.push(wing);
  }
  return result;
}

function legs(builder: LandmarkBuilder, root: THREE.Group) {
  const result: THREE.Group[] = [];
  for (const front of [false, true]) {
    for (const side of [-1, 1]) {
      const leg = group(root, `dragon-${front ? 'foreleg' : 'hindleg'}-${side < 0 ? 'left' : 'right'}`, [
        side * 0.51,
        0.8,
        front ? 0.87 : -0.81,
      ]);
      leg.userData.dragonSide = side;
      leg.userData.dragonFront = front;
      oval(builder, leg, [0.3, 0.36, 0.39], [side * 0.15, -0.055, 0.02], C.skin);
      sweep(
        builder,
        leg,
        [
          [side * 0.12, -0.04, 0],
          [side * 0.36, -0.37, front ? 0.14 : -0.15],
          [side * 0.36, -0.58, front ? 0.43 : 0.37],
        ],
        [0.22, 0.17, 0.12],
        C.skin,
        'paint',
        20,
      );
      const foot: Point3 = [side * 0.36, -0.66, front ? 0.62 : 0.53];
      oval(builder, leg, [0.26, 0.105, 0.32], foot, C.ridge);
      for (const digit of [-1, 0, 1]) {
        sweep(
          builder,
          leg,
          [
            [foot[0] + digit * 0.155, -0.651, foot[2] + 0.14],
            [foot[0] + digit * 0.174, -0.68, foot[2] + 0.34],
            [foot[0] + digit * 0.187, -0.75, foot[2] + 0.4],
          ],
          [0.063, 0.047, 0.003],
          C.horn,
          'ceramic',
          12,
        );
      }
      for (let index = 0; index < 3; index++) {
        builder.add(
          leg,
          scale(0.2, 0.22, 0.04),
          'ceramic',
          C.scale,
          [side * 0.35, -0.34 - index * 0.105, 0.2 + index * 0.12],
          [0.4, 0, side * 0.7],
        );
      }
      result.push(leg);
    }
  }
  return result;
}

function saddle(builder: LandmarkBuilder, root: THREE.Group) {
  const saddle = group(root, 'dragon-saddle', [0, 1.525, -0.05]);
  builder.box(saddle, [0.62, 0.1, 0.69], 'rubber', C.leather, [0, 0.04, 0], 0.048);
  builder.box(saddle, [0.49, 0.07, 0.5], 'rubber', '#574234', [0, 0.055, 0], 0.03);
  oval(builder, saddle, [0.325, 0.15, 0.065], [0, 0.12, -0.33], C.leather, 'rubber');
  oval(builder, saddle, [0.31, 0.085, 0.056], [0, 0.1, 0.32], C.leather, 'rubber');
  for (const side of [-1, 1]) {
    sweep(
      builder,
      root,
      [
        [side * 0.26, 1.53, -0.07],
        [side * 0.47, 1.37, 0.06],
        [side * 0.57, 1.34, 0.18],
      ],
      [0.029, 0.029, 0.026],
      C.leather,
      'rubber',
      16,
    );
    builder.torus(root, 0.103, 0.018, 'metal', C.metal, [side * 0.57, 1.304, 0.18], [0, Math.PI / 2, 0]);
    builder.box(root, [0.15, 0.027, 0.19], 'metal', C.metal, [side * 0.57, 1.2, 0.18], 0.008);
    // Raised grips are stable rider contact points; reins can remain part of the moving neck.
    builder.beam(root, [side * 0.215, 1.55, 0.28], [side * 0.3, 2.05, 0.5], 0.031, 'rubber', C.leather);
    builder.beam(root, [side * 0.3, 2.05, 0.44], [side * 0.3, 2.05, 0.57], 0.031, 'metal', C.metal);
    for (const z of [-0.29, 0.28]) {
      builder.oval(saddle, [0.016, 0.014, 0.016], 'metal', C.metal, [side * 0.272, 0.087, z]);
    }
  }
  root.userData.seatHeight = 1.62;
  root.userData.riderSeat = [0, 1.62, -0.05];
  root.userData.riderGrips = [
    [-0.3, 2.05, 0.5],
    [0.3, 2.05, 0.5],
  ];
  root.userData.riderFootrests = [
    [-0.57, 1.22, 0.18],
    [0.57, 1.22, 0.18],
  ];
}

/** Original sleeping dragon, facing +Z, with all shared GPU resources owned by its scene graph. */
export function createWorldDragonModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'transport-dragon';
  root.userData.transportKind = 'dragon';
  const builder = createLandmarkBuilder();
  const torso = body(builder, root);
  const dragonTail = tail(builder, root);
  const { neck, eyes, lids, mouth, jaw } = headAndNeck(builder, root);
  const dragonWings = wings(builder, root);
  const dragonLegs = legs(builder, root);
  saddle(builder, root);
  builder.flush();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.name = object.name.replace('landmark-batch-', 'dragon-surface-');
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
  });
  rigs.set(root, {
    torso,
    neck,
    tail: dragonTail,
    wings: dragonWings,
    legs: dragonLegs,
    eyes,
    lids,
    mouth,
    jaw,
    fire: 0,
    awake: 0,
    flight: 0,
  });
  animateWorldDragon(root, { mounted: false, airborne: false, speed: 0, seconds: 0, time: 0, reducedMotion: true });
  root.updateMatrixWorld(true);
  return root;
}

/** Pose changes are bounded and never move the saddle or the world-space transport root. */
export function animateWorldDragon(root: THREE.Group, state: DragonAnimationState): void {
  const rig = rigs.get(root);
  if (!rig) return;
  const seconds = Number.isFinite(state.seconds) ? THREE.MathUtils.clamp(state.seconds, 0, 0.1) : 0;
  const time = Number.isFinite(state.time) ? state.time : 0;
  const speed = Number.isFinite(state.speed) ? Math.max(0, Math.min(30, state.speed)) : 0;
  const awake = Number(state.mounted);
  const flight = Number(state.mounted && state.airborne);
  const blend = state.reducedMotion ? 1 : 1 - Math.exp(-seconds * 5.5);
  rig.awake = THREE.MathUtils.lerp(rig.awake, awake, blend);
  rig.flight = THREE.MathUtils.lerp(rig.flight, flight, blend);
  rig.fire = THREE.MathUtils.lerp(rig.fire, Number(state.mounted && state.breathingFire === true), blend);
  rig.jaw.rotation.x = rig.fire * 0.38;
  const breath = state.reducedMotion ? 0 : Math.sin(time * 1.25) * 0.014 * (1 - rig.awake);
  rig.torso.scale.y = 1 + breath;
  rig.neck.rotation.x = THREE.MathUtils.lerp(0.64, -0.45, rig.awake) + breath * 0.4;
  rig.neck.rotation.y = (state.reducedMotion ? 0 : Math.sin(time * 0.55) * 0.018) * rig.awake;
  rig.eyes.visible = rig.awake > 0.32;
  rig.lids.visible = !rig.eyes.visible;
  rig.tail.rotation.y = state.reducedMotion ? 0 : Math.sin(time * (0.65 + speed * 0.035)) * (0.018 + rig.awake * 0.055);
  for (const wing of rig.wings) {
    const side = wing.userData.dragonSide as number;
    const open = rig.flight * 0.94 + rig.awake * 0.06;
    wing.scale.x = THREE.MathUtils.lerp(0.32, 1, open);
    wing.rotation.y = -side * THREE.MathUtils.lerp(0.38, 0, open);
    const flap = state.reducedMotion ? 0 : Math.sin(time * (3.7 + speed * 0.016)) * rig.flight * 0.48;
    wing.rotation.z = side * (THREE.MathUtils.lerp(0.32, 0.14, open) + flap);
  }
  for (const leg of rig.legs) {
    const side = leg.userData.dragonSide as number;
    const front = leg.userData.dragonFront as boolean;
    const stride = state.reducedMotion
      ? 0
      : Math.sin(time * (2.8 + speed * 0.48) + (front ? 0 : Math.PI) + (side > 0 ? Math.PI : 0)) *
        Math.min(1, speed / 4) *
        rig.awake *
        (1 - rig.flight) *
        0.17;
    leg.rotation.x = rig.flight * (front ? 0.4 : 0.5) + stride;
    // Lift the planted half of each step and draw the paws up for flight.
    leg.position.y = 0.8 + rig.flight * 0.4 + Math.max(0, Math.sin(stride) * 1.07) * (1 - rig.flight);
    leg.rotation.z = side * rig.flight * 0.08;
  }
  root.userData.dragonSleeping = !state.mounted;
}

/** A +Z emitter attached to the articulated jaw, including the rider's roll transform. */
export function getWorldDragonMouth(root: THREE.Group): THREE.Object3D | null {
  return rigs.get(root)?.mouth ?? null;
}
