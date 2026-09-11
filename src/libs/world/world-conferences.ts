import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD_CONFERENCES, type WorldConference } from '@/libs/world/world-conference-catalog';
import { disposeObject, type Point3, WORLD_PALETTE } from '@/libs/world/world-geometry';
import type { WorldInteraction } from '@/libs/world/world-types';

export const CONFERENCE_DECK = {
  width: 24,
  depth: 18,
  radius: 15,
  displaySpacing: 8,
  hoverHeight: 1.8,
  hoverAmount: 0.14,
} as const;

type ConferenceSurface = 'matte' | 'metal' | 'water' | 'glow';

/** Palette variation lives in the vertices, so all three destinations share four surface materials. */
function batch(parent: THREE.Object3D, materials: Map<ConferenceSurface, THREE.MeshStandardMaterial>) {
  const parts = new Map<ConferenceSurface, THREE.BufferGeometry[]>();
  const add = (
    geometry: THREE.BufferGeometry,
    color: string,
    position: Point3,
    rotation: Point3 = [0, 0, 0],
    surface: ConferenceSurface = 'matte',
  ) => {
    geometry
      .rotateX(rotation[0])
      .rotateY(rotation[1])
      .rotateZ(rotation[2])
      .translate(...position);
    geometry.deleteAttribute('uv');
    if (!geometry.getAttribute('color')) {
      const shade = new THREE.Color(color);
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = shade.r;
        colors[i + 1] = shade.g;
        colors[i + 2] = shade.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const bucket = parts.get(surface) ?? [];
    bucket.push(geometry);
    parts.set(surface, bucket);
  };
  return {
    add,
    box(size: Point3, color: string, position: Point3, rotation?: Point3, surface?: ConferenceSurface) {
      add(new THREE.BoxGeometry(...size), color, position, rotation, surface);
    },
    face(
      size: readonly [number, number],
      color: string,
      position: Point3,
      rotation?: Point3,
      surface?: ConferenceSurface,
    ) {
      add(new THREE.PlaneGeometry(...size), color, position, rotation, surface);
    },
    rod(start: Point3, end: Point3, radius: number, color: string, surface: ConferenceSurface = 'metal', sides = 8) {
      const a = new THREE.Vector3(...start);
      const b = new THREE.Vector3(...end);
      const direction = b.clone().sub(a);
      const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), sides);
      geometry.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()),
      );
      const midpoint = a.add(b).multiplyScalar(0.5);
      add(geometry, color, [midpoint.x, midpoint.y, midpoint.z], [0, 0, 0], surface);
    },
    cone(radius: number, height: number, color: string, position: Point3, sides = 8, rotation: Point3 = [0, 0, 0]) {
      add(new THREE.ConeGeometry(radius, height, sides), color, position, rotation);
    },
    finish() {
      for (const [surface, pieces] of parts) {
        const triangles = pieces.map((piece) => (piece.index ? piece.toNonIndexed() : piece));
        const geometry = mergeGeometries(triangles)!;
        new Set([...pieces, ...triangles]).forEach((piece) => piece.dispose());
        let material = materials.get(surface);
        if (!material) {
          material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: surface === 'metal' ? 0.38 : surface === 'water' ? 0.27 : 0.9,
            metalness: surface === 'metal' ? 0.65 : surface === 'water' ? 0.28 : 0.02,
            ...(surface === 'glow' ? { emissive: '#B8DA78', emissiveIntensity: 0.6 } : {}),
          });
          materials.set(surface, material);
        }
        const object = new THREE.Mesh(geometry, material);
        object.name = `${parent.name} · ${surface}`;
        object.castShadow = surface !== 'water' && surface !== 'glow';
        object.receiveShadow = true;
        parent.add(object);
      }
    },
  };
}

type Diorama = ReturnType<typeof batch>;

function gable(city: Diorama, width: number, height: number, depth: number, color: string, position: Point3) {
  const profile = new THREE.Shape();
  profile.moveTo(-width / 2, 0);
  profile.lineTo(width / 2, 0);
  profile.lineTo(0, height);
  profile.closePath();
  city.add(
    new THREE.ExtrudeGeometry(profile, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2),
    color,
    position,
  );
  const slope = Math.atan2(height, width / 2);
  const roofWidth = Math.hypot(width / 2, height);
  // Fine roof courses are planes, rather than dozens of extra box meshes.
  for (const side of [-1, 1]) {
    for (let row = 1; row <= 3; row++) {
      const t = row / 4;
      city.face(
        [0.016, depth],
        '#6E463F',
        [position[0] + side * (width / 2) * t, position[1] + height * (1 - t) + 0.008, position[2]],
        [-Math.PI / 2, 0, -side * slope],
      );
    }
    city.box(
      [roofWidth, 0.025, 0.035],
      '#D0A189',
      [position[0] + (side * width) / 4, position[1] + height / 2 + 0.012, position[2] + depth / 2 + 0.012],
      [0, 0, -side * slope],
    );
  }
}

