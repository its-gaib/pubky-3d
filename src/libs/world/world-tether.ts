import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { label, mesh } from '@/libs/world/world-geometry';
import { createLandmarkBuilder } from '@/libs/world/world-landmark-details';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import type { WorldInteraction } from '@/libs/world/world-types';

/** The actual Tether company wordmark already bundled by Pubky, extruded as a sculpture. */
export function createTether(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, title: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
) {
  const monument = new THREE.Group();
  monument.name = 'tether-monument';
  monument.position.set(WORLD_ANCHORS.tether[0], 0, WORLD_ANCHORS.tether[1]);
  scene.add(monument);
  const detail = createLandmarkBuilder();
  const { box, cylinder, torus, beam } = detail;
  cylinder(monument, 9, 10, 0.25, 'stone', '#24473C', [0, 0.13, 0], 96);
  box(monument, [16.5, 0.5, 5.5], 'stone', '#414C4B', [0, 0.5, 0], 0.08);
  box(monument, [16.12, 0.12, 5.11], 'metal', '#738F82', [0, 0.8, 0], 0.03);
  box(monument, [15.7, 1.7, 4.6], 'stone', '#1F2B29', [0, 1.6, 0], 0.055);
  box(monument, [16, 0.2, 4.9], 'metal', '#9BADA4', [0, 2.55, 0], 0.04);
  box(monument, [15.5, 0.055, 4.4], 'metal', '#485D54', [0, 2.68, 0], 0.018);
  torus(monument, 7, 0.044, 'light:#3BA48A', '#4FAF93', [0, 0.3, 0]);
  for (const side of [-1, 1]) {
    for (const x of [-6.3, -3.15, 0, 3.15, 6.3]) {
      box(monument, [0.035, 1.49, 0.022], 'metal', '#466256', [x, 1.61, side * 2.304]);
      box(monument, [2.54, 0.55, 0.035], 'stone', '#293C33', [x, 1.58, side * 2.318], 0.025);
      cylinder(monument, 0.035, 0.035, 0.018, 'metal', '#8FABA0', [x, 1.61, side * 2.35], 6, [Math.PI / 2, 0, 0]);
    }
    box(monument, [14.82, 0.04, 0.03], 'light:#3BA48A', '#589F84', [0, 2.36, side * 2.319]);
  }
  for (const x of [-5.3, 5.3]) {
    box(monument, [0.84, 0.14, 1.03], 'metal', '#728D7E', [x, 2.77, 0], 0.035);
    box(monument, [0.24, 3.33, 0.46], 'metal', '#5C756B', [x, 4.35, -0.13], 0.035);
    for (const z of [-0.4, 0.14]) box(monument, [0.45, 3.4, 0.1], 'metal', '#879F94', [x, 4.35, z], 0.025);
    for (const side of [-1, 1]) {
      cylinder(monument, 0.065, 0.065, 0.044, 'metal', '#CCD8CA', [x + side * 0.3, 2.863, 0], 6);
      beam(monument, [x, 3.58, -0.16], [x + side * 1.02, 5.27, -0.16], 0.063, 'metal', '#5E8775');
    }
    box(monument, [0.83, 0.18, 0.56], 'metal', '#7F9A8D', [x, 5.98, -0.12], 0.035);
  }
  box(monument, [12.35, 0.18, 0.36], 'metal', '#527567', [0, 5.22, -0.12], 0.03);
  for (let stud = 0; stud < 24; stud++) {
    const angle = (stud * Math.PI) / 12;
    cylinder(
      monument,
      0.065,
      0.065,
      0.025,
      'metal',
      '#5E907A',
      [Math.sin(angle) * 8.74, 0.267, Math.cos(angle) * 8.74],
      6,
    );
  }
  detail.flush();
  const fallback = label(monument, 'tether', [0, 6.8, 0], 13, '#BBDCD0', '#1D3B31');
  register(monument, { kind: 'fun', id: 'tether' }, 'Read about Tether Ventures');
  obstacle(monument.position.x, monument.position.z, 5.2);
  const abort = new AbortController();
  void fetch('/images/tether-text.svg', { signal: abort.signal, credentials: 'omit' })
    .then((response) => (response.ok ? response.text() : null))
    .then((source) => {
      if (!source || abort.signal.aborted) return;
      const lettering = new THREE.Group();
      lettering.name = 'official-tether-extrusion';
      for (const path of new SVGLoader().parse(source).paths) {
        const shapes = path.toShapes();
        const geometry = new THREE.ExtrudeGeometry(shapes, {
          depth: 2.4,
          bevelEnabled: true,
          bevelSegments: 3,
          steps: 1,
          bevelSize: 0.07,
          bevelThickness: 0.1,
          curveSegments: 18,
        });
        const positions = geometry.getAttribute('position');
        const normals = geometry.getAttribute('normal');
        for (const cap of geometry.groups.filter((part) => part.materialIndex === 0)) {
          for (let vertex = cap.start; vertex < cap.start + cap.count; vertex++)
            normals.setXYZ(vertex, 0, 0, positions.getZ(vertex) < 1.2 ? -1 : 1);
        }
        const object = mesh(
          lettering,
          geometry,
          new THREE.MeshStandardMaterial({
            color: '#C0D0C6',
            metalness: 0.82,
            roughness: 0.24,
            emissive: '#245E4A',
            emissiveIntensity: 0.2,
          }),
        );
        object.receiveShadow = false;
      }
      lettering.scale.set(0.36, -0.36, 0.36);
      lettering.position.set(-7.2, 8.35, 0);
      monument.add(lettering);
      fallback.visible = false;
    })
    .catch(() => {
      /* A local wordmark fallback keeps the monument readable. */
    });
  return { dispose: () => abort.abort() };
}
