import * as THREE from 'three';
import { label, mesh, WORLD_PALETTE } from '@/libs/world/world-geometry';
import { createLandmarkBuilder } from '@/libs/world/world-landmark-details';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import type { WorldInteraction } from '@/libs/world/world-types';

/**
 * An original sculptural homage to Valentina Picozzi / Satoshigallery's Lugano
 * monument: a faceless coder made from spaced vertical steel contour sheets.
 * No photographed artwork or third-party model is bundled.
 */
export function createSatoshi(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
) {
  const monument = new THREE.Group();
  monument.name = 'Satoshi monument';
  monument.position.set(WORLD_ANCHORS.satoshi[0], 0, WORLD_ANCHORS.satoshi[1]);
  scene.add(monument);
  const detail = createLandmarkBuilder();
  const { box, cylinder } = detail;
  box(monument, [6.5, 0.25, 5.8], 'stone', '#454950', [0, 0.12, 0], 0.045);
  box(monument, [5.95, 0.085, 5.15], 'metal', '#777F87', [0, 0.287, 0], 0.022);
  box(monument, [5.6, 1.2, 4.8], 'stone', '#242B31', [0, 0.82, 0], 0.06);
  box(monument, [5.75, 0.12, 4.95], 'metal', '#909BA1', [0, 1.48, 0], 0.027);
  box(monument, [5.43, 0.045, 4.64], 'metal', '#535F67', [0, 1.566, 0], 0.016);
  box(monument, [5.4, 0.055, 0.12], 'light:#C8FF03', WORLD_PALETTE.lime, [0, 0.3, 2.44]);
  for (const x of [-2.5, 2.5]) {
    for (const z of [-2.14, 2.14]) cylinder(monument, 0.072, 0.072, 0.025, 'metal', '#CAD1CF', [x, 1.596, z], 6);
  }
  for (const side of [-1, 1]) {
    for (const z of [-1.57, 0, 1.57]) box(monument, [0.018, 1.03, 0.028], 'stone', '#3E484F', [side * 2.805, 0.83, z]);
    box(monument, [0.055, 0.45, 3.86], 'stone', '#303A41', [side * 2.812, 0.82, 0], 0.018);
  }
  box(monument, [4.98, 1.015, 0.12], 'metal', '#616B6E', [0, 0.87, 2.434], 0.04);
  for (const x of [-2.31, 2.31]) {
    for (const y of [0.52, 1.22])
      cylinder(monument, 0.04, 0.04, 0.03, 'metal', '#ACB9B4', [x, y, 2.508], 6, [Math.PI / 2, 0, 0]);
  }

  const figure = new THREE.Group();
  figure.name = 'satoshi-steel-contours';
  figure.position.y = 1.58;
  figure.rotation.y = -0.52;
  monument.add(figure);
  const steels = ['#BDC6CC', '#929EA7', '#D7DEDF'];

  function sheet(points: [number, number][], x: number, index: number) {
    const shape = new THREE.Shape();
    points.forEach(([z, y], point) => (point ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.04,
      bevelEnabled: true,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      bevelSegments: 1,
      curveSegments: 1,
    });
    geometry.rotateY(Math.PI / 2);
    // Bevel plus core retain the original 0.052 sheet thickness and 0.175 pitch.
    geometry.translate(x - 0.02, 0, 0);
    detail.add(figure, geometry, 'metal', steels[index % steels.length]);
  }

  function ellipseSlice(x: number, center: [number, number, number], radius: [number, number, number], index: number) {
    const across = (x - center[0]) / radius[0];
    if (Math.abs(across) >= 1) return;
    const size = Math.sqrt(1 - across * across);
    const points: [number, number][] = [];
    for (let i = 0; i < 28; i++) {
      const angle = (i * Math.PI * 2) / 28;
      points.push([center[2] + Math.cos(angle) * radius[2] * size, center[1] + Math.sin(angle) * radius[1] * size]);
    }
    sheet(points, x, index);
  }

  for (let index = 0; index < 29; index++) {
    const x = (index - 14) * 0.175;
    // Crossed legs, shoes, and a slightly hunched sweatshirt all share slice planes.
    ellipseSlice(x, [-0.72, 0.65, 0.5], [1.73, 0.62, 0.75], index);
    ellipseSlice(x, [0.65, 0.46, 0.92], [1.75, 0.44, 0.66], index);
    ellipseSlice(x, [-1.3, 0.2, 1.18], [0.66, 0.21, 0.62], index);
    ellipseSlice(x, [1.3, 0.22, 0.93], [0.66, 0.23, 0.62], index);
    ellipseSlice(x, [0, 2.08, -0.19], [1.33, 1.37, 0.8], index);
    ellipseSlice(x, [-1.24, 2.07, 0.25], [0.38, 1.01, 0.48], index);
    ellipseSlice(x, [1.24, 2.07, 0.25], [0.38, 1.01, 0.48], index);
    // Open hood profile: the empty face remains a void, with no invented likeness.
    if (Math.abs(x) < 0.91) {
      const size = Math.sqrt(1 - (x / 0.94) ** 2);
      const hood: [number, number][] = [
        [-0.66, 3.05],
        [-0.88, 3.75],
        [-0.68, 4.42],
        [-0.12, 4.84],
        [0.5, 4.63],
        [0.84, 4.2],
        [0.55, 3.96],
        [0.32, 4.31],
        [-0.12, 4.36],
        [-0.38, 3.98],
        [-0.29, 3.48],
        [0.18, 3.17],
      ];
      sheet(
        hood.map(([z, y]) => [z * size, 3.82 + (y - 3.82) * size]),
        x,
        index,
      );
    }
    if (Math.abs(x) < 1.42) {
      // The laptop is sliced too, so the disappearing-angle effect includes it.
      sheet(
        [
          [1.14, 1.64],
          [1.4, 2.89],
          [1.29, 2.9],
          [1.03, 1.73],
          [0.64, 1.66],
        ],
        x,
        index,
      );
    }
  }

  // Vertex colors keep the three steel tones in one draw without closing gaps.
  detail.flush();
  const lettering = label(monument, 'WE ARE ALL SATOSHI', [0, 0.87, 2.52], 4.6, WORLD_PALETTE.lime);
  const plaque = mesh(
    monument,
    new THREE.PlaneGeometry(4.6, 0.92),
    new THREE.MeshBasicMaterial({ map: lettering.material.map }),
    [0, 0.87, 2.509],
  );
  plaque.name = 'Satoshi dedication plaque';
  plaque.castShadow = false;
  lettering.removeFromParent();
  lettering.material.dispose();
  register(monument, { kind: 'fun', id: 'satoshi' }, 'Read the Satoshi monument plaque');
  obstacle(monument.position.x, monument.position.z, 3.05);
}
