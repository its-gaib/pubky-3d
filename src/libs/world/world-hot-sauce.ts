import * as THREE from 'three';
import { mesh } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import { worldGrainTexture } from '@/libs/world/world-surfaces';
import type { WorldInteraction } from '@/libs/world/world-types';

export const HOT_SAUCE_POSITION = WORLD_ANCHORS.hotSauce;
export const HOT_SAUCE_RADIUS = 22;
export const HOT_SAUCE_HEIGHT = 11;

const TAU = Math.PI * 2;
const RADII = [0.025, 0.25, 0.68, 1.42, 2.35, 3.35, 4.33, 4.85, 4.65, 3.85, 1.35];

/** Interpolating the radius separately keeps the hooked tip genuinely tapered. */
function chiliRadius(t: number, angle: number) {
  const sample = t * (RADII.length - 1);
  const index = Math.min(RADII.length - 2, Math.floor(sample));
  const fraction = sample - index;
  const a = RADII[Math.max(0, index - 1)];
  const b = RADII[index];
  const c = RADII[index + 1];
  const d = RADII[Math.min(RADII.length - 1, index + 2)];
  const radius =
    b + 0.5 * fraction * (c - a + fraction * (2 * a - 5 * b + 4 * c - d + fraction * (3 * (b - c) + d - a)));
  const lobes = Math.cos(angle * 5 + Math.sin(t * Math.PI) * 0.28);
  return Math.max(0.015, radius) * (1 + lobes * 0.042 * Math.sin(t * Math.PI * 0.9));
}

function curveFrame(curve: THREE.CatmullRomCurve3, t: number) {
  const tangent = curve.getTangent(t).normalize();
  // Both sculpted curves travel through XY; this axis stays clear of their tangents.
  const normal = new THREE.Vector3(0, 0, 1).cross(tangent).normalize();
  return { center: curve.getPoint(t), normal, binormal: tangent.clone().cross(normal).normalize() };
}