function facadeWindow(city: Diorama, x: number, y: number, z: number, width = 0.18, height = 0.29, trim = '#E5D3B5') {
  city.face([width + 0.055, height + 0.055], trim, [x, y, z]);
  city.face([width, height], '#263E48', [x, y, z + 0.004], undefined, 'metal');
  city.face([0.018, height], trim, [x, y, z + 0.008]);
  city.face([width, 0.019], '#B7C4AF', [x, y - height * 0.08, z + 0.009]);
}

function arch(city: Diorama, width: number, height: number, depth: number, color: string, position: Point3) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height - width / 2);
  shape.absarc(0, height - width / 2, width / 2, 0, Math.PI, false);
  shape.closePath();
  city.add(new THREE.ExtrudeGeometry(shape, { depth, curveSegments: 6, bevelEnabled: false }), color, position);
}

/** Ridged hills use vertex shading, preserving the outline without individual rock draw calls. */
function mountain(city: Diorama, position: Point3, radius: number, height: number, seed: number, crater = false) {
  const geometry = new THREE.CylinderGeometry(radius * (crater ? 0.17 : 0.025), radius, height, 20, 6, true);
  const vertices = geometry.getAttribute('position');
  const colors = new Float32Array(vertices.count * 3);
  const low = new THREE.Color(crater ? '#456C4F' : '#446B65');
  const high = new THREE.Color(crater ? '#7B8565' : '#A5B8B0');
  const shade = new THREE.Color();
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const z = vertices.getZ(i);
    const t = (vertices.getY(i) + height / 2) / height;
    const angle = Math.atan2(z, x);
    const ridge = 1 + Math.sin(angle * 5 + seed) * 0.075 + Math.cos(angle * 9 - seed) * 0.04;
    vertices.setXYZ(i, x * ridge + Math.sin(seed) * t * t * 0.12, vertices.getY(i), z * ridge * 0.77);
    shade.copy(low).lerp(high, Math.min(1, t * t * 0.8 + (Math.sin(angle * 5 + seed) + 1) * 0.08));
    shade.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  city.add(geometry, '#FFFFFF', [position[0], position[1] + height / 2, position[2]]);
  if (crater) {
    const summit: Point3 = [position[0] + Math.sin(seed) * 0.12, position[1] + height, position[2]];
    city.add(new THREE.TorusGeometry(radius * 0.17, 0.045, 5, 20).scale(1, 0.77, 1), '#8B856A', summit, [
      Math.PI / 2,
      0,
      0,
    ]);
    city.add(new THREE.CylinderGeometry(radius * 0.145, radius * 0.11, 0.085, 16).scale(1, 1, 0.77), '#263D32', [
      summit[0],
      summit[1] - 0.035,
      summit[2],
    ]);
  }
}

