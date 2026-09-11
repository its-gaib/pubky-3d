import * as THREE from 'three';
import { mesh } from '@/libs/world/world-geometry';
import { worldDetail } from '@/libs/world/world-surfaces';
import type { WorldPost, WorldTag } from '@/libs/world/world-types';

type Point = [number, number, number];

function pointedLeaf() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-0.31, 0, 0, 0, 0.075, 0, 0.37, 0, 0, 0, 0, 0.15, 0, 0, -0.15, 0, -0.025, 0], 3),
  );
  geometry.setIndex([0, 3, 1, 3, 2, 1, 2, 4, 1, 4, 0, 1, 0, 5, 3, 3, 5, 2, 2, 5, 4, 4, 5, 0]);
  geometry.computeVertexNormals();
  return geometry;
}

function branch(points: Point[], base: number, tip: number) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const segments = 14;
  const sides = 10;
  const geometry = new THREE.TubeGeometry(curve, segments, 1, sides, false);
  const positions = geometry.getAttribute('position');
  const center = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    const amount = Math.floor(index / (sides + 1)) / segments;
    curve.getPointAt(amount, center);
    const radius = base + (tip - base) * amount;
    positions.setXYZ(
      index,
      center.x + (positions.getX(index) - center.x) * radius,
      center.y + (positions.getY(index) - center.y) * radius,
      center.z + (positions.getZ(index) - center.z) * radius,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

function postPaperTexture(post: WorldPost, tag: string, accent: string, number: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#EDF0E3';
    context.fillRect(0, 0, 384, 512);
    context.fillStyle = '#DFE4D6';
    for (let line = 0; line < 64; line++) context.fillRect(0, line * 8, 384, 0.5);
    context.fillStyle = accent;
    context.fillRect(0, 0, 384, 10);
    context.fillRect(28, 37, 8, 39);
    context.fillStyle = '#54604E';
    context.font = '600 16px sans-serif';
    context.fillText('FIELD NOTES', 49, 48);
    context.fillStyle = '#28302A';
    context.font = 'bold 26px sans-serif';
    context.fillText(`#${tag.slice(0, 21)}`, 49, 80, 303);
    context.fillStyle = '#BEC8B7';
    context.fillRect(28, 112, 328, 1);
    context.fillStyle = '#3A443B';
    context.font = '600 19px sans-serif';
    context.fillText(post.author.slice(0, 34), 28, 151, 328);
    context.font = '22px sans-serif';
    const words = post.text.slice(0, 260).trim().split(/\s+/).slice(0, 64);
    let line = '';
    let y = 198;
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > 318) {
        context.fillText(line, 28, y, 328);
        y += 32;
        line = word;
        if (y > 390) break;
      } else line = next;
    }
    if (y <= 390) context.fillText(line, 28, y, 328);
    context.fillStyle = '#6A7864';
    context.font = '600 14px sans-serif';
    context.fillText('PICK A LEAF · READ A POST', 28, 468, 285);
    context.textAlign = 'right';
    context.fillText(String(number + 1).padStart(2, '0'), 355, 468);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'Local post leaf excerpt';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A folded, clipped paper leaf carries only a locally drawn, bounded text excerpt. */
function createPostLeaf(parent: THREE.Group, post: WorldPost, tag: string, color: string, index: number) {
  const leaf = new THREE.Group();
  leaf.name = 'Folded post leaf';
  parent.add(leaf);
  const shape = new THREE.Shape();
  shape.moveTo(-0.61, -0.81);
  shape.lineTo(0.61, -0.81);
  shape.lineTo(0.61, 0.56);
  shape.lineTo(0.36, 0.81);
  shape.lineTo(-0.61, 0.81);
  shape.closePath();
  const detail = worldDetail(leaf, 'Paper and brass clip');
  detail.add(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false }), '#DFE4D7');
  const fold = new THREE.BufferGeometry();
  fold.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0.36, 0.81, 0.026, 0.36, 0.56, 0.05, 0.61, 0.56, 0.026], 3),
  );
  fold.computeVertexNormals();
  detail.add(fold, '#BEC8B5');
  detail.add(new THREE.TorusGeometry(0.082, 0.018, 6, 18), '#9A9475', 'metal', [0, 0.87, 0.005]);
  detail.add(new THREE.BoxGeometry(0.19, 0.1, 0.065), '#8D8260', 'metal', [0, 0.74, 0.015]);
  detail.add(new THREE.CylinderGeometry(0.009, 0.009, 0.36, 5), '#928A70', 'wood', [0, 1.11, 0]);
  detail.finish();
  const page = new THREE.PlaneGeometry(1.1, 1.38, 8, 8);
  const positions = page.getAttribute('position');
  for (let vertex = 0; vertex < positions.count; vertex++) {
    positions.setZ(vertex, 0.015 + Math.cos(positions.getX(vertex) * 2.8) * 0.012);
  }
  page.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    map: postPaperTexture(post, tag, color, index),
    color: '#FFFFFF',
    roughness: 0.98,
    metalness: 0,
    emissive: '#C5CFB7',
    emissiveIntensity: 0.07,
  });
  const front = mesh(leaf, page, material, [0, -0.04, 0.03]);
  front.castShadow = false;
  return leaf;
}

