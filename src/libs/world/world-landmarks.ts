import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { box, cylinder, label, material, mesh, ring, sphere } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import type { WorldInteraction } from '@/libs/world/world-types';

/** Original toy architecture. Only the fixed, bundled Bitkit asset is parsed as SVG. */
export function createLandmarks(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, label: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
): { animate: (time: number, delta: number) => void; dispose: () => void } {
  const abort = new AbortController();
  const cream = '#A9A9B2';
  const lilac = '#665080';
  const ink = '#101014';

  function group(x: number, z: number) {
    const object = new THREE.Group();
    object.position.set(x, 0, z);
    scene.add(object);
    return object;
  }

  function beam(parent: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, color: string, radius = 0.22) {
    const direction = to.clone().sub(from);
    const object = cylinder(parent, radius, radius, direction.length(), color);
    object.position.copy(from).add(to).multiplyScalar(0.5);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return object;
  }

  const university = group(...WORLD_ANCHORS.university);
  box(university, [13, 0.45, 10], '#303034', [0, 0.23, 0]);
  box(university, [12, 0.5, 9], cream, [0, 0.7, 0]);
  box(university, [10.4, 5.4, 6], '#454549', [0, 3.7, -1]);
  box(university, [2.4, 3.8, 0.16], '#17151D', [0, 2.9, 2.05]);
  for (const x of [-4.7, -2.9, 2.9, 4.7]) {
    cylinder(university, 0.42, 0.48, 5.2, cream, [x, 3.6, 3.1], 12);
    box(university, [1.15, 0.35, 1.15], '#6E667B', [x, 1.13, 3.1]);
    box(university, [1.15, 0.4, 1.15], cream, [x, 6.05, 3.1]);
  }
  box(university, [12.5, 0.55, 8.8], cream, [0, 6.4, 0]);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-6.5, 0);
  roofShape.lineTo(6.5, 0);
  roofShape.lineTo(0, 2.6);
  roofShape.closePath();
  mesh(university, new THREE.ExtrudeGeometry(roofShape, { depth: 8.6, bevelEnabled: false }), lilac, [0, 6.7, -4.3]);
  sphere(university, 0.62, '#C8FF03', [0, 7.7, 4.42]);
  const cap = new THREE.Group();
  university.add(cap);
  cap.position.y = 11.7;
  cylinder(cap, 1.15, 1.1, 0.7, '#303034');
  box(cap, [4.2, 0.25, 4.2], '#18171E', [0, 0.42, 0]).rotation.y = Math.PI / 4;
  beam(cap, new THREE.Vector3(0, 0.65, 0), new THREE.Vector3(2, 0.6, 1), '#C8FF03', 0.07);
  beam(cap, new THREE.Vector3(2, 0.6, 1), new THREE.Vector3(2, -0.6, 1), '#C8FF03', 0.07);
  sphere(cap, 0.2, '#C8FF03', [2, -0.65, 1]);
  label(university, 'Pubky University', [0, 15, 0], 12);
  label(university, 'KEEP YOUR KEYS. GET A DEGREE.', [0, 2.4, 5.7], 8.4, '#C8FF03');
  register(university, { kind: 'zone', id: 'university' }, 'Visit Pubky University');
  obstacle(university.position.x, university.position.z - 1.2, 4.7);

  const yard = group(...WORLD_ANCHORS.github);
  box(yard, [15, 0.25, 11], '#303034', [0, 0.12, 0]);
  const workshops = [
    { x: -5, z: -1, color: '#664C36', name: 'APP' },
    { x: 0, z: -3, color: '#4F4264', name: 'NEXUS' },
    { x: 5, z: -1, color: '#31564F', name: 'HOMESERVER' },
  ];
  for (const workshop of workshops) {
    box(yard, [3.6, 3.3, 3.3], workshop.color, [workshop.x, 1.85, workshop.z]);
    box(yard, [3.9, 0.35, 3.6], cream, [workshop.x, 3.65, workshop.z]);
    for (let i = 0; i < 3; i++) {
      box(yard, [2.5, 0.56, 0.12], ink, [workshop.x, 1 + i * 0.85, workshop.z + 1.7]);
      sphere(yard, 0.11, '#C8FF03', [workshop.x + 0.88, 1 + i * 0.85, workshop.z + 1.82]);
    }
    label(yard, workshop.name, [workshop.x, 4.4, workshop.z], 4.5);
    obstacle(yard.position.x + workshop.x, yard.position.z + workshop.z, 2.2);
  }
  const branch = new THREE.Group();
  branch.position.set(1.2, 0, 3.7);
  yard.add(branch);
  beam(branch, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 7.4, 0), '#89898F', 0.3);
  beam(branch, new THREE.Vector3(0, 3.3, 0), new THREE.Vector3(3, 5.1, 0), '#89898F', 0.3);
  beam(branch, new THREE.Vector3(3, 5.1, 0), new THREE.Vector3(3, 7.4, 0), '#89898F', 0.3);
  for (const [x, y, color] of [
    [0, 1, '#C8FF03'],
    [0, 4.3, '#9A7DCD'],
    [0, 7.4, '#67B79A'],
    [3, 7.4, '#C8FF03'],
  ] as const) {
    sphere(branch, 0.69, color, [x, y, 0]);
  }
  const forklift = new THREE.Group();
  forklift.position.set(-4.3, 0, 3.8);
  yard.add(forklift);
  box(forklift, [2, 1.3, 2.6], '#C8FF03', [0, 1.15, 0]);
  box(forklift, [1.5, 1.25, 1.2], '#3C4449', [0, 2.3, -0.4]);
  box(forklift, [1.8, 0.2, 1.5], cream, [0, 3, -0.4]);
  for (const x of [-1, 1])
    for (const z of [-0.8, 0.8]) {
      cylinder(forklift, 0.46, 0.46, 0.35, ink, [x, 0.55, z], 12).rotation.z = Math.PI / 2;
    }
  for (const x of [-0.6, 0.6]) {
    box(forklift, [0.18, 3, 0.2], ink, [x, 1.9, 1.4]);
    box(forklift, [0.18, 0.16, 1.8], ink, [x, 0.5, 2.2]);
  }
  label(yard, 'Open Source Yard', [0, 10.1, 0], 12);
  register(yard, { kind: 'zone', id: 'github' }, 'Explore the GitHub workshops');

  const bitkit = group(...WORLD_ANCHORS.bitkit);
  cylinder(bitkit, 6.2, 6.5, 0.45, '#303034', [0, 0.22, 0]);
  cylinder(bitkit, 5, 5.8, 1.1, '#BD481F', [0, 1, 0]);
  cylinder(bitkit, 3.8, 4.8, 0.7, '#F0662F', [0, 1.9, 0]);
  for (const x of [-4.3, 4.3]) box(bitkit, [0.32, 4.8, 0.32], '#fc6b30', [x, 4.2, -0.2]);
  const logo = new THREE.Group();
  logo.position.set(0, 7.3, 0);
  logo.rotation.y = -0.16;
  bitkit.add(logo);
  const fallback = label(logo, 'BITKIT', [0, 0, 0], 13, '#ffffff', '#ff4400');
  void fetch('/world/bitkit-logo.svg', { signal: abort.signal, credentials: 'omit' })
    .then((response) => (response.ok ? response.text() : null))
    .then((source) => {
      if (!source || abort.signal.aborted) return;
      const parsed = new SVGLoader().parse(source);
      const extrusion = new THREE.Group();
      for (const [index, path] of parsed.paths.entries()) {
        const shapes = SVGLoader.createShapes(path);
        const geometry = new THREE.ExtrudeGeometry(shapes, { depth: 4, bevelEnabled: false, curveSegments: 8 });
        const surface = material(`#${path.color.getHexString()}`);
        surface.side = THREE.DoubleSide;
        mesh(extrusion, geometry, surface, [0, 0, index * 1.5]);
      }
      extrusion.scale.set(0.086, -0.086, 0.086);
      extrusion.position.set(-7.03, 2.06, 0);
      logo.add(extrusion);
      fallback.visible = false;
    })
    .catch(() => {
      /* A readable local fallback remains if the bundled asset cannot load. */
    });
  label(bitkit, 'Bitkit Beacon', [0, 11.6, 0], 10);
  register(bitkit, { kind: 'zone', id: 'bitkit' }, 'Visit the Bitkit Beacon');
  obstacle(bitkit.position.x, bitkit.position.z, 3.8);

  const pond = group(...WORLD_ANCHORS.duck);
  cylinder(pond, 5.3, 5.7, 0.18, '#454549', [0, 0.08, 0], 36).scale.z = 0.8;
  cylinder(pond, 4.9, 4.9, 0.2, '#164D57', [0, 0.16, 0], 36).scale.z = 0.8;
  const duck = new THREE.Group();
  duck.position.y = 1.1;
  pond.add(duck);
  sphere(duck, 2, '#EEC432').scale.set(1.2, 0.8, 1);
  sphere(duck, 1.3, '#FFDB50', [0, 1.8, 0.9]);
  const beak = sphere(duck, 0.75, '#f7964e', [0, 1.65, 2]);
  beak.scale.set(1, 0.4, 1.1);
  for (const x of [-0.7, 0.7]) sphere(duck, 0.13, '#15151B', [x, 2.05, 1.87]);
  for (const x of [-1.5, 1.5]) sphere(duck, 0.85, '#f5c34f', [x, 0.45, 0]).scale.set(0.4, 0.5, 1.4);
  label(pond, 'Department of Quack', [0, 6.4, 0], 10.5);
  register(pond, { kind: 'fun', id: 'duck' }, 'Consult the giant duck');

  const trampoline = group(...WORLD_ANCHORS.trampoline);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    cylinder(trampoline, 0.15, 0.15, 0.8, '#71717A', [Math.sin(angle) * 2.5, 0.4, Math.cos(angle) * 2.5]);
  }
  cylinder(trampoline, 3, 3, 0.23, '#17171E', [0, 0.8, 0], 32);
  ring(trampoline, 3, 0.25, '#C8FF03', [0, 0.86, 0]);
  ring(trampoline, 1.4, 0.06, '#8DA850', [0, 0.93, 0]);
  label(trampoline, 'Proof of Bounce', [0, 4, 0], 9);
  register(trampoline, { kind: 'fun', id: 'trampoline' }, 'Bounce on the trampoline');

  const portal = group(...WORLD_ANCHORS.portal);
  cylinder(portal, 4.3, 4.8, 0.4, '#303034', [0, 0.2, 0]);
  const portalRing = mesh(portal, new THREE.TorusGeometry(3.1, 0.48, 8, 40), material('#C8FF03', true), [0, 4, 0]);
  const veil = mesh(
    portal,
    new THREE.CircleGeometry(2.8, 32),
    new THREE.MeshBasicMaterial({
      color: '#88CA32',
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    [0, 4, 0],
  );
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const rune = box(portal, [0.35, 0.35, 0.4], '#EEEEF6', [Math.sin(angle) * 3.15, 4 + Math.cos(angle) * 3.15, 0.46]);
    rune.rotation.z = angle + Math.PI / 4;
  }
  label(portal, 'Probably a Portal', [0, 9, 0], 10);
  register(portal, { kind: 'fun', id: 'portal' }, 'Investigate the mysterious portal');

  return {
    animate(time, delta) {
      cap.position.y = 11.7 + Math.sin(time * 1.1) * 0.25;
      cap.rotation.y += delta * 0.18;
      duck.position.y = 1.1 + Math.sin(time * 1.4) * 0.13;
      duck.rotation.y = Math.sin(time * 0.35) * 0.15;
      logo.position.y = 7.3 + Math.sin(time * 0.8) * 0.16;
      portalRing.rotation.z += delta * 0.08;
      veil.scale.setScalar(1 + Math.sin(time * 1.8) * 0.045);
    },
    dispose() {
      abort.abort();
    },
  };
}
