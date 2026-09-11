import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { createWorldAvatarAtlas } from '@/libs/world/world-avatar-atlas';
import {
  createWorldMaskGeometry,
  createWorldPortraitBackGeometry,
  createWorldPortraitGeometry,
  createWorldPortraitMaterial,
  WORLD_MASK_COLORS,
} from '@/libs/world/world-avatar-head';
import type { createWorldAvatarImageLoader } from '@/libs/world/world-avatar-image';
import type { PersonaState, WorldAvatarIdentity, WorldRideableId } from '@/libs/world/world-types';

type Point = readonly [number, number, number];
type Section = readonly [y: number, width: number, depth: number, centerZ?: number];

/** The explorer retains the original collision footprint and camera height. */
export const PERSONA_DIMENSIONS = { height: 2.8, shoulderWidth: 1.52, sole: 0.035 } as const;

export type WorldPersonaRidePose = {
  kind: WorldRideableId;
  speed: number;
  airborne: boolean;
  lean: number;
  stuntProgress: number | null;
  /** Shared with the BMX crank so both feet stay on the moving pedals. */
  pedalPhase?: number;
};

function surface(color: string, roughness = 0.85, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** Rounded garment cross sections, with a broad front for the real embroidered wordmark. */
function garment(sections: readonly Section[], segments = 32) {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [y, width, depth, centerZ = 0] of sections) {
    for (let segment = 0; segment <= segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      vertices.push(
        Math.sign(x) * Math.abs(x) ** 0.64 * width,
        y,
        Math.sign(z) * Math.abs(z) ** 0.64 * depth + centerZ,
      );
    }
  }
  for (let section = 0; section < sections.length - 1; section++) {
    for (let segment = 0; segment < segments; segment++) {
      const start = section * (segments + 1) + segment;
      indices.push(start, start + segments + 1, start + 1, start + 1, start + segments + 1, start + segments + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function tube(points: readonly Point[], radius: number, segments = 20, closed = false) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(
      points.map((point) => new THREE.Vector3(...point)),
      closed,
    ),
    segments,
    radius,
    6,
    closed,
  );
}

function sneakerLayer(width: number, length: number, height: number, y: number, z: number) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -length / 2);
  shape.bezierCurveTo(-width * 0.46, -length / 2, -width / 2, -length * 0.38, -width / 2, -length * 0.21);
  shape.lineTo(-width / 2, length * 0.2);
  shape.bezierCurveTo(-width / 2, length * 0.42, -width * 0.31, length / 2, 0, length / 2);
  shape.bezierCurveTo(width * 0.31, length / 2, width / 2, length * 0.42, width / 2, length * 0.2);
  shape.lineTo(width / 2, -length * 0.21);
  shape.bezierCurveTo(width / 2, -length * 0.38, width * 0.46, -length / 2, 0, -length / 2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height * 0.6,
    bevelEnabled: true,
    bevelThickness: height * 0.2,
    bevelSize: 0.01,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 8,
  });
  return geometry.rotateX(Math.PI / 2).translate(0, y + height * 0.3, z);
}

/** Static details become one mesh per material inside each moving joint. */
function parts(parent: THREE.Group) {
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
  return {
    add(geometry: THREE.BufferGeometry, material: THREE.Material) {
      // The custom cloth has no UVs; merging only position/normal also avoids
      // retaining texture coordinates for these untextured procedural surfaces.
      geometry.deleteAttribute('uv');
      const triangles = geometry.index ? geometry.toNonIndexed() : geometry;
      if (triangles !== geometry) geometry.dispose();
      const geometries = groups.get(material);
      if (geometries) geometries.push(triangles);
      else groups.set(material, [triangles]);
    },
    finish(name: string) {
      for (const [material, geometries] of groups) {
        const geometry = mergeGeometries(geometries)!;
        const object = new THREE.Mesh(geometry, material);
        object.name = name;
        object.castShadow = true;
        object.receiveShadow = true;
        parent.add(object);
        geometries.forEach((part) => part.dispose());
      }
    },
  };
}

