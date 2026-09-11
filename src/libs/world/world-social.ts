import * as THREE from 'three';
import { createWorldAvatarAtlas } from '@/libs/world/world-avatar-atlas';
import { createWorldPortraitGeometry, createWorldPortraitMaterial } from '@/libs/world/world-avatar-head';
import type { createWorldAvatarImageLoader } from '@/libs/world/world-avatar-image';
import { createWorldBurnEscape } from '@/libs/world/world-burn-escape';
import {
  type createWorldBurning,
  createWorldGroupBurnTarget,
  WORLD_BURN_LIMITS,
  type WorldBurnTarget,
} from '@/libs/world/world-burning';
import { disposeObject, WORLD_PALETTE } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import { createSocialClusterSculpture } from '@/libs/world/world-social-cluster';
import {
  layoutSocialPeople,
  resolveSocialView,
  SOCIAL_PAGE_SIZE,
  SOCIAL_SECTOR_COUNT,
  type SocialPersonPlacement,
  socialSectorCountLabel,
  socialSectorPreview,
  socialSectorRepresentatives,
  socialSectors,
  socialViewForPerson,
} from '@/libs/world/world-social-layout';
import {
  createSocialPersonBatches,
  type SocialPersonAppearance,
  socialPersonAppearance,
} from '@/libs/world/world-social-people';
import type { WorldAvatarIdentity, WorldData, WorldInteraction, WorldSocialView } from '@/libs/world/world-types';

const INSTANCE_CAPACITY = SOCIAL_PAGE_SIZE * 2;
// A complete new page always fits beside every retained runner.
const ESCAPE_CAPACITY = INSTANCE_CAPACITY - SOCIAL_PAGE_SIZE;
const NAME_COUNT = 10;
const EDGE_CAPACITY = 256;
const EDGE_STEPS = 12;

interface AnimatedPerson {
  placement: SocialPersonPlacement;
  anchor: THREE.Object3D;
  scale: number;
  targetScale: number;
  appearance: SocialPersonAppearance;
  matrix: THREE.Matrix4;
  headMatrix: THREE.Matrix4;
  hidden: boolean;
  detached: boolean;
  escape?: {
    path: ReturnType<typeof createWorldBurnEscape>;
    elapsed: number;
    resumedAt: number;
    registered: boolean;
    yaw: number;
    stride: number;
    falling: boolean;
    reducedMotion: boolean;
  };
  burnParent?: string;
  unbindBurn?: () => void;
  slots: { object: THREE.InstancedMesh; index: number; head: boolean; ground?: boolean }[];
}

