import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { IMAGE_MAX_DIMENSION, IMAGE_MAX_RAW_SIZE } from '@/config/images';
import { ARENA_DIMENSIONS, createArena } from '@/libs/world/world-arena';
import { BANK_POSITION, createBank } from '@/libs/world/world-bank';
import { WORLD_ZONES } from '@/libs/world/world-catalog';
import { createChess } from '@/libs/world/world-chess';
import { createCinema } from '@/libs/world/world-cinema';
import { createCinemaScreen } from '@/libs/world/world-cinema-screen';
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
import { createGalacticJellyfish } from '@/libs/world/world-jellyfish';
import { createLandmarks } from '@/libs/world/world-landmarks';
import {
  WORLD_ANCHORS,
  WORLD_DIMENSIONS,
  WORLD_PORTALS,
  WORLD_RADIUS,
  WORLD_TREE_POSITIONS,
  worldArrival,
  worldCameraFar,
  worldLandmarkPose,
} from '@/libs/world/world-layout';
import { movementStep, resolvePosition, type WorldObstacle } from '@/libs/world/world-motion';
import { createWorldPlanets } from '@/libs/world/world-planets';
import { createPortalTransit } from '@/libs/world/world-portals';
import { createRunner } from '@/libs/world/world-runner';
import { createSatoshi } from '@/libs/world/world-satoshi';
import { createSocialPlaza } from '@/libs/world/world-social';
import { SOCIAL_PLAZA_RADIUS } from '@/libs/world/world-social-layout';
import { createTether } from '@/libs/world/world-tether';
import { createTheater } from '@/libs/world/world-theater';
import type {
  PersonaState,
  WorldController,
  WorldData,
  WorldInteraction,
  WorldOptions,
} from '@/libs/world/world-types';

interface Interactive {
  object: THREE.Object3D;
  action: WorldInteraction;
  title: string;
  dynamic: boolean;
}

const TREE_COLORS = ['#79A63B', '#276A55', '#976631', '#8B405D', '#5E497E', '#33887B'];

function persona(color: string) {
  const group = new THREE.Group();
  const coat = material('#111114');
  const accent = material(color);
  const body = mesh(group, new THREE.CapsuleGeometry(0.55, 0.68, 3, 8), coat, [0, 1.22, 0]);
  body.scale.z = 0.8;
  const hood = mesh(group, new THREE.IcosahedronGeometry(0.6, 1), coat, [0, 2.1, -0.04]);
  hood.scale.set(1, 1.1, 0.86);
  sphere(group, 0.4, '#D4BCA4', [0, 2.1, 0.19]);
  const opening = mesh(group, new THREE.TorusGeometry(0.47, 0.105, 6, 18), coat, [0, 2.12, 0.29]);
  opening.scale.set(0.9, 1.1, 1);
  box(group, [0.07, 0.085, 0.05], '#101014', [-0.14, 2.14, 0.56]);
  box(group, [0.07, 0.085, 0.05], '#101014', [0.14, 2.14, 0.56]);
  for (const x of [-0.14, 0.14]) {
    cylinder(group, 0.019, 0.019, 0.28, '#DADAE0', [x, 1.65, 0.42], 5);
    cylinder(group, 0.027, 0.027, 0.07, '#92929D', [x, 1.48, 0.42], 5);
  }
  box(group, [0.7, 0.29, 0.085], '#202026', [0, 0.87, 0.4]);
  const pocketSeam = box(group, [0.48, 0.018, 0.02], '#4A4A54', [0, 0.99, 0.45]);
  pocketSeam.rotation.z = -0.02;
  const leftLeg = box(group, [0.3, 0.65, 0.36], '#303034', [-0.25, 0.43, 0]);
  const rightLeg = box(group, [0.3, 0.65, 0.36], '#303034', [0.25, 0.43, 0]);
  for (const leg of [leftLeg, rightLeg]) {
    mesh(leg, new THREE.BoxGeometry(0.35, 0.15, 0.55), accent, [0, -0.29, 0.13]);
    box(leg, [0.36, 0.065, 0.57], '#DADAE0', [0, -0.37, 0.13]);
  }
  const leftArm = mesh(group, new THREE.BoxGeometry(0.28, 0.72, 0.3), coat, [-0.64, 1.18, 0]);
  const rightArm = mesh(group, new THREE.BoxGeometry(0.28, 0.72, 0.3), coat, [0.64, 1.18, 0]);
  for (const arm of [leftArm, rightArm]) sphere(arm, 0.13, '#D4BCA4', [0, -0.43, 0]);

  // Reuse the app's official, bundled SVG as shallow chest embroidery.
  const abort = new AbortController();
  void fetch('/pubky-logo.svg', { signal: abort.signal, credentials: 'omit' })
    .then((response) => (response.ok ? response.text() : null))
    .then((source) => {
      if (!source || abort.signal.aborted) return;
      const logo = new THREE.Group();
      for (const path of new SVGLoader().parse(source).paths) {
        const shapes = SVGLoader.createShapes(path);
        const geometry = new THREE.ShapeGeometry(shapes, 8);
        const embroidery = new THREE.MeshBasicMaterial({
          color: path.color,
          side: THREE.DoubleSide,
          toneMapped: false,
        });
        mesh(logo, geometry, embroidery).castShadow = false;
      }
      logo.scale.set(0.0074, -0.0074, 0.0074);
      logo.position.set(-0.403, 1.46, 0.445);
      logo.name = 'official-pubky-hoodie-logo';
      group.add(logo);
      const backPrint = logo.clone(true);
      backPrint.name = 'official-pubky-hoodie-back-logo';
      backPrint.scale.set(0.009, -0.009, 0.009);
      backPrint.rotation.y = Math.PI;
      backPrint.position.set(0.4905, 1.6, -0.448);
      group.add(backPrint);
    })
    .catch(() => {
      /* The black hoodie remains usable if the bundled embroidery cannot load. */
    });
  return { group, accent, leftLeg, rightLeg, leftArm, rightArm, dispose: () => abort.abort() };
}