/** Sculpted trunks and layered foliage retain the tag tree's original walkable footprint. */
export function createTagTree(tree: THREE.Group, tag: WorldTag, color: string) {
  tree.name = 'Tag tree';
  const detail = worldDetail(tree, 'Trunk roots and canopy');
  detail.add(new THREE.CylinderGeometry(3.65, 4.05, 0.14, 48), '#344132', 'stone', [0, 0.12, 0]);
  detail.add(
    branch(
      [
        [0, 0, 0],
        [-0.17, 1.3, 0.08],
        [0.17, 2.9, -0.02],
        [0.07, 4.2, 0.12],
        [-0.28, 5.8, 0.15],
      ],
      0.72,
      0.12,
    ),
    '#615247',
    'wood',
  );
  for (let root = 0; root < 7; root++) {
    const angle = root * 2.39996;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    detail.add(
      branch(
        [
          [x * 0.25, 1.12, z * 0.25],
          [x * 0.7, 0.44, z * 0.7],
          [x * 1.4, 0.22, z * 1.4],
          [x * 2.05, 0.14, z * 2.05],
        ],
        0.28,
        0.035,
      ),
      root % 2 ? '#746052' : '#52483F',
      'wood',
    );
  }
  for (let limb = 0; limb < 6; limb++) {
    const angle = limb * 2.4;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    detail.add(
      branch(
        [
          [0, 2.65 + (limb % 2) * 0.4, 0],
          [x * 0.8, 3.85, z * 0.8],
          [x * 1.65, 4.75, z * 1.65],
          [x * 2.8, 5.6 + (limb % 2) * 0.7, z * 2.8],
        ],
        0.24,
        0.055,
      ),
      limb % 2 ? '#756152' : '#615247',
      'wood',
    );
  }
  // Narrow raised bark seams add structure without a per-tree texture or draw.
  for (let ridge = 0; ridge < 9; ridge++) {
    const angle = (ridge / 9) * Math.PI * 2;
    detail.add(
      branch(
        [
          [Math.cos(angle) * 0.68, 0.4, Math.sin(angle) * 0.68],
          [Math.cos(angle) * 0.47 - 0.1, 1.6, Math.sin(angle) * 0.47],
          [Math.cos(angle) * 0.31 + 0.12, 3.1, Math.sin(angle) * 0.31],
        ],
        0.022,
        0.015,
      ),
      '#493E35',
      'wood',
    );
  }
  const tint = new THREE.Color();
  const lobeCenters: { position: THREE.Vector3; size: number; squash: number }[] = [];
  for (let lobe = 0; lobe < 23; lobe++) {
    const angle = lobe * 2.39996;
    const ring = lobe < 8 ? 2.45 : lobe < 18 ? 1.6 : 0.7;
    const height = lobe < 8 ? 5.55 : lobe < 18 ? 6.75 : 7.65;
    const size = lobe < 8 ? 1.35 : 1.45;
    const squash = 0.68 + (lobe % 3) * 0.04;
    const geometry = new THREE.IcosahedronGeometry(size, 2).scale(1.08, squash, 1);
    lobeCenters.push({
      position: new THREE.Vector3(Math.cos(angle) * ring, height + Math.sin(lobe * 1.4) * 0.2, Math.sin(angle) * ring),
      size,
      squash,
    });
    tint.set(color).multiplyScalar(0.7 + (lobe % 6) * 0.075);
    detail.add(geometry, `#${tint.getHexString()}`, 'foliage', [
      Math.cos(angle) * ring,
      height + Math.sin(lobe * 1.4) * 0.2,
      Math.sin(angle) * ring,
    ]);
  }
  const normal = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const leafShape = pointedLeaf();
  for (let leaf = 0; leaf < 276; leaf++) {
    const lobe = lobeCenters[leaf % lobeCenters.length];
    const angle = leaf * 2.39996;
    const y = 0.2 + ((Math.sin(leaf * 8.17) + 1) / 2) * 0.78;
    const spread = Math.sqrt(1 - y * y);
    normal.set(Math.cos(angle) * spread, y, Math.sin(angle) * spread);
    orientation.setFromUnitVectors(up, normal);
    const geometry = leafShape.clone().rotateY(angle).applyQuaternion(orientation);
    tint.set(color).multiplyScalar(0.82 + (leaf % 5) * 0.09);
    detail.add(geometry, `#${tint.getHexString()}`, 'foliage', [
      lobe.position.x + normal.x * lobe.size * 1.095,
      lobe.position.y + normal.y * lobe.size * lobe.squash * 1.025,
      lobe.position.z + normal.z * lobe.size * 1.015,
    ]);
  }
  leafShape.dispose();
  detail.finish();

  return tag.posts.slice(0, 5).map((post, postIndex) => {
    const angle = (postIndex * Math.PI * 2) / Math.min(tag.posts.length, 5) + 0.4;
    const leaf = createPostLeaf(tree, post, tag.label, color, postIndex);
    leaf.position.set(Math.cos(angle) * 3.9, 3.6 + (postIndex % 2) * 1.5, Math.sin(angle) * 3.9);
    leaf.rotation.y = angle;
    leaf.rotation.z = (postIndex % 2 ? -1 : 1) * 0.12;
    return { object: leaf, post, postIndex };
  });
}