/** A reusable, articulated miniature. It has no account or presence dependency. */
export function createPersona(color = '#C8FF03', imageLoader?: ReturnType<typeof createWorldAvatarImageLoader>) {
  const group = new THREE.Group();
  group.name = 'Pubky explorer';
  // Physics owns the outer root. Rider and vehicle turn together around this
  // visual center without moving the floor origin used by scene locomotion.
  const riderPivot = new THREE.Group();
  riderPivot.name = 'explorer-rider-pivot';
  riderPivot.position.y = 1;
  group.add(riderPivot);
  const figure = new THREE.Group();
  figure.name = 'explorer-riding-figure';
  figure.position.y = -1;
  const transportMount = new THREE.Group();
  transportMount.name = 'explorer-transport-mount';
  transportMount.position.y = -1;
  riderPivot.add(figure, transportMount);
  const toolMount = new THREE.Group();
  toolMount.name = 'explorer-tool-mount';
  group.add(toolMount);
  const body = new THREE.Group();
  body.name = 'hoodie-torso';
  body.position.y = 1.06;
  figure.add(body);
  const head = new THREE.Group();
  head.name = 'explorer-head';
  head.position.set(0, 0.93, 0.025);
  body.add(head);

  const coat = surface('#121317', 0.96);
  const rib = surface('#202127', 0.94);
  const seam = surface('#32343B', 0.9);
  const lining = surface('#090B0F', 1);
  const trousers = surface('#30343D', 0.92);
  const trouserSeam = surface('#414650', 0.9);
  const skin = surface('#D6AC88', 0.79);
  const warmSkin = surface('#C39177', 0.87);
  const laces = surface('#E5E4DE', 0.9);
  const sole = surface('#D3D7D2', 0.78);
  const outsole = surface('#3A4243', 0.96);
  const metal = surface('#81868C', 0.38, 0.68);
  const accent = surface(/^#[0-9a-f]{6}$/i.test(color) ? color : '#C8FF03', 0.83);
  const unitSphere = new THREE.SphereGeometry(1, 24, 16);
  const ellipsoid = (radius: Point, position: Point) =>
    unitSphere
      .clone()
      .scale(...radius)
      .translate(...position);
  const rounded = (size: Point, radius: number, position: Point) =>
    new RoundedBoxGeometry(...size, 3, radius).translate(...position);

  const torso = parts(body);
  torso.add(
    garment([
      [-0.23, 0.01, 0.01],
      [-0.22, 0.38, 0.27],
      [-0.17, 0.455, 0.315],
      [-0.04, 0.47, 0.325],
      [0.16, 0.477, 0.345],
      [0.37, 0.5, 0.357],
      [0.56, 0.51, 0.352],
      [0.68, 0.484, 0.324],
      [0.77, 0.4, 0.265],
      [0.82, 0.255, 0.207],
      [0.825, 0.01, 0.01],
    ]),
    coat,
  );
  // A separate ribbed waistband, softly raised kangaroo pocket and inset hand openings.
  torso.add(
    garment([
      [-0.23, 0.38, 0.272],
      [-0.215, 0.436, 0.3],
      [-0.13, 0.454, 0.318],
      [-0.115, 0.45, 0.315],
    ]),
    rib,
  );
  torso.add(rounded([0.678, 0.272, 0.062], 0.047, [0, 0.02, 0.339]), rib);
  torso.add(
    tube(
      [
        [-0.31, 0.095, 0.353],
        [-0.26, 0.139, 0.374],
        [0, 0.152, 0.377],
        [0.26, 0.139, 0.374],
        [0.31, 0.095, 0.353],
      ],
      0.008,
    ),
    seam,
  );
  for (const side of [-1, 1]) {
    torso.add(
      tube(
        [
          [side * 0.307, 0.11, 0.369],
          [side * 0.27, 0.023, 0.379],
          [side * 0.305, -0.069, 0.363],
        ],
        0.012,
        10,
      ),
      lining,
    );
    torso.add(
      tube(
        [
          [side * 0.484, 0.58, 0.225],
          [side * 0.416, 0.711, 0.226],
          [side * 0.253, 0.797, 0.216],
        ],
        0.008,
        12,
      ),
      seam,
    );
    torso.add(
      tube(
        [
          [side * 0.463, -0.08, 0.143],
          [side * 0.478, 0.14, 0.174],
          [side * 0.5, 0.38, 0.172],
        ],
        0.007,
        12,
      ),
      rib,
    );
    // Cream cotton cords hang in slight curves; metal aglets and eyelets catch the light.
    torso.add(
      tube(
        [
          [side * 0.153, 0.736, 0.275],
          [side * 0.145, 0.625, 0.349],
          [side * 0.172, 0.477, 0.375],
          [side * 0.155, 0.376 + side * 0.023, 0.377],
        ],
        0.011,
        14,
      ),
      laces,
    );
    torso.add(new THREE.TorusGeometry(0.022, 0.007, 6, 12).translate(side * 0.153, 0.736, 0.286), metal);
    torso.add(rounded([0.027, 0.067, 0.027], 0.01, [side * 0.155, 0.359 + side * 0.023, 0.377]), metal);
  }
  for (let stitch = -9; stitch <= 9; stitch++) {
    const x = stitch * 0.041;
    const z = 0.31 * (1 - Math.abs(x / 0.457) ** 3.125) ** 0.32;
    torso.add(
      tube(
        [
          [x, -0.2, z],
          [x, -0.137, z + 0.006],
        ],
        0.0035,
        1,
      ),
      seam,
    );
  }
  torso.finish('hoodie fabric and tailoring');

  const hood = parts(head);
  // The shell closes behind the head, while a genuinely open front reveals the lining.
  const hoodVertices: number[] = [];
  const hoodIndices: number[] = [];
  const hoodSections = [
    [0.463, 0.545, 0.235, 0.265],
    [0.502, 0.578, 0.235, 0.13],
    [0.518, 0.59, 0.235, -0.055],
    [0.486, 0.568, 0.242, -0.245],
    [0.384, 0.477, 0.252, -0.416],
    [0.213, 0.295, 0.271, -0.517],
    [0.001, 0.001, 0.295, -0.554],
  ];
  const hoodSegments = 48;
  for (const [width, height, centerY, z] of hoodSections) {
    for (let segment = 0; segment <= hoodSegments; segment++) {
      const angle = (segment / hoodSegments) * Math.PI * 2;
      hoodVertices.push(Math.cos(angle) * width, centerY + Math.sin(angle) * height, z);
    }
  }
  for (let section = 0; section < hoodSections.length - 1; section++) {
    for (let segment = 0; segment < hoodSegments; segment++) {
      const start = section * (hoodSegments + 1) + segment;
      hoodIndices.push(
        start,
        start + hoodSegments + 1,
        start + 1,
        start + 1,
        start + hoodSegments + 1,
        start + hoodSegments + 2,
      );
    }
  }
  const hoodGeometry = new THREE.BufferGeometry();
  hoodGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hoodVertices, 3));
  hoodGeometry.setIndex(hoodIndices);
  hoodGeometry.computeVertexNormals();
  hood.add(hoodGeometry, coat);
  hood.add(new THREE.TorusGeometry(0.46, 0.059, 10, 48).scale(0.89, 1.075, 0.85).translate(0, 0.234, 0.273), rib);
  hood.add(new THREE.TorusGeometry(0.435, 0.034, 8, 48).scale(0.879, 1.075, 0.9).translate(0, 0.232, 0.238), lining);
  hood.add(
    tube(
      [
        [0, 0.784, 0.238],
        [0, 0.819, -0.06],
        [0, 0.716, -0.338],
        [0, 0.48, -0.518],
        [0, 0.22, -0.554],
        [0, -0.05, -0.465],
      ],
      0.007,
      28,
    ),
    seam,
  );
  hood.add(
    tube(
      [
        [-0.369, -0.015, 0.288],
        [-0.249, -0.193, 0.337],
        [0, -0.249, 0.347],
        [0.249, -0.193, 0.337],
        [0.369, -0.015, 0.288],
      ],
      0.031,
      24,
    ),
    coat,
  );
  hood.finish('open hood and stitched lining');

  const identityHead = new THREE.Group();
  identityHead.name = 'explorer-identity-mask';
  identityHead.position.set(0, 0.221, 0.055);
  head.add(identityHead);
  const maskGeometry = createWorldMaskGeometry();
  for (const [name, geometry] of Object.entries(maskGeometry)) {
    const material = surface(
      WORLD_MASK_COLORS[name as keyof typeof WORLD_MASK_COLORS],
      name === 'visor' ? 0.21 : 0.54,
      name === 'visor' ? 0.36 : 0.28,
    );
    const object = new THREE.Mesh(geometry, material);
    object.name = `anonymous-mask-${name}`;
    object.castShadow = true;
    object.receiveShadow = true;
    identityHead.add(object);
  }
  const maskParts = [...identityHead.children];
  const portraitBack = new THREE.Mesh(createWorldPortraitBackGeometry(), coat);
  portraitBack.name = 'explorer-portrait-back';
  portraitBack.visible = false;
  portraitBack.castShadow = true;
  identityHead.add(portraitBack);
  function showPortrait(visible: boolean) {
    portrait.visible = portraitBack.visible = visible;
    maskParts.forEach((object) => {
      object.visible = !visible;
    });
  }
  let identity: WorldAvatarIdentity | null = null;
  const atlas = createWorldAvatarAtlas(imageLoader, {
    capacity: 1,
    zoom: 1.2,
    onChange: () => {
      showPortrait(Boolean(identity && atlas.get(identity.id)));
    },
  });
  const portrait = new THREE.Mesh(createWorldPortraitGeometry(), createWorldPortraitMaterial(atlas.texture));
  portrait.name = 'explorer-profile-portrait';
  portrait.visible = false;
  identityHead.add(portrait);
  const leftArm = new THREE.Group();
  leftArm.name = 'left-shoulder';
  leftArm.position.set(-0.55, 0.665, 0.005);
  body.add(leftArm);
  const sleeve = parts(leftArm);
  sleeve.add(
    garment(
      [
        [-0.406, 0.146, 0.154],
        [-0.35, 0.156, 0.17],
        [-0.2, 0.174, 0.186],
        [-0.045, 0.18, 0.194],
        [0.063, 0.16, 0.17],
        [0.126, 0.11, 0.116],
        [0.15, 0.001, 0.001],
      ],
      24,
    ),
    coat,
  );
  sleeve.add(
    tube(
      [
        [-0.115, 0.04, 0.129],
        [-0.153, -0.12, 0.118],
        [-0.125, -0.31, 0.113],
      ],
      0.006,
      12,
    ),
    seam,
  );
  sleeve.finish('shaped upper sleeve');
  const leftElbow = new THREE.Group();
  leftElbow.name = 'left-elbow';
  leftElbow.position.y = -0.343;
  leftArm.add(leftElbow);
  const forearm = parts(leftElbow);
  forearm.add(
    garment(
      [
        [-0.293, 0.131, 0.139],
        [-0.23, 0.142, 0.15],
        [-0.12, 0.149, 0.16],
        [0.005, 0.15, 0.157],
        [0.063, 0.132, 0.14],
        [0.084, 0.001, 0.001],
      ],
      24,
    ),
    coat,
  );
  forearm.add(new THREE.CylinderGeometry(0.143, 0.126, 0.095, 20).translate(0, -0.294, 0), rib);
  forearm.add(new THREE.TorusGeometry(0.128, 0.006, 5, 20).rotateX(Math.PI / 2).translate(0, -0.325, 0), seam);
  forearm.add(ellipsoid([0.102, 0.146, 0.104], [0, -0.426, 0.012]), skin);
  forearm.add(ellipsoid([0.043, 0.076, 0.056], [0.081, -0.414, 0.069]), skin);
  forearm.add(
    tube(
      [
        [-0.043, -0.468, 0.102],
        [0.008, -0.475, 0.113],
        [0.044, -0.464, 0.104],
      ],
      0.005,
      8,
    ),
    warmSkin,
  );
  forearm.finish('cuff and relaxed hand');
  const rightArm = leftArm.clone(true);
  rightArm.name = 'right-shoulder';
  rightArm.position.x = 0.55;
  rightArm.scale.x = -1;
  const rightElbow = rightArm.getObjectByName('left-elbow')!;
  rightElbow.name = 'right-elbow';
  body.add(rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.name = 'left-hip';
  leftLeg.position.set(-0.222, 0.908, 0);
  figure.add(leftLeg);
  const thigh = parts(leftLeg);
  thigh.add(
    garment(
      [
        [-0.405, 0.141, 0.143, -0.009],
        [-0.35, 0.15, 0.158, -0.009],
        [-0.2, 0.163, 0.177, -0.018],
        [-0.02, 0.177, 0.185, -0.018],
        [0.06, 0.147, 0.156, -0.018],
        [0.08, 0.001, 0.001, -0.018],
      ],
      24,
    ),
    trousers,
  );
  thigh.add(
    tube(
      [
        [-0.154, -0.06, 0.074],
        [-0.162, -0.22, 0.07],
        [-0.134, -0.358, 0.071],
      ],
      0.007,
      12,
    ),
    trouserSeam,
  );
  thigh.finish('tailored trouser thigh');
  const leftKnee = new THREE.Group();
  leftKnee.name = 'left-knee';
  leftKnee.position.y = -0.37;
  leftLeg.add(leftKnee);
  const shin = parts(leftKnee);
  shin.add(
    garment(
      [
        [-0.308, 0.119, 0.116],
        [-0.26, 0.127, 0.124],
        [-0.14, 0.137, 0.139],
        [-0.015, 0.144, 0.146],
        [0.062, 0.132, 0.137],
        [0.08, 0.001, 0.001],
      ],
      24,
    ),
    trousers,
  );
  shin.add(new THREE.CylinderGeometry(0.124, 0.118, 0.07, 20).translate(0, -0.288, 0), rib);
  shin.add(
    tube(
      [
        [-0.126, -0.04, 0.069],
        [-0.127, -0.15, 0.062],
        [-0.115, -0.264, 0.055],
      ],
      0.006,
      10,
    ),
    trouserSeam,
  );
  shin.finish('tapered trouser shin');
  const leftFoot = new THREE.Group();
  leftFoot.name = 'left-ankle';
  leftFoot.position.y = -0.335;
  leftKnee.add(leftFoot);
  const shoe = parts(leftFoot);
  shoe.add(sneakerLayer(0.336, 0.554, 0.071, -0.09, 0.092), sole);
  shoe.add(sneakerLayer(0.34, 0.558, 0.038, -0.142, 0.092), outsole);
  shoe.add(ellipsoid([0.157, 0.127, 0.24], [0, -0.006, 0.098]), accent);
  shoe.add(ellipsoid([0.129, 0.112, 0.123], [0, 0.043, -0.047]), rib);
  shoe.add(new RoundedBoxGeometry(0.142, 0.043, 0.205, 3, 0.019).rotateX(0.23).translate(0, 0.125, 0.073), coat);
  shoe.add(
    tube(
      [
        [-0.132, -0.011, 0.261],
        [0, -0.011, 0.321],
        [0.132, -0.011, 0.261],
      ],
      0.013,
      18,
    ),
    rib,
  );
  for (const side of [-1, 1]) {
    shoe.add(
      tube(
        [
          [side * 0.151, -0.037, -0.069],
          [side * 0.156, 0.002, 0.048],
          [side * 0.137, 0.001, 0.177],
        ],
        0.012,
        12,
      ),
      rib,
    );
    shoe.add(
      tube(
        [
          [side * 0.159, -0.092, -0.111],
          [side * 0.173, -0.082, 0.098],
          [side * 0.134, -0.082, 0.314],
        ],
        0.0045,
        16,
      ),
      laces,
    );
  }
  for (let lace = 0; lace < 3; lace++) {
    shoe.add(
      tube(
        [
          [-0.063, 0.162 - lace * 0.012, 0.035 + lace * 0.047],
          [0, 0.169 - lace * 0.012, 0.047 + lace * 0.047],
          [0.063, 0.162 - lace * 0.012, 0.035 + lace * 0.047],
        ],
        0.0075,
        8,
      ),
      laces,
    );
  }
  shoe.add(rounded([0.041, 0.073, 0.043], 0.013, [0, 0.118, -0.119]), accent);
  shoe.finish('layered sneaker and cotton laces');
  const rightLeg = leftLeg.clone(true);
  rightLeg.name = 'right-hip';
  rightLeg.position.x = 0.222;
  rightLeg.scale.x = -1;
  const rightKnee = rightLeg.getObjectByName('left-knee')!;
  const rightFoot = rightLeg.getObjectByName('left-ankle')!;
  rightKnee.name = 'right-knee';
  rightFoot.name = 'right-ankle';
  figure.add(rightLeg);
  unitSphere.dispose();

  // Preserve the existing bundled SVG boundary and abort late completion on teardown.
  const abort = new AbortController();
  void fetch('/pubky-logo.svg', { signal: abort.signal, credentials: 'omit' })
    .then((response) => (response.ok ? response.text() : null))
    .then((source) => {
      if (!source || abort.signal.aborted) return;
      const logo = new THREE.Group();
      const embroideryParts = new Map<string, THREE.BufferGeometry[]>();
      for (const path of new SVGLoader().parse(source).paths) {
        const geometry = new THREE.ShapeGeometry(SVGLoader.createShapes(path), 8);
        const color = path.color.getHexString();
        const geometries = embroideryParts.get(color);
        if (geometries) geometries.push(geometry);
        else embroideryParts.set(color, [geometry]);
      }
      for (const [color, geometries] of embroideryParts) {
        const geometry = mergeGeometries(geometries)!;
        geometries.forEach((part) => part.dispose());
        const embroidery = new THREE.MeshBasicMaterial({
          color: `#${color}`,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        const print = new THREE.Mesh(geometry, embroidery);
        print.name = 'bundled Pubky embroidery';
        logo.add(print);
      }
      logo.name = 'official-pubky-hoodie-logo';
      logo.scale.set(0.0066, -0.0066, 0.0066);
      logo.position.set(-0.3597, 0.612, 0.367);
      body.add(logo);
      const backPrint = logo.clone(true);
      backPrint.name = 'official-pubky-hoodie-back-logo';
      backPrint.scale.set(0.0075, -0.0075, 0.0075);
      backPrint.rotation.y = Math.PI;
      backPrint.position.set(0.40875, 0.615, -0.367);
      body.add(backPrint);
    })
    .catch(() => {
      /* The plain black hoodie remains usable if the bundled embroidery cannot load. */
    });

  let ridePose: WorldPersonaRidePose | null = null;
  let toolPitch: number | null = null;
  let lastSeconds = 0;
  let lastAnimation: PersonaState['animation'] = 'idle';
  let lastReducedMotion = false;
  const rideBodyInverse = new THREE.Matrix4();
  const rideHandTarget = new THREE.Vector3();
  const toolGrip = new THREE.Vector3();
  const toolPivot = new THREE.Vector3(0, 1.45, 0.2);

  function resetRideTransforms() {
    riderPivot.position.set(0, 1, 0);
    riderPivot.rotation.set(0, 0, 0);
    figure.position.set(0, -1, 0);
    figure.rotation.set(0, 0, 0);
    transportMount.position.set(0, -1, 0);
    transportMount.rotation.set(0, 0, 0);
    toolMount.position.set(0, 0, 0);
    toolMount.rotation.set(0, 0, 0);
    leftLeg.position.set(-0.222, 0.908, 0);
    rightLeg.position.set(0.222, 0.908, 0);
    leftLeg.rotation.order = 'XYZ';
    rightLeg.rotation.order = 'XYZ';
  }

  /** Solve the two existing leg joints; the sneaker remains parallel to its pedal or deck. */
  function placeRideFoot(
    leg: THREE.Object3D,
    knee: THREE.Object3D,
    foot: THREE.Object3D,
    ankleY: number,
    ankleZ: number,
    ankleX?: number,
  ) {
    const dy = ankleY - leg.position.y;
    const dz = ankleZ - leg.position.z;
    const dx = ankleX === undefined ? 0 : ankleX - leg.position.x;
    const reachZ = ankleX === undefined ? dz : Math.hypot(dx, dz);
    const thighLength = 0.37;
    const shinLength = 0.335;
    const bend = Math.acos(
      THREE.MathUtils.clamp(
        (dy * dy + reachZ * reachZ - thighLength ** 2 - shinLength ** 2) / (2 * thighLength * shinLength),
        -1,
        1,
      ),
    );
    const hipAngle =
      Math.atan2(-reachZ, -dy) - Math.atan2(shinLength * Math.sin(bend), thighLength + shinLength * Math.cos(bend));
    const outwardAngle = ankleX === undefined ? 0 : Math.atan2(dx, dz);
    leg.rotation.set(hipAngle, outwardAngle, 0, ankleX === undefined ? 'XYZ' : 'YXZ');
    knee.rotation.set(bend, 0, 0);
    foot.rotation.set(-hipAngle - bend, -outwardAngle * leg.scale.x, 0, 'XYZ');
  }

  /** Grip anchors are in the same floor coordinates as the attached vehicle. */
  function placeRideHands(halfWidth: number, height: number, z: number, figureLift: number, holdingTool = false) {
    body.updateMatrix();
    rideBodyInverse.copy(body.matrix).invert();
    const upperLength = 0.343;
    const lowerLength = Math.hypot(0.426, 0.012);
    const handAngle = Math.atan2(0.012, 0.426);
    for (let side = -1; side <= 1; side += 2) {
      const arm = side < 0 ? leftArm : rightArm;
      const elbow = side < 0 ? leftElbow : rightElbow;
      if (holdingTool) {
        toolGrip.set(side < 0 ? -0.25 : 0.3, side < 0 ? 1.45 : 1.4, side < 0 ? 0.75 : 0.35);
        toolGrip.applyMatrix4(toolMount.matrix);
      } else toolGrip.set(side * halfWidth, height, z);
      rideHandTarget
        .set(toolGrip.x, toolGrip.y - figureLift, toolGrip.z - figure.position.z)
        .applyMatrix4(rideBodyInverse)
        .sub(arm.position);
      const horizontal = Math.hypot(rideHandTarget.x, rideHandTarget.z);
      const bend = -Math.acos(
        THREE.MathUtils.clamp(
          (rideHandTarget.lengthSq() - upperLength ** 2 - lowerLength ** 2) / (2 * upperLength * lowerLength),
          -1,
          1,
        ),
      );
      const shoulderAngle =
        Math.atan2(-horizontal, -rideHandTarget.y) -
        Math.atan2(lowerLength * Math.sin(bend), upperLength + lowerLength * Math.cos(bend));
      arm.rotation.set(shoulderAngle, Math.atan2(rideHandTarget.x, rideHandTarget.z), 0, 'YXZ');
      elbow.rotation.set(bend + handAngle, 0, 0);
    }
  }

  function applyRidePose(time: number, reducedMotion: boolean) {
    if (!ridePose) return;
    const speed = Number.isFinite(ridePose.speed) ? Math.min(60, Math.abs(ridePose.speed)) : 0;
    const lean = Number.isFinite(ridePose.lean) ? THREE.MathUtils.clamp(ridePose.lean, -1, 1) : 0;
    const progress =
      ridePose.stuntProgress !== null && Number.isFinite(ridePose.stuntProgress)
        ? THREE.MathUtils.clamp(ridePose.stuntProgress, 0, 1)
        : 0;
    const stuntActive = progress > 0 && progress < 1;
    const stuntTurn = stuntActive ? THREE.MathUtils.smoothstep(progress, 0, 1) * Math.PI * 2 : 0;
    const stuntLift = stuntActive ? Math.sin(progress * Math.PI) : 0;
    const motion = Math.min(1, speed / 12);
    const bob = reducedMotion ? 0 : Math.sin(time * 7) * motion * 0.008;
    body.position.y = 1.06;
    body.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    riderPivot.rotation.z = -lean * 0.12;

    switch (ridePose.kind) {
      case 'skateboard':
      case 'hoverboard': {
        const skateboard = ridePose.kind === 'skateboard';
        const deckHeight = skateboard ? 0.285 : 0.218;
        const lift = deckHeight - 0.06 - stuntLift * 0.055 + bob;
        figure.position.y += lift;
        figure.rotation.y = skateboard ? Math.PI / 2 : 0;
        leftLeg.position.x = skateboard ? -0.31 : -0.183;
        rightLeg.position.x = skateboard ? 0.31 : 0.183;
        placeRideFoot(leftLeg, leftKnee, leftFoot, deckHeight + 0.161 - lift, skateboard ? 0 : -0.09);
        placeRideFoot(rightLeg, rightKnee, rightFoot, deckHeight + 0.161 - lift, skateboard ? 0 : -0.09);
        body.rotation.x = skateboard ? -0.025 : 0.055;
        head.rotation.y = skateboard ? -1.05 : 0;
        leftArm.rotation.set(-0.18, 0, -0.42 - stuntLift * 0.3);
        rightArm.rotation.set(0.1, 0, 0.5 + stuntLift * 0.3);
        leftElbow.rotation.x = -0.48;
        rightElbow.rotation.x = -0.38;
        if (skateboard) transportMount.rotation.z = stuntTurn;
        else riderPivot.rotation.y = stuntTurn;
        break;
      }
      case 'kart': {
        const lift = 0.69 - 0.908;
        figure.position.y += lift;
        figure.position.z = -0.272;
        body.rotation.x = 0.28;
        head.rotation.x = -0.18;
        leftLeg.position.x = -0.165;
        rightLeg.position.x = 0.165;
        placeRideFoot(leftLeg, leftKnee, leftFoot, 0.36 + 0.161 - lift, 0.35 - figure.position.z);
        placeRideFoot(rightLeg, rightKnee, rightFoot, 0.36 + 0.161 - lift, 0.35 - figure.position.z);
        placeRideHands(0.184, 1.04, 0.353, lift);
        riderPivot.rotation.z = -lean * 0.055 + stuntTurn;
        break;
      }
      case 'bmx': {
        const lift = 1.19 - 0.908 + bob;
        const phase = ridePose.pedalPhase ?? 0;
        const cycle = Number.isFinite(phase) ? phase % (Math.PI * 2) : 0;
        const pedalY = -0.075 * Math.cos(cycle) + 0.12 * Math.sin(cycle);
        const pedalZ = -0.075 * Math.sin(cycle) - 0.12 * Math.cos(cycle);
        figure.position.y += lift;
        figure.position.z = -0.23;
        body.rotation.x = 0.28;
        head.rotation.x = -0.22;
        leftLeg.position.x = -0.207;
        rightLeg.position.x = 0.207;
        placeRideFoot(
          leftLeg,
          leftKnee,
          leftFoot,
          0.525 + pedalY + 0.0235 + 0.161 - lift,
          -0.117 + pedalZ - 0.09 - figure.position.z,
        );
        placeRideFoot(
          rightLeg,
          rightKnee,
          rightFoot,
          0.525 - pedalY + 0.0235 + 0.161 - lift,
          -0.117 - pedalZ - 0.09 - figure.position.z,
        );
        placeRideHands(0.325, 1.6, 0.516, lift);
        riderPivot.rotation.x = -stuntTurn;
        riderPivot.rotation.z = -lean * 0.18;
        break;
      }
      case 'dragon': {
        const lift = 1.8 - 0.908;
        figure.position.y += lift;
        figure.position.z = -0.05;
        body.rotation.x = 0.2;
        head.rotation.x = -0.16;
        placeRideFoot(leftLeg, leftKnee, leftFoot, 1.22 + 0.161 - lift, 0.18 - 0.09 - figure.position.z, -0.57);
        placeRideFoot(rightLeg, rightKnee, rightFoot, 1.22 + 0.161 - lift, 0.18 - 0.09 - figure.position.z, 0.57);
        placeRideHands(0.3, 2.05, 0.5, lift);
        riderPivot.rotation.z = -lean * 0.18 + stuntTurn;
        riderPivot.rotation.x = -stuntLift * 0.1;
        break;
      }
      case 'jetpack':
        figure.position.y += bob;
        body.rotation.x = 0.055;
        head.rotation.x = -0.055;
        leftLeg.rotation.set(0.12, 0, -0.045);
        rightLeg.rotation.set(0.03, 0, 0.045);
        leftKnee.rotation.set(ridePose.airborne ? 0.44 : 0.2, 0, 0);
        rightKnee.rotation.set(ridePose.airborne ? 0.34 : 0.16, 0, 0);
        leftFoot.rotation.set(0.16, 0, 0);
        rightFoot.rotation.set(0.12, 0, 0);
        leftArm.rotation.set(-0.14, 0, -0.31);
        rightArm.rotation.set(-0.14, 0, 0.31);
        leftElbow.rotation.x = -0.64;
        rightElbow.rotation.x = -0.64;
        riderPivot.rotation.z = -lean * 0.16 + stuntTurn;
        riderPivot.rotation.x = -stuntLift * 0.18;
        break;
    }
  }

  /** Changes transforms only. Repeated frames never build geometry, materials or vectors. */
  function animate(seconds: number, animation: PersonaState['animation'] = 'idle', reducedMotion = false) {
    lastSeconds = seconds;
    lastAnimation = animation;
    lastReducedMotion = reducedMotion;
    resetRideTransforms();
    atlas.flush();
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) % 3600 : 0;
    const walking = animation === 'walk' && !reducedMotion;
    const dancing = animation === 'dance' && !reducedMotion;
    const jumping = animation === 'jump';
    const stride = walking ? Math.sin(time * 11.5) * 0.46 : 0;
    const breath = reducedMotion ? 0 : Math.sin(time * 2.1);
    const beat = dancing ? Math.sin(time * 7.4) : 0;
    body.position.y = 1.06 + (walking ? Math.cos(time * 23) * 0.014 : dancing ? Math.abs(beat) * 0.11 : breath * 0.007);
    body.rotation.set(
      jumping ? -0.1 : walking ? 0.055 : 0,
      walking ? stride * 0.12 : dancing ? beat * 0.18 : 0,
      dancing ? beat * 0.09 : walking ? -stride * 0.045 : 0,
    );
    head.rotation.set(
      jumping ? -0.06 : walking ? -0.035 : breath * 0.012,
      dancing ? -beat * 0.2 : reducedMotion ? 0 : Math.sin(time * 0.64) * 0.025,
      dancing ? -beat * 0.045 : 0,
    );

    leftLeg.rotation.set(jumping ? -0.37 : stride, 0, dancing ? -0.09 : -0.022);
    rightLeg.rotation.set(jumping ? 0.16 : -stride, 0, dancing ? 0.09 : 0.022);
    leftKnee.rotation.x = jumping ? 0.75 : walking ? Math.max(0, stride) * 1.3 : dancing ? Math.abs(beat) * 0.19 : 0;
    rightKnee.rotation.x = jumping ? 0.52 : walking ? Math.max(0, -stride) * 1.3 : dancing ? Math.abs(beat) * 0.19 : 0;
    leftFoot.rotation.set(jumping ? -0.16 : walking ? -Math.max(0, -stride) * 0.32 : 0, 0, 0);
    rightFoot.rotation.set(jumping ? -0.16 : walking ? -Math.max(0, stride) * 0.32 : 0, 0, 0);

    leftArm.rotation.set(
      jumping ? -0.45 : dancing ? beat * 0.35 : -stride * 0.9,
      0,
      jumping ? -0.47 : dancing ? -1.12 - beat * 0.3 : -0.075 - breath * 0.012,
      'XYZ',
    );
    rightArm.rotation.set(
      jumping ? -0.45 : dancing ? -beat * 0.35 : stride * 0.9,
      0,
      jumping ? 0.47 : dancing ? 1.12 - beat * 0.3 : 0.075 + breath * 0.012,
      'XYZ',
    );
    leftElbow.rotation.x = jumping ? -0.73 : dancing ? -1.05 + beat * 0.3 : -0.15 - Math.max(0, -stride) * 0.5;
    rightElbow.rotation.x = jumping ? -0.73 : dancing ? -1.05 - beat * 0.3 : -0.15 - Math.max(0, stride) * 0.5;
    applyRidePose(time, reducedMotion);
    if (toolPitch !== null && !ridePose) {
      toolMount.rotation.x = toolPitch;
      toolMount.position.copy(toolPivot).applyEuler(toolMount.rotation).negate().add(toolPivot);
      toolMount.updateMatrix();
      // Lean into the front grip so both hands stay within the existing arm reach.
      body.rotation.set(0.18 + toolPitch * 0.3, 0, 0);
      head.rotation.set(toolPitch - body.rotation.x, 0, 0);
      placeRideHands(0, 0, 0, 0, true);
    }
  }
  animate(0, 'idle', true);
  return {
    group,
    transportMount,
    toolMount,
    accent,
    body,
    head,
    leftArm,
    rightArm,
    leftElbow,
    rightElbow,
    leftLeg,
    rightLeg,
    leftKnee,
    rightKnee,
    leftFoot,
    rightFoot,
    animate,
    setToolPose(pitch: number | null) {
      const wasHoldingTool = toolPitch !== null;
      toolPitch = pitch !== null && Number.isFinite(pitch) ? THREE.MathUtils.clamp(pitch, -0.65, 0.8) : null;
      if (wasHoldingTool && toolPitch === null) animate(lastSeconds, lastAnimation, lastReducedMotion);
    },
    setRidePose(value: WorldPersonaRidePose | null) {
      const wasRiding = ridePose !== null;
      ridePose = value;
      if (wasRiding && !value) animate(lastSeconds, lastAnimation, lastReducedMotion);
    },
    setAvatarIdentity(value: WorldAvatarIdentity | null) {
      identity = value;
      atlas.sync(value ? [value] : []);
      showPortrait(Boolean(value && atlas.get(value.id)));
    },
    // World ownership releases shared geometry/materials through disposeObject(scene).
    dispose() {
      abort.abort();
      atlas.dispose();
      portrait.material.map = null;
    },
  };
}