function makePath(scene: THREE.Scene, points: THREE.Vector3[], width = 3.2) {
  const curve = new THREE.CatmullRomCurve3(points);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= 45; i++) {
    const point = curve.getPoint(i / 45);
    const tangent = curve.getTangent(i / 45);
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
    positions.push(point.x + side.x, 0.075, point.z + side.z, point.x - side.x, 0.075, point.z - side.z);
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
  return curve;
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

  const camera = new THREE.PerspectiveCamera(40, 1, WORLD_DIMENSIONS.cameraNear, WORLD_DIMENSIONS.cameraFar);
  const ambient = new THREE.HemisphereLight('#DDE5FF', '#18201B', 1.7);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#E8EDFF', 2.25);
  sun.position.set(-35, 65, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -WORLD_DIMENSIONS.shadowExtent,
    right: WORLD_DIMENSIONS.shadowExtent,
    top: WORLD_DIMENSIONS.shadowExtent,
    bottom: -WORLD_DIMENSIONS.shadowExtent,
    near: 1,
    far: WORLD_DIMENSIONS.shadowFar,
  });
  sun.shadow.normalBias = 0.1;
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#738CDB', 0.95);
  rim.position.set(35, 28, -45);
  scene.add(rim);

  const water = mesh(scene, new THREE.PlaneGeometry(900, 900), '#0A1019', [0, -4.6, 0]);
  water.rotation.x = -Math.PI / 2;
  water.castShadow = false;
  const coast = cylinder(
    scene,
    WORLD_DIMENSIONS.coastRadius,
    WORLD_DIMENSIONS.coastRadius - 6,
    5.2,
    '#303037',
    [0, -2.85, 0],
    64,
  );
  coast.receiveShadow = true;
  cylinder(scene, WORLD_DIMENSIONS.landRadius, WORLD_DIMENSIONS.landRadius + 2, 0.85, '#232327', [0, -0.425, 0], 64);
  const surf: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const wave = ring(scene, WORLD_DIMENSIONS.coastRadius + 2.5 + i * 8, 0.13, '#25343A', [0, -4.35, 0]);
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
  const pathSamples: THREE.Vector3[] = [];
  const groundPoint = ([x, z]: readonly [number, number]) => new THREE.Vector3(x, 0, z);
  const addPath = (points: THREE.Vector3[]) => pathSamples.push(...makePath(scene, points).getSpacedPoints(35));
  const plazaGround = groundPoint(WORLD_ANCHORS.plaza);
  const arenaEntrance = new THREE.Vector3(
    WORLD_ANCHORS.arena[0],
    0,
    WORLD_ANCHORS.arena[1] + ARENA_DIMENSIONS.entranceZ,
  );

  WORLD_ZONES.forEach((zone) => {
    const [x, z] = zone.position;
    if (zone.id === 'arena') {
      addPath([plazaGround, new THREE.Vector3(34, 0, 57), arenaEntrance, groundPoint(zone.position)]);
    } else if (zone.id === 'university') {
      // Leave the Satoshi plinth clear on the university approach.
      addPath([plazaGround, new THREE.Vector3(-5, 0, -32), groundPoint(zone.position)]);
    } else if (zone.id === 'cinema') {
      const arrival = worldArrival('cinema');
      addPath([plazaGround, new THREE.Vector3(-48, 0, 46), new THREE.Vector3(arrival.x, 0, arrival.z)]);
    } else if (zone.id === 'chess') {
      const arrival = worldArrival('chess');
      addPath([plazaGround, new THREE.Vector3(72, 0, -10), new THREE.Vector3(arrival.x, 0, arrival.z)]);
    } else if (zone.id !== 'plaza') {
      addPath([plazaGround, new THREE.Vector3(x * 0.6, 0, z * 0.35 + 4), groundPoint(zone.position)]);
    }
    cylinder(
      scene,
      zone.id === 'plaza' ? SOCIAL_PLAZA_RADIUS : 10,
      zone.id === 'plaza' ? SOCIAL_PLAZA_RADIUS : 10,
      0.16,
      zone.id === 'plaza' ? '#3B3B42' : '#2A2A30',
      [x, 0.04, z],
      48,
    );
  });
  addPath([groundPoint(WORLD_ANCHORS.bitkit), new THREE.Vector3(5, 0, 71), arenaEntrance]);
  addPath([groundPoint(WORLD_ANCHORS.university), new THREE.Vector3(7, 0, -74), groundPoint(WORLD_ANCHORS.forest)]);
  addPath([
    groundPoint(WORLD_ANCHORS.github),
    new THREE.Vector3(-42, 0, 4),
    new THREE.Vector3(-43, 0, -31),
    groundPoint(WORLD_ANCHORS.university),
  ]);
  addPath([groundPoint(WORLD_ANCHORS.forest), new THREE.Vector3(40, 0, -90), groundPoint(WORLD_ANCHORS.tether)]);
  addPath([
    groundPoint(WORLD_ANCHORS.university),
    new THREE.Vector3(-26, 0, -100),
    groundPoint(WORLD_PORTALS[0].position),
  ]);
  addPath([groundPoint(WORLD_ANCHORS.github), new THREE.Vector3(-103, 0, 34), groundPoint(WORLD_PORTALS[1].position)]);
  addPath([arenaEntrance, new THREE.Vector3(90, 0, 72), groundPoint(WORLD_PORTALS[2].position)]);
  addPath([arenaEntrance, new THREE.Vector3(63, 0, 82), groundPoint(WORLD_ANCHORS.runner)]);
  addPath([
    arenaEntrance,
    new THREE.Vector3(76, 0, 60),
    new THREE.Vector3(99, 0, 44),
    new THREE.Vector3(BANK_POSITION[0], 0, BANK_POSITION[1] + 7),
  ]);

  // Tiny trees around the coast leave the central paths clear.
  for (let i = 0; i < 38; i++) {
    const angle = i * 2.39996;
    const radius = WORLD_RADIUS - 12 + Math.sin(i * 7.1) * 7;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (
      WORLD_ZONES.some(
        (zone) =>
          Math.hypot(x - zone.position[0], z - zone.position[1]) <
          (zone.id === 'cinema' ? 22 : zone.id === 'arena' ? 25 : zone.id === 'chess' ? 24 : 15),
      )
    )
      continue;
    if (Math.hypot(x - BANK_POSITION[0], z - BANK_POSITION[1]) < 7) continue;
    if (Math.hypot(x - WORLD_ANCHORS.tether[0], z - WORLD_ANCHORS.tether[1]) < 10) continue;
    if (Math.hypot(x - WORLD_ANCHORS.runner[0], z - WORLD_ANCHORS.runner[1]) < 12) continue;
    if (WORLD_PORTALS.some((portal) => Math.hypot(x - portal.position[0], z - portal.position[1]) < 9)) continue;
    if (pathSamples.some((point) => Math.hypot(x - point.x, z - point.z) < 3.2)) continue;
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
    const radius = 40 + (Math.sin(i * 16.4) * 0.5 + 0.5) * (WORLD_RADIUS - 45);
    dummy.position.set(Math.cos(angle) * radius, 0.2, Math.sin(angle) * radius);
    dummy.scale.set(1, 1.5 + (i % 3), 1);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new THREE.Color(i % 3 ? '#C8FF03' : '#7D9182'));
  }
  scene.add(flowers);

  const landmarks = createLandmarks(scene, register, obstacle);
  const arena = createArena(scene, register, obstacle);
  const bank = createBank(scene, register, obstacle);
  const jellyfish = createGalacticJellyfish(scene);
  const planets = createWorldPlanets(scene);
  const cinema = createCinema(scene, register, obstacle);
  const cinemaScreen = createCinemaScreen(container, scene, cinema.screenFrame);
  const chess = createChess(scene, WORLD_ANCHORS.chess, obstacle);
  register(chess.group, { kind: 'zone', id: 'chess' }, 'Explore the Chess Citadel');
  register(chess.entrance, { kind: 'zone', id: 'chess' }, 'Play chess on Pubky');
  const runner = createRunner(scene, WORLD_ANCHORS.runner);
  register(runner.persona, { kind: 'fun', id: 'runner' }, 'Catch up with @halfin · mention pills');
  const portals = createPortalTransit();
  const tether = createTether(scene, register, obstacle);
  createSatoshi(scene, register, obstacle);
  const theater = createTheater(scene, register, obstacle, options.data);
  const player = persona('#C8FF03');
  player.group.position.set(0, 0.15, 24);
  scene.add(player.group);
  const playerHalo = ring(scene, 1, 0.08, '#C8FF03', [0, 0.2, 24]);
  label(player.group, 'you', [0, 3.3, 0], 2.4, '#C8FF03', '#1D1D20');

  // A floating sculpture expresses the social graph before opening individual people.
  const sculpture = new THREE.Group();
  sculpture.position.set(WORLD_ANCHORS.plaza[0], 0, WORLD_ANCHORS.plaza[1]);
  scene.add(sculpture);
  cylinder(sculpture, 2.7, 3.3, 0.6, '#454549', [0, 0.35, 0]);
  const orbitA = ring(sculpture, 2.1, 0.12, '#C8FF03', [0, 4.6, 0]);
  orbitA.rotation.x = 0.8;
  const orbitB = ring(sculpture, 2.5, 0.09, '#85859A', [0, 4.6, 0]);
  orbitB.rotation.x = -0.8;
  sphere(sculpture, 0.85, '#EEEEF6', [0, 4.6, 0]);
  for (let index = 0; index < 6; index++) {
    const angle = (index / 6) * Math.PI * 2;
    const node = new THREE.Vector3(Math.cos(angle) * 2.7, 4.6 + Math.sin(angle * 2) * 1.2, Math.sin(angle) * 2.7);
    sphere(sculpture, 0.28, index % 2 ? '#B59BFF' : '#C8FF03', node.toArray());
    const center = new THREE.Vector3(0, 4.6, 0);
    const direction = node.clone().sub(center);
    const connection = cylinder(sculpture, 0.035, 0.035, direction.length(), '#8E9CA6');
    connection.position.copy(center).add(node).multiplyScalar(0.5);
    connection.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  }
  label(sculpture, 'THE PUBKY GRAPH', [0, 8.5, 0], 10);
  register(sculpture, { kind: 'fun', id: 'graph' }, 'Open the Pubky Graph Explorer');
  obstacle(sculpture.position.x, sculpture.position.z, 2.5);

  let dataGroup = new THREE.Group();
  scene.add(dataGroup);
  let floatingLeaves: { object: THREE.Object3D; baseY: number; phase: number }[] = [];
  const staticObstacleCount = obstacles.length;

  const populateForest = (data: WorldData) => {
    for (let i = interactives.length - 1; i >= 0; i--) if (interactives[i].dynamic) interactives.splice(i, 1);
    disposeObject(dataGroup);
    dataGroup = new THREE.Group();
    scene.add(dataGroup);
    floatingLeaves = [];
    obstacles.splice(staticObstacleCount);
    isDynamic = true;
    data.tags.slice(0, 6).forEach((tag, tagIndex) => {
      const [x, z] = WORLD_TREE_POSITIONS[tagIndex];
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
    isDynamic = false;
  };
  populateForest(options.data);
  const social = createSocialPlaza(scene, options.data);
  let forestTags = options.data.tags;
  let theaterPosts = options.data.trendingPosts;
  let dataSource = options.data.source;

  // Local collectibles are clearly game props, with no token or monetary semantics.
  const collectibles: THREE.Group[] = [];
  for (let i = 0; i < 8; i++) {
    const collectible = new THREE.Group();
    const angle = (i / 8) * Math.PI * 2;
    collectible.position.set(Math.sin(angle) * 27, 1.6, Math.cos(angle) * 27 + 5);
    ring(collectible, 0.45, 0.12, '#C8FF03', [0, 0.4, 0]).rotation.x = 0;
    box(collectible, [0.16, 0.75, 0.14], '#C8FF03', [0, -0.25, 0]);
    box(collectible, [0.36, 0.14, 0.14], '#C8FF03', [0.1, -0.55, 0]);
    scene.add(collectible);
    collectibles.push(collectible);
  }

  const balloon = new THREE.Group();
  balloon.position.set(WORLD_ANCHORS.balloon[0], 18, WORLD_ANCHORS.balloon[1]);
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
  let snapCamera = false;
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
  let landmarkPose: ReturnType<typeof worldLandmarkPose> | null = null;
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
    if (overview) {
      options.onExplore?.();
      pitch = 0.26;
    }
    overview = false;
    landmarkPose = null;
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
  const travelTo: WorldController['travelTo'] = (id, travelOptions) => {
    const zone = WORLD_ZONES.find((value) => value.id === id);
    if (!zone) return;
    clearInput();
    portals.reset();
    const arrival = worldArrival(id);
    const spawn = resolvePosition(arrival.x, arrival.z, obstacles);
    player.group.position.set(spawn.x, 0.15, spawn.z);
    jumpHeight = 0;
    jumpVelocity = 0;
    enterExplore();
    landmarkPose = travelOptions?.faceLandmark ? worldLandmarkPose(id, camera.aspect) : null;
    if (landmarkPose) {
      player.group.rotation.y = landmarkPose.facing;
      yaw = landmarkPose.yaw;
      pitch = landmarkPose.pitch;
      zoom = 1;
      cameraTarget.set(...landmarkPose.target);
      camera.position.set(...landmarkPose.cameraPosition);
    }
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
    const socialHit = social.pick(raycaster);
    const hits = raycaster.intersectObjects(
      interactives.map((item) => item.object),
      true,
    );
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        if (object.userData.worldInteraction)
          return socialHit && socialHit.distance < hit.distance
            ? socialHit
            : (object.userData.worldInteraction as Interactive);
        object = object.parent;
      }
    }
    return socialHit;
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
      pitch = THREE.MathUtils.clamp(pitch + dy * 0.003, 0.16, 1.25);
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
      if (point && Math.hypot(point.x, point.z) < WORLD_RADIUS) {
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
    cinemaScreen.resize(Math.max(1, width), Math.max(1, height));
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    if (landmarkPose) landmarkPose = worldLandmarkPose(landmarkPose.zone, camera.aspect);
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
      const transfer = portals.step(player.group.position, time, moving && jumpHeight === 0);
      if (transfer) {
        clearInput();
        player.group.position.set(transfer.x, 0.15, transfer.z);
        player.group.rotation.y = transfer.facing;
        yaw = transfer.cameraYaw;
        pitch = 0.26;
        zoom = 1;
        landmarkPose = null;
        jumpHeight = 0;
        jumpVelocity = 0;
        cameraTarget.copy(player.group.position).setY(1.3);
        snapCamera = true;
        lastStatus = -1;
      }
      if (jumpHeight > 0 || jumpVelocity > 0) {
        jumpVelocity -= 24 * delta;
        jumpHeight = Math.max(0, jumpHeight + jumpVelocity * delta);
        if (jumpHeight === 0) jumpVelocity = 0;
      }
      const onTrampoline =
        Math.hypot(
          player.group.position.x - WORLD_ANCHORS.trampoline[0],
          player.group.position.z - WORLD_ANCHORS.trampoline[1],
        ) < 2.3;
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
    social.tick(delta, player.group.position, reducedMotion, overview);
    if (!paused) {
      bank.animate(time, reducedMotion);
      jellyfish.animate(time, delta, reducedMotion);
      planets.animate(time, delta, reducedMotion);
      runner.animate(time, delta, reducedMotion);
    }

    if (!paused && !reducedMotion) {
      orbitA.rotation.z = time * 0.2;
      orbitB.rotation.y = time * 0.17;
      floatingLeaves.forEach((leaf) => {
        leaf.object.position.y = leaf.baseY + Math.sin(time * 1.5 + leaf.phase) * 0.16;
      });
      collectibles.forEach((item, index) => {
        item.rotation.y = time + index;
        item.position.y = 1.6 + Math.sin(time * 2 + index) * 0.2;
      });
      balloon.position.y = 18 + Math.sin(time * 0.6) * 0.8;
      landmarks.animate(time, delta);
      arena.animate(time);
      surf.forEach((wave, index) => {
        const scale = 1 + Math.sin(time * 0.5 + index) * 0.009;
        wave.scale.set(scale, scale, 0.7);
      });
    }

    if (landmarkPose && !overview) desiredTarget.set(...landmarkPose.target);
    else desiredTarget.copy(overview ? new THREE.Vector3(0, 0, 0) : player.group.position).setY(overview ? 0 : 1.3);
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-delta * 4);
    cameraTarget.lerp(desiredTarget, smoothing);
    const portraitScale = camera.aspect < 1 ? 1 / camera.aspect : 1;
    const distance =
      (overview ? WORLD_DIMENSIONS.overviewDistance * portraitScale : (landmarkPose?.distance ?? 42)) * zoom;
    const far = worldCameraFar(distance);
    if (camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    // Portrait screens pull the overview camera back; keep the island in front
    // of the fog instead of fading it out at the desktop's fixed distance.
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = Math.max(155, distance + 90);
      scene.fog.far = scene.fog.near + 175;
    }
    cameraGoal
      .set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      )
      .add(cameraTarget);
    if (snapCamera || (lastStatus === -1 && time < 0.1)) camera.position.copy(cameraGoal);
    else camera.position.lerp(cameraGoal, smoothing);
    snapCamera = false;
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
      const personNearby = social.nearest(player.group.position.x, player.group.position.z, nearestDistance);
      if (personNearby) nearby = personNearby;
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
    cinemaScreen.render(camera, time);
  };
  renderer.setAnimationLoop(tick);
  options.onReady();

  return {
    travelTo,
    setSocialView(value) {
      social.setView(value);
      nearby = null;
      lastStatus = -1;
    },
    setSocialFocus(id) {
      social.setFocus(id);
    },
    travelToPerson(id) {
      const person = social.findPerson(id);
      if (!person) return;
      clearInput();
      portals.reset();
      const [x, z] = person.position;
      const spawn = resolvePosition(x, z + 4, obstacles);
      player.group.position.set(spawn.x, 0.15, spawn.z);
      player.group.rotation.y = Math.atan2(x - spawn.x, z - spawn.z);
      jumpHeight = 0;
      jumpVelocity = 0;
      enterExplore();
      lastStatus = -1;
    },
    setOverview(value) {
      if (overview !== value) {
        walkTarget = null;
        pitch = value ? 0.72 : 0.26;
      }
      if (value) landmarkPose = null;
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
    setTheaterLoading(value) {
      theater.setLoading(value);
    },
    stepTheater(delta) {
      theater.step(delta);
      lastStatus = -1;
    },
    setPersonaColor(color) {
      if (/^#[0-9a-f]{6}$/i.test(color)) player.accent.color.set(color);
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
      social.updateData(data);
      // Live follows change independently from the forest and the current show.
      if (forestTags !== data.tags || dataSource !== data.source) populateForest(data);
      if (theaterPosts !== data.trendingPosts || dataSource !== data.source) theater.updateData(data);
      forestTags = data.tags;
      theaterPosts = data.trendingPosts;
      dataSource = data.source;
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
      player.dispose();
      tether.dispose();
      social.dispose();
      jellyfish.dispose();
      planets.dispose();
      bank.dispose();
      cinemaScreen.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