function prague(city: Diorama) {
  city.box([6.6, 0.13, 1.4], '#376B7C', [0, 0.25, 1.04], undefined, 'water');
  for (const z of [0.3, 1.82]) city.box([6.6, 0.17, 0.15], '#B8A58D', [0, 0.33, z]);
  for (const x of [-2.7, -1.8, -0.9, 0, 0.9, 1.8, 2.7]) {
    city.face([0.48, 0.024], '#77A3AA', [x, 0.318, 1.52 + Math.sin(x) * 0.1], [-Math.PI / 2, 0, 0], 'water');
  }
  const bridge = new THREE.Shape();
  bridge.moveTo(-3.1, 0);
  bridge.lineTo(-3.1, 0.74);
  bridge.lineTo(3.1, 0.74);
  bridge.lineTo(3.1, 0);
  for (const x of [2.35, 1.175, 0, -1.175, -2.35]) {
    bridge.lineTo(x + 0.43, 0);
    bridge.lineTo(x + 0.43, 0.16);
    bridge.absarc(x, 0.16, 0.43, 0, Math.PI, false);
    bridge.lineTo(x - 0.43, 0);
  }
  bridge.closePath();
  city.add(
    new THREE.ExtrudeGeometry(bridge, { depth: 0.56, curveSegments: 7, bevelEnabled: false }),
    '#C3AF92',
    [0, 0.28, 0.69],
  );
  city.box([6.34, 0.075, 0.68], '#E0CEAE', [0, 1.045, 0.97]);
  for (const z of [0.68, 1.26]) city.box([6.3, 0.105, 0.09], '#A28F79', [0, 1.135, z]);
  for (const x of [-2.9, -1.75, -0.58, 0.58, 1.75, 2.9]) {
    city.box([0.19, 0.08, 0.2], '#D8C4A1', [x, 1.2, 1.26]);
    city.add(new THREE.CylinderGeometry(0.034, 0.085, 0.28, 6), '#596058', [x, 1.38, 1.26], undefined, 'metal');
    city.add(new THREE.SphereGeometry(0.043, 6, 4), '#6C7164', [x, 1.56, 1.26], undefined, 'metal');
  }
  for (const [index, x] of [-2.64, -1.84, 1.84, 2.64].entries()) {
    const height = [1.13, 1.46, 1.28, 1.53][index];
    const facade = ['#DECDB0', '#D8AE98', '#BEBFAD', '#D7C394'][index];
    const top = 0.3 + height;
    city.box([0.68, height, 0.89], facade, [x, 0.3 + height / 2, -0.99]);
    city.box([0.75, 0.07, 0.95], '#E6D7BD', [x, top - 0.04, -0.99]);
    gable(city, 0.8, 0.43, 1.02, '#A36855', [x, top, -0.99]);
    city.box([0.12, 0.31, 0.14], '#BEB1A2', [x + 0.19, top + 0.35, -1.12]);
    for (const dx of [-0.16, 0.16]) {
      for (const y of [0.68, top - 0.34]) facadeWindow(city, x + dx, y, -0.539, 0.13, 0.23);
    }
    arch(city, 0.19, 0.31, 0.025, '#655C52', [x, 0.31, -0.53]);
  }
  city.box([1.87, 1.35, 1.5], '#BFB8AA', [0, 0.96, -0.98]);
  gable(city, 1.98, 0.69, 1.59, '#5C666F', [0, 1.64, -0.98]);
  for (const x of [-0.9, 0.9]) {
    city.box([0.15, 1.61, 0.25], '#DED0B8', [x, 1.13, -0.13]);
    city.cone(0.13, 0.36, '#67717A', [x, 2.1, -0.13], 4, [0, Math.PI / 4, 0]);
  }
  arch(city, 0.44, 0.66, 0.028, '#7D827A', [0, 0.31, -0.212]);
  arch(city, 0.31, 0.54, 0.03, '#384743', [0, 0.31, -0.18]);
  city.add(new THREE.TorusGeometry(0.205, 0.04, 5, 16), '#D6C8AD', [0, 1.27, -0.2]);
  city.add(
    new THREE.CylinderGeometry(0.169, 0.169, 0.022, 16),
    '#768D94',
    [0, 1.27, -0.216],
    [Math.PI / 2, 0, 0],
    'metal',
  );
  for (const x of [-0.59, 0.59]) {
    city.box([0.51, 2.17, 0.6], '#CBBFAA', [x, 1.38, -0.39]);
    for (const y of [0.42, 1.39, 2.39]) city.box([0.59, 0.08, 0.66], '#E6D5B7', [x, y, -0.39]);
    for (const dx of [-0.13, 0.13]) arch(city, 0.105, 0.55, 0.015, '#32474A', [x + dx, 1.66, -0.084]);
    city.cone(0.43, 0.93, '#4A5B67', [x, 2.91, -0.39], 4, [0, Math.PI / 4, 0]);
    city.rod([x, 3.32, -0.39], [x, 3.63, -0.39], 0.012, '#C3A576');
    city.rod([x - 0.065, 3.54, -0.39], [x + 0.065, 3.54, -0.39], 0.011, '#C3A576');
    for (const dx of [-0.23, 0.23]) {
      for (const dz of [-0.23, 0.23]) {
        city.box([0.095, 0.34, 0.095], '#C7BCA5', [x + dx, 2.52, -0.39 + dz]);
        city.cone(0.09, 0.32, '#526370', [x + dx, 2.85, -0.39 + dz], 4, [0, Math.PI / 4, 0]);
      }
    }
  }
}

