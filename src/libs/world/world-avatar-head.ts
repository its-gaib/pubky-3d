import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Point = [number, number, number];
export const WORLD_MASK_COLORS = { shell: '#343D43', visor: '#09151C', trim: '#707F86', inlay: '#C8FF03' } as const;

function combine(parts: THREE.BufferGeometry[]) {
  const normalized = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const result = mergeGeometries(normalized)!;
  new Set([...parts, ...normalized]).forEach((part) => part.dispose());
  return result;
}

function seam(points: Point[], radius: number) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))),
    20,
    radius,
    5,
    false,
  );
}

/** Map the full image onto a rounded head, with a circular edge that meets its rear shell. */
export function createWorldPortraitGeometry() {
  const geometry = new THREE.PlaneGeometry(2, 2, 32, 32);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index++) {
    const u = positions.getX(index);
    const v = positions.getY(index);
    // A square-to-disc map retains every image corner and turns it around the head's sides.
    const x = u * Math.sqrt(1 - (v * v) / 2);
    const y = v * Math.sqrt(1 - (u * u) / 2);
    const depth = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    positions.setXYZ(index, x * 0.355, y * 0.355, 0.012 + depth * 0.322);
    const shade = 0.74 + depth * 0.26;
    colors.set([shade, shade, shade], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createWorldPortraitBackGeometry() {
  return new THREE.SphereGeometry(1, 32, 20, Math.PI, Math.PI).scale(0.355, 0.355, 0.277).translate(0, 0, 0.012);
}

/** Anonymous, age-neutral hardware. No invented face, brows, smile or demographic inference. */
export function createWorldMaskGeometry() {
  const shell = new THREE.LatheGeometry(
    [
      [0, -0.402],
      [0.12, -0.384],
      [0.215, -0.324],
      [0.29, -0.19],
      [0.338, -0.025],
      [0.344, 0.13],
      [0.314, 0.27],
      [0.226, 0.367],
      [0.1, 0.405],
      [0, 0.414],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
    40,
  ).scale(1, 1, 0.81);
  const visor = combine([
    new RoundedBoxGeometry(0.55, 0.14, 0.067, 3, 0.042).translate(0, 0.112, 0.27),
    ...[-1, 1].map((side) =>
      new RoundedBoxGeometry(0.15, 0.131, 0.075, 2, 0.026).rotateY(side * 0.62).translate(side * 0.27, 0.11, 0.219),
    ),
    // Recessed, parallel vents read as equipment instead of a mouth.
    ...[-1, 1].flatMap((side) =>
      [0, 1, 2].map((index) =>
        new RoundedBoxGeometry(0.058, 0.009, 0.016, 1, 0.004)
          .rotateZ(side * 0.12)
          .translate(side * (0.14 + index * 0.023), -0.204 + index * 0.036, 0.228 - index * 0.001),
      ),
    ),
  ]);
  const trim = combine([
    seam(
      [
        [-0.307, 0.2, 0.178],
        [-0.214, 0.208, 0.272],
        [0, 0.21, 0.295],
        [0.214, 0.208, 0.272],
        [0.307, 0.2, 0.178],
      ],
      0.011,
    ),
    ...[-1, 1].map((side) =>
      seam(
        [
          [side * 0.32, 0.017, 0.148],
          [side * 0.286, -0.086, 0.202],
          [side * 0.2, -0.265, 0.189],
          [side * 0.098, -0.352, 0.137],
        ],
        0.009,
      ),
    ),
    new RoundedBoxGeometry(0.148, 0.021, 0.027, 2, 0.009).translate(0, -0.349, 0.144),
  ]);
  const inlay = combine(
    [-1, 1].map((side) =>
      new RoundedBoxGeometry(0.012, 0.063, 0.018, 2, 0.005).rotateZ(side * -0.2).translate(side * 0.281, 0.004, 0.212),
    ),
  );
  return { shell, visor, trim, inlay };
}

/** One texture and one instanced draw, with a stable atlas rectangle for each rendered identity. */
export function createWorldPortraitMaterial(texture: THREE.Texture, instanced = false) {
  const material = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, toneMapped: false });
  if (instanced) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `attribute vec4 avatarTile;\n${shader.vertexShader}`.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvMapUv = avatarTile.xy + vMapUv * avatarTile.zw;',
      );
    };
    material.customProgramCacheKey = () => 'world-avatar-atlas-v1';
  }
  return material;
}
