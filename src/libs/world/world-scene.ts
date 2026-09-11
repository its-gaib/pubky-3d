import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { IMAGE_MAX_DIMENSION, IMAGE_MAX_RAW_SIZE } from '@/config/images';
import { ARENA_DIMENSIONS, createArena } from '@/libs/world/world-arena';
import { createWorldAvatarImageLoader } from '@/libs/world/world-avatar-image';
import { BANK_POSITION, createBank } from '@/libs/world/world-bank';
import { createWorldHumanBurnTarget } from '@/libs/world/world-burn-escape';
import { createWorldBurning, createWorldGroupBurnTarget } from '@/libs/world/world-burning';
import { clampWorldPitch, createWorldCameraFollow, worldCameraVertical } from '@/libs/world/world-camera';
import { WORLD_ZONES } from '@/libs/world/world-catalog';
import { createChess } from '@/libs/world/world-chess';
import { createCinema } from '@/libs/world/world-cinema';
import { createCinemaScreen } from '@/libs/world/world-cinema-screen';
import { createConferences } from '@/libs/world/world-conferences';
import { getWorldDragonMouth } from '@/libs/world/world-dragon';
import { createCoastalNature, createIslandTerrain, createPathFurniture } from '@/libs/world/world-environment';
import { createWorldFireEffects } from '@/libs/world/world-fire-effects';
import {
  createWorldFlamethrower,
  FLAMETHROWER_PICKUP_DISTANCE,
  type WorldToolAction,
} from '@/libs/world/world-flamethrower';
import { createTagTree } from '@/libs/world/world-forest';
import { disposeObject, label, mesh, ring, WORLD_PALETTE } from '@/libs/world/world-geometry';
import { createHotSauce, HOT_SAUCE_HEIGHT, HOT_SAUCE_RADIUS } from '@/libs/world/world-hot-sauce';
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
import { createPersona } from '@/libs/world/world-persona';
import { createWorldPlanets } from '@/libs/world/world-planets';
import { createPortalTransit } from '@/libs/world/world-portals';
import { createGraphSculpture, createWorldBalloon, createWorldKey } from '@/libs/world/world-props';
import { createWorldShadows, worldPixelRatio } from '@/libs/world/world-render-quality';
import { createRunner } from '@/libs/world/world-runner';
import { createSatoshi } from '@/libs/world/world-satoshi';
import { createWorldStars } from '@/libs/world/world-sky';
import { createSocialPlaza } from '@/libs/world/world-social';
import { worldGrainTexture, worldPlanarUv } from '@/libs/world/world-surfaces';
import { createTether } from '@/libs/world/world-tether';
import { createTheater } from '@/libs/world/world-theater';
import { worldRideMountDistance } from '@/libs/world/world-transport-motion';
import { createWorldTransports, type WorldTransportAction } from '@/libs/world/world-transports';
import type {
  PersonaState,
  WorldController,
  WorldData,
  WorldInteraction,
  WorldOptions,
  WorldRideableId,
} from '@/libs/world/world-types';
import { createZoneGround } from '@/libs/world/world-zone-ground';

interface Interactive {
  object: THREE.Object3D;
  action: WorldInteraction | WorldTransportAction | WorldToolAction;
  title: string;
  dynamic: boolean;
}

const TREE_COLORS = ['#79A63B', '#276A55', '#976631', '#8B405D', '#5E497E', '#33887B'];

function makePath(scene: THREE.Scene, points: THREE.Vector3[], surface: THREE.Material, width = 3.2) {
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
  worldPlanarUv(geometry, 8);
  const path = mesh(scene, geometry, surface);
  path.material.side = THREE.DoubleSide;
  path.castShadow = false;
  return curve;
}

