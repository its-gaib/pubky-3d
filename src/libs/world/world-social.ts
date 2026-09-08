import * as THREE from 'three';
import { cylinder, disposeObject, material, sphere, WORLD_PALETTE } from '@/libs/world/world-geometry';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import {
  layoutSocialPeople,
  resolveSocialView,
  SOCIAL_PAGE_SIZE,
  SOCIAL_SECTOR_COUNT,
  type SocialPersonPlacement,
  socialSectorCountLabel,
  socialSectorPreview,
  socialSectors,
  socialViewForPerson,
} from '@/libs/world/world-social-layout';
import type { WorldData, WorldInteraction, WorldSocialView } from '@/libs/world/world-types';

const INSTANCE_CAPACITY = SOCIAL_PAGE_SIZE * 2;
const NAME_COUNT = 10;
const EDGE_CAPACITY = 256;
const EDGE_STEPS = 12;

interface AnimatedPerson {
  placement: SocialPersonPlacement;
  anchor: THREE.Object3D;
  scale: number;
  targetScale: number;
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

/** A bounded render window over the complete graph. No network or profile-image textures. */
export function createSocialPlaza(scene: THREE.Scene, initialData: WorldData) {
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
  let placements = new Map<string, SocialPersonPlacement>();
  const people = new Map<string, AnimatedPerson>();
  let instances: AnimatedPerson[] = [];
  let edges: SocialEdge[] = [];
  const clusterConnections = new Set<number>();
  let sectorByPerson = new Map<string, number>();
  const rootPosition = new THREE.Vector3(WORLD_ANCHORS.plaza[0], 4.6, WORLD_ANCHORS.plaza[1]);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const subdued = new THREE.Color('#555563');

  const parts: { object: THREE.InstancedMesh; offset: THREE.Vector3; tint: boolean }[] = [];
  function part(
    name: string,
    geometry: THREE.BufferGeometry,
    surface: string,
    offset: [number, number, number],
    tint = false,
  ) {
    const object = new THREE.InstancedMesh(geometry, material(surface), INSTANCE_CAPACITY);
    object.name = `social-${name}`;
    object.count = 0;
    object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    object.castShadow = name === 'body' || name === 'head';
    object.receiveShadow = true;
    // A tiny, fixed instance pool can move between any plaza sectors without stale bounds.
    object.frustumCulled = false;
    root.add(object);
    parts.push({ object, offset: new THREE.Vector3(...offset), tint });
    return object;
  }
  const body = part('body', new THREE.CapsuleGeometry(0.48, 0.6, 3, 8), '#FFFFFF', [0, 1.22, 0], true);
  const head = part('head', new THREE.IcosahedronGeometry(0.46, 1), '#D4BCA4', [0, 2.08, 0]);
  part('hat', new THREE.CylinderGeometry(0.48, 0.53, 0.2, 10), '#FFFFFF', [0, 2.38, 0], true);
  part('antenna', new THREE.IcosahedronGeometry(0.1, 0), WORLD_PALETTE.lime, [0, 2.57, 0]);
  for (const x of [-0.16, 0.16]) part('eye', new THREE.BoxGeometry(0.08, 0.09, 0.06), '#101014', [x, 2.12, 0.41]);
  for (const x of [-0.25, 0.25]) part('leg', new THREE.BoxGeometry(0.3, 0.65, 0.36), '#303034', [x, 0.43, 0]);
  for (const x of [-0.61, 0.61]) part('arm', new THREE.BoxGeometry(0.23, 0.7, 0.26), '#FFFFFF', [x, 1.18, 0], true);
  part('backpack', new THREE.BoxGeometry(0.65, 0.65, 0.3), '#56565F', [0, 1.25, -0.43]);
  const pedestal = part('pedestal', new THREE.CylinderGeometry(1.25, 1.25, 0.16, 12), '#FFFFFF', [0, 0, 0], true);

  const names = Array.from({ length: NAME_COUNT }, () => textCard(root, 5));
  names.forEach((name) => {
    name.sprite.visible = false;
  });

  const emptySector = socialSectors([])[0];
  // Geometry has a fixed maximum pool even when there are only one or two tag neighborhoods.
  const clusters = Array.from({ length: SOCIAL_SECTOR_COUNT }, (_, index) => {
    const sector = emptySector;
    const group = new THREE.Group();
    group.name = `social-sector-${index}`;
    group.position.set(sector.position[0], 0.2, sector.position[1]);
    root.add(group);
    const base = cylinder(group, 3, 3.5, 0.25, '#34343E', [0, 0, 0]);
    const prominent = new THREE.Group();
    group.add(prominent);
    cylinder(prominent, 0.85, 1.15, 2.1, WORLD_PALETTE.lime, [0, 1.45, 0], 8);
    sphere(prominent, 0.82, '#DADAE3', [0, 3.2, 0]);
    const satellites = new THREE.Group();
    group.add(satellites);
    for (let index = 0; index < 3; index++) {
      const angle = (index / 3) * Math.PI * 2;
      sphere(satellites, 0.38, '#9696A9', [Math.sin(angle) * 2.2, 0.8, Math.cos(angle) * 2.2]);
    }
    const name = textCard(group, 9.2, true);
    name.sprite.position.y = 6.4;
    group.visible = false;
    return { group, base, prominent, satellites, name, counts: sector };
  });

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
    const next = layoutSocialPeople(data.people, view, placements);
    placements = new Map(next.map((placement) => [placement.person.id, placement]));
    sectorByPerson = new Map(
      sectors.flatMap((sector) => sector.members.map((person) => [person.id, sector.sector] as const)),
    );
    clustered =
      view.sector === null &&
      sectors.reduce((count, sector) => count + sector.direct + sector.secondary, 0) > SOCIAL_PAGE_SIZE;
    for (const entry of people.values()) entry.targetScale = 0;
    for (const placement of next) {
      const current = people.get(placement.person.id);
      if (current) {
        current.placement = placement;
        current.targetScale = placement.scale;
      } else {
        const anchor = new THREE.Object3D();
        anchor.position.set(placement.position[0], 0.2, placement.position[1]);
        people.set(placement.person.id, {
          placement,
          anchor,
          scale: initial ? placement.scale : 0,
          targetScale: placement.scale,
        });
      }
    }
    // Rapid page changes cannot leave an ever-growing queue of fading figures.
    for (const [id, entry] of people) {
      if (people.size <= INSTANCE_CAPACITY) break;
      if (entry.targetScale === 0) people.delete(id);
    }
    for (const [index, cluster] of clusters.entries()) {
      const sector = sectors[index];
      if (!sector) {
        cluster.group.visible = false;
        continue;
      }
      cluster.counts = sector;
      cluster.group.position.set(sector.position[0], 0.2, sector.position[1]);
      cluster.group.visible = clustered && sector.direct + sector.secondary > 0;
      cluster.prominent.scale.setScalar(sector.direct ? 1 : 0.5);
      cluster.satellites.visible = sector.secondary > 0;
      cluster.name.write(
        sector.label,
        socialSectorCountLabel(sector),
        sector.direct > 0,
        socialSectorPreview(sector, 24),
      );
    }
    rebuildEdges();
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
        if (cluster.group.visible && clusterConnections.has(cluster.counts.sector))
          curve(rootPosition, cluster.group.position, 3.5);
      }
    } else {
      for (const edge of edges) {
        const from = edge.from === null ? null : people.get(edge.from);
        const to = people.get(edge.to);
        if (!to || (edge.from !== null && !from)) continue;
        const start = from ? from.anchor.position.clone().setY(2.2 * from.scale) : rootPosition;
        const end = to.anchor.position.clone().setY(2.2 * to.scale);
        curve(start, end, 2.1);
      }
    }
    edgeGeometry.setDrawRange(0, used * EDGE_STEPS * 2);
    edgeGeometry.attributes.position.needsUpdate = true;
  }

  function renderInstances() {
    instances = [...people.values()];
    for (const part of parts) {
      part.object.count = instances.length;
      instances.forEach((entry, index) => {
        const [x, z] = entry.placement.position;
        const facing = Math.atan2(WORLD_ANCHORS.plaza[0] - x, WORLD_ANCHORS.plaza[1] - z);
        transform.position
          .copy(part.offset)
          .multiplyScalar(entry.scale)
          .applyAxisAngle(THREE.Object3D.DEFAULT_UP, facing)
          .add(entry.anchor.position);
        transform.rotation.set(0, facing, 0);
        transform.scale.setScalar(entry.scale);
        transform.updateMatrix();
        part.object.setMatrixAt(index, transform.matrix);
        color.set(
          part.tint && /^#[0-9a-f]{6}$/i.test(entry.placement.person.color) ? entry.placement.person.color : '#FFFFFF',
        );
        if (entry.placement.person.degree === 2) color.lerp(subdued, 0.56);
        part.object.setColorAt(index, color);
      });
      part.object.instanceMatrix.needsUpdate = true;
      if (part.object.instanceColor) part.object.instanceColor.needsUpdate = true;
    }
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
      const nextView = socialViewForPerson(data.people, id);
      if (!nextView) return null;
      view = nextView;
      focus = id;
      rebuild();
      return placements.get(id) ?? null;
    },
    pick(raycaster: THREE.Raycaster): SocialHit | null {
      const targets: THREE.Object3D[] = clustered
        ? clusters.filter((cluster) => cluster.group.visible).map((cluster) => cluster.group)
        : [body, head, pedestal];
      for (const hit of raycaster.intersectObjects(targets, true)) {
        if (clustered) {
          let object: THREE.Object3D | null = hit.object;
          while (object && object !== root) {
            const index = clusters.findIndex((cluster) => cluster.group === object);
            if (index !== -1) return clusterHit(index, hit.distance);
            object = object.parent;
          }
        } else if (hit.instanceId !== undefined) {
          const entry = instances[hit.instanceId];
          if (entry?.targetScale && entry.scale > 0.1) return personHit(entry, hit.distance);
        }
      }
      return null;
    },
    nearest(x: number, z: number, limit = 7): SocialHit | null {
      let nearest: SocialHit | null = null;
      if (clustered) {
        for (const [index, cluster] of clusters.entries()) {
          if (!cluster.group.visible) continue;
          const distance = Math.hypot(x - cluster.group.position.x, z - cluster.group.position.z);
          if (distance < (nearest?.distance ?? limit)) nearest = clusterHit(index, distance);
        }
      } else
        for (const entry of people.values()) {
          if (!entry.targetScale) continue;
          const distance = Math.hypot(x - entry.anchor.position.x, z - entry.anchor.position.z);
          if (distance < (nearest?.distance ?? limit)) nearest = personHit(entry, distance);
        }
      return nearest;
    },
    tick(delta: number, player: THREE.Vector3, reducedMotion: boolean, overview: boolean) {
      if (disposed) return;
      const blend = reducedMotion ? 1 : 1 - Math.exp(-Math.max(0, delta) * 8);
      for (const [id, entry] of people) {
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
          people.delete(id);
          dirty = true;
        }
      }
      if (dirty) {
        renderInstances();
        dirty = false;
      }
      labelElapsed += delta;
      if (labelElapsed >= 0.25) {
        labelElapsed = 0;
        const nearby = [...people.values()]
          .filter(
            (entry) =>
              entry.targetScale &&
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
          if (!entry) return;
          name.write(entry.placement.person.name, '', entry.placement.person.degree !== 2);
          name.sprite.position.copy(entry.anchor.position).setY(3.4 * entry.scale + 0.3);
          const width = entry.placement.person.id === focus ? 5 : entry.placement.person.degree === 2 ? 3.8 : 5;
          name.sprite.scale.set(width, width / 5, 1);
        });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      people.clear();
      // Line geometries/materials are released explicitly alongside the bounded mesh pools.
      edgeGeometry.dispose();
      ribbons.material.dispose();
      root.remove(ribbons);
      parts.forEach((part) => part.object.dispose());
      disposeObject(root);
    },
  };
}