function lugano(city: Diorama) {
  city.add(new THREE.CylinderGeometry(1, 1, 0.1, 40).scale(3.22, 1, 2.15), '#377C88', [0, 0.26, 0], undefined, 'water');
  for (const [x, height, radius, seed] of [
    [-2.02, 2.15, 1.12, 0.8],
    [-0.19, 3.35, 1.34, 2.2],
    [1.93, 2.58, 1.1, 4.1],
  ]) {
    mountain(city, [x, 0.28, -0.88], radius, height, seed);
  }
  city.box([6.48, 0.18, 0.88], '#B9B29B', [0, 0.37, 1.79]);
  city.box([6.54, 0.08, 0.1], '#E2D9BC', [0, 0.48, 1.31]);
  city.box([6.54, 0.06, 0.1], '#E2D9BC', [0, 0.48, 2.25]);
  for (const [index, x] of [-2.54, -1.75, 1.67, 2.45].entries()) {
    const height = [0.83, 1.17, 1.04, 0.77][index];
    const top = 0.46 + height;
    city.box([0.63, height, 0.59], ['#D6B994', '#D4AD9C', '#DFCEAB', '#B9C4B3'][index], [x, 0.46 + height / 2, 1.75]);
    city.box([0.69, 0.055, 0.65], '#F0E0C1', [x, top - 0.035, 1.75]);
    gable(city, 0.74, 0.29, 0.74, '#9B6958', [x, top, 1.75]);
    for (const dx of [-0.145, 0.145]) {
      facadeWindow(city, x + dx, 0.88, 2.052, 0.115, 0.21);
      if (height > 0.95) facadeWindow(city, x + dx, top - 0.24, 2.052, 0.115, 0.21);
    }
    city.box([0.29, 0.055, 0.12], '#E2D3B4', [x, 0.61, 2.095]);
  }
  city.box([0.68, 0.78, 0.74], '#DDCCAB', [0.76, 0.86, 1.73]);
  gable(city, 0.78, 0.32, 0.81, '#8E6454', [0.76, 1.25, 1.73]);
  city.box([0.34, 1.62, 0.37], '#D2BD98', [0.65, 1.27, 1.68]);
  city.box([0.43, 0.08, 0.45], '#F0DDBD', [0.65, 1.99, 1.68]);
  arch(city, 0.14, 0.28, 0.018, '#41534F', [0.65, 1.65, 1.872]);
  city.cone(0.33, 0.35, '#A27459', [0.65, 2.21, 1.68], 4, [0, Math.PI / 4, 0]);
  city.add(new THREE.CylinderGeometry(0.09, 0.09, 0.013, 12), '#F1DFBA', [0.65, 1.4, 1.878], [Math.PI / 2, 0, 0]);
  city.face([0.013, 0.075], '#5B6558', [0.65, 1.43, 1.888]);
  city.face([0.065, 0.012], '#5B6558', [0.675, 1.4, 1.889]);
  for (const x of [-1.09, -0.14, 1.1]) {
    city.rod([x, 0.47, 2.18], [x, 0.93, 2.18], 0.029, '#6D775D', 'matte', 6);
    city.add(new THREE.IcosahedronGeometry(0.22, 0).scale(0.78, 1.1, 0.8), '#63866A', [x, 1.02, 2.18]);
    city.box([0.4, 0.1, 0.32], '#A29982', [x, 0.52, 2.15]);
  }
  for (const x of [-2.8, -1.6, -0.4, 0.8, 2])
    city.face([0.61, 0.019], '#8AB5B4', [x, 0.315, 0.43 + Math.sin(x * 2) * 0.2], [-Math.PI / 2, 0, 0], 'water');
  const hull = new THREE.Shape();
  hull.moveTo(-0.59, 0);
  hull.lineTo(-0.41, -0.13);
  hull.lineTo(0.37, -0.13);
  hull.lineTo(0.57, 0);
  hull.closePath();
  city.add(new THREE.ExtrudeGeometry(hull, { depth: 0.28, bevelEnabled: false }), '#DCDCC6', [-0.54, 0.45, 0.63]);
  city.box([0.8, 0.028, 0.28], '#A18868', [-0.56, 0.467, 0.77]);
  city.rod([-0.58, 0.47, 0.78], [-0.58, 1.78, 0.78], 0.014, '#D9D2B8');
  city.rod([-0.61, 0.68, 0.78], [-0.01, 0.68, 0.78], 0.011, '#B0B5A5');
  const sail = new THREE.Shape();
  sail.moveTo(0.035, 0);
  sail.lineTo(0.6, 0);
  sail.lineTo(0.035, 1.04);
  sail.closePath();
  city.add(new THREE.ExtrudeGeometry(sail, { depth: 0.012, bevelEnabled: false }), '#EFEAD4', [-0.58, 0.69, 0.771]);
  city.box([0.92, 0.13, 0.3], '#E8E4CB', [1.34, 0.4, 0.6]);
  city.box([0.65, 0.17, 0.25], '#7CA4A1', [1.34, 0.55, 0.6], undefined, 'metal');
  city.box([0.75, 0.045, 0.31], '#E9DFC4', [1.34, 0.66, 0.6]);
  for (const x of [1.08, 1.22, 1.36, 1.5, 1.64]) city.face([0.025, 0.15], '#DEDABD', [x, 0.55, 0.731]);
}

