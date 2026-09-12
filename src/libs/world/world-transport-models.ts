import * as THREE from 'three';
import { createWorldDragonModel } from '@/libs/world/world-dragon';
import { type Point3, WORLD_PALETTE } from '@/libs/world/world-geometry';
import { createWorldHorseModel } from '@/libs/world/world-horse';
import { createLandmarkBuilder, type LandmarkBuilder, type LandmarkSurface } from '@/libs/world/world-landmark-details';
import type { WorldRideableId } from '@/libs/world/world-types';

const C = {
  ink: '#151B1F',
  panel: '#283238',
  edge: '#526168',
  metal: '#AAB9BD',
  rubber: '#171A1D',
  grip: '#353E40',
  bone: '#DCE2D0',
  wood: '#AA8860',
  lime: WORLD_PALETTE.lime,
} as const;

function part(
  parent: THREE.Group,
  name: string,
  position: Point3,
  animation?: 'wheel' | 'rotor' | 'pedal' | 'pedal-platform' | 'steering' | 'thruster',
  axis?: 'x' | 'y' | 'z',
) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  if (animation) group.userData.transportAnimation = animation;
  if (axis) group.userData.rotationAxis = axis;
  parent.add(group);
  return group;
}

function tube(
  builder: LandmarkBuilder,
  parent: THREE.Object3D,
  points: Point3[],
  radius: number,
  surface: LandmarkSurface,
  color: string,
  closed = false,
) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
    closed,
    'centripetal',
  );
  builder.add(
    parent,
    new THREE.TubeGeometry(curve, Math.min(64, points.length * 6), radius, 8, closed),
    surface,
    color,
  );
}

function ring(
  builder: LandmarkBuilder,
  parent: THREE.Object3D,
  radius: number,
  thickness: number,
  surface: LandmarkSurface,
  color: string,
  position: Point3,
  axis: 'x' | 'y' = 'x',
  segments = 40,
) {
  builder.add(
    parent,
    new THREE.TorusGeometry(radius, thickness, 8, segments),
    surface,
    color,
    position,
    axis === 'x' ? [0, Math.PI / 2, 0] : [-Math.PI / 2, 0, 0],
  );
}

function axleCylinder(
  builder: LandmarkBuilder,
  parent: THREE.Object3D,
  radius: number,
  width: number,
  surface: LandmarkSurface,
  color: string,
  position: Point3 = [0, 0, 0],
  segments = 32,
) {
  builder.cylinder(parent, radius, radius, width, surface, color, position, segments, [0, 0, Math.PI / 2]);
}

function forwardMark(builder: LandmarkBuilder, parent: THREE.Object3D, center: Point3, scale = 1) {
  for (const side of [-1, 1]) {
    builder.box(
      parent,
      [0.025 * scale, 0.008, 0.18 * scale],
      'paint',
      C.lime,
      [center[0] + side * 0.047 * scale, center[1], center[2]],
      0,
      [0, -side * 0.56, 0],
    );
  }
}