/** Browser-only scene; the UI supplies approved avatar identities through its controller. */
export function createWorld(container: HTMLElement, options: WorldOptions): WorldController {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05050A');
  scene.fog = new THREE.Fog('#05050A', 155, 330);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(worldPixelRatio(window.innerWidth, window.innerHeight, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  // A small, locally rendered light probe gives metal and glass readable reflections.
  const lightProbe = new RoomEnvironment();
  const probeGenerator = new THREE.PMREMGenerator(renderer);
  const reflectionMap = probeGenerator.fromScene(lightProbe, 0.04, 0.1, 100);
  scene.environment = reflectionMap.texture;
  scene.environmentIntensity = 0.32;
  lightProbe.dispose();
  probeGenerator.dispose();
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Pubky world. Use arrow keys or W A S D to move, Space to jump or fly up, C to fly down, E to interact, F to dance or perform a riding stunt.',
  );
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.outline = 'none';
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(40, 1, WORLD_DIMENSIONS.cameraNear, WORLD_DIMENSIONS.cameraFar);
  const ambient = new THREE.HemisphereLight('#E4EAFF', '#32312D', 1.65);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#FFF0DC', 2.45);
  const updateShadows = createWorldShadows(sun);
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#738CDB', 0.95);
  rim.position.set(35, 28, -45);
  scene.add(rim);
  const stars = createWorldStars(scene);

  const terrain = createIslandTerrain(scene);
  const { water } = terrain;

  const obstacles: WorldObstacle[] = [];
  const obstacleOwners = new WeakMap<THREE.Object3D, WorldObstacle[]>();
  const interactives: Interactive[] = [];
  let isDynamic = false;
  const register = (object: THREE.Object3D, action: Interactive['action'], title: string) => {
    interactives.push({ object, action, title, dynamic: isDynamic });
    object.userData.worldInteraction = interactives[interactives.length - 1];
  };
  const obstacle = (x: number, z: number, radius: number) => {
    const item: WorldObstacle = { x, z, radius };
    obstacles.push(item);
    const owner = scene.children.at(-1);
    if (owner) {
      const owned = obstacleOwners.get(owner) ?? [];
      owned.push(item);
      obstacleOwners.set(owner, owned);
    }
    return item;
  };
  const fire = createWorldFireEffects(scene);
  const burning = createWorldBurning({
    onIgnite({ id, bounds }) {
      fire.ignite(id, bounds);
      nearby = null;
      walkTarget = null;
      pendingRide = null;
      pendingTool = false;
      lastStatus = -1;
    },
    onUpdate: ({ id, bounds }) => fire.follow(id, bounds),
    onGone(id, event) {
      if (event.completion === 'fall') fire.remove(id);
      else fire.explode(id, event.bounds);
    },
  });
  const burnUnavailable = (id: string) => burning.isBurning(id) || burning.isGone(id);
  const objectAvailable = (object: THREE.Object3D) => {
    for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
      if (
        !parent.visible ||
        parent.userData.worldBurnPending ||
        (parent.userData.worldBurnId && burnUnavailable(parent.userData.worldBurnId))
      )
        return false;
    }
    return true;
  };
  const withFlightHeight = <T>(height: number, build: () => T) => {
    const start = obstacles.length;
    const value = build();
    for (let index = start; index < obstacles.length; index++) obstacles[index].height = height;
    return value;
  };
  const pathSamples: THREE.Vector3[] = [];
  const paving = worldGrainTexture('paving');
  const pathMaterial = new THREE.MeshStandardMaterial({
    color: '#494C50',
    roughness: 0.95,
    metalness: 0.02,
    map: paving,
    bumpMap: paving,
    bumpScale: 0.014,
  });
  const groundPoint = ([x, z]: readonly [number, number]) => new THREE.Vector3(x, 0, z);
  const addPath = (points: THREE.Vector3[]) =>
    pathSamples.push(...makePath(scene, points, pathMaterial).getSpacedPoints(35));
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
    createZoneGround(scene, zone, paving);
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
  const hotSauceApproach = groundPoint(WORLD_ANCHORS.hotSauce);
  hotSauceApproach.setLength(hotSauceApproach.length() - HOT_SAUCE_RADIUS - 1.5);
  addPath([
    groundPoint(WORLD_ANCHORS.university),
    new THREE.Vector3(-57, 0, -89),
    new THREE.Vector3(-85, 0, -97),
    hotSauceApproach,
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

  const coastalNature = withFlightHeight(9.1, () => createCoastalNature(scene, pathSamples, obstacle));
  const pathFurniture = withFlightHeight(3.2, () => createPathFurniture(scene, pathSamples, obstacle));

  const landmarks = withFlightHeight(13, () => createLandmarks(scene, register, obstacle));
  for (const item of obstacles) {
    if (Math.hypot(item.x - WORLD_ANCHORS.github[0], item.z - WORLD_ANCHORS.github[1]) < 15) item.height = 5;
  }
  const arena = withFlightHeight(14, () => createArena(scene, register, obstacle));
  const bank = withFlightHeight(10, () => createBank(scene, register, obstacle));
  withFlightHeight(HOT_SAUCE_HEIGHT, () => createHotSauce(scene, register, obstacle));
  const jellyfish = createGalacticJellyfish(scene);
  const planets = createWorldPlanets(scene);
  const cinema = withFlightHeight(40, () => createCinema(scene, register, obstacle));
  const cinemaScreen = createCinemaScreen(container, scene, cinema.screenFrame);
  const conferences = withFlightHeight(15, () =>
    createConferences(scene, WORLD_ANCHORS.conferences, register, obstacle),
  );
  const conferenceObstacles = obstacleOwners.get(conferences.group) ?? [];
  // Thin elevated panels need their own flight footprint; ground routes stay open.
  for (let index = -2; index <= 2; index++) {
    const panel: WorldObstacle = {
      x: WORLD_ANCHORS.conferences[0] + index * 4.4,
      z: WORLD_ANCHORS.conferences[1] - 4.455,
      radius: 2.22,
      minHeight: 10.1,
      height: 14.2,
    };
    obstacles.push(panel);
    conferenceObstacles.push(panel);
  }
  obstacleOwners.set(conferences.group, conferenceObstacles);
  register(conferences.group, { kind: 'zone', id: 'conferences' }, 'Discover the next Pubky conferences');
  const chess = createChess(scene, WORLD_ANCHORS.chess);
  obstacles.push(...chess.obstacles);
  obstacleOwners.set(chess.group, chess.obstacles);
  for (const item of chess.obstacles) item.height = 7;
  register(chess.group, { kind: 'zone', id: 'chess' }, 'Explore the Chess Citadel');
  register(chess.entrance, { kind: 'zone', id: 'chess' }, 'Play chess on Pubky');
  const runner = createRunner(scene, WORLD_ANCHORS.runner);
  register(runner.persona, { kind: 'fun', id: 'runner' }, 'Catch up with @halfin · mention pills');
  const portals = createPortalTransit(Math.random, (index) => !burnUnavailable(`portal:${index}`));
  const tether = withFlightHeight(12, () => createTether(scene, register, obstacle));
  withFlightHeight(12, () => createSatoshi(scene, register, obstacle));
  const theaterStart = obstacles.length;
  const theater = withFlightHeight(13, () => createTheater(scene, register, obstacle, options.data));
  for (const item of obstacles.slice(theaterStart)) if (item.radius > 1) item.height = 3;
  for (let index = -2; index <= 2; index++) {
    const panel: WorldObstacle = {
      x: WORLD_ANCHORS.theater[0] + index * 3.348,
      z: WORLD_ANCHORS.theater[1] - 3.9695,
      radius: 1.73,
      minHeight: 2.405,
      height: 12.195,
    };
    obstacles.push(panel);
    const owner = scene.children.at(-1)!;
    const owned = obstacleOwners.get(owner) ?? [];
    owned.push(panel);
    obstacleOwners.set(owner, owned);
  }
  const avatarImages = createWorldAvatarImageLoader();
  const player = createPersona('#C8FF03', avatarImages);
  player.group.position.set(0, 0.15, 24);
  scene.add(player.group);
  const playerHalo = ring(scene, 1, 0.08, '#C8FF03', [0, 0.2, 24]);
  label(player.group, 'you', [0, 3.3, 0], 2.4, '#C8FF03', '#1D1D20');

  const { group: sculpture, orbitA, orbitB } = createGraphSculpture(scene, WORLD_ANCHORS.plaza);
  label(sculpture, 'THE PUBKY GRAPH', [0, 8.5, 0], 10);
  register(sculpture, { kind: 'fun', id: 'graph' }, 'Open the Pubky Graph Explorer');
  obstacle(sculpture.position.x, sculpture.position.z, 2.5);
  obstacles[obstacles.length - 1].height = 9;

  const transports = createWorldTransports(scene, obstacles, register, player);
  const flamethrower = createWorldFlamethrower(scene, player, register, obstacles);

  let dataGroup = new THREE.Group();
  scene.add(dataGroup);
  let floatingLeaves: { object: THREE.Object3D; baseY: number; phase: number }[] = [];
  const staticObstacleCount = obstacles.length;
  let forestBurnBindings: (() => void)[] = [];

  const populateForest = (data: WorldData) => {
    forestBurnBindings.forEach((release) => release());
    forestBurnBindings = [];
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
      const leaves = createTagTree(tree, tag, color);
      label(tree, `#${tag.label}`, [0, 10, 0], 7, '#C8FF03', '#1D1D20');
      register(tree, { kind: 'tag', index: tagIndex }, `Read #${tag.label.slice(0, 24)}`);
      const trunkObstacle = obstacle(x, z, 1.1);
      trunkObstacle.height = 11;
      const treeId = `tree:${JSON.stringify(tag.label)}`;
      forestBurnBindings.push(burning.bind(createWorldGroupBurnTarget(treeId, [tree], [trunkObstacle])));
      leaves.forEach(({ object: leaf, post, postIndex }) => {
        register(leaf, { kind: 'post', tagIndex, postIndex }, `Read a post by ${post.author.slice(0, 22)}`);
        floatingLeaves.push({ object: leaf, baseY: leaf.position.y, phase: tagIndex + postIndex });
        forestBurnBindings.push(
          burning.bind(
            createWorldGroupBurnTarget(`forest-post:${JSON.stringify([tag.label, post.id])}`, [leaf], [], {
              parentId: treeId,
            }),
          ),
        );
      });
    });
    isDynamic = false;
  };
  populateForest(options.data);
  const social = createSocialPlaza(scene, options.data, avatarImages, burning);
  let forestTags = options.data.tags;
  let theaterPosts = options.data.trendingPosts;
  let dataSource = options.data.source;

  // Local collectibles are clearly game props, with no token or monetary semantics.
  const collectibles: THREE.Group[] = [];
  for (let i = 0; i < 8; i++) {
    const collectible = createWorldKey();
    const angle = (i / 8) * Math.PI * 2;
    collectible.position.set(Math.sin(angle) * 27, 1.6, Math.cos(angle) * 27 + 5);
    scene.add(collectible);
    collectibles.push(collectible);
  }

  const balloon = createWorldBalloon(scene, WORLD_ANCHORS.balloon);

  const theaterHumans = theater.spectators.map(({ group, setEscapePose }, index) =>
    createWorldHumanBurnTarget(`human:theater:${index}`, group, scene, setEscapePose),
  );
  const arenaHumans = arena.gladiators.map(({ group, setEscapePose }, index) =>
    createWorldHumanBurnTarget(`human:arena:${index}`, group, scene, setEscapePose),
  );
  const sceneryHumans = [runner.burnTarget, ...theaterHumans, ...arenaHumans];
  const pendingHumanBurns = new Set<(typeof sceneryHumans)[number]>();
  for (const target of sceneryHumans) burning.bind(target);
  const igniteSceneryHuman = (target: (typeof sceneryHumans)[number]) => {
    if (burning.isGone(target.id) || burning.isBurning(target.id)) return;
    // Detach even when all flame slots are occupied, so the building cannot
    // take a person into its explosion. Only this fixed scenery cast can wait.
    target.onIgnite?.();
    if (!burning.ignite(target.id)) pendingHumanBurns.add(target);
  };

  // Each landmark owns its visual subtree and the exact collision objects built with it.
  const staticRoots = new Map<THREE.Object3D, string>();
  for (const item of interactives) {
    if (item.dynamic || item.action.kind === 'transport' || item.action.kind === 'tool') continue;
    let root = item.object;
    while (root.parent && root.parent !== scene) root = root.parent;
    const action = item.action;
    const id =
      action.kind === 'portal'
        ? `portal:${action.index}`
        : action.kind === 'zone' || action.kind === 'fun'
          ? `${action.kind}:${action.id}`
          : null;
    if (id) staticRoots.set(root, id);
  }
  for (const [root, id] of staticRoots) {
    const stopCinema = id === 'zone:cinema' ? () => cinemaScreen.dispose() : undefined;
    burning.bind(
      createWorldGroupBurnTarget(id, [root], obstacleOwners.get(root), {
        onIgnite() {
          stopCinema?.();
          if (id === 'fun:runner') igniteSceneryHuman(runner.burnTarget);
          if (id === 'zone:theater') theaterHumans.forEach(igniteSceneryHuman);
          if (id === 'zone:arena') arenaHumans.forEach(igniteSceneryHuman);
        },
        onGone: stopCinema,
      }),
    );
  }
  for (const target of [...coastalNature.burnTargets, ...pathFurniture.burnTargets]) burning.bind(target);
  collectibles.forEach((root, index) => burning.bind(createWorldGroupBurnTarget(`key:${index}`, [root])));
  burning.bind(createWorldGroupBurnTarget('prop:balloon', [balloon]));
  for (const target of jellyfish.burnTargets) burning.bind(target);
  planets.group.children.forEach((root, index) => burning.bind(createWorldGroupBurnTarget(`planet:${index}`, [root])));
  for (const item of transports.burnEntries) {
    const unavailable = () => transports.setAvailable(item.id, false);
    burning.bind(
      createWorldGroupBurnTarget(`ride:${item.id}`, [item.model], [item.obstacle], {
        canIgnite: () => transports.active?.id !== item.id,
        onIgnite: unavailable,
        onGone: unavailable,
      }),
    );
  }
  burning.bind(
    createWorldGroupBurnTarget('tool:flamethrower', [flamethrower.model], [flamethrower.obstacle], {
      canIgnite: () => !flamethrower.equipped,
      onIgnite: () => flamethrower.setAvailable(false),
      onGone: () => flamethrower.setAvailable(false),
    }),
  );

  const keys = new Set<string>();
  const touch = { x: 0, z: 0, lift: 0 };
  let pointerFiring = false;
  let buttonFiring = false;
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
  let pendingRide: WorldRideableId | null = null;
  let pendingTool = false;
  let animation: PersonaState['animation'] = 'idle';
  let capturingPhoto = false;
  let landmarkPose: ReturnType<typeof worldLandmarkPose> | null = null;
  const cameraTarget = new THREE.Vector3(0, 0, 0);
  const cameraGoal = new THREE.Vector3();
  const cameraFollow = createWorldCameraFollow();
  const desiredTarget = new THREE.Vector3();
  const tempPosition = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const fireOrigin = new THREE.Vector3();
  const fireDirection = new THREE.Vector3();
  const weaponExclusions = new Set(['tool:flamethrower']);
  const dragonExclusions = new Set(['ride:dragon']);

  const clearInput = () => {
    cameraFollow.reset();
    keys.clear();
    touch.x = 0;
    touch.z = 0;
    touch.lift = 0;
    walkTarget = null;
    pendingRide = null;
    pendingTool = false;
    pointerFiring = buttonFiring = false;
    flamethrower.clearInput();
    transports.clearInput();
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
    if (paused) return;
    if (transports.active) transports.jump();
    else if (jumpHeight === 0) jumpVelocity = 10;
  };
  const dance = () => {
    if (!paused && !transports.active && !flamethrower.equipped) danceUntil = time + 4;
  };
  const stunt = () => {
    if (!paused && transports.stunt()) lastStatus = -1;
  };
  const mountRide = (id: WorldRideableId) => {
    if (jumpHeight > 0.1 || jumpVelocity > 0) return false;
    if (!transports.isAvailable(id)) return false;
    if (flamethrower.equipped && !flamethrower.drop()) return false;
    if (!transports.mount(id)) return false;
    clearInput();
    enterExplore();
    jumpHeight = jumpVelocity = 0;
    danceUntil = 0;
    lastStatus = -1;
    return true;
  };
  const dispatch = (action: Interactive['action']) => {
    const represented = interactives.filter((item) => item.action === action);
    if (represented.length && !represented.some((item) => objectAvailable(item.object))) return;
    if (action.kind === 'tool') {
      if (transports.active || jumpHeight > 0.1) return;
      if (flamethrower.equipped) flamethrower.drop();
      else if (!flamethrower.equip()) {
        if (objectAvailable(flamethrower.model)) {
          walkTarget = flamethrower.model.getWorldPosition(new THREE.Vector3()).setY(0);
          pendingTool = true;
          enterExplore();
        }
        return;
      }
      clearInput();
      danceUntil = 0;
      enterExplore();
      lastStatus = -1;
      return;
    }
    if (action.kind === 'transport') {
      const previous = transports.active?.id;
      if (previous) {
        if (!transports.dismount()) return;
        clearInput();
        lastStatus = -1;
        if (previous === action.id) return;
      }
      if (!mountRide(action.id)) {
        const item = interactives.find((item) => item.action.kind === 'transport' && item.action.id === action.id);
        if (item) {
          walkTarget = item.object.getWorldPosition(new THREE.Vector3()).setY(0);
          pendingRide = action.id;
          enterExplore();
        }
      }
      return;
    }
    if (action.kind === 'fun' && action.id === 'trampoline') {
      if (transports.active) transports.jump();
      else jumpVelocity = 20;
    }
    options.onInteract(action);
  };
  const interact = () => {
    if (paused) return;
    if (transports.active) {
      if (transports.dismount()) clearInput();
      lastStatus = -1;
      return;
    }
    if (flamethrower.equipped) {
      flamethrower.drop();
      clearInput();
      lastStatus = -1;
      return;
    }
    if (nearby) dispatch(nearby.action);
  };
  const travelTo: WorldController['travelTo'] = (id, travelOptions) => {
    const zone = WORLD_ZONES.find((value) => value.id === id);
    if (!zone) return;
    transports.reset();
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
      'KeyC',
      'KeyB',
    ];
    if (!handled.includes(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    if (!event.repeat) {
      if (event.code === 'Space') jump();
      if (event.code === 'KeyE') interact();
      if (event.code === 'KeyF') {
        if (transports.active) stunt();
        else dance();
      }
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
      interactives.filter((item) => objectAvailable(item.object)).map((item) => item.object),
      true,
    );
    for (const hit of hits) {
      if (!objectAvailable(hit.object)) continue;
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
    if (paused || (event.button !== 0 && !(flamethrower.equipped && event.button === 2))) return;
    renderer.domElement.focus({ preventScroll: true });
    drag = { x: event.clientX, y: event.clientY, distance: 0, id: event.pointerId };
    renderer.domElement.setPointerCapture(event.pointerId);
    if (flamethrower.equipped && event.button === 0) {
      pointerFiring = true;
      enterExplore();
    }
  };
  const pointerMove = (event: PointerEvent) => {
    if (paused) return;
    if (drag && drag.id === event.pointerId) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.distance += Math.abs(dx) + Math.abs(dy);
      const turn = -dx * 0.004;
      yaw += turn;
      cameraFollow.orbit(turn);
      pitch = clampWorldPitch(pitch + dy * 0.003, overview);
      drag.x = event.clientX;
      drag.y = event.clientY;
    } else if (event.pointerType === 'mouse') {
      pointRay(event);
      renderer.domElement.style.cursor = flamethrower.equipped ? 'crosshair' : pick() ? 'pointer' : 'grab';
    }
  };
  const pointerUp = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const clicked = drag.distance < 7 && !paused && !flamethrower.equipped;
    if (drag.distance >= 7) cameraFollow.orbit();
    drag = null;
    pointerFiring = false;
    if (renderer.domElement.hasPointerCapture(event.pointerId))
      renderer.domElement.releasePointerCapture(event.pointerId);
    if (!clicked) return;
    pointRay(event);
    const selected = pick();
    if (selected) dispatch(selected.action);
    else {
      const point = raycaster.ray.intersectPlane(ground, new THREE.Vector3());
      if (point && Math.hypot(point.x, point.z) < WORLD_RADIUS) {
        pendingRide = null;
        walkTarget = point;
        enterExplore();
      }
    }
  };
  const pointerCancel = () => {
    if (drag?.distance) cameraFollow.orbit();
    drag = null;
    pointerFiring = false;
  };
  const contextMenu = (event: MouseEvent) => {
    if (flamethrower.equipped) event.preventDefault();
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
  renderer.domElement.addEventListener('lostpointercapture', pointerCancel);
  renderer.domElement.addEventListener('contextmenu', contextMenu);
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setPixelRatio(worldPixelRatio(width, height, window.devicePixelRatio));
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
    if (!burnUnavailable('zone:theater') && theater.tick(Math.min(elapsed, 1))) lastStatus = -1;
    if (!paused) time += delta;
    const previousPlayerX = player.group.position.x;
    const previousPlayerZ = player.group.position.z;
    let moving = false;
    if (!paused) {
      const inputX =
        Number(keys.has('KeyD') || keys.has('ArrowRight')) -
        Number(keys.has('KeyA') || keys.has('ArrowLeft')) +
        touch.x;
      const inputZ =
        Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) + touch.z;
      let rideX = inputX;
      let rideZ = inputZ;
      const movementYaw = cameraFollow.movementYaw(yaw, inputX, inputZ);
      let step = movementStep(inputX, inputZ, movementYaw, delta, keys.has('ShiftLeft') || keys.has('ShiftRight'));
      if (inputX || inputZ) {
        enterExplore();
        walkTarget = null;
        pendingRide = null;
        pendingTool = false;
      }
      if (pendingRide && transports.isAvailable(pendingRide)) mountRide(pendingRide);
      if (pendingTool && jumpHeight < 0.1 && !transports.active && flamethrower.equip()) {
        clearInput();
        enterExplore();
        lastStatus = -1;
      }
      if (walkTarget) {
        const dx = walkTarget.x - player.group.position.x;
        const dz = walkTarget.z - player.group.position.z;
        const length = Math.hypot(dx, dz);
        if (length < 0.6) walkTarget = null;
        else {
          step = { x: (dx / length) * delta * 8, z: (dz / length) * delta * 8 };
          rideX = (dx * Math.cos(movementYaw) - dz * Math.sin(movementYaw)) / length;
          rideZ = (dz * Math.cos(movementYaw) + dx * Math.sin(movementYaw)) / length;
        }
      }
      moving = Math.hypot(step.x, step.z) > 0.001;
      if (transports.active) {
        const lift = Number(keys.has('Space')) - Number(keys.has('KeyC')) + touch.lift;
        if (lift) enterExplore();
        transports.step(delta, {
          x: rideX,
          z: rideZ,
          yaw: movementYaw,
          lift,
          brake: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        });
        const activeRide = transports.active;
        if (!activeRide) clearInput();
        moving = !!activeRide && Math.hypot(activeRide.velocityX, activeRide.velocityZ) > 0.05;
      } else if (moving) {
        const position = resolvePosition(player.group.position.x + step.x, player.group.position.z + step.z, obstacles);
        player.group.position.x = position.x;
        player.group.position.z = position.z;
        const targetAngle = Math.atan2(step.x, step.z);
        player.group.rotation.y +=
          Math.atan2(Math.sin(targetAngle - player.group.rotation.y), Math.cos(targetAngle - player.group.rotation.y)) *
          Math.min(1, delta * 14);
      }
      const grounded = transports.active
        ? transports.active.altitude < 0.01 && transports.active.velocityY === 0
        : jumpHeight === 0;
      const transfer = portals.step(player.group.position, time, moving && grounded);
      if (transfer) {
        clearInput();
        player.group.position.set(transfer.x, 0.15, transfer.z);
        player.group.rotation.y = transfer.facing;
        transports.transfer(transfer.x, transfer.z, transfer.facing);
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
      if (!transports.active && (jumpHeight > 0 || jumpVelocity > 0)) {
        jumpVelocity -= 24 * delta;
        jumpHeight = Math.max(0, jumpHeight + jumpVelocity * delta);
        if (jumpHeight === 0) jumpVelocity = 0;
      }
      const onTrampoline =
        Math.hypot(
          player.group.position.x - WORLD_ANCHORS.trampoline[0],
          player.group.position.z - WORLD_ANCHORS.trampoline[1],
        ) < 2.3;
      if (onTrampoline && moving && !burnUnavailable('fun:trampoline')) {
        if (transports.active) transports.jump();
        else if (jumpHeight === 0) jumpVelocity = 18;
      }
      collectibles.forEach((item, index) => {
        if (
          !burnUnavailable(`key:${index}`) &&
          item.visible &&
          Math.abs(item.position.y - (player.group.position.y + 1)) < 2 &&
          Math.hypot(item.position.x - player.group.position.x, item.position.z - player.group.position.z) < 1.8
        ) {
          item.visible = false;
          collected++;
        }
      });
    }
    const ride = transports.active;
    animation = ride
      ? ride.altitude > 0.12
        ? 'jump'
        : moving
          ? 'walk'
          : 'idle'
      : jumpHeight > 0
        ? 'jump'
        : moving
          ? 'walk'
          : danceUntil > time
            ? 'dance'
            : 'idle';
    const dancing = animation === 'dance';
    transports.animate(paused ? 0 : delta, time, reducedMotion);
    if (flamethrower.equipped && !ride && !paused) player.group.rotation.y = yaw + Math.PI;
    player.setToolPose(flamethrower.equipped && !ride ? pitch - 0.26 : null);
    player.animate(time, animation, reducedMotion);
    if (!ride)
      player.group.position.y =
        0.15 + jumpHeight + (!reducedMotion && dancing ? Math.abs(Math.sin(time * 8)) * 0.4 : 0);
    if (dancing && !reducedMotion) player.group.rotation.y += delta * 3;
    playerHalo.position.set(player.group.position.x, 0.23, player.group.position.z);
    social.tick(paused ? 0 : delta, player.group.position, reducedMotion, overview);
    if (!paused) {
      if (!burnUnavailable('fun:bank')) bank.animate(time, reducedMotion);
      jellyfish.animate(time, delta, reducedMotion);
      planets.animate(time, delta, reducedMotion);
      if (!burnUnavailable('fun:runner')) runner.animate(time, delta, reducedMotion);
      conferences.animate(time, delta, reducedMotion);
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
      terrain.animate(time);
    }

    yaw = cameraFollow.step({
      yaw,
      deltaX: player.group.position.x - previousPlayerX,
      deltaZ: player.group.position.z - previousPlayerZ,
      seconds: delta,
      enabled:
        !paused && !overview && !landmarkPose && !drag && !flamethrower.equipped && !reducedMotion && !snapCamera,
    });
    if (landmarkPose && !overview) desiredTarget.set(...landmarkPose.target);
    else
      desiredTarget
        .copy(overview ? new THREE.Vector3(0, 0, 0) : player.group.position)
        .setY(
          overview
            ? 0
            : ride
              ? player.group.position.y + 1.15
              : flamethrower.equipped
                ? player.group.position.y + 1.55
                : 1.3,
        );
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-delta * 4);
    cameraTarget.lerp(desiredTarget, smoothing);
    const portraitScale = camera.aspect < 1 ? 1 / camera.aspect : 1;
    const distance =
      (overview
        ? WORLD_DIMENSIONS.overviewDistance * portraitScale
        : (landmarkPose?.distance ?? (flamethrower.equipped ? 20 : 42))) * zoom;
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
    const vertical = worldCameraVertical(pitch, distance, cameraTarget.y);
    cameraGoal
      .set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        vertical.height - cameraTarget.y,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      )
      .add(cameraTarget);
    if (snapCamera || (lastStatus === -1 && time < 0.1)) camera.position.copy(cameraGoal);
    else camera.position.lerp(cameraGoal, smoothing);
    snapCamera = false;
    camera.lookAt(cameraTarget.x, cameraTarget.y + vertical.lookLift, cameraTarget.z);

    flamethrower.setFiring(!paused && !overview && !ride && (pointerFiring || buttonFiring || keys.has('KeyB')));
    if (!paused) {
      if (flamethrower.isFiring && flamethrower.getNozzle(fireOrigin, fireDirection)) {
        fire.emitStream(fireOrigin, fireDirection, 1, 'weapon');
        burning.expose({
          origin: fireOrigin,
          direction: fireDirection,
          range: 22,
          halfAngle: 0.14,
          seconds: delta,
          excludeIds: weaponExclusions,
        });
      }
      if (
        ride?.id === 'dragon' &&
        ride.stuntProgress !== null &&
        ride.stuntProgress >= 0.08 &&
        ride.stuntProgress <= 0.85
      ) {
        const model = transports.getModel('dragon');
        const mouth = model && getWorldDragonMouth(model);
        if (mouth) {
          mouth.updateWorldMatrix(true, false);
          mouth.getWorldPosition(fireOrigin);
          fireDirection.set(0, 0, 1).transformDirection(mouth.matrixWorld);
          fire.emitStream(fireOrigin, fireDirection, 1.25, 'dragon');
          burning.expose({
            origin: fireOrigin,
            direction: fireDirection,
            range: 32,
            halfAngle: 0.19,
            seconds: delta,
            excludeIds: dragonExclusions,
          });
        }
      }
    }
    if (!paused)
      for (const target of pendingHumanBurns)
        if (burning.isGone(target.id) || burning.ignite(target.id)) pendingHumanBurns.delete(target);
    burning.tick(paused ? 0 : delta, reducedMotion);
    fire.tick(paused ? 0 : delta, time, camera, reducedMotion);

    if (time - lastStatus > 0.2 || lastStatus === -1) {
      lastStatus = time;
      let nearestDistance = 7;
      nearby = null;
      for (const item of interactives) {
        if (!objectAvailable(item.object)) continue;
        if (ride && (item.action.kind === 'transport' || ride.altitude > 0.7)) continue;
        item.object.getWorldPosition(tempPosition);
        const distanceTo = Math.hypot(
          tempPosition.x - player.group.position.x,
          tempPosition.z - player.group.position.z,
        );
        if (
          distanceTo < nearestDistance &&
          (item.action.kind !== 'tool' || distanceTo <= FLAMETHROWER_PICKUP_DISTANCE) &&
          (item.action.kind !== 'transport' || distanceTo <= worldRideMountDistance(item.action.id))
        ) {
          nearby = item;
          nearestDistance = distanceTo;
        }
      }
      const personNearby =
        !ride || ride.altitude < 0.7
          ? social.nearest(player.group.position.x, player.group.position.z, nearestDistance)
          : null;
      if (personNearby) nearby = personNearby;
      const zone = WORLD_ZONES.reduce((nearest, candidate) =>
        Math.hypot(candidate.position[0] - player.group.position.x, candidate.position[1] - player.group.position.z) <
        Math.hypot(nearest.position[0] - player.group.position.x, nearest.position[1] - player.group.position.z)
          ? candidate
          : nearest,
      );
      renderer.domElement.setAttribute(
        'aria-label',
        ride?.id === 'dragon'
          ? 'Pubky world. The dragon flies itself. F to roll and breathe fire, E to land and get off. Drag to orbit.'
          : flamethrower.equipped
            ? 'Pubky world. W A S D or arrows to move. Drag to aim, hold mouse or B to fire, E to drop the flamethrower.'
            : 'Pubky world. W A S D or arrows to move, Space to jump or fly up, C to fly down, E to interact, F to dance or perform a riding stunt.',
      );
      options.onStatus({
        zone: zone.id,
        position: [player.group.position.x, player.group.position.z],
        nearby: ride
          ? ride.altitude > 0.12
            ? 'Land to step off'
            : `Get off ${transports.getStatus()?.name}`
          : (nearby?.title ?? null),
        ride: transports.getStatus(),
        tool: flamethrower.equipped ? { id: 'flamethrower', firing: flamethrower.isFiring } : null,
        collected,
        ...theater.getStatus(),
      });
    }
    updateShadows(cameraTarget, overview);
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
      transports.reset();
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
      if (value) clearInput();
      if (overview !== value) {
        walkTarget = null;
        pendingRide = null;
        pitch = value ? 0.72 : 0.26;
      }
      if (value) landmarkPose = null;
      overview = value;
      zoom = 1;
    },
    setChessGame(game) {
      if (!burnUnavailable('zone:chess')) chess.setGame(game);
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
      ambient.intensity = value ? 1.2 : 1.65;
      sun.intensity = value ? 1.3 : 2.45;
      sun.color.set(value ? '#B7C7F1' : '#FFF0DC');
      rim.intensity = value ? 1.4 : 0.95;
      scene.environmentIntensity = value ? 0.24 : 0.32;
      pathFurniture.setNight(value);
      stars.setNight(value);
      (water.material as THREE.MeshStandardMaterial).color.set(value ? '#080F1D' : '#112027');
    },
    setReducedMotion(value) {
      reducedMotion = value;
      if (value) {
        theater.setPaused(true);
        lastStatus = -1;
      }
    },
    setTheaterPaused(value) {
      if (burnUnavailable('zone:theater')) return;
      theater.setPaused(value);
      lastStatus = -1;
    },
    setTheaterLoading(value) {
      theater.setLoading(value);
    },
    stepTheater(delta) {
      if (burnUnavailable('zone:theater')) return;
      theater.step(delta);
      lastStatus = -1;
    },
    setAvatarIdentities(viewer, people) {
      if (disposed) return;
      player.setAvatarIdentity(viewer);
      social.setAvatarIdentities(people);
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
    setRideLift(value) {
      touch.lift = !paused && (value === -1 || value === 1) ? value : 0;
    },
    setFiring(value) {
      buttonFiring = value === true && !paused && flamethrower.equipped && !transports.active;
      if (buttonFiring) enterExplore();
    },
    stunt,
    jump,
    dance,
    interact,
    async capturePhoto() {
      if (disposed || capturingPhoto) return null;
      clearInput();
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
      renderer.domElement.removeEventListener('lostpointercapture', pointerCancel);
      renderer.domElement.removeEventListener('contextmenu', contextMenu);
      renderer.domElement.removeEventListener('wheel', wheel);
      landmarks.dispose();
      burning.dispose();
      pendingHumanBurns.clear();
      fire.dispose();
      flamethrower.dispose();
      transports.dispose();
      player.dispose();
      tether.dispose();
      social.dispose();
      avatarImages.dispose();
      jellyfish.dispose();
      planets.dispose();
      bank.dispose();
      conferences.dispose();
      chess.dispose();
      cinemaScreen.dispose();
      terrain.dispose();
      coastalNature.dispose();
      pathFurniture.dispose();
      disposeObject(scene);
      reflectionMap.dispose();
      sun.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