function palm(city: Diorama, x: number, z: number, height: number, lean: number) {
  const trunk = new THREE.CylinderGeometry(0.052, 0.093, height, 7, 6);
  const positions = trunk.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const t = (positions.getY(i) + height / 2) / height;
    positions.setX(i, positions.getX(i) + lean * t * t);
  }
  trunk.computeVertexNormals();
  city.add(trunk, '#AA9270', [x, 0.32 + height / 2, z]);
  for (let leaf = 0; leaf < 7; leaf++) {
    const points: number[] = [];
    const angle = (leaf * Math.PI * 2) / 7;
    const length = 0.61 + (leaf % 3) * 0.055;
    const vertex = (t: number, side: number) => {
      const width = Math.sin(t * Math.PI) * 0.086 * side;
      return [t * length, Math.sin(t * Math.PI) * 0.13 - t * 0.13 - Math.abs(side) * 0.018, width];
    };
    for (let segment = 0; segment < 5; segment++) {
      const a = segment / 5;
      const b = (segment + 1) / 5;
      for (const side of [-1, 1]) {
        const triangle = [
          ...vertex(a, 0),
          ...vertex(b, 0),
          ...vertex(b, side),
          ...vertex(a, 0),
          ...vertex(b, side),
          ...vertex(a, side),
        ];
        // Both sides are geometry, allowing the shared matte material to stay single sided.
        for (let i = 0; i < triangle.length; i += 9) {
          points.push(
            ...triangle.slice(i, i + 9),
            ...triangle.slice(i + 6, i + 9),
            ...triangle.slice(i + 3, i + 6),
            ...triangle.slice(i, i + 3),
          );
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geometry.computeVertexNormals();
    city.add(geometry, leaf % 2 ? '#668B55' : '#3E734C', [x + lean, 0.32 + height, z], [0, -angle, 0]);
  }
}

function salvador(city: Diorama) {
  city.box([6.55, 0.12, 1.15], '#3C8790', [0, 0.25, 1.87], undefined, 'water');
  city.box([6.6, 0.12, 0.2], '#D5C298', [0, 0.32, 1.32]);
  mountain(city, [-1.43, 0.26, -0.82], 1.35, 2.43, 1.1, true);
  mountain(city, [1.39, 0.26, -0.84], 1.34, 3.15, 3.4, true);
  city.box([2.28, 0.09, 1.01], '#B8B59C', [0, 0.36, 0.72]);
  city.box([1.85, 0.06, 0.3], '#E3D8B4', [0, 0.43, 1.23]);
  city.box([1.69, 0.88, 0.73], '#DEDCC2', [0, 0.91, 0.67]);
  city.box([1.79, 0.08, 0.81], '#F0E9CC', [0, 1.37, 0.67]);
  city.box([1.59, 0.11, 0.1], '#C6B881', [0, 1.17, 1.066]);
  gable(city, 0.89, 0.31, 0.74, '#D7BC79', [0, 1.4, 0.68]);
  city.add(
    new THREE.SphereGeometry(0.42, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.72, 1),
    '#C9B476',
    [0, 1.49, 0.52],
    undefined,
    'metal',
  );
  city.add(new THREE.CylinderGeometry(0.38, 0.38, 0.14, 16), '#E1D9B4', [0, 1.43, 0.52]);
  city.rod([0, 1.75, 0.52], [0, 1.97, 0.52], 0.013, '#D5C89D');
  city.rod([-0.061, 1.9, 0.52], [0.061, 1.9, 0.52], 0.012, '#D5C89D');
  for (const x of [-0.67, 0.67]) {
    city.box([0.36, 1.46, 0.46], '#E8E1C2', [x, 1.18, 0.76]);
    city.box([0.43, 0.075, 0.53], '#C7BF9B', [x, 1.8, 0.76]);
    arch(city, 0.16, 0.31, 0.018, '#556B66', [x, 1.35, 0.997]);
    city.add(
      new THREE.SphereGeometry(0.23, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1),
      '#B8A363',
      [x, 1.91, 0.76],
      undefined,
      'metal',
    );
    city.rod([x, 2.08, 0.76], [x, 2.25, 0.76], 0.012, '#D8D0A6');
    facadeWindow(city, x, 0.97, 0.998, 0.13, 0.24);
  }
  for (const x of [-0.36, 0, 0.36]) {
    arch(city, 0.26, 0.58, 0.022, '#C1BA99', [x, 0.47, 1.043]);
    arch(city, 0.19, 0.51, 0.022, '#596B62', [x, 0.47, 1.07]);
  }
  for (const x of [-1.67, 1.66]) {
    city.box([0.64, 0.16, 0.53], '#ACA987', [x, 0.42, 0.76]);
    city.add(new THREE.IcosahedronGeometry(0.31, 0).scale(1, 0.72, 0.76), '#62865B', [x, 0.68, 0.76]);
  }
  palm(city, -2.57, 0.6, 1.45, 0.09);
  palm(city, 2.56, 0.73, 1.68, -0.11);
  for (const [index, x] of [-2.6, -1.3, 0, 1.3, 2.6].entries()) {
    city.face([0.85, 0.036], '#A3C7B9', [x, 0.315, 2.02 + (index % 2) * 0.14], [-Math.PI / 2, 0, 0], 'water');
    city.face([0.49, 0.019], '#75ACA7', [x - 0.12, 0.317, 1.68 + (index % 2) * 0.14], [-Math.PI / 2, 0, 0], 'water');
  }
}

function textPlane(
  parent: THREE.Object3D,
  size: [number, number],
  position: Point3,
  paint: (context: CanvasRenderingContext2D) => void,
  pixels: [number, number] = [768, 448],
) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(pixels[0] * 1.5);
  canvas.height = Math.round(pixels[1] * 1.5);
  const context = canvas.getContext('2d');
  if (context) {
    context.scale(1.5, 1.5);
    paint(context);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(size[0], size[1]),
    new THREE.MeshBasicMaterial({ map: texture, fog: false, toneMapped: false }),
  );
  plane.position.set(...position);
  parent.add(plane);
  return plane;
}

function ticket(context: CanvasRenderingContext2D, conference: WorldConference, index: number) {
  context.fillStyle = '#10161B';
  context.fillRect(0, 0, 768, 448);
  context.fillStyle = '#2A343A';
  context.fillRect(18, 92, 732, 1);
  context.fillRect(18, 18, 1, 412);
  context.fillRect(749, 18, 1, 412);
  context.fillStyle = '#1B252B';
  context.fillRect(28, 371, 712, 51);
  context.fillStyle = conference.color;
  context.fillRect(0, 0, 768, 14);
  context.font = '700 25px sans-serif';
  context.fillText('PUBKY ON TOUR', 34, 62);
  context.textAlign = 'right';
  context.fillText(['PRG', 'LUG', 'SAL'][index], 730, 62);
  context.textAlign = 'left';
  context.fillStyle = '#EEEEF6';
  context.font = '900 66px sans-serif';
  context.fillText(conference.city, 34, 158, 700);
  context.font = '500 29px sans-serif';
  context.fillText(conference.name, 36, 210, 690);
  context.font = '400 25px sans-serif';
  context.fillStyle = '#B2B2C0';
  context.fillText(conference.country, 36, 252, 690);
  context.strokeStyle = '#535362';
  context.lineWidth = 2;
  context.setLineDash([9, 8]);
  context.beginPath();
  context.moveTo(30, 282);
  context.lineTo(738, 282);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = conference.color;
  context.font = '700 34px sans-serif';
  context.fillText(conference.dateLabel, 36, 340, 690);
  context.fillStyle = '#EEEEF6';
  context.font = '500 23px sans-serif';
  context.fillText('Explore the official event', 44, 404);
  context.strokeStyle = conference.color;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(695, 397);
  context.lineTo(719, 397);
  context.moveTo(711, 389);
  context.lineTo(719, 397);
  context.lineTo(711, 405);
  context.stroke();
}

/** A local departure deck: three independently selectable tickets, no booking or network behavior. */
export function createConferences(
  scene: THREE.Scene,
  anchor: readonly [number, number],
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle?: (x: number, z: number, radius: number) => void,
) {
  const group = new THREE.Group();
  group.name = 'Next Stop: Pubky';
  group.position.set(anchor[0], 0, anchor[1]);
  scene.add(group);
  const materials = new Map<ConferenceSurface, THREE.MeshStandardMaterial>();
  const deck = batch(group, materials);
  deck.box([24, 0.35, 18], WORLD_PALETTE.surface, [0, 0.2, 0]);
  deck.box([23.6, 0.08, 17.6], '#343E42', [0, 0.415, 0]);
  for (const x of [-11.82, 11.82]) deck.box([0.045, 0.15, 17.7], '#748080', [x, 0.25, 0], undefined, 'metal');
  for (const z of [-8.84, 8.84]) deck.box([23.67, 0.15, 0.045], '#748080', [0, 0.25, z], undefined, 'metal');
  for (let x = -9.2; x <= 9.21; x += 2.3) deck.face([0.022, 17.2], '#232D32', [x, 0.46, 0], [-Math.PI / 2, 0, 0]);
  for (const z of [-7.05, -4.25, -1.45, 1.35, 4.15, 6.95])
    deck.face([23.2, 0.025], '#232D32', [0, 0.461, z], [-Math.PI / 2, 0, 0]);
  deck.box([23.2, 0.035, 0.08], '#96B76C', [0, 0.47, 8.4], undefined, 'metal');
  // Side and rear rails stop before the arrival edge and remain below the hovering models.
  for (const x of [-11.4, 11.4]) {
    for (const z of [-7.7, -5.1, -2.5, 0.1, 2.7, 5.3]) {
      deck.box([0.18, 0.055, 0.18], '#646F70', [x, 0.49, z], undefined, 'metal');
      deck.box([0.065, 0.94, 0.065], '#73807E', [x, 0.97, z], undefined, 'metal');
    }
    for (const y of [0.85, 1.45]) deck.box([0.07, 0.055, 13.1], '#83918A', [x, y, -1.2], undefined, 'metal');
  }
  for (const x of [-10.2, -6.8, -3.4, 0, 3.4, 6.8, 10.2])
    deck.box([0.065, 0.94, 0.065], '#73807E', [x, 0.97, -8.35], undefined, 'metal');
  for (const y of [0.85, 1.45]) deck.box([22.85, 0.055, 0.07], '#83918A', [0, y, -8.35], undefined, 'metal');
  for (const x of [-8, -4, 0, 4, 8]) {
    deck.add(new THREE.CylinderGeometry(0.14, 0.14, 0.035, 10), '#19272A', [x, 0.479, 7.67], undefined, 'metal');
    deck.add(new THREE.CylinderGeometry(0.082, 0.082, 0.012, 10), '#D4E3A0', [x, 0.502, 7.67], undefined, 'glow');
  }
  for (const x of [-10.5, 10.5]) {
    deck.box([0.32, 12.3, 0.32], '#596665', [x, 6.5, -4.5], undefined, 'metal');
    deck.box([0.74, 0.14, 0.79], '#88908A', [x, 0.535, -4.5], undefined, 'metal');
    for (const dx of [-0.24, 0.24]) {
      for (const dz of [-0.25, 0.25])
        deck.add(
          new THREE.CylinderGeometry(0.038, 0.038, 0.026, 6),
          '#B4B8A1',
          [x + dx, 0.62, -4.5 + dz],
          undefined,
          'metal',
        );
    }
    deck.rod([x, 2.38, -4.5], [x, 0.6, -6], 0.045, '#72807C');
    deck.box([0.11, 7.25, 0.04], '#2D3B3B', [x, 4.6, -4.321], undefined, 'metal');
  }
  deck.box([22, 4.1, 0.45], '#364348', [0, 12.15, -4.5], undefined, 'metal');
  deck.box([21.73, 3.84, 0.055], '#1C2A30', [0, 12.15, -4.305]);
  for (const x of [-10.91, 10.91]) deck.box([0.09, 4.01, 0.08], '#92A59A', [x, 12.15, -4.245], undefined, 'metal');
  for (const y of [10.16, 14.14]) deck.box([21.85, 0.085, 0.08], '#92A59A', [0, y, -4.245], undefined, 'metal');
  for (const x of [-10.83, 10.83]) {
    for (const y of [10.27, 14.03])
      deck.add(
        new THREE.CylinderGeometry(0.036, 0.036, 0.018, 6),
        '#C1CBB0',
        [x, y, -4.194],
        [Math.PI / 2, 0, 0],
        'metal',
      );
  }
  for (const z of [5.2, 6.5, 7.8]) {
    for (const side of [-1, 1])
      deck.box([0.9, 0.045, 0.12], WORLD_PALETTE.lime, [side * 0.3, 0.48, z], [0, (side * Math.PI) / 4, 0]);
  }
  deck.finish();
  const board = textPlane(
    group,
    [21.5, 3.65],
    [0, 12.15, -4.24],
    (context) => {
      context.fillStyle = '#10111A';
      context.fillRect(0, 0, 1024, 174);
      context.textAlign = 'center';
      context.fillStyle = WORLD_PALETTE.lime;
      context.font = '900 56px sans-serif';
      context.fillText('NEXT STOP: PUBKY', 512, 67, 960);
      context.fillStyle = '#EEEEF6';
      context.font = '700 24px sans-serif';
      context.fillText('PRAGUE  ·  LUGANO  ·  SAN SALVADOR', 512, 118, 960);
      context.fillStyle = '#B2B2C0';
      context.font = '500 17px sans-serif';
      context.fillText('3 stops. Bring your curiosity.', 512, 153, 960);
    },
    [1024, 174],
  );
  board.name = 'Pubky departure board';
  const displays = WORLD_CONFERENCES.map((conference, index) => {
    const display = new THREE.Group();
    display.name = `${conference.city} boarding pass`;
    display.position.set((index - 1) * CONFERENCE_DECK.displaySpacing, CONFERENCE_DECK.hoverHeight, 0);
    group.add(display);
    const city = batch(display, materials);
    city.box([7.2, 0.15, 5.3], '#455358', [0, -0.035, 0], undefined, 'metal');
    city.box([7.03, 0.08, 5.13], '#8C9990', [0, 0.08, 0], undefined, 'metal');
    city.box([6.85, 0.12, 4.95], index === 0 ? '#7F8974' : index === 1 ? '#657F70' : '#718764', [0, 0.17, 0]);
    city.box([6.8, 0.033, 0.023], conference.color, [0, -0.035, 2.653], undefined, 'metal');
    for (const x of [-3.36, 3.36]) {
      city.box([0.12, 3.17, 0.12], '#73817C', [x, 1.795, -2.5], undefined, 'metal');
      city.rod([x, 1.56, -2.5], [x, 0.17, -1.72], 0.027, '#8B9688');
    }
    city.box([7.15, 4.9, 0.3], '#46565B', [0, 5.3, -2.55], undefined, 'metal');
    city.box([6.93, 4.66, 0.05], '#172329', [0, 5.3, -2.417]);
    for (const x of [-3.53, 3.53]) city.box([0.06, 4.85, 0.06], conference.color, [x, 5.3, -2.375], undefined, 'metal');
    for (const y of [2.88, 7.72]) city.box([7.07, 0.06, 0.06], conference.color, [0, y, -2.375], undefined, 'metal');
    for (const x of [-3.48, 3.48]) {
      for (const y of [3.02, 7.58])
        city.add(
          new THREE.CylinderGeometry(0.023, 0.023, 0.019, 6),
          '#B2BDB0',
          [x, y, -2.337],
          [Math.PI / 2, 0, 0],
          'metal',
        );
    }
    if (index === 0) prague(city);
    else if (index === 1) lugano(city);
    else salvador(city);
    city.finish();
    const pass = textPlane(display, [6.83, 4.54], [0, 5.3, -2.37], (context) => ticket(context, conference, index));
    pass.name = `${conference.city} official event dates`;
    register(display, { kind: 'conference', index }, `Next stop: ${conference.city}`);
    obstacle?.(anchor[0] + display.position.x, anchor[1], 3);
    return display;
  });
  let elapsed = 0;
  let disposed = false;
  return {
    group,
    animate(_time: number, delta: number, reducedMotion = false) {
      if (disposed || reducedMotion || !Number.isFinite(delta) || delta <= 0) return;
      elapsed += Math.min(delta, 0.05);
      for (let index = 0; index < displays.length; index++) {
        displays[index].position.y =
          CONFERENCE_DECK.hoverHeight + Math.sin(elapsed * 0.7 + index * 2) * CONFERENCE_DECK.hoverAmount;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeObject(group);
    },
  };
}
