import * as THREE from 'three';
import { IMAGE_MAX_DIMENSION, IMAGE_MAX_RAW_SIZE } from '@/config/images';
import { BANK_POSITION, createBank } from '@/libs/world/world-bank';
import { WORLD_ZONES } from '@/libs/world/world-catalog';
import {
  box,
  cylinder,
  disposeObject,
  label,
  material,
  mesh,
  ring,
  sphere,
  WORLD_PALETTE,
} from '@/libs/world/world-geometry';
import { createLandmarks } from '@/libs/world/world-landmarks';
import { movementStep, resolvePosition, type WorldObstacle } from '@/libs/world/world-motion';
import { createSatoshi } from '@/libs/world/world-satoshi';
import { createTheater } from '@/libs/world/world-theater';
import type {
  PersonaState,
  WorldController,
  WorldData,
  WorldInteraction,
  WorldOptions,
  WorldZoneId,
} from '@/libs/world/world-types';

interface Interactive {
  object: THREE.Object3D;
  action: WorldInteraction;
  title: string;
  dynamic: boolean;
}

const TREE_COLORS = ['#79A63B', '#276A55', '#976631', '#8B405D', '#5E497E', '#33887B'];
const TREE_POSITIONS = [
  [16, -21],
  [27, -16],
  [36, -23],
  [29, -33],
  [17, -34],
  [8, -29],
];

function persona(color: string) {
  const group = new THREE.Group();
  const coat = material(color);
  const body = mesh(group, new THREE.CapsuleGeometry(0.48, 0.6, 3, 8), coat, [0, 1.22, 0]);
  body.scale.z = 0.8;
  sphere(group, 0.46, '#D4BCA4', [0, 2.08, 0]);
  cylinder(group, 0.48, 0.53, 0.2, color, [0, 2.38, 0], 10);
  sphere(group, 0.1, '#C8FF03', [0, 2.57, 0]);
  box(group, [0.08, 0.09, 0.06], '#101014', [-0.16, 2.12, 0.41]);
  box(group, [0.08, 0.09, 0.06], '#101014', [0.16, 2.12, 0.41]);
  const leftLeg = box(group, [0.3, 0.65, 0.36], '#303034', [-0.25, 0.43, 0]);
  const rightLeg = box(group, [0.3, 0.65, 0.36], '#303034', [0.25, 0.43, 0]);
  const leftArm = box(group, [0.23, 0.7, 0.26], color, [-0.61, 1.18, 0]);
  const rightArm = box(group, [0.23, 0.7, 0.26], color, [0.61, 1.18, 0]);
  box(group, [0.65, 0.65, 0.3], '#56565F', [0, 1.25, -0.43]);
  return { group, coat, leftLeg, rightLeg, leftArm, rightArm };
}

function makePath(scene: THREE.Scene, points: THREE.Vector3[], width = 3.2) {
  const curve = new THREE.CatmullRomCurve3(points);
  const positions: number[] = [];
  const indices: number[] = [];
  const edges: THREE.Vector3[][] = [[], []];
  for (let i = 0; i <= 45; i++) {
    const point = curve.getPoint(i / 45);
    const tangent = curve.getTangent(i / 45);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
    positions.push(point.x + side.x, 0.075, point.z + side.z, point.x - side.x, 0.075, point.z - side.z);
    edges[0].push(new THREE.Vector3(point.x + side.x, 0.14, point.z + side.z));
    edges[1].push(new THREE.Vector3(point.x - side.x, 0.14, point.z - side.z));
    if (i < 45) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const path = mesh(scene, geometry, '#3B3B42');
  path.material.side = THREE.DoubleSide;
  path.castShadow = false;
  for (const edge of edges) {
    const rail = mesh(
      scene,
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge), 45, 0.035, 3, false),
      new THREE.MeshBasicMaterial({ color: WORLD_PALETTE.lime, toneMapped: false }),
    );
    rail.castShadow = false;
  }
}

