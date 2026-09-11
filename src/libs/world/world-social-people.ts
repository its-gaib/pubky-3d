import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createWorldMaskGeometry,
  createWorldPortraitBackGeometry,
  WORLD_MASK_COLORS,
} from '@/libs/world/world-avatar-head';
import type { WorldPerson } from '@/libs/world/world-types';

type Point = [number, number, number];
type FigurePalette = 'coat' | 'trousers' | 'skin' | 'accent' | 'shoe' | 'ivory' | 'metal' | 'base' | 'mask';

export interface SocialPersonAppearance {
  height: number;
  garmentStyle: number;
  headPose: THREE.Matrix4;
  colors: Record<FigurePalette, THREE.Color>;
}

export interface SocialPersonBatch {
  object: THREE.InstancedMesh;
  palette: FigurePalette;
  head: boolean;
  identity?: 'masked' | 'portrait';
  variant?: { kind: 'garmentStyle'; index: number };
}

const SKIN_COLORS = ['#EAC3A4', '#D9A680', '#BD8966', '#A46F50', '#825339', '#613F30', '#E1B396', '#B77D60'];
const COAT_COLORS = ['#40434B', '#424840', '#42434A', '#4B4544', '#363D43', '#44414D'];
const TROUSER_COLORS = ['#30333B', '#383B3F', '#333331', '#3C3940'];
const MUTED_COLOR = new THREE.Color('#62626F');
const WHITE = new THREE.Color('#FFFFFF');

function variation(id: string, salt: string) {
  let value = 2166136261;
  // Public keys are short; bounding decorative hashing also bounds malformed fixture input.
  for (const character of `${id.slice(0, 128)}:${salt}`) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0) / 0xffffffff;
}