/** Subdivided caps keep the board concavity and upturned ends smooth instead of bending one large polygon. */
function deckGeometry(width: number, length: number, thickness: number, kick: number) {
  const along = 32;
  const across = 8;
  const vertices: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const halfWidth = width / 2;
  const halfLength = length / 2;
  const straightEnd = halfLength - halfWidth;
  for (let row = 0; row <= along; row++) {
    const z = (row / along - 0.5) * length;
    const nose = Math.max(0, (Math.abs(z) - straightEnd) / halfWidth);
    const localWidth = halfWidth * Math.sqrt(Math.max(0.005, 1 - nose * nose));
    const lift = kick * Math.pow(Math.max(0, (Math.abs(z) / halfLength - 0.65) / 0.35), 2);
    for (let column = 0; column <= across; column++) {
      const cross = (column / across - 0.5) * 2;
      const bowl = 0.019 * cross * cross;
      for (const side of [1, -1]) {
        vertices.push(cross * localWidth, (side * thickness) / 2 + lift + bowl, z);
        uv.push(column / across, row / along);
      }
    }
  }
  const at = (row: number, column: number, bottom = false) => (row * (across + 1) + column) * 2 + Number(bottom);
  const quad = (a: number, b: number, c: number, d: number) => indices.push(a, b, c, b, d, c);
  for (let row = 0; row < along; row++) {
    for (let column = 0; column < across; column++) {
      quad(at(row, column), at(row + 1, column), at(row, column + 1), at(row + 1, column + 1));
      quad(at(row, column, true), at(row, column + 1, true), at(row + 1, column, true), at(row + 1, column + 1, true));
    }
    quad(at(row, 0), at(row, 0, true), at(row + 1, 0), at(row + 1, 0, true));
    quad(at(row, across), at(row + 1, across), at(row, across, true), at(row + 1, across, true));
  }
  for (let column = 0; column < across; column++) {
    quad(at(0, column), at(0, column + 1), at(0, column, true), at(0, column + 1, true));
    quad(at(along, column), at(along, column, true), at(along, column + 1), at(along, column + 1, true));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function capsuleOutline(width: number, length: number) {
  const radius = width / 2;
  const end = length / 2 - radius;
  const shape = new THREE.Shape();
  shape.absarc(0, end, radius, 0, Math.PI, false);
  shape.lineTo(-radius, -end);
  shape.absarc(0, -end, radius, Math.PI, Math.PI * 2, false);
  shape.closePath();
  return shape;
}

function wheelCopies(
  root: THREE.Group,
  prototype: THREE.Group,
  radius: number,
  wheels: readonly (readonly [string, Point3])[],
) {
  for (const [name, position] of wheels) {
    const wheel = prototype.clone(true);
    wheel.name = name;
    wheel.position.set(...position);
    wheel.userData.transportAnimation = 'wheel';
    wheel.userData.rotationAxis = 'x';
    wheel.userData.wheelRadius = radius;
    root.add(wheel);
  }
}

function skateboard(builder: LandmarkBuilder, root: THREE.Group) {
  const wheel = new THREE.Group();
  axleCylinder(builder, wheel, 0.073, 0.082, 'rubber', C.bone);
  for (const side of [-1, 1]) {
    ring(builder, wheel, 0.064, 0.018, 'rubber', C.bone, [side * 0.031, 0, 0], 'x', 28);
    axleCylinder(builder, wheel, 0.029, 0.011, 'metal', C.edge, [side * 0.047, 0, 0], 20);
    axleCylinder(builder, wheel, 0.012, 0.013, 'metal', C.metal, [side * 0.05, 0, 0], 12);
  }
  builder.flush();
  wheelCopies(root, wheel, 0.082, [
    ['wheel-front-left', [-0.258, 0.082, 0.55]],
    ['wheel-front-right', [0.258, 0.082, 0.55]],
    ['wheel-rear-left', [-0.258, 0.082, -0.55]],
    ['wheel-rear-right', [0.258, 0.082, -0.55]],
  ]);
  builder.add(root, deckGeometry(0.55, 1.8, 0.064, 0.108), 'stone', C.wood, [0, 0.236, 0]);
  builder.add(root, deckGeometry(0.534, 1.772, 0.012, 0.105), 'paint', C.panel, [0, 0.201, 0]);
  builder.add(root, deckGeometry(0.52, 1.748, 0.009, 0.104), 'rubber', C.rubber, [0, 0.273, 0]);
  for (const z of [-0.55, 0.55]) {
    builder.box(root, [0.19, 0.033, 0.23], 'metal', C.edge, [0, 0.186, z], 0.013);
    axleCylinder(builder, root, 0.023, 0.52, 'metal', C.metal, [0, 0.086, z], 16);
    builder.cylinder(root, 0.044, 0.06, 0.076, 'rubber', '#AEBD73', [0, 0.139, z], 20);
    for (const side of [-1, 1]) {
      builder.beam(root, [side * 0.18, 0.086, z], [side * 0.035, 0.15, z], 0.03, 'metal', C.metal);
      for (const offset of [-0.075, 0.075]) {
        builder.cylinder(root, 0.013, 0.013, 0.01, 'metal', C.edge, [side * 0.075, 0.284, z + offset], 12);
        builder.box(root, [0.016, 0.002, 0.003], 'rubber', C.ink, [side * 0.075, 0.29, z + offset]);
      }
    }
  }
  // Sparse molded grit and two little racing chevrons make the grip readable without a bitmap.
  for (let row = 0; row < 13; row++) {
    for (let column = 0; column < 5; column++) {
      const x = (column - 2) * 0.075 + (row % 2) * 0.007;
      const y = 0.279 + 0.019 * (x / 0.26) ** 2;
      builder.box(root, [0.008, 0.004, 0.015], 'rubber', '#41494A', [x, y, (row - 6) * 0.067]);
    }
  }
  forwardMark(builder, root, [0, 0.283, 0.285]);
  root.userData.deckHeight = 0.28;
}

function jetpack(builder: LandmarkBuilder, root: THREE.Group) {
  const nozzle = new THREE.Group();
  builder.cylinder(nozzle, 0.116, 0.167, 0.17, 'metal', C.edge, [0, 0.102, 0], 40);
  ring(builder, nozzle, 0.148, 0.018, 'metal', C.metal, [0, 0.025, 0], 'y');
  builder.cylinder(nozzle, 0.125, 0.125, 0.008, 'rubber', C.ink, [0, 0.027, 0], 32);
  builder.cylinder(nozzle, 0.073, 0.093, 0.012, `light:${C.lime}`, '#ABC739', [0, 0.02, 0], 32);
  for (let index = 0; index < 10; index++) {
    const angle = (index / 10) * Math.PI * 2;
    builder.box(
      nozzle,
      [0.012, 0.125, 0.03],
      'metal',
      C.metal,
      [Math.sin(angle) * 0.14, 0.094, Math.cos(angle) * 0.14],
      0,
      [0, angle, 0],
    );
  }
  builder.flush();
  const exhaustLength = 1.15;
  const exhaustGeometry = new THREE.ConeGeometry(0.145, exhaustLength, 24, 4, true)
    .rotateX(Math.PI)
    .translate(0, -exhaustLength / 2, 0);
  const exhaustInnerGeometry = new THREE.ConeGeometry(0.095, 0.86, 24, 3, true).rotateX(Math.PI).translate(0, -0.43, 0);
  const exhaustCoreGeometry = new THREE.ConeGeometry(0.05, 0.5, 20, 2, true).rotateX(Math.PI).translate(0, -0.25, 0);
  const exhaustSurface = new THREE.MeshBasicMaterial({
    color: '#FF6519',
    transparent: true,
    opacity: 0.58,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const exhaustInnerSurface = new THREE.MeshBasicMaterial({
    color: '#FFC94D',
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const exhaustCoreSurface = new THREE.MeshBasicMaterial({
    color: '#E5F8FF',
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  for (const [side, name] of [
    [-1, 'left'],
    [1, 'right'],
  ] as const) {
    const thruster = nozzle.clone(true);
    thruster.name = `thruster-${name}`;
    thruster.position.set(side * 0.29, 0, -0.025);
    thruster.userData.transportAnimation = 'thruster';
    thruster.userData.rotationAxis = 'x';
    root.add(thruster);
    const exhaust = part(root, `exhaust-${name}`, [side * 0.29, 0.017, -0.025]);
    exhaust.userData.transportAnimation = 'exhaust';
    exhaust.userData.rotationAxis = 'y';
    exhaust.userData.exhaustLength = exhaustLength;
    exhaust.visible = false;
    for (const [geometry, material] of [
      [exhaustGeometry, exhaustSurface],
      [exhaustInnerGeometry, exhaustInnerSurface],
      [exhaustCoreGeometry, exhaustCoreSurface],
    ] as const) {
      const flame = new THREE.Mesh(geometry, material);
      flame.name = 'jet-exhaust-core';
      exhaust.add(flame);
    }
    builder.cylinder(root, 0.126, 0.132, 0.66, 'paint', C.panel, [side * 0.29, 0.542, -0.025], 40);
    builder.oval(root, [0.126, 0.107, 0.126], 'metal', C.edge, [side * 0.29, 0.865, -0.025]);
    for (const y of [0.29, 0.71]) {
      ring(builder, root, 0.132, 0.016, 'metal', C.metal, [side * 0.29, y, -0.025], 'y');
    }
    builder.box(root, [0.055, 0.39, 0.009], 'paint', C.lime, [side * 0.29, 0.515, -0.163], 0.004);
    tube(
      builder,
      root,
      [
        [side * 0.26, 0.968, 0.042],
        [side * 0.337, 0.891, 0.215],
        [side * 0.321, 0.553, 0.302],
        [side * 0.24, 0.227, 0.255],
      ],
      0.043,
      'rubber',
      C.rubber,
    );
    builder.box(root, [0.083, 0.106, 0.03], 'metal', C.metal, [side * 0.297, 0.462, 0.326], 0.012);
    builder.box(root, [0.054, 0.058, 0.034], 'rubber', C.ink, [side * 0.297, 0.465, 0.334], 0.006);
  }
  builder.box(root, [0.495, 0.915, 0.3], 'paint', C.ink, [0, 0.559, 0.02], 0.065);
  builder.box(root, [0.38, 0.645, 0.061], 'rubber', C.grip, [0, 0.571, 0.192], 0.024);
  for (const y of [0.39, 0.52, 0.65, 0.78]) {
    builder.box(root, [0.341, 0.014, 0.018], 'rubber', C.ink, [0, y, 0.227], 0.005);
  }
  builder.box(root, [0.565, 0.079, 0.05], 'rubber', C.grip, [0, 0.247, 0.288], 0.025);
  builder.box(root, [0.119, 0.099, 0.047], 'metal', C.metal, [0, 0.247, 0.315], 0.016);
  builder.box(root, [0.058, 0.044, 0.012], 'paint', C.lime, [0, 0.247, 0.343], 0.005);
  builder.box(root, [0.29, 0.375, 0.031], 'metal', C.edge, [0, 0.585, -0.147], 0.013);
  for (let index = 0; index < 7; index++) {
    builder.box(root, [0.223, 0.014, 0.017], 'rubber', C.ink, [0, 0.479 + index * 0.034, -0.17]);
  }
  for (const x of [-0.109, 0.109]) {
    for (const y of [0.421, 0.75]) {
      builder.add(root, new THREE.CylinderGeometry(0.01, 0.01, 0.016, 12).rotateX(Math.PI / 2), 'metal', C.metal, [
        x,
        y,
        -0.17,
      ]);
    }
  }
  for (let index = 0; index < 4; index++) {
    builder.box(root, [0.039, 0.061, 0.013], `light:${C.lime}`, C.lime, [-0.079 + index * 0.052, 0.845, -0.147], 0.004);
  }
  tube(
    builder,
    root,
    [
      [-0.142, 0.968, 0.035],
      [-0.118, 1.067, 0.035],
      [0.118, 1.067, 0.035],
      [0.142, 0.968, 0.035],
    ],
    0.022,
    'rubber',
    C.grip,
  );
  root.userData.harnessSide = '+z';
}

function kart(builder: LandmarkBuilder, root: THREE.Group) {
  const wheel = new THREE.Group();
  axleCylinder(builder, wheel, 0.265, 0.153, 'rubber', C.rubber, [0, 0, 0], 40);
  for (const side of [-1, 1]) {
    ring(builder, wheel, 0.231, 0.047, 'rubber', C.rubber, [side * 0.045, 0, 0]);
    axleCylinder(builder, wheel, 0.166, 0.016, 'metal', C.edge, [side * 0.094, 0, 0]);
    ring(builder, wheel, 0.158, 0.012, 'metal', C.metal, [side * 0.105, 0, 0]);
    axleCylinder(builder, wheel, 0.048, 0.025, 'metal', C.metal, [side * 0.108, 0, 0], 20);
    for (let spoke = 0; spoke < 6; spoke++) {
      const angle = (spoke / 6) * Math.PI * 2;
      builder.beam(
        wheel,
        [side * 0.108, Math.cos(angle) * 0.055, Math.sin(angle) * 0.055],
        [side * 0.108, Math.cos(angle + 0.1) * 0.145, Math.sin(angle + 0.1) * 0.145],
        0.014,
        'metal',
        C.metal,
      );
    }
  }
  for (let tread = 0; tread < 28; tread++) {
    const angle = (tread / 28) * Math.PI * 2;
    builder.box(
      wheel,
      [0.135, 0.008, 0.043],
      'rubber',
      '#262D30',
      [0, Math.cos(angle) * 0.265, Math.sin(angle) * 0.265],
      0,
      [angle, 0, 0],
    );
  }
  builder.flush();
  wheelCopies(root, wheel, 0.278, [
    ['wheel-front-left', [-0.692, 0.278, 0.69]],
    ['wheel-front-right', [0.692, 0.278, 0.69]],
    ['wheel-rear-left', [-0.692, 0.278, -0.67]],
    ['wheel-rear-right', [0.692, 0.278, -0.67]],
  ]);
  tube(
    builder,
    root,
    [
      [-0.57, 0.222, -0.96],
      [0.57, 0.222, -0.96],
      [0.58, 0.222, 0.7],
      [0.34, 0.222, 1.039],
      [-0.34, 0.222, 1.039],
      [-0.58, 0.222, 0.7],
    ],
    0.047,
    'metal',
    C.edge,
    true,
  );
  for (const z of [-0.67, 0.69]) {
    axleCylinder(builder, root, 0.039, 1.375, 'metal', C.edge, [0, 0.278, z], 20);
  }
  builder.box(root, [0.967, 0.12, 1.66], 'paint', C.panel, [0, 0.258, -0.033], 0.055);
  for (const side of [-1, 1]) {
    builder.box(root, [0.232, 0.205, 1.102], 'paint', C.ink, [side * 0.548, 0.383, -0.023], 0.044);
    builder.box(root, [0.014, 0.036, 0.85], 'paint', C.lime, [side * 0.666, 0.407, -0.009], 0.008);
    for (let vent = 0; vent < 5; vent++) {
      builder.box(root, [0.018, 0.05, 0.035], 'rubber', C.grip, [side * 0.671, 0.337, -0.16 + vent * 0.073]);
    }
    builder.beam(root, [side * 0.42, 0.293, 0.54], [side * 0.65, 0.278, 0.7], 0.023, 'metal', C.metal);
  }
  builder.box(root, [0.678, 0.141, 0.582], 'rubber', C.rubber, [0, 0.4795, -0.272], 0.055);
  builder.box(root, [0.654, 0.644, 0.131], 'rubber', C.rubber, [0, 0.74, -0.535], 0.055, [-0.17, 0, 0]);
  builder.box(root, [0.443, 0.349, 0.021], 'rubber', C.grip, [0, 0.745, -0.445], 0.04, [-0.17, 0, 0]);
  for (const side of [-1, 1]) {
    builder.box(root, [0.083, 0.243, 0.501], 'rubber', C.grip, [side * 0.305, 0.528, -0.275], 0.035);
    builder.box(root, [0.039, 0.208, 0.022], 'paint', C.lime, [side * 0.25, 0.867, -0.428], 0.006, [-0.17, 0, 0]);
  }
  builder.box(root, [0.649, 0.188, 0.278], 'paint', C.panel, [0, 0.475, -0.876], 0.027);
  for (let fin = 0; fin < 9; fin++) {
    builder.box(root, [0.024, 0.196, 0.237], 'metal', C.edge, [-0.272 + fin * 0.068, 0.48, -0.876]);
  }
  builder.box(root, [0.438, 0.056, 0.503], 'paint', C.lime, [0, 0.334, 0.696], 0.025, [-0.12, 0, 0]);
  builder.box(root, [0.166, 0.009, 0.283], 'paint', C.ink, [0, 0.382, 0.722], 0.015, [-0.12, 0, 0]);
  forwardMark(builder, root, [0, 0.406, 0.756], 0.75);
  tube(
    builder,
    root,
    [
      [-0.472, 0.337, 0.898],
      [-0.466, 0.337, 1.079],
      [0.466, 0.337, 1.079],
      [0.472, 0.337, 0.898],
    ],
    0.034,
    'metal',
    C.edge,
  );
  builder.beam(root, [-0.566, 0.287, -1.058], [0.566, 0.287, -1.058], 0.036, 'metal', C.edge);
  builder.beam(root, [0, 0.315, 0.22], [0, 1.034, 0.35], 0.031, 'metal', C.metal);
  const steering = part(root, 'steering-wheel', [0, 1.04, 0.353], 'steering', 'z');
  steering.rotation.x = -1.12;
  builder.add(steering, new THREE.TorusGeometry(0.184, 0.027, 8, 40), 'rubber', C.rubber);
  for (let spoke = 0; spoke < 3; spoke++) {
    const angle = (spoke / 3) * Math.PI * 2;
    builder.beam(steering, [0, 0, 0], [Math.sin(angle) * 0.164, Math.cos(angle) * 0.164, 0], 0.018, 'metal', C.edge);
  }
  builder.oval(steering, [0.053, 0.053, 0.024], 'metal', C.metal, [0, 0, 0.005]);
  for (const side of [-1, 1]) {
    builder.box(root, [0.17, 0.02, 0.33], 'metal', C.edge, [side * 0.165, 0.34, 0.435], 0.009);
    for (let ridge = 0; ridge < 6; ridge++) {
      builder.box(root, [0.135, 0.008, 0.013], 'rubber', C.grip, [side * 0.165, 0.354, 0.31 + ridge * 0.05]);
    }
  }
  root.userData.seatHeight = 0.55;
}

function bmx(builder: LandmarkBuilder, root: THREE.Group) {
  const wheel = new THREE.Group();
  ring(builder, wheel, 0.39, 0.042, 'rubber', C.rubber, [0, 0, 0], 'x', 48);
  axleCylinder(builder, wheel, 0.037, 0.159, 'metal', C.edge, [0, 0, 0], 20);
  for (const side of [-1, 1]) {
    ring(builder, wheel, 0.353, 0.013, 'metal', C.metal, [side * 0.021, 0, 0], 'x', 48);
    axleCylinder(builder, wheel, 0.064, 0.014, 'metal', C.edge, [side * 0.04, 0, 0], 24);
    for (let spoke = 0; spoke < 16; spoke++) {
      const angle = (spoke / 16) * Math.PI * 2;
      const rimAngle = angle + side * 0.28;
      const from = new THREE.Vector3(side * 0.043, Math.cos(angle) * 0.056, Math.sin(angle) * 0.056);
      const to = new THREE.Vector3(side * 0.014, Math.cos(rimAngle) * 0.354, Math.sin(rimAngle) * 0.354);
      const direction = to.clone().sub(from);
      const geometry = new THREE.CylinderGeometry(0.004, 0.004, direction.length(), 5);
      geometry.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
      );
      builder.add(wheel, geometry, 'metal', C.metal, from.add(to).multiplyScalar(0.5).toArray() as Point3);
    }
  }
  for (let tread = 0; tread < 32; tread++) {
    const angle = (tread / 32) * Math.PI * 2;
    builder.box(
      wheel,
      [0.058, 0.006, 0.033],
      'rubber',
      C.grip,
      [0, Math.cos(angle) * 0.432, Math.sin(angle) * 0.432],
      0,
      [angle, 0, 0],
    );
  }
  builder.flush();
  wheelCopies(root, wheel, 0.435, [
    ['wheel-front', [0, 0.435, 0.62]],
    ['wheel-rear', [0, 0.435, -0.62]],
  ]);
  const crank: Point3 = [0, 0.525, -0.117];
  const saddleTube: Point3 = [0, 0.927, -0.242];
  const headTop: Point3 = [0, 0.995, 0.457];
  const headBottom: Point3 = [0, 0.794, 0.509];
  builder.beam(root, crank, saddleTube, 0.033, 'paint', C.lime);
  builder.beam(root, saddleTube, headTop, 0.032, 'paint', C.lime);
  builder.beam(root, headBottom, crank, 0.038, 'paint', C.lime);
  builder.beam(root, headTop, headBottom, 0.044, 'paint', C.panel);
  for (const side of [-1, 1]) {
    builder.beam(root, [side * 0.085, 0.435, -0.62], [side * 0.035, crank[1], crank[2]], 0.022, 'paint', C.panel);
    builder.beam(root, [side * 0.085, 0.435, -0.62], [side * 0.025, 0.9, -0.232], 0.021, 'paint', C.panel);
    tube(
      builder,
      root,
      [
        [side * 0.092, 0.435, 0.62],
        [side * 0.076, 0.581, 0.583],
        [side * 0.052, 0.789, 0.51],
      ],
      0.026,
      'paint',
      C.panel,
    );
    axleCylinder(builder, root, 0.022, 0.04, 'metal', C.metal, [side * 0.092, 0.435, 0.62], 12);
    axleCylinder(builder, root, 0.022, 0.04, 'metal', C.metal, [side * 0.097, 0.435, -0.62], 12);
  }
  for (const point of [crank, saddleTube, headTop, headBottom]) {
    builder.oval(root, [0.041, 0.047, 0.047], 'paint', C.lime, point);
  }
  builder.beam(root, saddleTube, [0, 0.981, -0.249], 0.025, 'metal', C.metal);
  builder.oval(root, [0.16, 0.061, 0.247], 'rubber', C.rubber, [0, 0.989, -0.23]);
  builder.box(root, [0.043, 0.014, 0.257], 'paint', C.lime, [0, 1.049, -0.21], 0.008);
  const crankRig = part(root, 'pedal-crank', crank, 'pedal', 'x');
  axleCylinder(builder, crankRig, 0.091, 0.012, 'metal', C.edge, [0.095, 0, 0]);
  ring(builder, crankRig, 0.096, 0.008, 'metal', C.metal, [0.103, 0, 0]);
  for (const side of [-1, 1]) {
    builder.beam(crankRig, [side * 0.12, 0, 0], [side * 0.14, side * 0.075, side * 0.12], 0.017, 'metal', C.metal);
    const pedal = part(
      crankRig,
      side === -1 ? 'pedal-left' : 'pedal-right',
      [side * 0.207, side * 0.075, side * 0.12],
      'pedal-platform',
      'x',
    );
    builder.box(pedal, [0.167, 0.026, 0.121], 'metal', C.edge, [0, 0, 0], 0.009);
    for (const offset of [-0.042, 0.042]) {
      builder.box(pedal, [0.127, 0.009, 0.014], 'rubber', C.grip, [0, 0.019, offset]);
    }
  }
  ring(builder, root, 0.053, 0.01, 'metal', C.edge, [0.102, 0.435, -0.62]);
  tube(
    builder,
    root,
    [
      [0.111, 0.492, -0.621],
      [0.111, 0.624, -0.116],
      [0.111, 0.525, -0.021],
      [0.111, 0.43, -0.116],
      [0.111, 0.382, -0.625],
      [0.111, 0.435, -0.676],
    ],
    0.008,
    'metal',
    C.metal,
    true,
  );
  builder.beam(root, headTop, [0, 1.434, 0.441], 0.026, 'metal', C.metal);
  const bars = part(root, 'handlebar', [0, 1.437, 0.44], 'steering', 'y');
  tube(
    builder,
    bars,
    [
      [-0.354, 0.163, 0.076],
      [-0.222, 0.157, 0.051],
      [-0.155, 0.029, -0.009],
      [0.155, 0.029, -0.009],
      [0.222, 0.157, 0.051],
      [0.354, 0.163, 0.076],
    ],
    0.024,
    'metal',
    C.edge,
  );
  for (const side of [-1, 1]) {
    axleCylinder(builder, bars, 0.031, 0.139, 'rubber', C.rubber, [side * 0.325, 0.163, 0.076], 24);
    for (let grip = 0; grip < 5; grip++) {
      ring(builder, bars, 0.031, 0.003, 'rubber', C.grip, [side * (0.275 + grip * 0.026), 0.163, 0.076], 'x', 16);
    }
    builder.beam(bars, [side * 0.223, 0.157, 0.087], [side * 0.321, 0.127, 0.116], 0.009, 'metal', C.metal);
  }
  tube(
    builder,
    root,
    [
      [0.223, 1.577, 0.527],
      [0.19, 1.327, 0.613],
      [0.109, 0.945, 0.603],
      [0.055, 0.8, 0.51],
    ],
    0.006,
    'rubber',
    C.rubber,
  );
  const kickstand = part(root, 'kickstand', [0, 0, 0]);
  builder.beam(kickstand, [-0.047, 0.5, -0.148], [-0.267, 0.019, -0.322], 0.014, 'metal', C.edge);
  builder.box(kickstand, [0.066, 0.024, 0.047], 'rubber', C.rubber, [-0.267, 0.012, -0.322], 0.007);
  root.userData.seatHeight = 1.05;
}

function hoverboard(builder: LandmarkBuilder, root: THREE.Group) {
  const rotor = new THREE.Group();
  for (let blade = 0; blade < 5; blade++) {
    const shape = new THREE.Shape();
    shape.moveTo(0.027, -0.015);
    shape.quadraticCurveTo(0.079, -0.055, 0.17, -0.039);
    shape.quadraticCurveTo(0.174, -0.001, 0.154, 0.034);
    shape.quadraticCurveTo(0.086, 0.018, 0.027, 0.01);
    shape.closePath();
    builder.add(
      rotor,
      new THREE.ExtrudeGeometry(shape, { depth: 0.009, bevelEnabled: false, curveSegments: 5 })
        .rotateX(-Math.PI / 2)
        .rotateY((blade / 5) * Math.PI * 2),
      'metal',
      blade % 2 ? C.edge : C.metal,
    );
  }
  builder.oval(rotor, [0.039, 0.019, 0.039], 'metal', C.lime, [0, 0.008, 0]);
  builder.flush();
  const shell = capsuleOutline(0.7, 1.6);
  for (const z of [-0.5, 0.5]) {
    const hole = new THREE.Path();
    hole.absarc(0, z, 0.19, 0, Math.PI * 2, true);
    shell.holes.push(hole);
  }
  builder.add(
    root,
    new THREE.ExtrudeGeometry(shell, {
      depth: 0.112,
      bevelEnabled: true,
      bevelSize: 0.017,
      bevelThickness: 0.013,
      bevelSegments: 2,
      curveSegments: 20,
    }).rotateX(-Math.PI / 2),
    'paint',
    C.panel,
    [0, 0.067, 0],
  );
  for (const [z, name] of [
    [0.5, 'front'],
    [-0.5, 'rear'],
  ] as const) {
    const fan = rotor.clone(true);
    fan.name = `rotor-${name}`;
    fan.position.set(0, 0.141, z);
    fan.userData.transportAnimation = 'rotor';
    fan.userData.rotationAxis = 'y';
    root.add(fan);
    builder.cylinder(root, 0.18, 0.18, 0.012, 'rubber', C.ink, [0, 0.092, z], 40);
    ring(builder, root, 0.196, 0.015, 'metal', C.edge, [0, 0.192, z], 'y', 40);
    ring(builder, root, 0.175, 0.006, `light:${C.lime}`, C.lime, [0, 0.188, z], 'y', 40);
    for (let bar = 0; bar < 3; bar++) {
      const angle = (bar / 3) * Math.PI;
      builder.beam(
        root,
        [Math.cos(angle) * 0.187, 0.202, z + Math.sin(angle) * 0.187],
        [-Math.cos(angle) * 0.187, 0.202, z - Math.sin(angle) * 0.187],
        0.007,
        'metal',
        C.edge,
      );
    }
  }
  for (const side of [-1, 1]) {
    builder.box(root, [0.17, 0.018, 0.519], 'rubber', C.rubber, [side * 0.183, 0.2, 0], 0.018);
    for (let tread = 0; tread < 9; tread++) {
      builder.box(root, [0.137, 0.007, 0.014], 'rubber', C.grip, [side * 0.183, 0.212, -0.205 + tread * 0.051]);
    }
    builder.box(root, [0.018, 0.034, 0.426], 'paint', C.lime, [side * 0.355, 0.123, 0], 0.008);
    for (let vent = 0; vent < 6; vent++) {
      builder.box(root, [0.012, 0.035, 0.026], 'rubber', C.ink, [side * 0.351, 0.087, -0.174 + vent * 0.069]);
    }
    for (const z of [-0.229, 0.229]) {
      builder.box(root, [0.091, 0.061, 0.09], 'rubber', C.rubber, [side * 0.243, 0.031, z], 0.019);
    }
  }
  forwardMark(builder, root, [0, 0.197, 0.05], 0.6);
  root.userData.deckHeight = 0.218;
}

/** Ground rests at Y=0; forward is +Z. Every model owns its shared resources. */
export function createWorldTransportModel(kind: WorldRideableId): THREE.Group {
  if (kind === 'dragon') return createWorldDragonModel();
  if (kind === 'horse') return createWorldHorseModel();
  const root = new THREE.Group();
  root.name = `transport-${kind}`;
  root.userData.transportKind = kind;
  const builder = createLandmarkBuilder();
  const build = { skateboard, jetpack, kart, bmx, hoverboard };
  build[kind](builder, root);
  builder.flush();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.name = object.name.replace('landmark-batch-', 'transport-surface-');
      object.geometry.computeBoundingBox();
      object.geometry.computeBoundingSphere();
    }
  });
  root.updateMatrixWorld(true);
  return root;
}