/** Shared GPU limb poses preserve the fixed batches instead of allocating a rig per fleeing person. */
function prepareRunningBatch(object: THREE.InstancedMesh, capacity: number) {
  const limbs = ['body', 'neck-hands', 'trousers', 'sneaker-uppers', 'sneaker-soles-laces', 'outfit-accents'];
  if (!limbs.some((name) => object.name === `social-${name}`)) return null;
  const run = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
  object.geometry.setAttribute('socialRun', run);
  const positions = object.geometry.getAttribute('position');
  // x = limb weight, y = elbow/knee weight, z = side, w = arm (1) or leg (-1).
  const joints = new Float32Array(positions.count * 4);
  for (let vertex = 0; vertex < positions.count; vertex++) {
    const x = positions.getX(vertex);
    const y = positions.getY(vertex);
    const arm = object.name === 'social-body' || object.name === 'social-neck-hands';
    let weight = 0;
    if (arm)
      weight = THREE.MathUtils.smoothstep(Math.abs(x), 0.32, 0.46) * (1 - THREE.MathUtils.smoothstep(y, 1.97, 2.08));
    else if (y < 1.4) weight = 1 - THREE.MathUtils.smoothstep(y, 1.15, 1.4);
    joints[vertex * 4] = weight;
    joints[vertex * 4 + 1] = 1 - THREE.MathUtils.smoothstep(y, arm ? 1.5 : 0.72, arm ? 1.7 : 0.83);
    joints[vertex * 4 + 2] = x < 0 ? -1 : 1;
    joints[vertex * 4 + 3] = arm ? 1 : -1;
  }
  object.geometry.setAttribute('socialJoint', new THREE.BufferAttribute(joints, 4));
  const declarations = `
attribute vec2 socialRun;
attribute vec4 socialJoint;
vec3 socialRotateX(vec3 value, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(value.x, c * value.y - s * value.z, s * value.y + c * value.z);
}
vec3 socialRunPose(vec3 value, bool normal) {
  float weight = socialJoint.x * socialRun.y;
  if (weight <= 0.0) return value;
  bool arm = socialJoint.w > 0.0;
  float swing = socialRun.x * socialJoint.z;
  float angle = arm ? swing * 0.68 : -swing * 0.78;
  float bend = arm ? -0.82 + swing * 0.22 : 0.28 + max(0.0, -swing) * 0.92;
  vec3 result = value;
  vec3 joint = vec3(socialJoint.z * (arm ? 0.55 : 0.215), arm ? 1.62 : 0.79, 0.0);
  vec3 pivot = vec3(socialJoint.z * (arm ? 0.435 : 0.185), arm ? 1.985 : 1.28, 0.0);
  if (!normal) result -= joint;
  result = socialRotateX(result, bend * socialJoint.y);
  if (!normal) result += joint - pivot;
  result = socialRotateX(result, angle);
  if (!normal) result += pivot;
  return mix(value, result, weight);
}
`;
  function attach(material: THREE.Material) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${declarations}`)
        .replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\nobjectNormal = socialRunPose(objectNormal, true);',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\ntransformed = socialRunPose(transformed, false);',
        );
    };
    material.customProgramCacheKey = () => 'social-running-limbs-v1';
  }
  (Array.isArray(object.material) ? object.material : [object.material]).forEach(attach);
  const depth = object.castShadow ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }) : null;
  if (depth) {
    attach(depth);
    object.customDepthMaterial = depth;
  }
  return { run, depth };
}

interface SocialHit {
  object: THREE.Object3D;
  action: WorldInteraction;
  title: string;
  dynamic: boolean;
  distance: number;
}

interface SocialEdge {
  from: string | null;
  to: string;
}

function textCard(parent: THREE.Object3D, width: number, sectorCard = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = sectorCard ? 272 : 128;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, fog: false, toneMapped: false }),
  );
  sprite.scale.set(width, (width * canvas.height) / canvas.width, 1);
  sprite.renderOrder = 5;
  parent.add(sprite);
  let previous = '';
  return {
    sprite,
    write(title: string, detail = '', direct = true, preview = '') {
      const key = `${title}\n${detail}\n${direct}\n${preview}`;
      if (!context || key === previous) return;
      previous = key;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = WORLD_PALETTE.surface;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = direct ? WORLD_PALETTE.lime : '#B8B8C5';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = '600 40px sans-serif';
      context.fillText(title.slice(0, 48), 320, sectorCard ? 51 : 67, 594);
      if (sectorCard) {
        context.fillStyle = WORLD_PALETTE.text;
        context.font = '600 30px sans-serif';
        context.fillText(preview.slice(0, 80), 320, 132, 594);
        context.fillStyle = WORLD_PALETTE.text;
        context.font = '500 28px sans-serif';
        context.fillText(detail.slice(0, 64), 320, 219, 594);
      }
      texture.needsUpdate = true;
    },
  };
}

/** A bounded render window; only controller-approved identities can request a profile texture. */
export function createSocialPlaza(
  scene: THREE.Scene,
  initialData: WorldData,
  imageLoader?: ReturnType<typeof createWorldAvatarImageLoader>,
  burning?: ReturnType<typeof createWorldBurning>,
) {
  const root = new THREE.Group();
  root.name = 'world-social';
  scene.add(root);
  let data = initialData;
  let view: WorldSocialView = { sector: null, page: 0 };
  let focus: string | null = null;
  let clustered = false;
  let dirty = true;
  let labelElapsed = 1;
  let disposed = false;
  let reduceMotion = false;
  let placements = new Map<string, SocialPersonPlacement>();
  const people = new Map<string, AnimatedPerson>();
  let personParents = new Map<string, string>();
  const burnedParents = new Map<string, string>();
  const burnMatrix = new THREE.Matrix4();
  const burnBounds = new THREE.Box3();
  const burnHits: THREE.Intersection[] = [];
  const emptyMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  let instances: AnimatedPerson[] = [];
  let edges: SocialEdge[] = [];
  const clusterConnections = new Set<number>();
  let sectorByPerson = new Map<string, number>();
  const rootPosition = new THREE.Vector3(WORLD_ANCHORS.plaza[0], 4.6, WORLD_ANCHORS.plaza[1]);
  const transform = new THREE.Object3D();
  const { batches: parts, body, head, pedestal } = createSocialPersonBatches(root, INSTANCE_CAPACITY);
  const runningBatches = new Map(
    parts.flatMap(({ object }) => {
      const running = prepareRunningBatch(object, INSTANCE_CAPACITY);
      return running ? [[object, running] as const] : [];
    }),
  );

  const burnProxy = new THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>(
    body.geometry,
    body.material,
  );
  const personBurnId = (id: string) => `social-person:${id}`;
  const sectorBurnId = (key: string) => `social-sector:${key}`;
  const parentBurnId = (id: string) => burnedParents.get(id) ?? personParents.get(id);
  function personGone(id: string) {
    if (burning?.isGone(personBurnId(id))) return true;
    // A runner has its own lifetime, including while waiting for a bounded flame slot.
    const entry = people.get(id);
    if (entry?.escape && !entry.hidden) return false;
    const parent = parentBurnId(id);
    return Boolean(entry?.hidden || (parent && burning?.isGone(parent)));
  }
  function personUnavailable(id: string) {
    const parent = parentBurnId(id);
    return (
      personGone(id) ||
      Boolean(people.get(id)?.escape || burning?.isBurning(personBurnId(id)) || (parent && burning?.isBurning(parent)))
    );
  }
  function sectorUnavailable(key: string) {
    return Boolean(burning?.isGone(sectorBurnId(key)) || burning?.isBurning(sectorBurnId(key)));
  }
  function availableEscapeSlots() {
    let escaping = 0;
    for (const entry of people.values()) if (entry.escape && !entry.hidden) escaping++;
    return Math.max(0, ESCAPE_CAPACITY - escaping);
  }

  let approvedIdentities = new Map<string, WorldAvatarIdentity>();
  const atlas = createWorldAvatarAtlas(imageLoader, {
    capacity: INSTANCE_CAPACITY,
    zoom: 1.2,
    onChange: () => {
      dirty = true;
    },
  });
  const portraitGeometry = createWorldPortraitGeometry().translate(0, 2.55, 0);
  const portraitTiles = new THREE.InstancedBufferAttribute(new Float32Array(INSTANCE_CAPACITY * 4), 4).setUsage(
    THREE.DynamicDrawUsage,
  );
  portraitGeometry.setAttribute('avatarTile', portraitTiles);
  const portraits = new THREE.InstancedMesh(
    portraitGeometry,
    createWorldPortraitMaterial(atlas.texture, true),
    INSTANCE_CAPACITY,
  );
  portraits.name = 'social-profile-portraits';
  portraits.count = 0;
  portraits.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(portraits);
  const portraitSectorInstances: number[] = [];
  const portraitHeadOffset = new THREE.Matrix4().makeTranslation(0, -2.55, 0);
  const rootInverse = new THREE.Matrix4();
  const clusterHeadMatrix = new THREE.Matrix4();

  const names = Array.from({ length: NAME_COUNT }, () => textCard(root, 5));
  names.forEach((name) => {
    name.sprite.visible = false;
  });

  const emptySector = socialSectors([])[0];
  const clusterSculpture = createSocialClusterSculpture(new THREE.Group());
  // Geometry has a fixed maximum pool even when there are only one or two tag neighborhoods.
  const clusters = Array.from({ length: SOCIAL_SECTOR_COUNT }, (_, index) => {
    const sector = emptySector;
    const group = new THREE.Group();
    group.name = `social-sector-${index}`;
    group.position.set(sector.position[0], 0.2, sector.position[1]);
    root.add(group);
    // Identical community markers share their geometry and material across sectors.
    const base = clusterSculpture.base.clone();
    const prominent = clusterSculpture.prominent.clone(true);
    const satellites = clusterSculpture.satellites.clone(true);
    const heads = [
      prominent.getObjectByName('community-central-head')!,
      ...Array.from(
        { length: 3 },
        (_, satellite) => satellites.getObjectByName(`community-satellite-head-${satellite}`)!,
      ),
    ].map((anchor) => ({
      anchor,
      mask: anchor.getObjectByName('community-anonymous-mask')!,
      back: anchor.getObjectByName('community-profile-back')!,
    }));
    group.add(base, prominent, satellites);
    const name = textCard(group, 9.2, true);
    name.sprite.position.y = 6.4;
    group.visible = false;
    return {
      group,
      base,
      prominent,
      satellites,
      heads,
      representatives: socialSectorRepresentatives(sector),
      name,
      counts: sector,
      burnKey: '',
      unbindBurn: undefined as (() => void) | undefined,
      portraitSlots: [] as { index: number; anchor: THREE.Object3D }[],
    };
  });

  function syncAvatars() {
    const identities = new Map<string, WorldAvatarIdentity>();
    function include(person: SocialPersonPlacement['person']) {
      if (personGone(person.id)) return;
      const identity = approvedIdentities.get(person.id);
      if (identities.size < INSTANCE_CAPACITY && identity && identity.avatarUrl === person.avatarUrl)
        identities.set(person.id, identity);
    }
    // Visible overview heads have priority over older individual figures still fading out.
    for (const cluster of clusters) {
      if (!cluster.group.visible || !cluster.prominent.visible) continue;
      const { central, satellites } = cluster.representatives;
      if (central) include(central);
      satellites.forEach(include);
    }
    for (const entry of people.values()) if (entry.targetScale) include(entry.placement.person);
    for (const entry of people.values()) if (!entry.targetScale) include(entry.placement.person);
    atlas.sync([...identities.values()]);
  }

  function avatarTile(person: SocialPersonPlacement['person']) {
    if (personGone(person.id)) return undefined;
    const identity = approvedIdentities.get(person.id);
    return identity && identity.avatarUrl === person.avatarUrl ? atlas.get(person.id) : undefined;
  }

  const positions = new Float32Array(EDGE_CAPACITY * EDGE_STEPS * 6);
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  edgeGeometry.setDrawRange(0, 0);
  const ribbons = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: WORLD_PALETTE.lime,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  ribbons.name = 'social-follow-lines';
  ribbons.frustumCulled = false;
  root.add(ribbons);

  function markBurnChanged() {
    dirty = true;
    labelElapsed = 1;
    if (focus && personUnavailable(focus)) focus = null;
    for (const name of names) {
      const id = name.sprite.userData.socialPersonId;
      if (typeof id === 'string' && personUnavailable(id)) name.sprite.visible = false;
    }
    for (const cluster of clusters) {
      if (sectorUnavailable(cluster.counts.key)) cluster.name.sprite.visible = false;
    }
    drawEdges();
  }

  function writePersonBurn(entry: AnimatedPerson) {
    const [x, z] = entry.placement.position;
    const escape = entry.escape;
    const facing = escape?.yaw ?? Math.atan2(WORLD_ANCHORS.plaza[0] - x, WORLD_ANCHORS.plaza[1] - z);
    transform.position.copy(entry.anchor.position);
    transform.rotation.set(escape && !escape.reducedMotion ? (escape.falling ? 0.65 : 0.13) : 0, facing, 0, 'YXZ');
    transform.scale.set(entry.scale, entry.scale * entry.appearance.height, entry.scale);
    transform.updateMatrix();
    entry.matrix.copy(entry.hidden ? emptyMatrix : transform.matrix);
    entry.headMatrix.multiplyMatrices(entry.matrix, entry.appearance.headPose);
    for (const slot of entry.slots) {
      slot.object.setMatrixAt(
        slot.index,
        slot.ground && escape ? emptyMatrix : slot.head ? entry.headMatrix : entry.matrix,
      );
      slot.object.instanceMatrix.needsUpdate = true;
      slot.object.boundingSphere = null;
      slot.object.boundingBox = null;
      const running = runningBatches.get(slot.object);
      if (running) {
        running.run.setXY(slot.index, escape?.stride ?? 0, escape && !escape.reducedMotion && !escape.falling ? 1 : 0);
        running.run.needsUpdate = true;
      }
    }
  }

  function posePersonEscape(entry: AnimatedPerson, elapsed: number, reducedMotion: boolean) {
    const escape = entry.escape;
    if (!escape) return;
    escape.elapsed = Math.min(escape.path.duration, elapsed);
    const frame = escape.path.sample(escape.elapsed / escape.path.duration, reducedMotion);
    entry.anchor.position.copy(frame.position);
    escape.yaw = frame.yaw;
    escape.stride = frame.stride;
    escape.falling = frame.falling;
    escape.reducedMotion = reducedMotion;
    writePersonBurn(entry);
  }

  function startPersonEscape(entry: AnimatedPerson) {
    if (entry.escape) return;
    entry.detached = true;
    entry.burnParent = undefined;
    entry.scale = entry.targetScale || entry.placement.scale;
    entry.targetScale = entry.scale;
    entry.escape = {
      path: createWorldBurnEscape(entry.anchor.position),
      elapsed: 0,
      resumedAt: 0,
      registered: false,
      yaw: 0,
      stride: 0,
      falling: false,
      reducedMotion: reduceMotion,
    };
    posePersonEscape(entry, 0, reduceMotion);
    markBurnChanged();
  }

  function bindPersonBurn(entry: AnimatedPerson) {
    if (!burning) return;
    const id = entry.placement.person.id;
    const parent = entry.detached ? undefined : parentBurnId(id);
    if (entry.unbindBurn && entry.burnParent === parent) return;
    entry.unbindBurn?.();
    entry.burnParent = parent;
    entry.anchor.userData.worldBurnId = personBurnId(id);
    const target: WorldBurnTarget = {
      id: personBurnId(id),
      parentId: parent,
      roots: [entry.anchor],
      completion: 'fall',
      canIgnite: () =>
        !disposed &&
        !entry.hidden &&
        (Boolean(entry.escape && !entry.escape.registered) ||
          (!clustered && entry.targetScale > 0 && entry.scale > 0.05 && !personGone(id) && availableEscapeSlots() > 0)),
      getBounds(out) {
        out.makeEmpty();
        root.updateWorldMatrix(true, false);
        for (const slot of entry.slots) {
          if (!slot.object.visible || (entry.escape && slot.ground)) continue;
          if (!slot.object.geometry.boundingBox) slot.object.geometry.computeBoundingBox();
          if (!slot.object.geometry.boundingBox) continue;
          burnMatrix.multiplyMatrices(root.matrixWorld, slot.head ? entry.headMatrix : entry.matrix);
          out.union(burnBounds.copy(slot.object.geometry.boundingBox).applyMatrix4(burnMatrix));
        }
        if (entry.escape && !out.isEmpty()) out.expandByScalar(entry.scale * 0.35);
        return !out.isEmpty();
      },
      raycast(raycaster) {
        let nearest = Infinity;
        for (const slot of entry.slots) {
          if (!slot.object.visible || (entry.escape && slot.ground)) continue;
          burnProxy.geometry = slot.object.geometry;
          burnProxy.material = slot.object.material;
          burnProxy.matrixWorld.multiplyMatrices(root.matrixWorld, slot.head ? entry.headMatrix : entry.matrix);
          burnHits.length = 0;
          burnProxy.raycast(raycaster, burnHits);
          for (const hit of burnHits) nearest = Math.min(nearest, hit.distance);
        }
        return Number.isFinite(nearest) ? nearest : null;
      },
      getDuration: () => (entry.escape ? Math.max(1, entry.escape.path.duration - entry.escape.resumedAt) : 15),
      applyProgress(progress, reducedMotion = false) {
        const escape = entry.escape;
        if (escape)
          posePersonEscape(
            entry,
            THREE.MathUtils.lerp(escape.resumedAt, escape.path.duration, progress),
            reducedMotion,
          );
      },
      onIgnite() {
        startPersonEscape(entry);
        target.parentId = undefined;
        if (entry.escape && !entry.escape.registered) {
          entry.escape.registered = true;
          entry.escape.resumedAt = entry.escape.elapsed;
        }
      },
      hide() {
        const changed = !entry.hidden;
        entry.hidden = true;
        entry.targetScale = 0;
        writePersonBurn(entry);
        if (changed) markBurnChanged();
      },
    };
    entry.unbindBurn = burning.bind(target);
  }

  function updateClusterPortraits(cluster: (typeof clusters)[number]) {
    root.updateWorldMatrix(true, true);
    rootInverse.copy(root.matrixWorld).invert();
    for (const slot of cluster.portraitSlots) {
      if (!cluster.group.visible || !cluster.prominent.visible || burning?.isGone(sectorBurnId(cluster.counts.key)))
        portraits.setMatrixAt(slot.index, emptyMatrix);
      else {
        clusterHeadMatrix.multiplyMatrices(rootInverse, slot.anchor.matrixWorld).multiply(portraitHeadOffset);
        portraits.setMatrixAt(slot.index, clusterHeadMatrix);
      }
    }
    if (cluster.portraitSlots.length) {
      portraits.instanceMatrix.needsUpdate = true;
      portraits.boundingBox = null;
      portraits.boundingSphere = null;
    }
  }

  function addPerson(placement: SocialPersonPlacement, scale: number) {
    const anchor = new THREE.Object3D();
    anchor.position.set(placement.position[0], 0.2, placement.position[1]);
    const entry: AnimatedPerson = {
      placement,
      anchor,
      scale,
      targetScale: placement.scale,
      appearance: socialPersonAppearance(placement.person),
      matrix: new THREE.Matrix4(),
      headMatrix: new THREE.Matrix4(),
      hidden: false,
      detached: false,
      slots: [],
    };
    people.set(placement.person.id, entry);
    return entry;
  }

  function trimPersonWindow() {
    // Active escapes survive paging; the ordinary outgoing window gives up its slots first.
    for (const [id, entry] of people) {
      if (people.size <= INSTANCE_CAPACITY) break;
      if (!entry.targetScale && !entry.escape) {
        entry.unbindBurn?.();
        people.delete(id);
      }
    }
  }

  function releaseClusterPeople(cluster: (typeof clusters)[number]) {
    if (!burning) return;
    const promoted: AnimatedPerson[] = [];
    root.updateWorldMatrix(true, true);
    for (const [index, head] of cluster.heads.entries()) {
      if ((index === 0 && !cluster.prominent.visible) || (index > 0 && !cluster.satellites.visible)) continue;
      const representative =
        index === 0 ? cluster.representatives.central : cluster.representatives.satellites[index - 1];
      // Unassigned decorative busts stay anonymous; no invented identity can request an image.
      const person: SocialPersonPlacement['person'] = representative ?? {
        id: `sculpture:${cluster.counts.key}:${index}`,
        name: 'Anonymous',
        bio: '',
        color: '#8D9DA9',
        degree: 2,
        parentIds: [],
        position: cluster.counts.position,
      };
      const existing = people.get(person.id);
      if (existing?.escape || burning.isGone(personBurnId(person.id))) continue;
      const position = root.worldToLocal(head.anchor.getWorldPosition(new THREE.Vector3()));
      const appearance = socialPersonAppearance(person);
      const scale = THREE.MathUtils.clamp(
        head.anchor.getWorldScale(new THREE.Vector3()).y / appearance.height,
        0.35,
        2,
      );
      const placement: SocialPersonPlacement = {
        person,
        position: [position.x, position.z],
        scale,
        sector: cluster.counts.sector,
        sectorKey: cluster.counts.key,
      };
      const entry = existing ?? addPerson(placement, scale);
      entry.unbindBurn?.();
      entry.unbindBurn = undefined;
      entry.placement = placement;
      entry.appearance = appearance;
      entry.anchor.position.set(position.x, 0.15, position.z);
      entry.scale = scale;
      entry.targetScale = scale;
      if (burnedParents.size < WORLD_BURN_LIMITS.remembered)
        burnedParents.set(person.id, sectorBurnId(cluster.counts.key));
      startPersonEscape(entry);
      bindPersonBurn(entry);
      promoted.push(entry);
    }
    // The plinth remains the sector target. Every visible human has a separate fall lifetime.
    cluster.prominent.visible = false;
    cluster.satellites.visible = false;
    updateClusterPortraits(cluster);
    trimPersonWindow();
    renderInstances();
    for (const entry of promoted) burning.ignite(personBurnId(entry.placement.person.id));
  }

  function bindClusterBurn(cluster: (typeof clusters)[number]) {
    if (!burning) return;
    const id = sectorBurnId(cluster.counts.key);
    if (cluster.burnKey === id) return;
    cluster.unbindBurn?.();
    cluster.burnKey = id;
    cluster.group.scale.setScalar(1);
    const target = createWorldGroupBurnTarget(id, [cluster.group], [], {
      // Admit the whole sculpture atomically, before its busts detach or its ledger changes.
      canIgnite: () =>
        !disposed &&
        clustered &&
        cluster.group.visible &&
        availableEscapeSlots() >= Number(cluster.prominent.visible) + (cluster.satellites.visible ? 3 : 0),
      onIgnite() {
        for (const person of cluster.counts.members) {
          if (burnedParents.size < WORLD_BURN_LIMITS.remembered) burnedParents.set(person.id, id);
        }
        releaseClusterPeople(cluster);
        markBurnChanged();
      },
    });
    cluster.unbindBurn = burning.bind({
      ...target,
      getBounds(out) {
        target.getBounds(out);
        if (!portraits.geometry.boundingBox) portraits.geometry.computeBoundingBox();
        if (cluster.group.visible && portraits.geometry.boundingBox) {
          for (const slot of cluster.portraitSlots) {
            portraits.getMatrixAt(slot.index, burnMatrix);
            burnMatrix.premultiply(root.matrixWorld);
            out.union(burnBounds.copy(portraits.geometry.boundingBox).applyMatrix4(burnMatrix));
          }
        }
        return !out.isEmpty();
      },
      raycast(raycaster) {
        let nearest = target.raycast?.(raycaster) ?? Infinity;
        for (const slot of cluster.portraitSlots) {
          portraits.getMatrixAt(slot.index, burnMatrix);
          burnProxy.geometry = portraits.geometry;
          burnProxy.material = portraits.material;
          burnProxy.matrixWorld.multiplyMatrices(root.matrixWorld, burnMatrix);
          burnHits.length = 0;
          burnProxy.raycast(raycaster, burnHits);
          for (const hit of burnHits) nearest = Math.min(nearest, hit.distance);
        }
        return Number.isFinite(nearest) ? nearest : null;
      },
      applyProgress(progress, reducedMotion) {
        target.applyProgress?.(progress, reducedMotion);
        updateClusterPortraits(cluster);
      },
      hide() {
        const changed = cluster.group.visible;
        target.hide();
        if (cluster.portraitSlots.length) updateClusterPortraits(cluster);
        if (changed) markBurnChanged();
      },
    });
  }

  function rebuildEdges() {
    edges = [];
    clusterConnections.clear();
    const allPeople = new Map(data.people.map((person) => [person.id, person]));
    const seen = new Set<string>();
    for (const relationship of data.relationships) {
      if (clustered) {
        const target = allPeople.get(relationship.to);
        const sector = target ? sectorByPerson.get(target.id) : undefined;
        if (!allPeople.has(relationship.from) && target?.degree === 1 && sector !== undefined)
          clusterConnections.add(sector);
        continue;
      }
      const to = placements.get(relationship.to);
      if (!to) continue;
      const from = placements.get(relationship.from);
      const viewer = !allPeople.has(relationship.from) && to.person.degree === 1;
      if (!from && !viewer) continue;
      const selected = focus === relationship.from || focus === relationship.to;
      const primary =
        to.person.degree === 2 && to.person.parentIds?.length
          ? relationship.from === to.person.parentIds.reduce((first, id) => (id < first ? id : first))
          : false;
      if (focus ? !selected : !(placements.size <= 16 || viewer || primary)) continue;
      const key = `${relationship.from}:${relationship.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: viewer ? null : relationship.from, to: relationship.to });
    }
  }

  function rebuild(initial = false) {
    const sectors = socialSectors(data.people);
    view = resolveSocialView(sectors, view);
    personParents = new Map(
      sectors.flatMap((sector) => sector.members.map((person) => [person.id, sectorBurnId(sector.key)] as const)),
    );
    const next = layoutSocialPeople(data.people, view, placements);
    placements = new Map(next.map((placement) => [placement.person.id, placement]));
    sectorByPerson = new Map(
      sectors.flatMap((sector) => sector.members.map((person) => [person.id, sector.sector] as const)),
    );
    clustered =
      view.sector === null &&
      sectors.reduce((count, sector) => count + sector.direct + sector.secondary, 0) > SOCIAL_PAGE_SIZE;
    for (const entry of people.values()) if (!entry.escape) entry.targetScale = 0;
    for (const placement of next) {
      if (
        personGone(placement.person.id) ||
        (personUnavailable(placement.person.id) && !people.get(placement.person.id)?.escape)
      )
        continue;
      const current = people.get(placement.person.id);
      if (current) {
        // Profile authorization can still change during a run; its route and full scale stay fixed.
        if (current.escape) current.placement = { ...current.placement, person: placement.person };
        else {
          current.placement = placement;
          current.targetScale = placement.scale;
          current.appearance = socialPersonAppearance(placement.person);
        }
      } else {
        addPerson(placement, initial ? placement.scale : 0);
      }
    }
    trimPersonWindow();
    for (const [index, cluster] of clusters.entries()) {
      const sector = sectors[index];
      if (!sector) {
        cluster.group.visible = false;
        cluster.unbindBurn?.();
        cluster.unbindBurn = undefined;
        cluster.burnKey = '';
        continue;
      }
      cluster.counts = sector;
      const alive = sector.members.filter(
        (person) =>
          !personGone(person.id) && (!personUnavailable(person.id) || burning?.isBurning(sectorBurnId(sector.key))),
      );
      const visibleSector = {
        ...sector,
        members: alive,
        direct: alive.filter((person) => person.degree === 1).length,
        secondary: alive.filter((person) => person.degree === 2).length,
      };
      cluster.representatives = socialSectorRepresentatives(visibleSector);
      cluster.group.position.set(sector.position[0], 0.2, sector.position[1]);
      cluster.group.visible = clustered && alive.length > 0 && !burning?.isGone(sectorBurnId(sector.key));
      cluster.name.sprite.visible = !sectorUnavailable(sector.key);
      cluster.prominent.visible = !sectorUnavailable(sector.key);
      cluster.prominent.scale.setScalar(sector.direct ? 1 : 0.5);
      cluster.satellites.visible = sector.secondary > 0 && !sectorUnavailable(sector.key);
      cluster.name.write(
        sector.label,
        socialSectorCountLabel(visibleSector),
        visibleSector.direct > 0,
        socialSectorPreview(visibleSector, 24),
      );
      bindClusterBurn(cluster);
    }
    for (const entry of people.values()) bindPersonBurn(entry);
    rebuildEdges();
    syncAvatars();
    dirty = true;
    labelElapsed = 1;
  }

  function drawEdges() {
    let used = 0;
    function curve(start: THREE.Vector3, end: THREE.Vector3, height: number) {
      if (used >= EDGE_CAPACITY) return;
      for (let step = 0; step < EDGE_STEPS; step++) {
        for (let endpoint = 0; endpoint < 2; endpoint++) {
          const point = (step + endpoint) / EDGE_STEPS;
          const offset = used * EDGE_STEPS * 6 + step * 6 + endpoint * 3;
          positions[offset] = start.x + (end.x - start.x) * point;
          positions[offset + 1] = start.y + (end.y - start.y) * point + 4 * point * (1 - point) * height;
          positions[offset + 2] = start.z + (end.z - start.z) * point;
        }
      }
      used++;
    }
    if (clustered) {
      for (const cluster of clusters) {
        if (
          cluster.group.visible &&
          !sectorUnavailable(cluster.counts.key) &&
          clusterConnections.has(cluster.counts.sector)
        )
          curve(rootPosition, cluster.group.position, 3.5);
      }
    } else {
      for (const edge of edges) {
        const from = edge.from === null ? null : people.get(edge.from);
        const to = people.get(edge.to);
        if (
          !to ||
          personUnavailable(to.placement.person.id) ||
          (from && personUnavailable(from.placement.person.id)) ||
          (edge.from !== null && !from)
        )
          continue;
        const start = from ? from.anchor.position.clone().setY(2.2 * from.scale) : rootPosition;
        const end = to.anchor.position.clone().setY(2.2 * to.scale);
        curve(start, end, 2.1);
      }
    }
    edgeGeometry.setDrawRange(0, used * EDGE_STEPS * 2);
    edgeGeometry.attributes.position.needsUpdate = true;
  }

  function renderInstances() {
    instances = [...people.values()].filter(
      (entry) =>
        !personGone(entry.placement.person.id) && (entry.escape || !personUnavailable(entry.placement.person.id)),
    );
    for (const entry of people.values()) entry.slots.length = 0;
    let portraitCount = 0;
    portraitSectorInstances.length = 0;
    root.updateWorldMatrix(true, true);
    rootInverse.copy(root.matrixWorld).invert();
    for (const [sector, cluster] of clusters.entries()) {
      cluster.portraitSlots.length = 0;
      for (const [index, head] of cluster.heads.entries()) {
        const person = index === 0 ? cluster.representatives.central : cluster.representatives.satellites[index - 1];
        const uv =
          cluster.group.visible && (index === 0 ? cluster.prominent.visible : cluster.satellites.visible) && person
            ? avatarTile(person)
            : null;
        head.mask.visible = !uv;
        head.back.visible = Boolean(uv);
        if (!uv) continue;
        // The shared page geometry includes a 2.55-high head center; cluster anchors already locate theirs.
        clusterHeadMatrix.multiplyMatrices(rootInverse, head.anchor.matrixWorld).multiply(portraitHeadOffset);
        portraits.setMatrixAt(portraitCount, clusterHeadMatrix);
        portraitTiles.setXYZW(portraitCount, ...uv);
        portraitSectorInstances.push(sector);
        cluster.portraitSlots.push({ index: portraitCount, anchor: head.anchor });
        portraitCount++;
      }
    }
    const portraitPeople = new Set(
      instances
        .filter((entry) => avatarTile(entry.placement.person))
        .sort((left, right) => Number(Boolean(right.targetScale)) - Number(Boolean(left.targetScale)))
        .slice(0, INSTANCE_CAPACITY - portraitCount)
        .map((entry) => entry.placement.person.id),
    );
    // Clothing, masks and approved portraits follow the same moving person transform.
    for (const entry of instances) writePersonBurn(entry);
    for (const part of parts) {
      let count = 0;
      const ground = part.object.name.startsWith('social-pedestal');
      const running = runningBatches.get(part.object);
      for (const entry of instances) {
        // Compact variants draw only the people wearing them, not zero-scaled hidden geometry.
        const hasPortrait = portraitPeople.has(entry.placement.person.id);
        if (part.identity && (part.identity === 'portrait') !== hasPortrait) continue;
        if (part.variant && entry.appearance[part.variant.kind] !== part.variant.index) continue;
        part.object.setMatrixAt(
          count,
          ground && entry.escape ? emptyMatrix : part.head ? entry.headMatrix : entry.matrix,
        );
        part.object.setColorAt(count, entry.appearance.colors[part.palette]);
        entry.slots.push({ object: part.object, index: count, head: part.head, ground });
        const escape = entry.escape;
        running?.run.setXY(count, escape?.stride ?? 0, escape && !escape.reducedMotion && !escape.falling ? 1 : 0);
        count++;
      }
      part.object.count = count;
      part.object.instanceMatrix.needsUpdate = true;
      // Refresh bounds for both frustum culling and raycasting after each page change.
      part.object.boundingSphere = null;
      part.object.boundingBox = null;
      if (running) running.run.needsUpdate = true;
      if (part.object.instanceColor) part.object.instanceColor.needsUpdate = true;
    }
    instances.forEach((entry, index) => {
      head.setMatrixAt(index, entry.headMatrix);
      entry.slots.push({ object: head, index, head: true });
    });
    head.count = instances.length;
    head.instanceMatrix.needsUpdate = true;
    head.boundingSphere = null;
    for (const entry of instances) {
      if (!portraitPeople.has(entry.placement.person.id)) continue;
      const uv = avatarTile(entry.placement.person);
      if (!uv) continue;
      portraits.setMatrixAt(portraitCount, entry.headMatrix);
      portraitTiles.setXYZW(portraitCount, ...uv);
      entry.slots.push({ object: portraits, index: portraitCount, head: true });
      portraitCount++;
    }
    portraits.count = portraitCount;
    portraits.instanceMatrix.needsUpdate = true;
    portraitTiles.needsUpdate = true;
    portraits.boundingSphere = null;
    drawEdges();
  }

  function personHit(entry: AnimatedPerson, distance: number): SocialHit {
    return {
      object: entry.anchor,
      action: { kind: 'person', id: entry.placement.person.id },
      title: `Meet ${entry.placement.person.name.slice(0, 24)}`,
      dynamic: false,
      distance,
    };
  }

  function clusterHit(index: number, distance: number): SocialHit {
    return {
      object: clusters[index].group,
      action: { kind: 'social-cluster', sector: index, sectorKey: clusters[index].counts.key },
      title: `Preview ${clusters[index].counts.label} · ${socialSectorPreview(clusters[index].counts, 24)}`,
      dynamic: false,
      distance,
    };
  }

  rebuild(true);
  renderInstances();

  return {
    setAvatarIdentities(identities: readonly WorldAvatarIdentity[]) {
      if (disposed) return;
      approvedIdentities = new Map(identities.slice(0, INSTANCE_CAPACITY).map((identity) => [identity.id, identity]));
      syncAvatars();
      dirty = true;
    },
    updateData(value: WorldData) {
      data = value;
      rebuild();
    },
    setView(value: WorldSocialView) {
      view = value;
      rebuild();
    },
    setFocus(id: string | null) {
      focus = id;
      rebuildEdges();
      dirty = true;
      labelElapsed = 1;
    },
    findPerson(id: string) {
      if (personUnavailable(id)) return null;
      const nextView = socialViewForPerson(data.people, id);
      if (!nextView) return null;
      view = nextView;
      focus = id;
      rebuild();
      return placements.get(id) ?? null;
    },
    pick(raycaster: THREE.Raycaster): SocialHit | null {
      const targets: THREE.Object3D[] = clustered
        ? [...clusters.filter((cluster) => cluster.group.visible).map((cluster) => cluster.group), portraits]
        : [body, head, pedestal];
      for (const hit of raycaster.intersectObjects(targets, true)) {
        if (clustered) {
          if (hit.object === portraits && hit.instanceId !== undefined) {
            const sector = portraitSectorInstances[hit.instanceId];
            if (sector !== undefined && !sectorUnavailable(clusters[sector].counts.key))
              return clusterHit(sector, hit.distance);
            continue;
          }
          let object: THREE.Object3D | null = hit.object;
          while (object && object !== root) {
            const index = clusters.findIndex((cluster) => cluster.group === object);
            if (index !== -1 && !sectorUnavailable(clusters[index].counts.key)) return clusterHit(index, hit.distance);
            object = object.parent;
          }
        } else if (hit.instanceId !== undefined) {
          const entry = instances[hit.instanceId];
          if (entry?.targetScale && entry.scale > 0.1 && !personUnavailable(entry.placement.person.id))
            return personHit(entry, hit.distance);
        }
      }
      return null;
    },
    nearest(x: number, z: number, limit = 7): SocialHit | null {
      let nearest: SocialHit | null = null;
      if (clustered) {
        for (const [index, cluster] of clusters.entries()) {
          if (!cluster.group.visible || sectorUnavailable(cluster.counts.key)) continue;
          const distance = Math.hypot(x - cluster.group.position.x, z - cluster.group.position.z);
          if (distance < (nearest?.distance ?? limit)) nearest = clusterHit(index, distance);
        }
      } else
        for (const entry of people.values()) {
          if (!entry.targetScale || personUnavailable(entry.placement.person.id)) continue;
          const distance = Math.hypot(x - entry.anchor.position.x, z - entry.anchor.position.z);
          if (distance < (nearest?.distance ?? limit)) nearest = personHit(entry, distance);
        }
      return nearest;
    },
    tick(delta: number, player: THREE.Vector3, reducedMotion: boolean, overview: boolean) {
      if (disposed) return;
      reduceMotion = reducedMotion;
      const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, delta) * 8);
      for (const [id, entry] of people) {
        if (entry.hidden || personGone(id)) {
          entry.unbindBurn?.();
          people.delete(id);
          dirty = true;
          continue;
        }
        if (entry.escape) {
          const escape = entry.escape;
          if (!escape.registered) {
            posePersonEscape(entry, escape.elapsed + Math.min(0.1, Math.max(0, delta)), reducedMotion);
            if (escape.elapsed >= escape.path.duration) {
              entry.hidden = true;
              entry.targetScale = 0;
              writePersonBurn(entry);
              markBurnChanged();
            } else burning?.ignite(personBurnId(id));
          } else if (escape.reducedMotion !== reducedMotion) {
            posePersonEscape(entry, escape.elapsed, reducedMotion);
          }
          continue;
        }
        const [x, z] = entry.placement.position;
        if (
          Math.abs(entry.scale - entry.targetScale) > 0.001 ||
          Math.hypot(entry.anchor.position.x - x, entry.anchor.position.z - z) > 0.001
        ) {
          entry.scale += (entry.targetScale - entry.scale) * blend;
          entry.anchor.position.x += (x - entry.anchor.position.x) * blend;
          entry.anchor.position.z += (z - entry.anchor.position.z) * blend;
          dirty = true;
        }
        if (!entry.targetScale && entry.scale < 0.008) {
          entry.unbindBurn?.();
          people.delete(id);
          dirty = true;
        }
      }
      if (dirty) {
        syncAvatars();
        renderInstances();
        dirty = false;
      }
      atlas.flush();
      labelElapsed += delta;
      if (labelElapsed >= 0.25) {
        labelElapsed = 0;
        const nearby = [...people.values()]
          .filter(
            (entry) =>
              entry.targetScale &&
              !personUnavailable(entry.placement.person.id) &&
              (entry.placement.person.id === focus || (!overview && entry.anchor.position.distanceTo(player) < 10)),
          )
          .sort(
            (left, right) =>
              Number(right.placement.person.id === focus) - Number(left.placement.person.id === focus) ||
              left.anchor.position.distanceToSquared(player) - right.anchor.position.distanceToSquared(player),
          )
          .slice(0, NAME_COUNT);
        names.forEach((name, index) => {
          const entry = nearby[index];
          name.sprite.visible = Boolean(entry) && !clustered;
          name.sprite.userData.socialPersonId = entry?.placement.person.id;
          if (!entry) return;
          name.write(entry.placement.person.name, '', entry.placement.person.degree !== 2);
          name.sprite.position.copy(entry.anchor.position).setY(3.35 * entry.scale * entry.appearance.height + 0.3);
          const width = entry.placement.person.id === focus ? 5 : entry.placement.person.degree === 2 ? 3.8 : 5;
          name.sprite.scale.set(width, width / 5, 1);
        });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of people.values()) entry.unbindBurn?.();
      clusters.forEach((cluster) => cluster.unbindBurn?.());
      people.clear();
      burnedParents.clear();
      personParents.clear();
      approvedIdentities.clear();
      atlas.dispose();
      portraits.material.map = null;
      portraits.dispose();
      head.dispose();
      // Line geometries/materials are released explicitly alongside the bounded mesh pools.
      edgeGeometry.dispose();
      ribbons.material.dispose();
      root.remove(ribbons);
      parts.forEach((part) => part.object.dispose());
      for (const running of runningBatches.values()) running.depth?.dispose();
      runningBatches.clear();
      disposeObject(root);
    },
  };
}
