import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { box, cylinder, label, material, mesh, ring, sphere } from '@/libs/world/world-geometry';
import type { WorldInteraction } from '@/libs/world/world-types';

/** Original toy architecture. Only the fixed, bundled Bitkit asset is parsed as SVG. */
export function createLandmarks(
  scene: THREE.Scene,
  register: (object: THREE.Object3D, interaction: WorldInteraction, label: string) => void,
  obstacle: (x: number, z: number, radius: number) => void,
): { animate: (time: number, delta: number) => void; dispose: () => void } {
  const abort = new AbortController();
  const cream = '#fff2d7';
  const lilac = '#b596e0';
  const ink = '#34495e';

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

  const university = group(-24, -27);
  box(university, [13, 0.45, 10], '#e5d8c3', [0, 0.23, 0]);
  box(university, [12, 0.5, 9], cream, [0, 0.7, 0]);
  box(university, [10.4, 5.4, 6], '#e9dfcb', [0, 3.7, -1]);
  box(university, [2.4, 3.8, 0.16], '#736691', [0, 2.9, 2.05]);
  for (const x of [-4.7, -2.9, 2.9, 4.7]) {
    cylinder(university, 0.42, 0.48, 5.2, cream, [x, 3.6, 3.1], 12);
    box(university, [1.15, 0.35, 1.15], '#d8c5e9', [x, 1.13, 3.1]);
    box(university, [1.15, 0.4, 1.15], cream, [x, 6.05, 3.1]);
  }
  box(university, [12.5, 0.55, 8.8], cream, [0, 6.4, 0]);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-6.5, 0);
  roofShape.lineTo(6.5, 0);
  roofShape.lineTo(0, 2.6);
  roofShape.closePath();
  mesh(university, new THREE.ExtrudeGeometry(roofShape, { depth: 8.6, bevelEnabled: false }), lilac, [0, 6.7, -4.3]);
  sphere(university, 0.62, '#ffdb83', [0, 7.7, 4.42]);
  const cap = new THREE.Group();
  university.add(cap);
  cap.position.y = 11.7;
  cylinder(cap, 1.15, 1.1, 0.7, '#5a4878');
  box(cap, [4.2, 0.25, 4.2], '#54426f', [0, 0.42, 0]).rotation.y = Math.PI / 4;
  beam(cap, new THREE.Vector3(0, 0.65, 0), new THREE.Vector3(2, 0.6, 1), '#ffcc64', 0.07);
  beam(cap, new THREE.Vector3(2, 0.6, 1), new THREE.Vector3(2, -0.6, 1), '#ffcc64', 0.07);
  sphere(cap, 0.2, '#ffcc64', [2, -0.65, 1]);
  label(university, 'Pubky University', [0, 15, 0], 12);
  label(university, 'KEEP YOUR KEYS. GET A DEGREE.', [0, 2.4, 5.7], 8.4, '#5d487a');
  register(university, { kind: 'zone', id: 'university' }, 'Visit Pubky University');
  obstacle(-24, -28.2, 4.7);

  const arena = group(31, 13);
  cylinder(arena, 10, 10.2, 0.22, '#f6d9b5', [0, 0.12, 0], 48);
  ring(arena, 4.9, 0.08, '#fff4df', [0, 0.26, 0]);
  // A horseshoe keeps the front entrance open and the arena floor walkable.
  for (let tier = 0; tier < 3; tier++) {
    const outer = 7.8 + tier * 0.85;
    const inner = outer - 0.85;
    const shape = new THREE.Shape();
    for (let i = 0; i <= 40; i++) {
      const angle = 0.55 + (i / 40) * (Math.PI * 2 - 1.1);
      const point = [Math.sin(angle) * outer, -Math.cos(angle) * outer];
      if (i === 0) shape.moveTo(point[0], point[1]);
      else shape.lineTo(point[0], point[1]);
    }
    for (let i = 40; i >= 0; i--) {
      const angle = 0.55 + (i / 40) * (Math.PI * 2 - 1.1);
      shape.lineTo(Math.sin(angle) * inner, -Math.cos(angle) * inner);
    }
    shape.closePath();
    const stand = mesh(
      arena,
      new THREE.ExtrudeGeometry(shape, { depth: 0.9 + tier * 0.65, bevelEnabled: false }),
      ['#eaa98e', '#f1baa1', '#f6cbb3'][tier],
      [0, 0.2, 0],
    );
    stand.rotation.x = -Math.PI / 2;
  }
  for (let i = 0; i < 12; i++) {
    const angle = 0.8 + (i / 11) * (Math.PI * 2 - 1.6);
    const x = Math.sin(angle) * 9;
    const z = Math.cos(angle) * 9;
    box(arena, [0.7, 3.5, 0.9], cream, [x, 3.6, z]).rotation.y = angle;
    box(arena, [1.9, 0.45, 1.1], '#de957d', [x, 5.15, z]).rotation.y = angle;
    obstacle(31 + x, 13 + z, 0.65);
  }
  for (const x of [-5.8, 5.8]) {
    cylinder(arena, 0.09, 0.09, 5.6, '#845e65', [x, 2.8, 6]);
    box(arena, [1.65, 1.05, 0.08], '#e98383', [x + 0.72, 5.1, 6]);
  }
  cylinder(arena, 1.3, 1.5, 0.5, '#eab37e', [0, 0.4, -2]);
  cylinder(arena, 0.12, 0.35, 1.1, '#d8a144', [0, 1.15, -2]);
  cylinder(arena, 0.72, 0.22, 0.8, '#ffda74', [0, 1.95, -2], 12);
  label(arena, 'The Arena', [0, 7.5, -1], 10.5);
  label(arena, 'BIG STADIUM. TINY VICTORIES.', [0, 0.8, 6], 7.5, '#915b4f');
  register(arena, { kind: 'zone', id: 'arena' }, 'Enter the Arena');

  const yard = group(-30, 4);
  box(yard, [15, 0.25, 11], '#b7cfbf', [0, 0.12, 0]);
  const workshops = [
    { x: -5, z: -1, color: '#f2bc83', name: 'APP' },
    { x: 0, z: -3, color: '#ae9bd0', name: 'NEXUS' },
    { x: 5, z: -1, color: '#75bdb1', name: 'HOMESERVER' },
  ];
  for (const workshop of workshops) {
    box(yard, [3.6, 3.3, 3.3], workshop.color, [workshop.x, 1.85, workshop.z]);
    box(yard, [3.9, 0.35, 3.6], cream, [workshop.x, 3.65, workshop.z]);
    for (let i = 0; i < 3; i++) {
      box(yard, [2.5, 0.56, 0.12], ink, [workshop.x, 1 + i * 0.85, workshop.z + 1.7]);
      sphere(yard, 0.11, '#c8ec9f', [workshop.x + 0.88, 1 + i * 0.85, workshop.z + 1.82]);
    }
    label(yard, workshop.name, [workshop.x, 4.4, workshop.z], 4.5);
    obstacle(-30 + workshop.x, 4 + workshop.z, 2.2);
  }
  const branch = new THREE.Group();
  branch.position.set(1.2, 0, 3.7);
  yard.add(branch);
  beam(branch, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 7.4, 0), '#6c8f81', 0.3);
  beam(branch, new THREE.Vector3(0, 3.3, 0), new THREE.Vector3(3, 5.1, 0), '#6c8f81', 0.3);
  beam(branch, new THREE.Vector3(3, 5.1, 0), new THREE.Vector3(3, 7.4, 0), '#6c8f81', 0.3);
  for (const [x, y, color] of [
    [0, 1, '#ffbd7c'],
    [0, 4.3, '#bba2e7'],
    [0, 7.4, '#94d6ce'],
    [3, 7.4, '#ffbd7c'],
  ] as const) {
    sphere(branch, 0.69, color, [x, y, 0]);
  }
  const forklift = new THREE.Group();
  forklift.position.set(-4.3, 0, 3.8);
  yard.add(forklift);
  box(forklift, [2, 1.3, 2.6], '#f6cb65', [0, 1.15, 0]);
  box(forklift, [1.5, 1.25, 1.2], '#749991', [0, 2.3, -0.4]);
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

  const bitkit = group(-20, 31);
  cylinder(bitkit, 6.2, 6.5, 0.45, '#ffd3a7', [0, 0.22, 0]);
  cylinder(bitkit, 5, 5.8, 1.1, '#ff8950', [0, 1, 0]);
  cylinder(bitkit, 3.8, 4.8, 0.7, '#ffb574', [0, 1.9, 0]);
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
  obstacle(-20, 31, 3.8);

  const pond = group(15, 36);
  cylinder(pond, 5.3, 5.7, 0.18, '#dfd9a9', [0, 0.08, 0], 36).scale.z = 0.8;
  cylinder(pond, 4.9, 4.9, 0.2, '#79cfd1', [0, 0.16, 0], 36).scale.z = 0.8;
  const duck = new THREE.Group();
  duck.position.y = 1.1;
  pond.add(duck);
  sphere(duck, 2, '#ffdb68').scale.set(1.2, 0.8, 1);
  sphere(duck, 1.3, '#ffe582', [0, 1.8, 0.9]);
  const beak = sphere(duck, 0.75, '#f7964e', [0, 1.65, 2]);
  beak.scale.set(1, 0.4, 1.1);
  for (const x of [-0.7, 0.7]) sphere(duck, 0.13, '#39473e', [x, 2.05, 1.87]);
  for (const x of [-1.5, 1.5]) sphere(duck, 0.85, '#f5c34f', [x, 0.45, 0]).scale.set(0.4, 0.5, 1.4);
  label(pond, 'Department of Quack', [0, 6.4, 0], 10.5);
  register(pond, { kind: 'fun', id: 'duck' }, 'Consult the giant duck');

  const trampoline = group(39, -8);
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    cylinder(trampoline, 0.15, 0.15, 0.8, '#657c7a', [Math.sin(angle) * 2.5, 0.4, Math.cos(angle) * 2.5]);
  }
  cylinder(trampoline, 3, 3, 0.23, '#53718d', [0, 0.8, 0], 32);
  ring(trampoline, 3, 0.25, '#c9afe5', [0, 0.86, 0]);
  ring(trampoline, 1.4, 0.06, '#99b9ca', [0, 0.93, 0]);
  label(trampoline, 'Proof of Bounce', [0, 4, 0], 9);
  register(trampoline, { kind: 'fun', id: 'trampoline' }, 'Bounce on the trampoline');

  const portal = group(-2, -43);
  cylinder(portal, 4.3, 4.8, 0.4, '#b4aac7', [0, 0.2, 0]);
  const portalRing = mesh(portal, new THREE.TorusGeometry(3.1, 0.48, 8, 40), material('#d0a6ef', true), [0, 4, 0]);
  const veil = mesh(
    portal,
    new THREE.CircleGeometry(2.8, 32),
    new THREE.MeshBasicMaterial({
      color: '#b5d6ea',
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    [0, 4, 0],
  );
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const rune = box(portal, [0.35, 0.35, 0.4], '#fff4cb', [Math.sin(angle) * 3.15, 4 + Math.cos(angle) * 3.15, 0.46]);
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
