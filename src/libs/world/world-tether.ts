import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { box, cylinder, label, mesh, ring } from '@/libs/world/world-geometry';
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
  cylinder(monument, 9, 10, 0.25, '#24473C', [0, 0.13, 0], 48);
  box(monument, [16.5, 0.5, 5.5], '#333E3D', [0, 0.5, 0]);
  box(monument, [15.7, 1.7, 4.6], '#1F2B29', [0, 1.6, 0]);
  box(monument, [16, 0.2, 4.9], '#849A91', [0, 2.55, 0]);
  for (const x of [-5.3, 5.3]) box(monument, [0.45, 3.5, 0.6], '#536E62', [x, 4.3, 0]);
  ring(monument, 7, 0.06, '#3BA48A', [0, 0.3, 0]);
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
        const shapes = SVGLoader.createShapes(path);
        const geometry = new THREE.ExtrudeGeometry(shapes, {
          depth: 2.4,
          bevelEnabled: true,
          bevelSegments: 1,
          steps: 1,
          bevelSize: 0.08,
          bevelThickness: 0.08,
          curveSegments: 8,
        });
        mesh(
          lettering,
          geometry,
          new THREE.MeshStandardMaterial({
            color: '#AEC3B8',
            metalness: 0.82,
            roughness: 0.27,
            emissive: '#245E4A',
            emissiveIntensity: 0.2,
          }),
        );
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