/** Browser-only scene. Avatar state deliberately has no network / account dependency. */
export function createWorld(container: HTMLElement, options: WorldOptions): WorldController {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05050A');
  scene.fog = new THREE.Fog('#05050A', 155, 330);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Pubky world. Use arrow keys or W A S D to walk, Space to jump, E to interact.',
  );
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.outline = 'none';
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  const ambient = new THREE.HemisphereLight('#DDE5FF', '#18201B', 1.7);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#E8EDFF', 2.25);
  sun.position.set(-35, 65, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -72, right: 72, top: 72, bottom: -72, near: 1, far: 180 });
  sun.shadow.normalBias = 0.1;
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#738CDB', 0.95);
  rim.position.set(35, 28, -45);
  scene.add(rim);

  const water = mesh(scene, new THREE.PlaneGeometry(900, 900), '#0A1019', [0, -4.6, 0]);
  water.rotation.x = -Math.PI / 2;
  water.castShadow = false;
  const coast = cylinder(scene, 62.5, 58, 5.2, '#303037', [0, -2.85, 0], 64);
  coast.receiveShadow = true;
  cylinder(scene, 60.5, 62, 0.85, '#232327', [0, -0.425, 0], 64);
  const surf: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const wave = ring(scene, 65 + i * 6, 0.13, '#25343A', [0, -4.35, 0]);
    wave.scale.z = 0.7;
    surf.push(wave);
  }

  const obstacles: WorldObstacle[] = [];
  const interactives: Interactive[] = [];
  let isDynamic = false;
  const register = (object: THREE.Object3D, action: WorldInteraction, title: string) => {
    interactives.push({ object, action, title, dynamic: isDynamic });
    object.userData.worldInteraction = interactives[interactives.length - 1];
  };
  const obstacle = (x: number, z: number, radius: number) => obstacles.push({ x, z, radius });

  WORLD_ZONES.forEach((zone) => {
    const [x, z] = zone.position;
    if (zone.id !== 'plaza') {
      makePath(scene, [
        new THREE.Vector3(0, 0, 8),
        new THREE.Vector3(x * 0.6, 0, z * 0.35 + 4),
        new THREE.Vector3(x, 0, z),
      ]);
    }
    cylinder(
      scene,
      zone.id === 'plaza' ? 12 : 10,
      zone.id === 'plaza' ? 12 : 10,
      0.16,
      zone.id === 'plaza' ? '#3B3B42' : '#2A2A30',
      [x, 0.04, z],
      48,
    );
  });
  makePath(scene, [new THREE.Vector3(-20, 0, 31), new THREE.Vector3(0, 0, 35), new THREE.Vector3(31, 0, 13)]);
  makePath(scene, [new THREE.Vector3(-24, 0, -27), new THREE.Vector3(0, 0, -42), new THREE.Vector3(24, 0, -24)]);
  makePath(scene, [new THREE.Vector3(-30, 0, 4), new THREE.Vector3(-40, 0, -13), new THREE.Vector3(-24, 0, -27)]);

  // Tiny trees around the coast leave the central paths clear.
  for (let i = 0; i < 38; i++) {
    const angle = i * 2.39996;
    const radius = 45 + Math.sin(i * 7.1) * 8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (WORLD_ZONES.some((zone) => Math.hypot(x - zone.position[0], z - zone.position[1]) < 15)) continue;
    if (Math.hypot(x - BANK_POSITION[0], z - BANK_POSITION[1]) < 7) continue;
    const height = 2.3 + (i % 4) * 0.55;
    cylinder(scene, 0.2, 0.32, height, '#4F4844', [x, height / 2, z], 5);
    cylinder(scene, 0, height * 0.65, height * 1.5, i % 3 ? '#254B40' : '#405C34', [x, height * 1.4, z], 7);
    obstacle(x, z, 0.5);
  }

  // Instanced wildflowers avoid hundreds of individual draw calls.
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), material('#FFFFFF', true), 160);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 160; i++) {
    const angle = i * 2.39996;
    const radius = 20 + (Math.sin(i * 16.4) * 0.5 + 0.5) * 36;
    dummy.position.set(Math.cos(angle) * radius, 0.2, Math.sin(angle) * radius);
    dummy.scale.set(1, 1.5 + (i % 3), 1);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new THREE.Color(i % 3 ? '#C8FF03' : '#7D9182'));
  }
  scene.add(flowers);

  const landmarks = createLandmarks(scene, register, obstacle);
  const bank = createBank(scene, register, obstacle);
  createSatoshi(scene, register, obstacle);
  const theater = createTheater(scene, register, obstacle, options.data);
  const player = persona('#C8FF03');
  player.group.position.set(0, 0.15, 24);
  scene.add(player.group);
  const playerHalo = ring(scene, 1, 0.08, '#C8FF03', [0, 0.2, 24]);
  label(player.group, 'you', [0, 3.3, 0], 2.4, '#C8FF03', '#1D1D20');

  // A floating sculpture expresses the social graph before opening individual people.
  const sculpture = new THREE.Group();
  sculpture.position.set(0, 0, 8);
  scene.add(sculpture);
  cylinder(sculpture, 2.7, 3.3, 0.6, '#454549', [0, 0.35, 0]);
  const orbitA = ring(sculpture, 2.1, 0.12, '#C8FF03', [0, 4.6, 0]);
  orbitA.rotation.x = 0.8;
  const orbitB = ring(sculpture, 2.5, 0.09, '#85859A', [0, 4.6, 0]);
  orbitB.rotation.x = -0.8;
  sphere(sculpture, 0.85, '#EEEEF6', [0, 4.6, 0]);
  label(sculpture, 'social plaza', [0, 8.5, 0], 10);
  register(sculpture, { kind: 'zone', id: 'plaza' }, 'Explore the social constellation');
  obstacle(0, 8, 2.5);

  let dataGroup = new THREE.Group();
  scene.add(dataGroup);
  let floatingLeaves: { object: THREE.Object3D; baseY: number; phase: number }[] = [];
  let graphParticles: { mesh: THREE.Mesh; curve: THREE.QuadraticBezierCurve3; phase: number }[] = [];
  let networkPeople: ReturnType<typeof persona>[] = [];
  const staticObstacleCount = obstacles.length;

  const populateData = (data: WorldData) => {
    for (let i = interactives.length - 1; i >= 0; i--) if (interactives[i].dynamic) interactives.splice(i, 1);
    disposeObject(dataGroup);
    dataGroup = new THREE.Group();
    scene.add(dataGroup);
    floatingLeaves = [];
    graphParticles = [];
    networkPeople = [];
    obstacles.splice(staticObstacleCount);
    isDynamic = true;
    data.tags.slice(0, 6).forEach((tag, tagIndex) => {
      const [x, z] = TREE_POSITIONS[tagIndex];
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      dataGroup.add(tree);
      const color = TREE_COLORS[tagIndex];
      cylinder(tree, 0.45, 0.8, 5, '#514842', [0, 2.5, 0], 6);
      cylinder(tree, 3.5, 4, 0.12, '#303B2B', [0, 0.15, 0]);
      const canopy = sphere(tree, 3.1, color, [0, 6.1, 0]);
      canopy.scale.set(1.1, 0.8, 1);
      sphere(tree, 2, color, [-2.1, 5.7, 0.6]);
      sphere(tree, 1.9, color, [1.8, 5.2, -1]);
      for (let i = 0; i < 3; i++) {
        const branch = cylinder(tree, 0.15, 0.25, 3, '#514842', [Math.cos(i * 2) * 1.1, 3.8, Math.sin(i * 2) * 1.1], 5);
        branch.rotation.z = i % 2 ? 0.7 : -0.7;
      }
      label(tree, `#${tag.label}`, [0, 10, 0], 7, '#C8FF03', '#1D1D20');
      register(tree, { kind: 'tag', index: tagIndex }, `Read #${tag.label.slice(0, 24)}`);
      obstacle(x, z, 1.1);
      tag.posts.slice(0, 5).forEach((post, postIndex) => {
        const angle = (postIndex * Math.PI * 2) / Math.min(tag.posts.length, 5) + 0.4;
        const leaf = new THREE.Group();
        leaf.position.set(Math.cos(angle) * 3.9, 3.6 + (postIndex % 2) * 1.5, Math.sin(angle) * 3.9);
        leaf.rotation.y = angle;
        leaf.rotation.z = (postIndex % 2 ? -1 : 1) * 0.12;
        tree.add(leaf);
        mesh(leaf, new THREE.BoxGeometry(1.2, 1.6, 0.12), material('#D9E2CE', true));
        box(leaf, [0.3, 0.12, 0.15], color, [-0.25, 0.46, 0.06]);
        for (let line = 0; line < 3; line++)
          box(leaf, [line === 2 ? 0.48 : 0.8, 0.06, 0.14], '#4B5646', [-0.02, 0.08 - line * 0.23, 0.06]);
        register(leaf, { kind: 'post', tagIndex, postIndex }, `Read a post by ${post.author.slice(0, 22)}`);
        floatingLeaves.push({ object: leaf, baseY: leaf.position.y, phase: tagIndex + postIndex });
      });
    });
    data.people.slice(0, 6).forEach((person) => {
      const character = persona(person.color);
      character.group.position.set(person.position[0], 0.2, person.position[1]);
      character.group.rotation.y = Math.atan2(-person.position[0], 8 - person.position[1]);
      dataGroup.add(character.group);
      cylinder(character.group, 1.3, 1.3, 0.16, person.color, [0, 0, 0]);
      label(character.group, person.name, [0, 3.5, 0], 4.8);
      register(character.group, { kind: 'person', id: person.id }, `Meet ${person.name.slice(0, 24)}`);
      networkPeople.push(character);
    });
    data.relationships.slice(0, 18).forEach((relationship, index) => {
      const from = data.people.find((person) => person.id === relationship.from);
      const to = data.people.find((person) => person.id === relationship.to);
      if (!from || !to) return;
      const start = new THREE.Vector3(from.position[0], 2.1, from.position[1]);
      const end = new THREE.Vector3(to.position[0], 2.1, to.position[1]);
      const middle = start.clone().lerp(end, 0.5);
      middle.y = 5 + (index % 3) * 1.3;
      const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
      mesh(
        dataGroup,
        new THREE.TubeGeometry(curve, 24, 0.045, 4, false),
        material(index % 3 === 0 ? WORLD_PALETTE.text : WORLD_PALETTE.lime, true),
      );
      const particle = sphere(dataGroup, 0.14, '#EEEEF6');
      particle.position.copy(curve.getPoint(index / 18));
      graphParticles.push({ mesh: particle, curve, phase: index / 8 });
      const arrow = mesh(dataGroup, new THREE.ConeGeometry(0.18, 0.55, 5), material(WORLD_PALETTE.lime, true));
      arrow.position.copy(curve.getPoint(0.88));
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(0.88).normalize());
    });
    isDynamic = false;
  };
  populateData(options.data);

  // Local collectibles are clearly game props, with no token or monetary semantics.
  const collectibles: THREE.Group[] = [];
  for (let i = 0; i < 8; i++) {
    const collectible = new THREE.Group();
    const angle = (i / 8) * Math.PI * 2;
    collectible.position.set(Math.sin(angle) * 19, 1.6, Math.cos(angle) * 19 + 5);
    ring(collectible, 0.45, 0.12, '#C8FF03', [0, 0.4, 0]).rotation.x = 0;
    box(collectible, [0.16, 0.75, 0.14], '#C8FF03', [0, -0.25, 0]);
    box(collectible, [0.36, 0.14, 0.14], '#C8FF03', [0.1, -0.55, 0]);
    scene.add(collectible);
    collectibles.push(collectible);
  }

  const balloon = new THREE.Group();
  balloon.position.set(-45, 18, 25);
  const envelope = sphere(balloon, 3.1, '#41414A', [0, 3, 0]);
  envelope.scale.y = 1.25;
  box(balloon, [1.5, 1, 1.5], '#25252C', [0, -2, 0]);
  for (const side of [-0.6, 0.6]) cylinder(balloon, 0.035, 0.035, 2.7, '#C8FF03', [side, -0.3, side], 4);
  scene.add(balloon);

  const keys = new Set<string>();
  const touch = { x: 0, z: 0 };
  let disposed = false;
  let paused = false;
  let overview = true;
  let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let yaw = 0.44;
  let pitch = 0.72;
  let zoom = 1;
  let jumpVelocity = 0;
  let jumpHeight = 0;
  let danceUntil = 0;
  let time = 0;
  let lastTime = 0;
  let lastStatus = -1;
  let collected = 0;
  let nearby: Interactive | null = null;
  let walkTarget: THREE.Vector3 | null = null;
  let animation: PersonaState['animation'] = 'idle';
  let capturingPhoto = false;
  const cameraTarget = new THREE.Vector3(0, 0, 0);
  const cameraGoal = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const tempPosition = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const clearInput = () => {
    keys.clear();
    touch.x = 0;
    touch.z = 0;
    walkTarget = null;
  };
  const enterExplore = () => {
    if (overview) options.onExplore?.();
    overview = false;
  };
  const jump = () => {
    if (!paused && jumpHeight === 0) jumpVelocity = 10;
  };
  const dance = () => {
    if (!paused) danceUntil = time + 4;
  };
  const interact = () => {
    if (paused || !nearby) return;
    if (nearby.action.kind === 'fun' && nearby.action.id === 'trampoline') jumpVelocity = 20;
    options.onInteract(nearby.action);
  };
  const travelTo = (id: WorldZoneId) => {
    const zone = WORLD_ZONES.find((value) => value.id === id);
    if (!zone) return;
    clearInput();
    const approach = id === 'arena' ? 2 : id === 'theater' ? 7 : 11;
    const spawn = resolvePosition(zone.position[0], zone.position[1] + approach, obstacles);
    player.group.position.set(spawn.x, 0.15, spawn.z);
    jumpHeight = 0;
    jumpVelocity = 0;
    overview = false;
    lastStatus = -1;
  };
  const handleKey = (event: KeyboardEvent) => {
    if (event.type === 'keyup') {
      keys.delete(event.code);
      return;
    }
    if (paused || event.ctrlKey || event.metaKey || event.altKey) return;
    if (
      event.target instanceof Element &&
      event.target.closest('input, textarea, select, button, a, [role="dialog"], [contenteditable="true"]')
    )
      return;
    const handled = [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Space',
      'ShiftLeft',
      'ShiftRight',
      'KeyE',
      'KeyF',
      'KeyR',
    ];
    if (!handled.includes(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    if (!event.repeat) {
      if (event.code === 'Space') jump();
      if (event.code === 'KeyE') interact();
      if (event.code === 'KeyF') dance();
      if (event.code === 'KeyR') travelTo('plaza');
    }
  };
  window.addEventListener('keydown', handleKey);
  window.addEventListener('keyup', handleKey);
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', clearInput);

  let drag: { x: number; y: number; distance: number; id: number } | null = null;
  const pointRay = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  };
  const pick = () => {
    const hits = raycaster.intersectObjects(
      interactives.map((item) => item.object),
      true,
    );
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        if (object.userData.worldInteraction) return object.userData.worldInteraction as Interactive;
        object = object.parent;
      }
    }
    return null;
  };
  const pointerDown = (event: PointerEvent) => {
    if (paused || event.button !== 0) return;
    renderer.domElement.focus({ preventScroll: true });
    drag = { x: event.clientX, y: event.clientY, distance: 0, id: event.pointerId };
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    if (paused) return;
    if (drag && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.distance += Math.abs(dx) + Math.abs(dy);
      yaw -= dx * 0.004;
      pitch = THREE.MathUtils.clamp(pitch + dy * 0.003, 0.3, 1.25);
      drag.x = event.clientX;
      drag.y = event.clientY;
    } else if (event.pointerType === 'mouse') {
      pointRay(event);
      renderer.domElement.style.cursor = pick() ? 'pointer' : 'grab';
    }
  };
  const pointerUp = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const clicked = drag.distance < 7 && !paused;
    drag = null;
    if (renderer.domElement.hasPointerCapture(event.pointerId))
      renderer.domElement.releasePointerCapture(event.pointerId);
    if (!clicked) return;
    pointRay(event);
    const selected = pick();
    if (selected) options.onInteract(selected.action);
    else {
      const point = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
      if (point && Math.hypot(point.x, point.z) < 56) {
        walkTarget = point;
        enterExplore();
      }
    }
  };
  const pointerCancel = () => {
    drag = null;
  };
  const wheel = (event: WheelEvent) => {
    if (paused) return;
    event.preventDefault();
    zoom = THREE.MathUtils.clamp(zoom + event.deltaY * 0.0008, 0.6, 1.5);
  };
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('pointercancel', pointerCancel);
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height));
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const tick = (timestamp: number) => {
    if (disposed) return;
    const elapsed = lastTime ? Math.max(0, (timestamp - lastTime) / 1000) : 0.016;
    const delta = Math.min(elapsed, 0.05);
    lastTime = timestamp;
    if (document.hidden) return;
    // The theater can resume from its reading panel while avatar input stays paused.
    if (theater.tick(Math.min(elapsed, 1))) lastStatus = -1;
    if (!paused) time += delta;
    let moving = false;
    if (!paused) {
      const inputX =
        Number(keys.has('KeyD') || keys.has('ArrowRight')) -
        Number(keys.has('KeyA') || keys.has('ArrowLeft')) +
        touch.x;
      const inputZ =
        Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + touch.z;
      let step = movementStep(inputX, inputZ, yaw, delta, keys.has('ShiftLeft') || keys.has('ShiftRight'));
      if (inputX || inputZ) {
        enterExplore();
        walkTarget = null;
      }
      if (walkTarget) {
        const dx = walkTarget.x - player.group.position.x;
        const dz = walkTarget.z - player.group.position.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.6) walkTarget = null;
        else step = { x: (dx / length) * delta * 8, z: (dz / length) * delta * 8 };
      }
      moving = Math.hypot(step.x, step.z) > 0.001;
      if (moving) {
        const position = resolvePosition(player.group.position.x + step.x, player.group.position.z + step.z, obstacles);
        player.group.position.x = position.x;
        player.group.position.z = position.z;
        const targetAngle = Math.atan2(step.x, step.z);
        player.group.rotation.y +=
          Math.atan2(Math.sin(targetAngle - player.group.rotation.y), Math.cos(targetAngle - player.group.rotation.y)) *
          Math.min(1, delta * 14);
      }
      if (jumpHeight > 0 || jumpVelocity > 0) {
        jumpVelocity -= 24 * delta;
        jumpHeight = Math.max(0, jumpHeight + jumpVelocity * delta);
        if (jumpHeight === 0) jumpVelocity = 0;
      }
      const onTrampoline = Math.hypot(player.group.position.x - 39, player.group.position.z + 8) < 2.3;
      if (onTrampoline && jumpHeight === 0 && moving) jumpVelocity = 18;
      collectibles.forEach((item) => {
        if (
          item.visible &&
          Math.hypot(item.position.x - player.group.position.x, item.position.z - player.group.position.z) < 1.8
        ) {
          item.visible = false;
          collected++;
        }
      });
    }
    animation = jumpHeight > 0 ? 'jump' : moving ? 'walk' : danceUntil > time ? 'dance' : 'idle';
    const dancing = animation === 'dance';
    const stride = !reducedMotion && moving ? Math.sin(time * 13) * 0.65 : 0;
    player.leftLeg.rotation.x = stride;
    player.rightLeg.rotation.x = -stride;
    player.leftArm.rotation.x = -stride;
    player.rightArm.rotation.x = stride;
    player.leftArm.rotation.z = dancing ? -1.7 : 0.1;
    player.rightArm.rotation.z = dancing ? 1.7 : -0.1;
    player.group.position.y = 0.15 + jumpHeight + (!reducedMotion && dancing ? Math.abs(Math.sin(time * 8)) * 0.4 : 0);
    if (dancing && !reducedMotion) player.group.rotation.y += delta * 3;
    playerHalo.position.set(player.group.position.x, 0.23, player.group.position.z);
    if (!paused) bank.animate(time, reducedMotion);

    if (!paused && !reducedMotion) {
      orbitA.rotation.z = time * 0.2;
      orbitB.rotation.y = time * 0.17;
      floatingLeaves.forEach((leaf) => {
        leaf.object.position.y = leaf.baseY + Math.sin(time * 1.5 + leaf.phase) * 0.16;
      });
      graphParticles.forEach((particle) => {
        particle.mesh.position.copy(particle.curve.getPoint((time * 0.13 + particle.phase) % 1));
      });
      networkPeople.forEach((person, index) => {
        person.group.position.y = 0.2 + Math.sin(time * 1.4 + index) * 0.04;
      });
      collectibles.forEach((item, index) => {
        item.rotation.y = time + index;
        item.position.y = 1.6 + Math.sin(time * 2 + index) * 0.2;
      });
      balloon.position.y = 18 + Math.sin(time * 0.6) * 0.8;
      landmarks.animate(time, delta);
      surf.forEach((wave, index) => {
        const scale = 1 + Math.sin(time * 0.5 + index) * 0.009;
        wave.scale.set(scale, scale, 0.7);
      });
    }

    desiredTarget.copy(overview ? new THREE.Vector3(0, 0, 0) : player.group.position).setY(overview ? 0 : 1.3);
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-delta * 4);
    cameraTarget.lerp(desiredTarget, smoothing);
    const portraitScale = camera.aspect < 1 ? 1 / camera.aspect : 1;
    const distance = (overview ? 156 * portraitScale : 42) * zoom;
    // Portrait screens pull the overview camera back; keep the island in front
    // of the fog instead of fading it out at the desktop's fixed distance.
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = Math.max(155, distance + 45);
      scene.fog.far = scene.fog.near + 175;
    }
    cameraGoal
      .set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      )
      .add(cameraTarget);
    if (lastStatus === -1 && time < 0.1) camera.position.copy(cameraGoal);
    else camera.position.lerp(cameraGoal, smoothing);
    camera.lookAt(cameraTarget);

    if (time - lastStatus > 0.2 || lastStatus === -1) {
      lastStatus = time;
      let nearestDistance = 7;
      nearby = null;
      for (const item of interactives) {
        item.object.getWorldPosition(tempPosition);
        const distanceTo = Math.hypot(
          tempPosition.x - player.group.position.x,
          tempPosition.z - player.group.position.z,
        );
        if (distanceTo < nearestDistance) {
          nearby = item;
          nearestDistance = distanceTo;
        }
      }
      const zone = WORLD_ZONES.reduce((nearest, candidate) =>
        Math.hypot(candidate.position[0] - player.group.position.x, candidate.position[1] - player.group.position.z) <
        Math.hypot(nearest.position[0] - player.group.position.x, nearest.position[1] - player.group.position.z)
          ? candidate
          : nearest,
      );
      options.onStatus({
        zone: zone.id,
        position: [player.group.position.x, player.group.position.z],
        nearby: nearby?.title ?? null,
        collected,
        ...theater.getStatus(),
      });
    }
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(tick);
  options.onReady();

  return {
    travelTo,
    setOverview(value) {
      if (overview !== value) walkTarget = null;
      overview = value;
      zoom = 1;
    },
    setPaused(value) {
      paused = value;
      clearInput();
      drag = null;
    },
    setNight(value) {
      const color = value ? '#03050C' : WORLD_PALETTE.background;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, 155, 330);
      ambient.intensity = value ? 1.25 : 1.7;
      sun.intensity = value ? 1.5 : 2.25;
      rim.intensity = value ? 1.4 : 0.95;
      (water.material as THREE.MeshStandardMaterial).color.set(value ? '#050A15' : '#0A1019');
    },
    setReducedMotion(value) {
      reducedMotion = value;
      if (value) {
        theater.setPaused(true);
        lastStatus = -1;
      }
    },
    setTheaterPaused(value) {
      theater.setPaused(value);
      lastStatus = -1;
    },
    stepTheater(delta) {
      theater.step(delta);
      lastStatus = -1;
    },
    setPersonaColor(color) {
      if (/^#[0-9a-f]{6}$/i.test(color)) player.coat.color.set(color);
    },
    setMove(x, z) {
      if (!paused) {
        touch.x = THREE.MathUtils.clamp(x, -1, 1);
        touch.z = THREE.MathUtils.clamp(z, -1, 1);
      }
    },
    jump,
    dance,
    interact,
    async capturePhoto() {
      if (disposed || capturingPhoto) return null;
      capturingPhoto = true;
      const frame = document.createElement('canvas');
      try {
        const source = renderer.domElement;
        if (!source.width || !source.height) return null;
        const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(source.width, source.height));
        frame.width = Math.max(1, Math.floor(source.width * scale));
        frame.height = Math.max(1, Math.floor(source.height * scale));
        const context = frame.getContext('2d');
        if (!context) return null;
        // Copy immediately after rendering; the WebGL drawing buffer need not be
        // preserved between frames. The HUD lives outside this canvas.
        renderer.render(scene, camera);
        context.drawImage(source, 0, 0, frame.width, frame.height);
        const blob = await new Promise<Blob | null>((resolve) => frame.toBlob(resolve, 'image/png'));
        return !disposed && blob?.type === 'image/png' && blob.size > 0 && blob.size <= IMAGE_MAX_RAW_SIZE
          ? blob
          : null;
      } catch {
        return null;
      } finally {
        frame.width = 0;
        frame.height = 0;
        capturingPhoto = false;
      }
    },
    updateData(data) {
      populateData(data);
      theater.updateData(data);
      nearby = null;
      lastStatus = -1;
    },
    getPersonaState() {
      return { position: player.group.position.toArray(), rotation: player.group.rotation.y, animation };
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
      window.removeEventListener('blur', clearInput);
      document.removeEventListener('visibilitychange', clearInput);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', pointerCancel);
      renderer.domElement.removeEventListener('wheel', wheel);
      landmarks.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