/** Stable clothing variation, independent of profile imagery and demographic inference. */
export function socialPersonAppearance(person: WorldPerson): SocialPersonAppearance {
  const choose = (palette: string[], salt: string) =>
    palette[Math.floor(variation(person.id, salt) * palette.length) % palette.length];
  const colors = {
    mask: new THREE.Color('#FFFFFF'),
    coat: new THREE.Color(choose(COAT_COLORS, 'coat')),
    trousers: new THREE.Color(choose(TROUSER_COLORS, 'trousers')),
    skin: new THREE.Color(choose(SKIN_COLORS, 'skin')),
    accent: new THREE.Color(/^#[0-9a-f]{6}$/i.test(person.color) ? person.color : '#C8FF03'),
    shoe: new THREE.Color('#525663'),
    ivory: new THREE.Color('#E7E7DD'),
    metal: new THREE.Color('#A6ACB3'),
    base: new THREE.Color('#34363F'),
  };
  if (person.degree === 2) {
    for (const [name, color] of Object.entries(colors)) {
      // Clothing distinguishes discovery figures; shared mask materials retain their finish.
      if (name === 'mask') continue;
      color.lerp(MUTED_COLOR, name === 'accent' ? 0.7 : 0.5);
    }
  }
  const headPose = new THREE.Matrix4()
    .makeTranslation(0, 2.19, 0)
    .multiply(
      new THREE.Matrix4().makeRotationFromEuler(
        new THREE.Euler(0, (variation(person.id, 'gaze') - 0.5) * 0.3, (variation(person.id, 'tilt') - 0.5) * 0.065),
      ),
    )
    .multiply(new THREE.Matrix4().makeTranslation(0, -2.19, 0));
  return {
    height: 0.95 + variation(person.id, 'height') * 0.1,
    garmentStyle: Math.floor(variation(person.id, 'garment') * 3) % 3,
    headPose,
    colors,
  };
}

function ellipsoid(size: Point, position: Point, rotation: Point = [0, 0, 0], segments = 16) {
  return new THREE.SphereGeometry(1, segments, Math.max(6, Math.floor(segments * 0.65)))
    .scale(...size)
    .rotateX(rotation[0])
    .rotateY(rotation[1])
    .rotateZ(rotation[2])
    .translate(...position);
}

function roundedBox(size: Point, position: Point, radius = 0.025, rotation: Point = [0, 0, 0]) {
  return new RoundedBoxGeometry(...size, Math.max(...size) > 0.4 ? 2 : 1, radius)
    .rotateX(rotation[0])
    .rotateY(rotation[1])
    .rotateZ(rotation[2])
    .translate(...position);
}

function tube(points: Point[], radius: number, segments = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return new THREE.TubeGeometry(curve, segments, radius, 5, false);
}

function shaded(geometry: THREE.BufferGeometry, shade: number | string = 1) {
  const color = typeof shade === 'string' ? new THREE.Color(shade) : WHITE.clone().multiplyScalar(shade);
  const values = new Float32Array(geometry.attributes.position.count * 3);
  for (let index = 0; index < values.length; index += 3) color.toArray(values, index);
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

function combine(parts: THREE.BufferGeometry[]) {
  const normalized = parts.map((geometry) => {
    if (!geometry.attributes.color) shaded(geometry);
    return geometry.index ? geometry.toNonIndexed() : geometry;
  });
  const geometry = mergeGeometries(normalized)!;
  new Set([...parts, ...normalized]).forEach((part) => part.dispose());
  return geometry;
}

function smoothSeam(geometry: THREE.BufferGeometry, rows: number, segments: number) {
  const normals = geometry.attributes.normal;
  const normal = new THREE.Vector3();
  const other = new THREE.Vector3();
  for (let row = 0; row < rows; row++) {
    const start = row * (segments + 1);
    const end = start + segments;
    normal.fromBufferAttribute(normals, start).add(other.fromBufferAttribute(normals, end)).normalize();
    normals.setXYZ(start, normal.x, normal.y, normal.z);
    normals.setXYZ(end, normal.x, normal.y, normal.z);
  }
}

/** Elliptical tailoring rings make shoulders, waists and ankles read without cube seams. */
function tailored(rings: { y: number; x: number; z: number; width: number; depth: number }[], segments = 20) {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const profile = rings[0].y > rings[rings.length - 1].y ? [...rings].reverse() : rings;
  profile.forEach((ring, row) => {
    for (let column = 0; column <= segments; column++) {
      const angle = (column / segments) * Math.PI * 2;
      vertices.push(ring.x + Math.sin(angle) * ring.width, ring.y, ring.z + Math.cos(angle) * ring.depth);
      uvs.push(column / segments, row / (rings.length - 1));
      if (row && column) {
        const current = row * (segments + 1) + column;
        const previous = current - segments - 1;
        indices.push(previous - 1, current, current - 1, previous - 1, previous, current);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  smoothSeam(geometry, rings.length, segments);
  return geometry;
}

function sleeve(side: number) {
  const forward = side > 0 ? 0.08 : 0;
  return tailored(
    [
      { y: 2.03, x: side * 0.415, z: -0.01, width: 0, depth: 0 },
      { y: 1.985, x: side * 0.435, z: -0.01, width: 0.137, depth: 0.147 },
      { y: 1.91, x: side * 0.47, z: -0.012, width: 0.154, depth: 0.16 },
      { y: 1.72, x: side * 0.525, z: -0.01, width: 0.145, depth: 0.143 },
      { y: 1.6, x: side * 0.55, z: 0, width: 0.137, depth: 0.132 },
      { y: 1.48, x: side * 0.554, z: 0.035 + forward * 0.5, width: 0.121, depth: 0.126 },
      { y: 1.31, x: side * 0.536, z: 0.077 + forward, width: 0.105, depth: 0.11 },
      { y: 1.285, x: side * 0.534, z: 0.08 + forward, width: 0.098, depth: 0.103 },
      { y: 1.285, x: side * 0.534, z: 0.08 + forward, width: 0, depth: 0 },
    ],
    16,
  );
}

/** Fixed shared batches: detailing grows geometry once, never mesh count per person. */
export function createSocialPersonBatches(parent: THREE.Object3D, capacity: number) {
  const batches: SocialPersonBatch[] = [];
  function batch(
    name: string,
    geometry: THREE.BufferGeometry[],
    palette: FigurePalette,
    options: {
      head?: boolean;
      identity?: SocialPersonBatch['identity'];
      variant?: SocialPersonBatch['variant'];
      roughness?: number;
      metalness?: number;
      unlit?: boolean;
    } = {},
  ) {
    const surface = options.unlit
      ? new THREE.MeshBasicMaterial({ color: '#FFFFFF', vertexColors: true, toneMapped: false })
      : new THREE.MeshStandardMaterial({
          color: '#FFFFFF',
          vertexColors: true,
          roughness: options.roughness ?? 0.84,
          metalness: options.metalness ?? 0,
        });
    const object = new THREE.InstancedMesh(combine(geometry), surface, capacity);
    object.name = `social-${name}`;
    object.count = 0;
    object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    object.castShadow = ['body', 'masked-head', 'portrait-back', 'trousers'].includes(name);
    object.receiveShadow = true;
    // The owner invalidates aggregate bounds after matrix/count changes, so an
    // offscreen plaza can skip the complete detailed crowd and its shadow pass.
    object.frustumCulled = true;
    parent.add(object);
    batches.push({
      object,
      palette,
      head: options.head ?? false,
      identity: options.identity,
      variant: options.variant,
    });
    return object;
  }

  const torso = tailored(
    [
      [1.265, 0, 0],
      [1.265, 0.305, 0.19],
      [1.31, 0.337, 0.209],
      [1.48, 0.354, 0.218],
      [1.77, 0.398, 0.239],
      [1.945, 0.408, 0.23],
      [2.035, 0.347, 0.2],
      [2.1, 0.206, 0.153],
      [2.122, 0.149, 0.119],
      [2.122, 0, 0],
    ].map(([y, width, depth]) => ({ y, width, depth, x: 0, z: 0 })),
  );
  const cuffs = [-1, 1].map((side) =>
    shaded(
      new THREE.CylinderGeometry(0.105, 0.102, 0.075, 16)
        .scale(1, 1, 1.06)
        .translate(side * 0.536, 1.318, side > 0 ? 0.15 : 0.074),
      0.68,
    ),
  );
  const body = batch(
    'body',
    [
      torso,
      sleeve(-1),
      sleeve(1),
      ...cuffs,
      shaded(new THREE.CylinderGeometry(0.337, 0.321, 0.07, 24).scale(1, 1, 0.623).translate(0, 1.315, 0), 0.72),
    ],
    'coat',
  );

  const proxy = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 16, 12).scale(0.355, 0.408, 0.322).translate(0, 2.55, 0),
    new THREE.MeshBasicMaterial(),
    capacity,
  );
  proxy.name = 'social-head-picking';
  proxy.visible = false;
  proxy.count = 0;
  proxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parent.add(proxy);
  const mask = createWorldMaskGeometry();
  batch('masked-head', [shaded(mask.shell.translate(0, 2.55, 0), WORLD_MASK_COLORS.shell)], 'mask', {
    head: true,
    identity: 'masked',
    roughness: 0.54,
    metalness: 0.28,
  });
  batch('mask-visor', [shaded(mask.visor.translate(0, 2.55, 0), WORLD_MASK_COLORS.visor)], 'mask', {
    head: true,
    identity: 'masked',
    roughness: 0.21,
    metalness: 0.36,
  });
  batch('mask-trim', [shaded(mask.trim.translate(0, 2.55, 0), WORLD_MASK_COLORS.trim)], 'mask', {
    head: true,
    identity: 'masked',
    roughness: 0.46,
    metalness: 0.3,
  });
  batch('mask-inlay', [shaded(mask.inlay.translate(0, 2.55, 0), WORLD_MASK_COLORS.inlay)], 'mask', {
    head: true,
    identity: 'masked',
  });

  batch('portrait-back', [shaded(createWorldPortraitBackGeometry().translate(0, 2.55, 0), '#242E34')], 'mask', {
    head: true,
    identity: 'portrait',
    roughness: 0.7,
  });

  const hands: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const z = side > 0 ? 0.168 : 0.091;
    hands.push(ellipsoid([0.087, 0.131, 0.073], [side * 0.526, 1.187, z], [0.11, 0, side * -0.08]));
    hands.push(ellipsoid([0.039, 0.075, 0.039], [side * 0.452, 1.207, z + 0.021], [0.2, 0, side * 0.25]));
  }
  batch('neck-hands', [new THREE.CylinderGeometry(0.126, 0.147, 0.21, 20).translate(0, 2.16, 0), ...hands], 'skin', {
    roughness: 0.78,
  });

  const trousers: THREE.BufferGeometry[] = [ellipsoid([0.322, 0.197, 0.188], [0, 1.263, -0.01])];
  for (const side of [-1, 1]) {
    trousers.push(
      tailored(
        [
          { y: 0.315, x: side * 0.232, z: 0.026, width: 0, depth: 0 },
          { y: 0.315, x: side * 0.232, z: 0.026, width: 0.114, depth: 0.13 },
          { y: 0.37, x: side * 0.232, z: 0.026, width: 0.124, depth: 0.138 },
          { y: 0.6, x: side * 0.225, z: 0, width: 0.136, depth: 0.151 },
          { y: 0.86, x: side * 0.213, z: -0.024, width: 0.145, depth: 0.16 },
          { y: 1.15, x: side * 0.184, z: -0.007, width: 0.173, depth: 0.182 },
          { y: 1.32, x: side * 0.176, z: 0, width: 0.176, depth: 0.18 },
          { y: 1.36, x: side * 0.176, z: 0, width: 0, depth: 0 },
        ],
        16,
      ),
    );
    trousers.push(
      shaded(
        new THREE.CylinderGeometry(0.125, 0.124, 0.047, 16).scale(1, 1, 1.12).translate(side * 0.232, 0.364, 0.026),
        0.71,
      ),
    );
    trousers.push(
      shaded(
        tube(
          [
            [side * 0.278, 1.07, 0.128],
            [side * 0.279, 0.82, 0.105],
            [side * 0.274, 0.48, 0.116],
          ],
          0.004,
          9,
        ),
        1.15,
      ),
    );
  }
  batch('trousers', trousers, 'trousers');

  const shoes: THREE.BufferGeometry[] = [];
  const soles: THREE.BufferGeometry[] = [];
  const accents: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * 0.232;
    shoes.push(ellipsoid([0.156, 0.111, 0.237], [x, 0.239, 0.1]));
    shoes.push(shaded(ellipsoid([0.149, 0.079, 0.128], [x, 0.207, 0.23]), 0.8));
    shoes.push(shaded(roundedBox([0.24, 0.105, 0.109], [x, 0.27, -0.067], 0.028), 0.72));
    soles.push(roundedBox([0.335, 0.082, 0.574], [x, 0.141, 0.095], 0.032));
    soles.push(shaded(roundedBox([0.329, 0.021, 0.565], [x, 0.1, 0.095], 0.008), 0.49));
    for (let lace = 0; lace < 3; lace++)
      soles.push(
        roundedBox([0.14 - lace * 0.006, 0.013, 0.018], [x, 0.338 - lace * 0.009, 0.056 + lace * 0.055], 0.006),
      );
    accents.push(roundedBox([0.027, 0.052, 0.182], [x + side * 0.153, 0.23, 0.073], 0.01, [0.11, 0, side * -0.05]));
    accents.push(roundedBox([0.135, 0.042, 0.017], [x, 0.261, -0.128], 0.008));
  }
  batch('sneaker-uppers', shoes, 'shoe', { roughness: 0.63 });
  batch('sneaker-soles-laces', soles, 'ivory');
  accents.push(roundedBox([0.095, 0.024, 0.015], [-0.207, 1.89, 0.207], 0.006));
  accents.push(roundedBox([0.022, 0.095, 0.015], [-0.241, 1.854, 0.206], 0.006));
  batch('outfit-accents', accents, 'accent', { roughness: 0.65 });

  // Each figure gets one neckline / pocket treatment from three shared garment batches.
  for (let style = 0; style < 3; style++) {
    const details: THREE.BufferGeometry[] = [];
    if (style === 0) {
      details.push(shaded(ellipsoid([0.232, 0.138, 0.114], [0, 2.045, -0.174]), 0.82));
      details.push(shaded(roundedBox([0.034, 0.725, 0.014], [0, 1.673, 0.235], 0.006), 0.6));
      for (const side of [-1, 1])
        details.push(
          shaded(
            tube(
              [
                [side * 0.096, 1.575, 0.232],
                [side * 0.175, 1.508, 0.208],
                [side * 0.238, 1.48, 0.173],
              ],
              0.013,
              9,
            ),
            0.57,
          ),
        );
    } else if (style === 1) {
      details.push(shaded(roundedBox([0.082, 0.68, 0.025], [0, 1.685, 0.234], 0.012), 0.75));
      for (const side of [-1, 1]) {
        details.push(
          shaded(roundedBox([0.143, 0.175, 0.035], [side * 0.116, 2.035, 0.13], 0.015, [0.35, 0, side * -0.47]), 1.17),
        );
        details.push(shaded(roundedBox([0.139, 0.115, 0.026], [side * 0.212, 1.848, 0.204], 0.014), 0.82));
      }
    } else {
      details.push(
        shaded(
          new THREE.TorusGeometry(0.147, 0.036, 6, 24)
            .rotateX(Math.PI / 2)
            .scale(1, 1, 0.82)
            .translate(0, 2.111, 0),
          0.68,
        ),
      );
      details.push(
        shaded(
          tube(
            [
              [-0.302, 1.932, 0.162],
              [0, 1.915, 0.244],
              [0.302, 1.932, 0.162],
            ],
            0.012,
            16,
          ),
          1.17,
        ),
      );
      details.push(
        shaded(
          tube(
            [
              [-0.32, 1.889, 0.153],
              [0, 1.875, 0.246],
              [0.32, 1.889, 0.153],
            ],
            0.006,
            16,
          ),
          0.6,
        ),
      );
    }
    batch(`garment-${style}`, details, 'coat', { variant: { kind: 'garmentStyle', index: style } });
  }
  batch(
    'zipper',
    [
      roundedBox([0.012, 0.69, 0.009], [0, 1.676, 0.245], 0.003),
      roundedBox([0.035, 0.051, 0.018], [0, 1.988, 0.255], 0.007),
    ],
    'metal',
    { variant: { kind: 'garmentStyle', index: 0 }, roughness: 0.35, metalness: 0.65 },
  );
  batch(
    'shirt-buttons',
    [1.456, 1.637, 1.818].map((y) => ellipsoid([0.013, 0.013, 0.012], [0, y, 0.254], [0, 0, 0], 10)),
    'metal',
    { variant: { kind: 'garmentStyle', index: 1 }, roughness: 0.5, metalness: 0.4 },
  );

  const pedestal = batch(
    'pedestal',
    [
      new THREE.CylinderGeometry(1.055, 1.12, 0.07, 48).translate(0, 0.022, 0),
      shaded(new THREE.CylinderGeometry(1.05, 1.055, 0.022, 48).translate(0, 0.066, 0), 1.25),
    ],
    'base',
    { roughness: 0.51, metalness: 0.3 },
  );
  const halo = new THREE.TorusGeometry(1.022, 0.014, 5, 48).rotateX(Math.PI / 2).translate(0, 0.08, 0);
  batch('pedestal-inlay', [halo], 'accent', { unlit: true });

  return { batches, body, head: proxy, pedestal };
}
