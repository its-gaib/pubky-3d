import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WORLD_BURN_ESCAPE } from '@/libs/world/world-burn-escape';
import {
  createWorldBurning,
  WORLD_BURN_LIMITS,
  type WorldBurnEvent,
  type WorldBurnTarget,
} from '@/libs/world/world-burning';
import { asOpaque } from '@/test-utils/type-assertions';
import { createSocialPlaza } from './world-social';
import {
  SOCIAL_PAGE_SIZE,
  socialAvatarPeople,
  socialSectorRepresentatives,
  socialSectors,
} from './world-social-layout';
import { socialPersonAppearance } from './world-social-people';
import type { WorldData, WorldPerson } from './world-types';

function person(id: string, degree: 1 | 2 = 1, parentIds: string[] = []): WorldPerson {
  return { id, name: id, degree, parentIds, color: '#C8FF03', position: [0, 0], bio: '' };
}
function graph(people: WorldPerson[]): WorldData {
  return {
    source: 'production',
    people,
    tags: [],
    trendingPosts: [],
    relationships: people
      .filter((entry) => entry.degree === 1)
      .map((entry) => ({ from: 'viewer', to: entry.id, label: 'follows' })),
  };
}

function avatarPerson(index: number, degree: 1 | 2 = 1): WorldPerson & { avatarUrl: string } {
  const alphabet = 'ybndrfg8ejkmcpqxot1uwisza345h769';
  let encoded = '';
  do {
    encoded = alphabet[index % alphabet.length] + encoded;
    index = Math.floor(index / alphabet.length);
  } while (index);
  const id = encoded.padStart(52, 'y');
  return { ...person(id, degree), avatarUrl: `https://nexus.pubky.app/static/avatar/${id}` };
}

