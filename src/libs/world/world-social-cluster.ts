import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createWorldMaskGeometry,
  createWorldPortraitBackGeometry,
  WORLD_MASK_COLORS,
} from '@/libs/world/world-avatar-head';
import { mesh } from '@/libs/world/world-geometry';
import { createLandmarkBuilder } from '@/libs/world/world-landmark-details';

/** Fixed community figures with independent anonymous masks and optional approved portrait backs. */
export function createSocialClusterSculpture(group: THREE.Group): {
  base: THREE.Mesh;
  prominent: THREE.Group;
  satellites: THREE.Group;
} {
  const detail = createLandmarkBuilder();
  const { add, box, oval, cylinder, torus, beam } = detail;
  const baseGroup = new THREE.Group();
  group.add(baseGroup);
  cylinder(baseGroup, 3, 3.5, 0.25, 'paint', '#343C44', [0, 0, 0], 80);
  cylinder(baseGroup, 2.97, 3.04, 0.095, 'paint', '#616E73', [0, 0.16, 0], 80);
  cylinder(baseGroup, 2.83, 2.94, 0.055, 'paint', '#27353A', [0, 0.233, 0], 80);
  torus(baseGroup, 2.96, 0.028, 'paint', '#A4C86A', [0, 0.215, 0]);
  cylinder(baseGroup, 1.08, 1.29, 0.24, 'paint', '#465651', [0, 0.335, 0], 48);
  torus(baseGroup, 1.15, 0.035, 'paint', '#A9C785', [0, 0.38, 0]);
  for (let marker = 0; marker < 12; marker++) {
    const angle = (marker * Math.PI) / 6;
    box(
      baseGroup,
      [0.045, 0.018, 0.15],
      'paint',
      '#B4C595',
      [Math.sin(angle) * 2.69, 0.274, Math.cos(angle) * 2.69],
      0,
      [0, angle, 0],
    );
  }

  const prominent = new THREE.Group();
  prominent.name = 'community-central-bust';
  group.add(prominent);
  add(
    prominent,
    new THREE.LatheGeometry(
      [
        [0, 0.43],
        [0.68, 0.43],
        [0.79, 0.54],
        [0.86, 0.93],
        [0.9, 1.65],
        [1.01, 2.21],
        [0.99, 2.38],
        [0.8, 2.62],
        [0.45, 2.72],
        [0, 2.72],
      ].map(([radius, y]) => new THREE.Vector2(radius, y)),
      32,
    ).scale(1, 1, 0.68),
    'paint',
    '#596949',
  );
  oval(prominent, [0.66, 0.36, 0.3], 'paint', '#35473C', [0, 2.66, -0.23]);
  for (const side of [-1, 1]) {
    add(prominent, new THREE.CapsuleGeometry(0.285, 0.77, 5, 20).rotateZ(side * 0.15), 'paint', '#667F46', [
      side * 0.84,
      1.94,
      0.025,
    ]);
    box(prominent, [0.082, 0.49, 0.043], 'paint', '#BBDD55', [side * 1.083, 2.1, 0.08], 0.024, [0, 0, side * 0.13]);
  }
  box(prominent, [1.01, 1.18, 0.14], 'paint', '#B6D955', [0, 1.99, 0.646], 0.115);
  beam(prominent, [0, 1.44, 0.733], [0, 2.58, 0.706], 0.018, 'paint', '#455337');
  for (const side of [-1, 1]) {
    beam(prominent, [side * 0.21, 2.65, 0.41], [side * 0.23, 2.08, 0.74], 0.018, 'paint', '#DBE1BD');
    cylinder(prominent, 0.025, 0.025, 0.092, 'paint', '#98AF6F', [side * 0.23, 2.05, 0.745], 12);
    beam(prominent, [side * 0.12, 1.54, 0.731], [side * 0.36, 1.66, 0.731], 0.014, 'paint', '#6F8D44');
  }
  cylinder(prominent, 0.225, 0.265, 0.41, 'paint', '#D7B79B', [0, 2.8, 0.06], 32);
  add(
    prominent,
    new THREE.TorusGeometry(0.33, 0.085, 8, 36).rotateX(Math.PI / 2).scale(1, 1, 0.75),
    'paint',
    '#34463B',
    [0, 2.684, 0.015],
  );
  const centralHead = new THREE.Group();
  centralHead.name = 'community-central-head';
  centralHead.position.set(0, 3.37, 0.09);
  centralHead.scale.setScalar(1.65);
  prominent.add(centralHead);
  const anonymous = new THREE.Group();
  anonymous.name = 'community-anonymous-mask';
  centralHead.add(anonymous);
  const portraitBack = new THREE.Group();
  portraitBack.name = 'community-profile-back';
  portraitBack.visible = false;
  centralHead.add(portraitBack);
  add(portraitBack, createWorldPortraitBackGeometry(), 'paint', '#242E34');
  const mask = createWorldMaskGeometry();
  for (const [name, geometry] of Object.entries(mask)) {
    add(anonymous, geometry, 'paint', WORLD_MASK_COLORS[name as keyof typeof WORLD_MASK_COLORS]);
  }
  detail.flush();

  const base = baseGroup.children[0] as THREE.Mesh;
  base.name = 'community-sculpture-plinth';
  group.add(base);
  baseGroup.removeFromParent();
  const satellites = new THREE.Group();
  satellites.name = 'community-satellite-busts';
  group.add(satellites);
  const central = prominent.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
  central.name = 'community-central-body';
  const parts: THREE.BufferGeometry[] = [];
  const transform = new THREE.Object3D();
  const satelliteHead = centralHead.clone(true);
  satelliteHead.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = object.geometry.clone();
    const colors = object.geometry.getAttribute('color');
    for (let vertex = 0; vertex < colors.count; vertex++)
      colors.setXYZ(vertex, colors.getX(vertex) * 0.88, colors.getY(vertex) * 0.88, colors.getZ(vertex) * 0.88);
  });
  for (let satellite = 0; satellite < 3; satellite++) {
    const angle = (satellite * Math.PI * 2) / 3;
    transform.position.set(Math.sin(angle) * 2.15, 0.1, Math.cos(angle) * 2.15);
    transform.rotation.y = angle;
    transform.scale.setScalar(0.38);
    transform.updateMatrix();
    const geometry = central.geometry.clone().applyMatrix4(transform.matrix);
    const colors = geometry.getAttribute('color');
    const muted = new THREE.Color('#8D9DA9');
    const color = new THREE.Color();
    for (let vertex = 0; vertex < colors.count; vertex++) {
      color.fromBufferAttribute(colors, vertex);
      color.lerp(muted, 0.55);
      colors.setXYZ(vertex, color.r, color.g, color.b);
    }
    parts.push(geometry);
    const head = satelliteHead.clone(true);
    head.name = `community-satellite-head-${satellite}`;
    head.applyMatrix4(transform.matrix);
    satellites.add(head);
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  mesh(satellites, geometry, central.material).name = 'community-satellite-sculptures';
  return { base, prominent, satellites };
}