function finishGeometry(positions: number[], colors: number[], indices: number[], uvs?: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function sculptedSweep(
  curve: THREE.CatmullRomCurve3,
  radius: (t: number, angle: number) => number,
  lengthSegments: number,
  radialSegments: number,
  dark: string,
  light: string,
) {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const darkColor = new THREE.Color(dark);
  const lightColor = new THREE.Color(light);
  const tint = new THREE.Color();
  const point = new THREE.Vector3();
  const stride = radialSegments + 1;
  for (let ring = 0; ring <= lengthSegments; ring++) {
    const t = ring / lengthSegments;
    const { center, normal, binormal } = curveFrame(curve, t);
    for (let edge = 0; edge <= radialSegments; edge++) {
      const angle = (edge / radialSegments) * TAU;
      const r = radius(t, angle);
      point
        .copy(center)
        .addScaledVector(normal, Math.cos(angle) * r)
        .addScaledVector(binormal, Math.sin(angle) * r);
      positions.push(...point.toArray());
      tint.copy(darkColor).lerp(lightColor, 0.38 + t * 0.42 + Math.cos(angle * 5 + t) * 0.06);
      colors.push(tint.r, tint.g, tint.b);
      uvs.push(edge / radialSegments, t);
      if (ring < lengthSegments && edge < radialSegments) {
        const a = ring * stride + edge;
        indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
  }
  for (const end of [0, 1]) {
    const center = curve.getPoint(end);
    const cap = positions.length / 3;
    positions.push(...center.toArray());
    tint.copy(darkColor).lerp(lightColor, end ? 0.8 : 0.38);
    colors.push(tint.r, tint.g, tint.b);
    uvs.push(0.5, end);
    const offset = end * lengthSegments * stride;
    for (let edge = 0; edge < radialSegments; edge++) {
      if (end) indices.push(cap, offset + edge, offset + edge + 1);
      else indices.push(cap, offset + edge + 1, offset + edge);
    }
  }
  const geometry = finishGeometry(positions, colors, indices, uvs);
  const normals = geometry.getAttribute('normal');
  const seam = new THREE.Vector3();
  for (let ring = 0; ring <= lengthSegments; ring++) {
    const start = ring * stride;
    const end = start + radialSegments;
    seam
      .set(
        normals.getX(start) + normals.getX(end),
        normals.getY(start) + normals.getY(end),
        normals.getZ(start) + normals.getZ(end),
      )
      .normalize();
    normals.setXYZ(start, seam.x, seam.y, seam.z);
    normals.setXYZ(end, seam.x, seam.y, seam.z);
  }
  return geometry;
}

/** Six pointed sepals follow the actual shoulder surface, including its lobes. */
function calyxGeometry(curve: THREE.CatmullRomCurve3) {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const tint = new THREE.Color();
  const dark = new THREE.Color('#236411');
  const light = new THREE.Color('#72B832');
  const point = new THREE.Vector3();
  const rows = 16;
  const columns = 8;
  for (let leaf = 0; leaf < 6; leaf++) {
    const offset = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const s = row / rows;
      const t = 1 - s * 0.135;
      const { center, normal, binormal } = curveFrame(curve, t);
      const spread = Math.max(0.001, 0.11 * (1 - s) + 0.3 * Math.sin(s * Math.PI) ** 0.8);
      for (let column = 0; column <= columns; column++) {
        const across = (column / columns) * 2 - 1;
        const angle = (leaf / 6) * TAU + across * spread + Math.sin(s * Math.PI) * 0.075;
        const crease = (1 - Math.abs(across)) * Math.sin(s * Math.PI);
        const r = chiliRadius(t, angle) + 0.085 + crease * 0.14;
        point
          .copy(center)
          .addScaledVector(normal, Math.cos(angle) * r)
          .addScaledVector(binormal, Math.sin(angle) * r);
        positions.push(...point.toArray());
        tint.copy(dark).lerp(light, 0.32 + crease * 0.4 + s * 0.15);
        colors.push(tint.r, tint.g, tint.b);
        if (row < rows && column < columns) {
          const a = offset + row * (columns + 1) + column;
          indices.push(a, a + columns + 1, a + 1, a + 1, a + columns + 1, a + columns + 2);
        }
      }
    }
  }
  return finishGeometry(positions, colors, indices);
}

/** A static local sculpture. Its meshes, shared maps and materials belong to the scene. */
export function createHotSauce(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
) {
  const group = new THREE.Group();
  group.name = 'bitkit-hot-sauce-monument';
  group.position.set(HOT_SAUCE_POSITION[0], 0, HOT_SAUCE_POSITION[1]);
  scene.add(group);
  const sculpture = new THREE.Group();
  sculpture.name = 'hot-sauce-grounded-chili';
  group.add(sculpture);

  const bodyCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-8.55, 5.8, 0.4),
    new THREE.Vector3(-8.05, 4.8, 0.33),
    new THREE.Vector3(-6.95, 4.05, 0.24),
    new THREE.Vector3(-5.5, 5.25, 0.1),
    new THREE.Vector3(-3.75, 8.15, -0.02),
    new THREE.Vector3(-2.35, 12, -0.15),
    new THREE.Vector3(-0.95, 16.4, -0.2),
    new THREE.Vector3(0, 20.65, -0.15),
    new THREE.Vector3(0.45, 24.3, -0.05),
    new THREE.Vector3(0, 27.6, 0),
    new THREE.Vector3(-0.35, 29.45, 0.08),
  ]);
  const skinGrain = worldGrainTexture('stone');
  skinGrain.name = 'Local chili skin micro-grain';
  skinGrain.repeat.set(7, 18);
  const skin = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.3,
    metalness: 0.015,
    clearcoat: 0.68,
    clearcoatRoughness: 0.19,
    envMapIntensity: 1.15,
    bumpMap: skinGrain,
    bumpScale: 0.035,
    roughnessMap: skinGrain,
  });
  const body = mesh(sculpture, sculptedSweep(bodyCurve, chiliRadius, 128, 64, '#B80812', '#F12D17'), skin);
  body.name = 'hot-sauce-lobed-red-chili';

  const green = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.43,
    metalness: 0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.3,
    side: THREE.DoubleSide,
  });
  const calyx = mesh(sculpture, calyxGeometry(bodyCurve), green);
  calyx.name = 'hot-sauce-six-pointed-green-calyx';
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.35, 29.3, 0.08),
    new THREE.Vector3(-0.6, 31.9, 0.13),
    new THREE.Vector3(-0.25, 34.45, 0.12),
    new THREE.Vector3(1.45, 36.55, 0.22),
    new THREE.Vector3(3.65, 37.6, 0.55),
    new THREE.Vector3(5.5, 37.65, 0.9),
    new THREE.Vector3(6.3, 38.1, 1),
  ]);
  const stem = mesh(
    sculpture,
    sculptedSweep(
      stemCurve,
      (t, angle) => (1.2 - t * 0.73) * (1 + Math.cos(angle * 7 + t) * 0.045),
      48,
      24,
      '#225B0C',
      '#70B832',
    ),
    green,
  );
  stem.name = 'hot-sauce-curved-green-stem';

  // Lay the complete chili across the approach. Precise vertex bounds put the
  // skin on the island's Y=0 surface and center the footprint on its anchor.
  const inwardYaw = Math.atan2(-HOT_SAUCE_POSITION[0], -HOT_SAUCE_POSITION[1]);
  sculpture.rotation.set(Math.PI / 2, inwardYaw + Math.PI / 2, 0, 'YXZ');
  sculpture.updateWorldMatrix(true, true);
  const restingBounds = new THREE.Box3().setFromObject(sculpture, true);
  const center = restingBounds.getCenter(new THREE.Vector3());
  sculpture.position.set(group.position.x - center.x, -restingBounds.min.y, group.position.z - center.z);

  // A low, tilted plaque stays close to the inward path, outside the sculpture.
  const plaqueMount = new THREE.Group();
  plaqueMount.name = 'hot-sauce-ground-plaque';
  plaqueMount.rotation.y = inwardYaw;
  group.add(plaqueMount);
  const stoneTexture = worldGrainTexture('stone');
  stoneTexture.repeat.set(2, 1);
  const stone = new THREE.MeshStandardMaterial({
    color: '#272C31',
    roughness: 0.86,
    metalness: 0.06,
    map: stoneTexture,
    bumpMap: stoneTexture,
    bumpScale: 0.035,
  });
  const plaqueRadius = HOT_SAUCE_RADIUS - 1.2;
  const base = mesh(plaqueMount, new THREE.BoxGeometry(5.8, 0.22, 1.3), stone, [0, 0.11, plaqueRadius]);
  base.name = 'hot-sauce-ground-plaque-base';
  const plaqueBoard = new THREE.Group();
  plaqueBoard.position.set(0, 0.49, plaqueRadius);
  plaqueBoard.rotation.x = -1;
  plaqueMount.add(plaqueBoard);
  const backing = mesh(plaqueBoard, new THREE.BoxGeometry(5.6, 0.96, 0.15), stone);
  backing.name = 'hot-sauce-mounted-plaque-frame';
  const accent = mesh(
    plaqueMount,
    new THREE.BoxGeometry(5.2, 0.025, 0.04),
    new THREE.MeshBasicMaterial({ color: '#FF6B00', toneMapped: false }),
    [0, 0.23, plaqueRadius + 0.59],
  );
  accent.name = 'hot-sauce-plaque-orange-inlay';
  accent.castShadow = false;
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#11171C';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#FF7A24';
    context.font = '800 132px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('BITKIT HOT SAUCE', 768, 102, 1456);
  }
  const plaqueTexture = new THREE.CanvasTexture(canvas);
  plaqueTexture.colorSpace = THREE.SRGBColorSpace;
  plaqueTexture.anisotropy = 4;
  const plaque = mesh(
    plaqueBoard,
    new THREE.PlaneGeometry(5.2, 0.65),
    new THREE.MeshBasicMaterial({ map: plaqueTexture, toneMapped: false }),
    [0, 0, 0.078],
  );
  plaque.name = 'BITKIT HOT SAUCE plaque';
  plaque.castShadow = false;
  register(group, { kind: 'fun', id: 'hot-sauce' }, 'BITKIT HOT SAUCE');
  // The center lies beyond walking reach; the path plaque also supports the E prompt.
  register(plaque, { kind: 'fun', id: 'hot-sauce' }, 'BITKIT HOT SAUCE');
  obstacle(HOT_SAUCE_POSITION[0], HOT_SAUCE_POSITION[1], HOT_SAUCE_RADIUS);
  return { group };
}