describe('bounded social plaza renderer', () => {
  let scene: THREE.Scene;
  let social: ReturnType<typeof createSocialPlaza>;
  beforeEach(() => {
    scene = new THREE.Scene();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      asOpaque<CanvasRenderingContext2D>({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
      }),
    );
  });
  afterEach(() => {
    social?.dispose();
    vi.restoreAllMocks();
  });

  function body() {
    const value = scene.getObjectByName('social-body');
    if (!(value instanceof THREE.InstancedMesh)) throw new Error('The social body batch is missing');
    return value;
  }
  function bodyScale(index = 0) {
    const matrix = new THREE.Matrix4();
    body().getMatrixAt(index, matrix);
    const scale = new THREE.Vector3();
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    return scale.x;
  }
  function instancePosition(object: THREE.InstancedMesh, index = 0) {
    const matrix = new THREE.Matrix4();
    object.getMatrixAt(index, matrix);
    return new THREE.Vector3().setFromMatrixPosition(matrix);
  }
  function advanceBurn(
    burning: ReturnType<typeof createWorldBurning>,
    seconds: number,
    reducedMotion = true,
    overview = false,
  ) {
    for (let frame = 0; frame < Math.ceil(seconds * 10); frame++) {
      social.tick(0.1, new THREE.Vector3(), reducedMotion, overview);
      burning.tick(0.1, reducedMotion);
    }
    social.tick(0, new THREE.Vector3(), reducedMotion, overview);
  }

  function imageLoader() {
    const pixels = new Uint8ClampedArray(32 * 32 * 4);
    pixels[3] = 255;
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      asOpaque<CanvasRenderingContext2D>({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        getImageData: () => ({ data: pixels }),
      }),
    );
    const close = vi.fn();
    return {
      load: vi.fn().mockImplementation(async () => asOpaque<ImageBitmap>({ width: 128, height: 128, close })),
      dispose: vi.fn(),
      close,
    };
  }

  function exposePerson(burning: ReturnType<typeof createWorldBurning>, position: readonly [number, number]) {
    const origin = new THREE.Vector3(position[0], 1.9, position[1] + 4);
    const direction = new THREE.Vector3(0, 0, -1);
    for (let frame = 0; frame < 2; frame++) {
      burning.expose({ origin, direction, range: 8, halfAngle: 0, seconds: 0.1 });
      burning.tick(0.1);
    }
    return new THREE.Raycaster(origin, direction, 0, 8);
  }

  it('runs an ignited person at full size through paging, keeps its approved portrait attached and falls without exploding', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const people = Array.from({ length: 120 }, (_, index) => avatarPerson(index));
    const ordered = socialSectors(people)[0].members;
    const [target, survivor] = ordered;
    const ledger = new Set<string>();
    const onGone = vi.fn<(id: string, event: WorldBurnEvent) => void>();
    const onUpdate = vi.fn<(event: WorldBurnEvent) => void>();
    const burning = createWorldBurning({ ledger, onGone, onUpdate });
    const loader = imageLoader();
    const data = graph(people);
    Object.freeze(data.people);
    social = createSocialPlaza(scene, data, loader, burning);
    social.setAvatarIdentities([target, survivor].map((entry) => ({ id: entry.id, avatarUrl: entry.avatarUrl! })));
    const placement = social.findPerson(target.id)!;
    social.tick(0.1, new THREE.Vector3(placement.position[0], 0, placement.position[1]), true, false);
    await vi.waitFor(() => expect(loader.close).toHaveBeenCalledTimes(2));
    social.tick(0.1, new THREE.Vector3(), true, false);
    const geometry = body().geometry;
    const material = body().material;
    const original = bodyScale(0);
    const other = bodyScale(1);
    const start = instancePosition(body());
    const otherPosition = instancePosition(body(), 1);
    const ray = exposePerson(burning, placement.position);
    expect(burning.isBurning(`social-person:${target.id}`)).toBe(true);
    expect(social.findPerson(target.id)).toBeNull();
    expect(social.nearest(...placement.position, 1)).toBeNull();
    expect(social.pick(ray)?.action).not.toEqual({ kind: 'person', id: target.id });
    const portraits = scene.getObjectByName('social-profile-portraits') as THREE.InstancedMesh;
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(portraits.count).toBe(2);
    advanceBurn(burning, 3.2);
    expect(instancePosition(body()).distanceTo(start)).toBeGreaterThan(45);
    expect(bodyScale(0)).toBeCloseTo(original, 6);
    expect(bodyScale(1)).toBeCloseTo(other, 6);
    expect(instancePosition(body(), 1).distanceTo(otherPosition)).toBeLessThan(0.001);
    const portraitMatrix = new THREE.Matrix4();
    portraits.getMatrixAt(0, portraitMatrix);
    expect(new THREE.Vector3().setFromMatrixScale(portraitMatrix).x).toBeCloseTo(bodyScale(0), 3);
    expect(instancePosition(portraits).distanceTo(instancePosition(body()))).toBeLessThan(0.4);
    const moving = instancePosition(body());
    social.setView({ sector: 0, page: 1 });
    social.updateData(graph([...people].reverse()));
    advanceBurn(burning, 1);
    expect(body().count).toBe(25);
    expect(instancePosition(body()).distanceTo(moving)).toBeGreaterThan(14);
    expect(bodyScale()).toBeCloseTo(original, 6);
    expect(onGone).not.toHaveBeenCalled();
    advanceBurn(burning, 30);
    expect(body().count).toBe(24);
    expect(ledger.has(`social-person:${target.id}`)).toBe(true);
    expect(onGone).toHaveBeenCalledOnce();
    const [goneId, gone] = onGone.mock.calls[0];
    expect(goneId).toBe(`social-person:${target.id}`);
    expect(gone.completion).toBe('fall');
    expect(gone.bounds.max.y).toBeLessThan(-20);
    const end = gone.bounds.getCenter(new THREE.Vector3());
    expect(Math.hypot(end.x, end.z)).toBeGreaterThan(WORLD_BURN_ESCAPE.edgeRadius);
    expect(onUpdate.mock.calls.some(([event]) => event.bounds.min.y < -10)).toBe(true);
    social.setView({ sector: 0, page: 1 });
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(body().count).toBe(24);
    social.updateData(graph([...people].reverse()));
    social.setView({ sector: 0, page: 0 });
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(body().count).toBe(95);
    expect(social.findPerson(target.id)).toBeNull();
    expect(body().geometry).toBe(geometry);
    expect(body().material).toBe(material);
    expect(data.people).toHaveLength(120);
    social.setView({ sector: null, page: 0 });
    social.tick(0.1, new THREE.Vector3(), true, true);
    await vi.waitFor(() => {
      social.tick(0.1, new THREE.Vector3(), true, true);
      expect(portraits.count).toBe(1);
    });
    const central = scene.getObjectByName('social-sector-0')!.getObjectByName('community-central-head')!;
    expect(central.getObjectByName('community-profile-back')!.visible).toBe(true);
    expect(loader.load.mock.calls.filter(([identity]) => identity.id === target.id)).toHaveLength(1);
    burning.dispose();
  });

  it('lets sector representatives flee separately from the exploding plinth and keeps hidden members gone after retagging', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const people = Array.from({ length: 120 }, (_, index) => ({
      ...avatarPerson(index),
      profileTags: [{ label: index < 60 ? 'red' : 'blue', count: 10 }],
    }));
    const onGone = vi.fn<(id: string, event: WorldBurnEvent) => void>();
    const burning = createWorldBurning({ ledger: new Set<string>(), onGone });
    const loader = imageLoader();
    social = createSocialPlaza(scene, graph(people), loader, burning);
    social.setAvatarIdentities(
      socialAvatarPeople(people, { sector: null, page: 0 }).map((entry) => ({
        id: entry.id,
        avatarUrl: entry.avatarUrl!,
      })),
    );
    await vi.waitFor(() => expect(loader.close).toHaveBeenCalledTimes(2));
    social.tick(0.1, new THREE.Vector3(), true, true);
    const portraits = scene.getObjectByName('social-profile-portraits') as THREE.InstancedMesh;
    expect(portraits.count).toBe(2);
    const sector = socialSectors(people).find((entry) => entry.key === 'tag:red')!;
    const cluster = scene.getObjectByName(`social-sector-${sector.sector}`)!;
    const central = cluster.getObjectByName('community-central-head')!;
    scene.updateMatrixWorld(true);
    const position = central.getWorldPosition(new THREE.Vector3());
    const origin = position.clone().add(new THREE.Vector3(0, 0, 4));
    const direction = new THREE.Vector3(0, 0, -1);
    for (let frame = 0; frame < 2; frame++) {
      burning.expose({ origin, direction, range: 8, halfAngle: 0, seconds: 0.1 });
      burning.tick(0.1);
    }
    expect(burning.isBurning('social-sector:tag:red')).toBe(true);
    expect(social.nearest(cluster.position.x, cluster.position.z, 1)).toBeNull();
    const ray = new THREE.Raycaster(origin, direction, 0, 8);
    ray.camera = cameraForRay(origin, position);
    expect(social.pick(ray)).toBeNull();
    expect(cluster.getObjectByName('community-central-bust')!.visible).toBe(false);
    expect(body().count).toBe(1);
    expect(portraits.count).toBe(2);
    const representative = socialSectorRepresentatives(sector).central!;
    expect(burning.isBurning(`social-person:${representative.id}`)).toBe(true);
    const original = bodyScale();
    const start = instancePosition(body());
    advanceBurn(burning, 7, true, true);
    expect(cluster.visible).toBe(false);
    expect(body().count).toBe(1);
    expect(bodyScale()).toBeCloseTo(original, 6);
    expect(instancePosition(body()).distanceTo(start)).toBeGreaterThan(100);
    expect(onGone.mock.calls).toHaveLength(1);
    expect(onGone.mock.calls[0][1].completion).toBe('explode');
    expect(onGone.mock.calls[0][0]).toBe('social-sector:tag:red');
    social.setView({ sector: sector.sector, sectorKey: sector.key, page: 0 });
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(body().count).toBe(1);
    expect(portraits.count).toBe(1);
    advanceBurn(burning, 25);
    expect(onGone.mock.calls.find(([id]) => id === `social-person:${representative.id}`)?.[1].completion).toBe('fall');
    social.setView({ sector: null, page: 0 });
    social.tick(0.1, new THREE.Vector3(), true, true);
    await vi.waitFor(() => {
      social.tick(0.1, new THREE.Vector3(), true, true);
      expect(portraits.count).toBe(1);
    });
    social.setView({ sector: sector.sector, sectorKey: sector.key, page: 0 });
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(body().count).toBe(0);
    const moved = people
      .map((entry, index) => (index === 0 ? { ...entry, profileTags: [{ label: 'blue', count: 10 }] } : entry))
      .reverse();
    social.updateData(graph(moved));
    expect(social.findPerson(people[0].id)).toBeNull();
    expect(social.findPerson(people[90].id)).not.toBeNull();
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(body().count).toBe(60);
    burning.dispose();
  });

  it('animates only the fleeing figure and immediately restores its anonymous mask if image approval is revoked', async () => {
    const people = Array.from({ length: 3 }, (_, index) => avatarPerson(index));
    const target = socialSectors(people)[0].members[0];
    const burning = createWorldBurning({ ledger: new Set<string>() });
    const loader = imageLoader();
    social = createSocialPlaza(scene, graph(people), loader, burning);
    social.setAvatarIdentities([{ id: target.id, avatarUrl: target.avatarUrl! }]);
    await vi.waitFor(() => expect(loader.close).toHaveBeenCalledOnce());
    social.tick(0.1, new THREE.Vector3(), true, false);
    const portraits = scene.getObjectByName('social-profile-portraits') as THREE.InstancedMesh;
    const masks = scene.getObjectByName('social-masked-head') as THREE.InstancedMesh;
    const heads = scene.getObjectByName('social-head-picking') as THREE.InstancedMesh;
    const pedestal = scene.getObjectByName('social-pedestal') as THREE.InstancedMesh;
    const original = bodyScale();
    const otherPosition = instancePosition(body(), 1);
    expect(burning.ignite(`social-person:${target.id}`)).toBe(true);
    advanceBurn(burning, 0.7, false);
    const gait = body().geometry.getAttribute('socialRun');
    expect(Math.abs(gait.getX(0))).toBeGreaterThan(0.01);
    expect(gait.getY(0)).toBe(1);
    expect(gait.getY(1)).toBe(0);
    const trousers = scene.getObjectByName('social-trousers') as THREE.InstancedMesh;
    expect(trousers.geometry.getAttribute('socialRun').getX(0)).toBeCloseTo(gait.getX(0), 6);
    expect(bodyScale()).toBeCloseTo(original, 6);
    expect(instancePosition(body(), 1).distanceTo(otherPosition)).toBeLessThan(0.001);
    const portraitPose = new THREE.Matrix4();
    const headPose = new THREE.Matrix4();
    portraits.getMatrixAt(0, portraitPose);
    heads.getMatrixAt(0, headPose);
    expect(portraitPose.equals(headPose)).toBe(true);
    const pedestalPose = new THREE.Matrix4();
    pedestal.getMatrixAt(0, pedestalPose);
    expect(new THREE.Vector3().setFromMatrixScale(pedestalPose).length()).toBe(0);
    expect(portraits.count).toBe(1);
    expect(masks.count).toBe(2);
    const moving = instancePosition(body());
    social.setAvatarIdentities([]);
    social.tick(0, new THREE.Vector3(), false, false);
    expect(portraits.count).toBe(0);
    expect(masks.count).toBe(3);
    expect(instancePosition(body()).distanceTo(moving)).toBeLessThan(0.001);
    advanceBurn(burning, 1, true);
    expect(gait.getX(0)).toBe(0);
    expect(gait.getY(0)).toBe(0);
    expect(instancePosition(body()).distanceTo(moving)).toBeGreaterThan(14);
    expect(bodyScale()).toBeCloseTo(original, 6);
    expect(loader.load).toHaveBeenCalledOnce();
    advanceBurn(burning, 30);
    expect(body().count).toBe(2);
    expect(masks.count).toBe(2);
    burning.dispose();
  });

  it('releases every visible satellite, keeping unassigned decorative heads anonymous and routes independent', async () => {
    const people = Array.from({ length: 120 }, (_, index) => avatarPerson(index, index === 119 ? 2 : 1));
    const sector = socialSectors(people)[0];
    const burning = createWorldBurning({ ledger: new Set<string>() });
    const loader = imageLoader();
    social = createSocialPlaza(scene, graph(people), loader, burning);
    social.setAvatarIdentities(
      socialAvatarPeople(people, { sector: null, page: 0 }).map((entry) => ({
        id: entry.id,
        avatarUrl: entry.avatarUrl!,
      })),
    );
    await vi.waitFor(() => expect(loader.close).toHaveBeenCalledTimes(2));
    social.tick(0.1, new THREE.Vector3(), true, true);
    let random = 0.1;
    vi.spyOn(Math, 'random').mockImplementation(() => (random = (random + 0.173) % 1));
    expect(burning.ignite(`social-sector:${sector.key}`)).toBe(true);
    const portraits = scene.getObjectByName('social-profile-portraits') as THREE.InstancedMesh;
    const masks = scene.getObjectByName('social-masked-head') as THREE.InstancedMesh;
    expect(body().count).toBe(4);
    expect(portraits.count).toBe(2);
    expect(masks.count).toBe(2);
    const start = Array.from({ length: 4 }, (_, index) => instancePosition(body(), index));
    const scales = Array.from({ length: 4 }, (_, index) => bodyScale(index));
    advanceBurn(burning, 2, true, true);
    const directions = start.map((position, index) =>
      instancePosition(body(), index).sub(position).setY(0).normalize(),
    );
    expect(directions.some((direction) => direction.distanceTo(directions[0]) > 0.2)).toBe(true);
    scales.forEach((scale, index) => expect(bodyScale(index)).toBeCloseTo(scale, 6));
    expect(loader.load).toHaveBeenCalledTimes(2);
    expect(people).toHaveLength(120);
    expect(people.every((entry) => !entry.id.startsWith('sculpture:'))).toBe(true);
    social.updateData(graph([...people].reverse()));
    advanceBurn(burning, 5, true, true);
    expect(body().count).toBe(4);
    expect(portraits.count).toBe(2);
    advanceBurn(burning, 30, true, true);
    expect(body().count).toBe(0);
    expect(portraits.count).toBe(0);
    expect(masks.count).toBe(0);
    burning.dispose();
  });

  it('starts escape even when all flame slots are occupied and resumes its own fall lifetime when a slot frees', () => {
    const burning = createWorldBurning({ ledger: new Set<string>() });
    for (let index = 0; index < WORLD_BURN_LIMITS.concurrent - 1; index++) {
      const id = `prop:budget-${index}`;
      burning.bind({
        id,
        getBounds(out) {
          out.min.set(60 + index, 0, 0);
          out.max.set(61 + index, 1, 1);
          return true;
        },
        getDuration: () => 2,
        hide: vi.fn(),
      });
      expect(burning.ignite(id)).toBe(true);
    }
    const people = Array.from({ length: 120 }, (_, index) => person(`person-${index}`));
    const sector = socialSectors(people)[0];
    const representative = socialSectorRepresentatives(sector).central!;
    social = createSocialPlaza(scene, graph(people), undefined, burning);
    expect(burning.ignite(`social-sector:${sector.key}`)).toBe(true);
    expect(burning.isBurning(`social-person:${representative.id}`)).toBe(false);
    expect(body().count).toBe(1);
    const start = instancePosition(body());
    const original = bodyScale();
    advanceBurn(burning, 1, true, true);
    expect(instancePosition(body()).distanceTo(start)).toBeGreaterThan(14);
    const waiting = instancePosition(body());
    // Entering its sector while it burns must not materialize the hidden membership.
    social.setView({ sector: 0, sectorKey: sector.key, page: 0 });
    advanceBurn(burning, 1.2);
    expect(body().count).toBe(1);
    expect(burning.isBurning(`social-person:${representative.id}`)).toBe(true);
    const continued = instancePosition(body()).distanceTo(waiting);
    expect(continued).toBeGreaterThan(15);
    expect(continued).toBeLessThan(23);
    expect(bodyScale()).toBeCloseTo(original, 6);
    advanceBurn(burning, 30);
    expect(body().count).toBe(0);
    expect(social.findPerson(representative.id)).toBeNull();
    expect(burning.isGone(`social-person:${representative.id}`)).toBe(true);
    burning.dispose();
  });

  it('reserves a complete page beside runners and rejects an entire sector when its humans cannot all fit', () => {
    const burning = createWorldBurning({ ledger: new Set<string>() });
    const targets = new Map<string, WorldBurnTarget>();
    const bind = burning.bind.bind(burning);
    vi.spyOn(burning, 'bind').mockImplementation((target) => {
      targets.set(target.id, target);
      return bind(target);
    });
    // Hold the effect allocator full while exercising many distinct snapshot arrivals.
    // Earlier integration cases cover real ignition; this fixture controls admission callbacks.
    vi.spyOn(burning, 'ignite').mockReturnValue(false);
    function snapshot(round: number) {
      return Array.from({ length: 120 }, (_, index) => ({
        ...avatarPerson(round * 200 + index, index >= 117 ? 2 : 1),
        profileTags: [{ label: `group${round}`, count: 10 }],
      }));
    }
    social = createSocialPlaza(scene, graph(snapshot(0)), undefined, burning);
    const geometry = body().geometry;
    for (let round = 0; round < 23; round++) {
      const people = snapshot(round);
      social.updateData(graph(people));
      const target = targets.get(`social-sector:${socialSectors(people)[0].key}`)!;
      expect(target.canIgnite?.()).toBe(true);
      target.onIgnite?.();
    }
    expect(body().count).toBe(92);
    const partial = snapshot(23);
    social.updateData(graph(partial));
    const partialSector = socialSectors(partial)[0];
    social.setView({ sector: partialSector.sector, sectorKey: partialSector.key, page: 0 });
    social.tick(0, new THREE.Vector3(), true, false);
    for (const person of partialSector.members.slice(0, 3)) {
      const target = targets.get(`social-person:${person.id}`)!;
      expect(target.canIgnite?.()).toBe(true);
      target.onIgnite?.();
    }
    const next = snapshot(24);
    social.updateData(graph(next));
    social.setView({ sector: null, page: 0 });
    social.tick(0, new THREE.Vector3(), true, true);
    const nextSector = socialSectors(next)[0];
    const sectorTarget = targets.get(`social-sector:${nextSector.key}`)!;
    expect(body().count).toBe(95);
    expect(sectorTarget.canIgnite?.()).toBe(false);
    const cluster = scene.getObjectByName(`social-sector-${nextSector.sector}`)!;
    expect(cluster.getObjectByName('community-central-bust')!.visible).toBe(true);
    expect(cluster.getObjectByName('community-satellite-busts')!.visible).toBe(true);
    social.setView({ sector: nextSector.sector, sectorKey: nextSector.key, page: 0 });
    social.tick(0, new THREE.Vector3(), true, false);
    expect(body().count).toBe(191);
    const last = targets.get(`social-person:${nextSector.members[0].id}`)!;
    expect(last.canIgnite?.()).toBe(true);
    last.onIgnite?.();
    expect(targets.get(`social-person:${nextSector.members[1].id}`)!.canIgnite?.()).toBe(false);
    const final = snapshot(25);
    social.updateData(graph(final));
    const finalSector = socialSectors(final)[0];
    social.setView({ sector: finalSector.sector, sectorKey: finalSector.key, page: 0 });
    social.tick(0, new THREE.Vector3(), true, false);
    expect(body().count).toBe(192);
    expect(body().instanceMatrix.count).toBe(192);
    expect(body().geometry).toBe(geometry);
    expect(social.findPerson(finalSector.members[0].id)).not.toBeNull();
    burning.dispose();
  });

  function cameraForRay(origin: THREE.Vector3, target: THREE.Vector3) {
    const camera = new THREE.PerspectiveCamera();
    camera.position.copy(origin);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    return camera;
  }

  it('replaces all 32 overview masks with approved portraits and preserves sector picking and page navigation', async () => {
    const people = Array.from({ length: 8 }, (_, sector) =>
      Array.from({ length: 17 }, (_, index) => ({
        ...avatarPerson(sector * 20 + index, index < 14 ? 1 : 2),
        profileTags: sector < 7 ? [{ label: `group-${sector}`, count: 10 }] : [],
      })),
    ).flat();
    const loader = imageLoader();
    social = createSocialPlaza(scene, graph(people), loader);
    const representatives = socialAvatarPeople(people, { sector: null, page: 0 });
    const identities = representatives.map((entry) => ({ id: entry.id, avatarUrl: entry.avatarUrl! }));
    const portraits = scene.getObjectByName('social-profile-portraits') as THREE.InstancedMesh;
    const geometry = portraits.geometry;
    const material = portraits.material;
    social.setAvatarIdentities(identities);
    await vi.waitFor(() => expect(loader.close).toHaveBeenCalledTimes(32));
    social.tick(0.1, new THREE.Vector3(), true, true);
    expect(body().count).toBe(0);
    expect(portraits.count).toBe(32);
    expect(portraits.instanceMatrix.count).toBe(192);
    for (const sector of socialSectors(people)) {
      const cluster = scene.getObjectByName(`social-sector-${sector.sector}`)!;
      for (const name of ['community-central-head', ...[0, 1, 2].map((index) => `community-satellite-head-${index}`)]) {
        const head = cluster.getObjectByName(name)!;
        expect(head.getObjectByName('community-anonymous-mask')?.visible).toBe(false);
        expect(head.getObjectByName('community-profile-back')?.visible).toBe(true);
      }
    }
    scene.updateMatrixWorld(true);
    const cluster = scene.getObjectByName('social-sector-1')!;
    const central = cluster.getObjectByName('community-central-head')!;
    const matrix = new THREE.Matrix4();
    portraits.getMatrixAt(4, matrix);
    expect(
      new THREE.Vector3(0, 2.55, 0).applyMatrix4(matrix).distanceTo(central.getWorldPosition(new THREE.Vector3())),
    ).toBeLessThan(0.00001);
    const ray = new THREE.Raycaster(
      central.localToWorld(new THREE.Vector3(0, 0, 2)),
      new THREE.Vector3(0, 0, -1).transformDirection(central.matrixWorld),
    );
    ray.camera = new THREE.PerspectiveCamera();
    ray.camera.position.copy(ray.ray.origin);
    ray.camera.lookAt(central.getWorldPosition(new THREE.Vector3()));
    ray.camera.updateMatrixWorld(true);
    expect(ray.intersectObject(portraits)[0]?.instanceId).toBe(4);
    const action = { kind: 'social-cluster', sector: 1, sectorKey: 'tag:group-1' };
    expect(social.pick(ray)?.action).toEqual(action);
    expect(social.nearest(cluster.position.x, cluster.position.z)?.action).toEqual(action);

    social.setView({ sector: 1, sectorKey: 'tag:group-1', page: 0 });
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(body().count).toBe(17);
    expect(portraits.count).toBe(4);
    social.setView({ sector: null, page: 0 });
    await vi.waitFor(() => {
      social.tick(0.1, new THREE.Vector3(), true, true);
      expect(portraits.count).toBe(32);
    });
    expect(portraits.geometry).toBe(geometry);
    expect(portraits.material).toBe(material);
    social.setAvatarIdentities([]);
    social.tick(0.1, new THREE.Vector3(), true, true);
    expect(portraits.count).toBe(0);
    expect(central.getObjectByName('community-anonymous-mask')?.visible).toBe(true);
    expect(central.getObjectByName('community-profile-back')?.visible).toBe(false);
    expect(social.pick(ray)?.action).toEqual(action);
    const sharedMask = central.getObjectByName('community-anonymous-mask')!.children[0] as THREE.Mesh;
    const releaseMask = vi.spyOn(sharedMask.geometry, 'dispose');
    const releasePortrait = vi.spyOn(geometry, 'dispose');
    social.dispose();
    expect(releaseMask).toHaveBeenCalledOnce();
    expect(releasePortrait).toHaveBeenCalledOnce();
  });

  it('keeps pending, failed and missing overview images masked and rejects a late revoked image', async () => {
    const original = Array.from({ length: 120 }, (_, index) => avatarPerson(index, index < 117 ? 1 : 2));
    const { central, satellites } = socialSectorRepresentatives(socialSectors(original)[0]);
    const people = original.map((entry) =>
      entry.id === satellites[2].id ? { ...entry, avatarUrl: undefined } : entry,
    );
    const loader = imageLoader();
    let resolvePending!: (bitmap: ImageBitmap) => void;
    const pending = new Promise<ImageBitmap>((resolve) => {
      resolvePending = resolve;
    });
    loader.load.mockImplementation(async (identity: { id: string }) => {
      if (identity.id === central!.id) return pending;
      if (identity.id === satellites[0].id) return null;
      return asOpaque<ImageBitmap>({ width: 128, height: 128, close: loader.close });
    });
    social = createSocialPlaza(scene, graph(people), loader);
    social.setAvatarIdentities(
      [central!, ...satellites].map((entry) => ({ id: entry.id, avatarUrl: entry.avatarUrl! })),
    );
    await vi.waitFor(() => expect(loader.close).toHaveBeenCalledOnce());
    social.tick(0.1, new THREE.Vector3(), true, true);
    const portraits = scene.getObjectByName('social-profile-portraits') as THREE.InstancedMesh;
    expect(portraits.count).toBe(1);
    expect(loader.load).toHaveBeenCalledTimes(3);
    const cluster = scene.getObjectByName('social-sector-0')!;
    for (const name of ['community-central-head', 'community-satellite-head-0', 'community-satellite-head-2'])
      expect(cluster.getObjectByName(name)?.getObjectByName('community-anonymous-mask')?.visible).toBe(true);
    expect(
      cluster.getObjectByName('community-satellite-head-1')?.getObjectByName('community-anonymous-mask')?.visible,
    ).toBe(false);
    social.setAvatarIdentities([]);
    resolvePending(asOpaque<ImageBitmap>({ width: 128, height: 128, close: loader.close }));
    await vi.waitFor(() => expect(loader.close).toHaveBeenCalledTimes(2));
    social.tick(0.1, new THREE.Vector3(), true, true);
    expect(portraits.count).toBe(0);
    expect(cluster.getObjectByName('community-central-head')?.getObjectByName('community-profile-back')?.visible).toBe(
      false,
    );
  });

  it('keeps overview portraits and rapidly fading pages inside the same 192-slot pool', async () => {
    const people = Array.from({ length: 300 }, (_, index) => avatarPerson(index, index < 297 ? 1 : 2));
    const loader = imageLoader();
    social = createSocialPlaza(scene, graph(people), loader);
    const representatives = socialAvatarPeople(people, { sector: null, page: 0 });
    const ordered = socialSectors(people)[0].members;
    const identities = [...new Map([...representatives, ...ordered].map((entry) => [entry.id, entry])).values()]
      .slice(0, 192)
      .map((entry) => ({ id: entry.id, avatarUrl: entry.avatarUrl! }));
    social.setAvatarIdentities(identities);
    social.setView({ sector: 0, page: 0 });
    social.tick(0.1, new THREE.Vector3(), true, false);
    social.setView({ sector: 0, page: 1 });
    social.tick(0.05, new THREE.Vector3(), false, false);
    social.setView({ sector: null, page: 0 });
    await vi.waitFor(() => expect(loader.close).toHaveBeenCalledTimes(loader.load.mock.calls.length));
    social.tick(0, new THREE.Vector3(), false, true);
    const portraits = scene.getObjectByName('social-profile-portraits') as THREE.InstancedMesh;
    const masks = scene.getObjectByName('social-masked-head') as THREE.InstancedMesh;
    expect(body().count).toBe(192);
    expect(portraits.count).toBe(192);
    expect(masks.count).toBe(4);
    expect(portraits.instanceMatrix.count).toBe(192);
    social.tick(1, new THREE.Vector3(), true, true);
    expect(body().count).toBe(0);
    expect(portraits.count).toBe(4);
  });

  it('uses count clusters for large networks and can select the last ID without growing its render pool', () => {
    const people = Array.from({ length: 2000 }, (_, index) => person(`person-${index}`));
    social = createSocialPlaza(scene, graph(people));
    expect(body().count).toBe(0);
    expect(scene.getObjectByName(`social-sector-${socialSectors(people)[0].sector}`)?.visible).toBe(true);
    const initialChildren = scene.getObjectByName('world-social')?.children.length;
    const destination = social.findPerson(people.at(-1)!.id);
    expect(destination?.person.id).toBe(people.at(-1)!.id);
    if (!destination) return;
    const location = new THREE.Vector3(destination.position[0], 0.2, destination.position[1]);
    social.tick(0.1, location, true, false);
    expect(body().count).toBeGreaterThan(0);
    expect(body().count).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
    expect(social.nearest(location.x, location.z)?.action).toEqual({ kind: 'person', id: destination.person.id });
    for (let page = 0; page < 8; page++) social.setView({ sector: socialSectors(people)[0].sector, page });
    social.tick(0.1, location, true, false);
    expect(body().count).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
    expect(scene.getObjectByName('world-social')?.children.length).toBe(initialChildren);
  });

  it('keeps masked heads and varied outfits within a fixed full-page geometry budget', () => {
    social = createSocialPlaza(
      scene,
      graph(Array.from({ length: SOCIAL_PAGE_SIZE }, (_, index) => person(`person-${index}`))),
    );
    const batches = scene
      .getObjectByName('world-social')!
      .children.filter((object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh);
    expect(batches.length).toBeLessThanOrEqual(26);
    for (const batch of batches) {
      expect(batch.instanceMatrix.count).toBe(SOCIAL_PAGE_SIZE * 2);
      expect(batch.count).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
    }
    for (const category of ['social-masked-head', 'social-mask-visor', 'social-garment-']) {
      expect(
        batches.filter((batch) => batch.name.startsWith(category)).reduce((count, batch) => count + batch.count, 0),
      ).toBe(SOCIAL_PAGE_SIZE);
    }
    const triangles = batches.reduce(
      (count, batch) =>
        count + ((batch.geometry.index?.count ?? batch.geometry.attributes.position.count) / 3) * batch.count,
      0,
    );
    expect(triangles).toBeLessThan(SOCIAL_PAGE_SIZE * 16_000);
    // Once transitions settle, fine geometry does not add a permanent crowd animation/upload cost.
    social.tick(0.1, new THREE.Vector3(), true, true);
    const version = body().instanceMatrix.version;
    social.tick(0.1, new THREE.Vector3(), false, true);
    expect(body().instanceMatrix.version).toBe(version);
  });

  it('keeps fictional appearances stable when profile text or follow degree changes', () => {
    const original = person('stable-public-key');
    const appearance = socialPersonAppearance(original);
    expect(socialPersonAppearance({ ...original, name: 'Updated name', bio: 'Updated profile text' })).toEqual(
      appearance,
    );
    const secondary = socialPersonAppearance({ ...original, degree: 2 });
    expect(secondary.height).toBe(appearance.height);
    expect(secondary.garmentStyle).toBe(appearance.garmentStyle);
    expect(secondary.headPose).toEqual(appearance.headPose);
    expect(secondary.colors.accent).not.toEqual(appearance.colors.accent);
  });

  it('keeps head picking attached to the correct person when portrait and mask batches compact independently', async () => {
    const pixels = new Uint8ClampedArray(32 * 32 * 4);
    pixels[3] = 255;
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      asOpaque<CanvasRenderingContext2D>({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        drawImage: vi.fn(),
        getImageData: () => ({ data: pixels }),
      }),
    );
    const people = ['b', 'n', 'y'].map((letter) => {
      const id = letter.repeat(52);
      return { ...person(id), avatarUrl: `https://nexus.pubky.app/static/avatar/${id}` };
    });
    const close = vi.fn();
    const loader = {
      load: vi.fn().mockResolvedValue(asOpaque<ImageBitmap>({ width: 128, height: 128, close })),
      dispose: vi.fn(),
    };
    social = createSocialPlaza(scene, graph(people), loader);
    social.setAvatarIdentities([people[1]]);
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    social.tick(0.1, new THREE.Vector3(), true, true);
    const portraits = scene.getObjectByName('social-profile-portraits') as THREE.InstancedMesh;
    const masks = scene.getObjectByName('social-masked-head') as THREE.InstancedMesh;
    const heads = scene.getObjectByName('social-head-picking') as THREE.InstancedMesh;
    expect(portraits.count).toBe(1);
    expect(masks.count).toBe(2);
    expect(heads.count).toBe(3);
    scene.updateMatrixWorld(true);
    const matrix = new THREE.Matrix4();
    heads.getMatrixAt(2, matrix);
    const center = new THREE.Vector3(0, 2.55, 0).applyMatrix4(matrix);
    const ray = new THREE.Raycaster(center.clone().add(new THREE.Vector3(0, 0, 2)), new THREE.Vector3(0, 0, -1));
    const expected = social.nearest(center.x, center.z)?.action;
    expect(social.pick(ray)?.action).toEqual(expected);
    expect(expected?.kind).toBe('person');
    social.setAvatarIdentities([]);
    social.tick(0.1, new THREE.Vector3(), true, true);
    expect(portraits.count).toBe(0);
    expect(masks.count).toBe(3);
    scene.updateMatrixWorld(true);
    expect(social.pick(ray)?.action).toEqual(expected);
  });

  it('previews real names and exact counts in existing sector textures as profiles change', () => {
    const fillText = vi.fn();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(
      asOpaque<CanvasRenderingContext2D>({ clearRect: vi.fn(), fillRect: vi.fn(), fillText }),
    );
    const people = Array.from({ length: 160 }, (_, index) => ({
      ...person(index.toString(36).padStart(52, '0')),
      name: `Friend ${index}`,
      profileLoaded: true,
      profileTags: [{ label: 'synonym', count: 32 }],
      profileTagsStatus: 'loaded' as const,
    }));
    const sector = socialSectors(people)[0].sector;
    const members = [...people].sort((a, b) => a.id.localeCompare(b.id));
    members[0].name = 'Avery';
    members[1].name = 'Bo';
    social = createSocialPlaza(scene, graph(people));
    expect(fillText).toHaveBeenCalledWith('Synonym', 320, 51, 594);
    expect(fillText).toHaveBeenCalledWith('Includes Avery · Bo', 320, 132, 594);
    expect(fillText).toHaveBeenCalledWith(`${members.length} people · ${members.length} following`, 320, 219, 594);
    const textures: (THREE.Texture | null)[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Sprite) textures.push(object.material.map);
    });
    const cluster = scene.getObjectByName(`social-sector-${sector}`)!;
    expect(social.nearest(cluster.position.x, cluster.position.z)?.title).toContain('Preview Synonym');
    expect(social.nearest(cluster.position.x, cluster.position.z)?.action).toEqual({
      kind: 'social-cluster',
      sector,
      sectorKey: 'tag:synonym',
    });
    social.updateData(
      graph(people.map((person) => (person.id === members[0].id ? { ...person, name: 'Avery updated' } : person))),
    );
    expect(fillText).toHaveBeenCalledWith('Includes Avery updated · Bo', 320, 132, 594);
    const nextTextures: (THREE.Texture | null)[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.Sprite) nextTextures.push(object.material.map);
    });
    expect(nextTextures).toEqual(textures);
    expect(body().count).toBe(0);
  });

  it('retains fixed resources and a selected tag when loaded metadata adds or removes neighborhoods', () => {
    const people = Array.from({ length: 140 }, (_, index) => ({
      ...person(index.toString(36).padStart(52, '0')),
      profileTags: [{ label: 'synonym', count: 32 }],
      profileTagsStatus: 'loaded' as const,
    }));
    social = createSocialPlaza(scene, graph(people));
    const resources = scene.getObjectByName('world-social')!.children.length;
    social.setView({ sector: 0, sectorKey: 'tag:synonym', page: 1 });
    expect(body().count).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
    const art = {
      ...person('z'.repeat(52)),
      profileTags: [{ label: 'art', count: 3 }],
      profileTagsStatus: 'loaded' as const,
    };
    social.updateData(graph([...people, art]));
    const target = social.findPerson(people.at(-1)!.id);
    expect(target?.sectorKey).toBe('tag:synonym');
    expect(target?.sector).toBe(1);
    expect(scene.getObjectByName('world-social')!.children.length).toBe(resources);
    social.updateData(graph(people.map((entry) => ({ ...entry, profileTags: [{ label: 'bitcoin', count: 2 }] }))));
    expect(body().count).toBe(0);
    expect(scene.getObjectByName('social-sector-0')?.visible).toBe(true);
    expect(scene.getObjectByName('world-social')!.children.length).toBe(resources);
  });

  it('tweens a live demotion and applies reduced-motion changes immediately', () => {
    social = createSocialPlaza(scene, graph([person('friend')]));
    expect(bodyScale()).toBeCloseTo(1.15);
    social.updateData(graph([person('friend', 2)]));
    social.tick(0.05, new THREE.Vector3(), false, false);
    expect(bodyScale()).toBeGreaterThan(0.5);
    expect(bodyScale()).toBeLessThan(1.15);
    social.tick(0.05, new THREE.Vector3(), true, false);
    expect(bodyScale()).toBeCloseTo(0.5);
    social.updateData(graph([person('friend')]));
    social.tick(0.05, new THREE.Vector3(), true, false);
    expect(bodyScale()).toBeCloseTo(1.15);
  });

  it('maps instance ray hits to the correct public profile instead of the shared mesh', () => {
    social = createSocialPlaza(scene, graph([person('first'), person('second')]));
    const destination = social.findPerson('second');
    expect(destination).not.toBeNull();
    if (!destination) return;
    social.tick(0.1, new THREE.Vector3(), true, false);
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(destination.position[0], 8, destination.position[1]),
      new THREE.Vector3(0, -1, 0),
    );
    expect(social.pick(ray)?.action).toEqual({ kind: 'person', id: 'second' });
  });

  it('refreshes picking bounds when a previously picked instance pool moves to new profiles', () => {
    social = createSocialPlaza(scene, graph([person('first')]));
    const first = social.findPerson('first')!;
    social.tick(0.1, new THREE.Vector3(), true, false);
    scene.updateMatrixWorld(true);
    expect(
      social.pick(
        new THREE.Raycaster(new THREE.Vector3(first.position[0], 8, first.position[1]), new THREE.Vector3(0, -1, 0)),
      )?.action,
    ).toEqual({ kind: 'person', id: 'first' });
    social.updateData(graph(Array.from({ length: 48 }, (_, index) => person(`replacement-${index}`))));
    const destination = social.findPerson('replacement-47')!;
    social.tick(0.1, new THREE.Vector3(), true, false);
    scene.updateMatrixWorld(true);
    expect(
      social.pick(
        new THREE.Raycaster(
          new THREE.Vector3(destination.position[0], 8, destination.position[1]),
          new THREE.Vector3(0, -1, 0),
        ),
      )?.action,
    ).toEqual({ kind: 'person', id: 'replacement-47' });
  });

  it('draws only supplied relationships and narrows them to the focused person', () => {
    const value = graph([person('friend'), person('discovery', 2, ['friend'])]);
    value.relationships.push({ from: 'friend', to: 'discovery', label: 'follows' });
    social = createSocialPlaza(scene, value);
    const lines = scene.getObjectByName('social-follow-lines');
    if (!(lines instanceof THREE.LineSegments)) throw new Error('Follow line buffer missing');
    expect(lines.geometry.drawRange.count).toBe(48);
    social.setFocus('discovery');
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(lines.geometry.drawRange.count).toBe(24);
    social.updateData({ ...value, relationships: [] });
    social.tick(0.1, new THREE.Vector3(), true, false);
    expect(lines.geometry.drawRange.count).toBe(0);
  });

  it('releases instance and line buffers when the world closes', () => {
    social = createSocialPlaza(scene, graph([person('friend')]));
    const geometry = body().geometry;
    const disposed = vi.spyOn(geometry, 'dispose');
    social.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(scene.getObjectByName('world-social')).toBeUndefined();
  });
});
