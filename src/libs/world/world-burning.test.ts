import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWorldBurning,
  createWorldGroupBurnTarget,
  createWorldInstanceBurnTarget,
  WORLD_BURN_LIMITS,
  type WorldBurnEvent,
  type WorldBurnTarget,
  type WorldFireExposure,
} from '@/libs/world/world-burning';
import { disposeObject } from '@/libs/world/world-geometry';
import type { WorldObstacle } from '@/libs/world/world-motion';
import { asInvalid } from '@/test-utils/type-assertions';

describe('local world burning lifecycle', () => {
  const scenes: THREE.Scene[] = [];

  afterEach(() => {
    scenes.forEach(disposeObject);
    scenes.length = 0;
    vi.restoreAllMocks();
  });

  function fixture(id = 'prop:box', position = new THREE.Vector3(0, 1, 5)) {
    const scene = new THREE.Scene();
    scenes.push(scene);
    const group = new THREE.Group();
    group.position.copy(position);
    const material = new THREE.MeshStandardMaterial({ color: '#77AA33' });
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    group.add(new THREE.Mesh(geometry, material));
    scene.add(group);
    const obstacle: WorldObstacle = { x: position.x, z: position.z, radius: 1, enabled: true };
    const target = createWorldGroupBurnTarget(id, [group], [obstacle]);
    return { scene, group, material, geometry, obstacle, target };
  }

  function ray(seconds = 0.1, overrides: Partial<WorldFireExposure> = {}): WorldFireExposure {
    return {
      origin: new THREE.Vector3(0, 1, 0),
      direction: new THREE.Vector3(0, 0, 1),
      range: 22,
      halfAngle: 0,
      seconds,
      ...overrides,
    };
  }

  function ignite(burning: ReturnType<typeof createWorldBurning>, exposure = ray()) {
    burning.expose(exposure);
    burning.tick(0.1);
    burning.expose(exposure);
  }

  function advance(burning: ReturnType<typeof createWorldBurning>, seconds: number, reducedMotion = false) {
    for (let frame = 0; frame < Math.ceil(seconds * 10); frame++) burning.tick(0.1, reducedMotion);
  }

  it('requires sustained heat, disables collision before ignition, and reports copied bounds', () => {
    const { target, group, obstacle } = fixture();
    const onIgnite = vi.fn((event: WorldBurnEvent) => {
      expect(obstacle.enabled).toBe(false);
      expect(event.duration).toBeGreaterThanOrEqual(4);
      expect(event.duration).toBeLessThanOrEqual(7);
    });
    const burning = createWorldBurning({ ledger: new Set(), onIgnite });
    burning.bind(target);
    burning.expose(ray());
    expect(burning.isBurning(target.id)).toBe(false);
    expect(obstacle.enabled).toBe(true);
    burning.tick(0.1);
    burning.expose(ray());
    expect(burning.isBurning(target.id)).toBe(true);
    expect(group.visible).toBe(true);
    expect(onIgnite).toHaveBeenCalledTimes(1);
    const event = onIgnite.mock.calls[0][0];
    expect(event.bounds.min.toArray()).toEqual([-1, 0, 4]);
    event.bounds.makeEmpty();
    const bounds = new THREE.Box3();
    target.getBounds(bounds);
    expect(bounds.min.toArray()).toEqual([-1, 0, 4]);
    expect(bounds.max.toArray()).toEqual([1, 2, 6]);
  });

  it('cools brief exposure instead of accumulating unrelated taps indefinitely', () => {
    const { target } = fixture();
    const burning = createWorldBurning({ ledger: new Set() });
    burning.bind(target);
    burning.expose(ray());
    advance(burning, 0.5);
    burning.expose(ray());
    expect(burning.isBurning(target.id)).toBe(false);
    burning.tick(0.1);
    burning.expose(ray());
    expect(burning.isBurning(target.id)).toBe(true);
  });

  it('keeps objects intact until one explosion completion with original bounds and untouched resources', () => {
    const { target, group, material, geometry, obstacle } = fixture();
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const originalColor = material.color.clone();
    const onGone = vi.fn(() => {
      expect(group.visible).toBe(false);
      expect(obstacle.enabled).toBe(false);
    });
    const burning = createWorldBurning({ ledger: new Set(), onGone });
    burning.bind(target);
    ignite(burning);
    advance(burning, 2);
    expect(group.scale.toArray()).toEqual([1, 1, 1]);
    advance(burning, 1.4);
    expect(group.scale.toArray()).toEqual([1, 1, 1]);
    expect(group.visible).toBe(true);
    group.scale.setScalar(2); // Existing animation remains free to set its own transform.
    obstacle.enabled = true;
    burning.tick(0);
    expect(group.scale.x).toBe(2);
    expect(obstacle.enabled).toBe(false);
    advance(burning, 4);
    expect(burning.isGone(target.id)).toBe(true);
    expect(burning.isBurning(target.id)).toBe(false);
    expect(onGone).toHaveBeenCalledExactlyOnceWith(
      target.id,
      expect.objectContaining({
        id: target.id,
        completion: 'explode',
        bounds: new THREE.Box3(new THREE.Vector3(-1, 0, 4), new THREE.Vector3(1, 2, 6)),
      }),
    );
    expect(material.color.equals(originalColor)).toBe(true);
    expect(material.opacity).toBe(1);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    group.visible = true;
    burning.tick(0.01);
    expect(group.visible).toBe(false);
    burning.dispose();
    expect(disposeGeometry).not.toHaveBeenCalled();
  });

  it('respects reduced motion while completing the deliberate burn and hide', () => {
    const { target, group } = fixture();
    const burning = createWorldBurning({ ledger: new Set() });
    burning.bind(target);
    ignite(burning);
    advance(burning, 3.9, true);
    expect(group.scale.toArray()).toEqual([1, 1, 1]);
    expect(group.visible).toBe(true);
    advance(burning, 4, true);
    expect(group.visible).toBe(false);
  });

  it('keeps an ignited identity gone across remounts but a new page ledger starts clean', () => {
    const ledger = new Set<string>();
    const first = fixture('post:author:post-id');
    const burning = createWorldBurning({ ledger });
    burning.bind(first.target);
    ignite(burning);
    burning.dispose();
    const second = fixture(first.target.id);
    const onGone = vi.fn();
    const onIgnite = vi.fn();
    const replacement = createWorldGroupBurnTarget(second.target.id, [second.group], [second.obstacle], { onGone });
    const remounted = createWorldBurning({ ledger, onIgnite });
    remounted.bind(replacement);
    expect(second.group.visible).toBe(false);
    expect(second.obstacle.enabled).toBe(false);
    expect(onGone).toHaveBeenCalledTimes(1);
    remounted.tick(0.1);
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(onIgnite).not.toHaveBeenCalled();
    const refreshed = fixture(first.target.id);
    const newPage = createWorldBurning({ ledger: new Set() });
    newPage.bind(refreshed.target);
    expect(refreshed.group.visible).toBe(true);
    expect(newPage.isGone(first.target.id)).toBe(false);
  });

  it('retains default in-memory identity state when the controller is recreated', () => {
    const first = fixture('test-page-lifetime:local-burn');
    const burning = createWorldBurning();
    burning.bind(first.target);
    ignite(burning);
    burning.dispose();
    const second = fixture(first.target.id);
    const remounted = createWorldBurning();
    remounted.bind(second.target);
    expect(second.group.visible).toBe(false);
    remounted.dispose();
  });

  it('makes releases identity-safe and resumes a replacement during an active burn', () => {
    const first = fixture();
    const burning = createWorldBurning({ ledger: new Set() });
    const releaseOld = burning.bind(first.target);
    ignite(burning);
    advance(burning, 3.4);
    const second = fixture(first.target.id);
    const onIgnite = vi.fn();
    const replacement = { ...second.target, onIgnite };
    burning.bind(replacement);
    releaseOld();
    expect(second.group.scale.toArray()).toEqual([1, 1, 1]);
    expect(second.obstacle.enabled).toBe(false);
    expect(onIgnite).toHaveBeenCalledTimes(1);
    advance(burning, 5);
    expect(second.group.visible).toBe(false);
    expect(first.group.visible).toBe(true);
  });

  it('suppresses child identities when their parent burns, including new data bindings', () => {
    const parent = fixture('tag:bitcoin');
    const child = fixture('post:author:one', new THREE.Vector3(8, 1, 5));
    const ledger = new Set<string>();
    const burning = createWorldBurning({ ledger });
    burning.bind(parent.target);
    burning.bind({ ...child.target, parentId: parent.target.id });
    ignite(burning);
    expect(burning.isBurning(child.target.id)).toBe(true);
    expect(child.obstacle.enabled).toBe(false);
    advance(burning, 8);
    expect(child.group.visible).toBe(false);
    const freshChild = fixture('post:author:two');
    burning.bind({ ...freshChild.target, parentId: parent.target.id });
    expect(freshChild.group.visible).toBe(false);
    expect(ledger.has(freshChild.target.id)).toBe(false);
  });

  it('hits the nearest solid and lets a cone reach multiple exposed objects without multiplying heat', () => {
    const front = fixture('prop:front');
    const behind = fixture('prop:behind', new THREE.Vector3(0, 1, 10));
    const side = fixture('prop:side', new THREE.Vector3(3.3, 1, 8));
    const burning = createWorldBurning({ ledger: new Set() });
    for (const item of [front, behind, side]) burning.bind(item.target);
    const exposure = ray(0.1, { halfAngle: 0.5 });
    burning.expose(exposure);
    expect(burning.isBurning(front.target.id)).toBe(false);
    expect(burning.isBurning(side.target.id)).toBe(false);
    burning.tick(0.1);
    burning.expose(exposure);
    expect(burning.isBurning(front.target.id)).toBe(true);
    expect(burning.isBurning(side.target.id)).toBe(true);
    expect(burning.isBurning(behind.target.id)).toBe(false);
  });

  it('uses real geometry after broad-phase bounds and handles origins inside those bounds', () => {
    const { group, target } = fixture('prop:frame');
    group.children[0].position.x = 4;
    const secondHalf = group.children[0].clone();
    secondHalf.position.set(-4, 0, -4);
    group.add(secondHalf);
    const throughGap = fixture('prop:gap', new THREE.Vector3(0, 1, 8));
    const burning = createWorldBurning({ ledger: new Set() });
    burning.bind(target);
    burning.bind(throughGap.target);
    ignite(burning);
    expect(burning.isBurning(target.id)).toBe(false);
    expect(burning.isBurning(throughGap.target.id)).toBe(true);
    const interior = fixture('prop:inside', new THREE.Vector3(0, 1, 4));
    const bounded: WorldBurnTarget = {
      ...interior.target,
      getBounds: (out) => {
        out.set(new THREE.Vector3(-8, -8, -8), new THREE.Vector3(8, 8, 20));
        return true;
      },
    };
    burning.bind(bounded);
    ignite(burning);
    expect(burning.isBurning(interior.target.id)).toBe(true);
  });

  it('excludes a ridden parent and its descendants without blocking targets ahead', () => {
    const ride = fixture('ride:dragon');
    const head = fixture('ride-part:dragon-head', new THREE.Vector3(0, 1, 7));
    const ahead = fixture('prop:ahead', new THREE.Vector3(0, 1, 12));
    const burning = createWorldBurning({ ledger: new Set() });
    burning.bind(ride.target);
    burning.bind({ ...head.target, parentId: ride.target.id });
    burning.bind(ahead.target);
    ignite(burning, ray(0.1, { excludeIds: new Set([ride.target.id]) }));
    expect(burning.isBurning(ride.target.id)).toBe(false);
    expect(burning.isBurning(head.target.id)).toBe(false);
    expect(burning.isBurning(ahead.target.id)).toBe(true);
  });

  it('bounds active burns, durations, saved identities, ray reach and malformed input', () => {
    const events: { duration: number; bounds: THREE.Box3 }[] = [];
    const burning = createWorldBurning({ ledger: new Set(), onIgnite: (event) => events.push(event) });
    for (let index = 0; index < WORLD_BURN_LIMITS.concurrent + 1; index++) {
      const item = fixture(`prop:bounded:${index}`, new THREE.Vector3(index * 4, 1, 5));
      burning.bind(item.target);
      ignite(burning, ray(0.1, { origin: new THREE.Vector3(index * 4, 1, 0) }));
    }
    expect(events).toHaveLength(WORLD_BURN_LIMITS.concurrent);
    expect(events.every((event) => event.duration >= 4 && event.duration <= 7)).toBe(true);
    const far = fixture('prop:too-far', new THREE.Vector3(0, 1, 100));
    const isolated = createWorldBurning({ ledger: new Set() });
    isolated.bind(far.target);
    ignite(isolated, ray(0.1, { range: 1e20 }));
    expect(isolated.isBurning(far.target.id)).toBe(false);
    const bad = fixture('prop:bad');
    isolated.bind(bad.target);
    for (const change of [
      { seconds: NaN },
      { range: Infinity },
      { halfAngle: -1 },
      { direction: new THREE.Vector3() },
      { origin: new THREE.Vector3(Infinity, 0, 0) },
    ])
      isolated.expose(ray(0.1, change));
    isolated.tick(NaN);
    expect(isolated.isBurning(bad.target.id)).toBe(false);
    isolated.expose(ray(1000));
    expect(isolated.isBurning(bad.target.id)).toBe(false);
    const full = new Set(Array.from({ length: WORLD_BURN_LIMITS.remembered }, (_, index) => `saved:${index}`));
    const limited = createWorldBurning({ ledger: full });
    limited.bind(bad.target);
    ignite(limited);
    expect(full.size).toBe(WORLD_BURN_LIMITS.remembered);
    expect(limited.isBurning(bad.target.id)).toBe(false);
  });

  it('rejects invalid IDs and world-sized invalid bounds without prototype-key hazards', () => {
    const burning = createWorldBurning({ ledger: new Set() });
    for (const id of ['', 'unnamespaced', '__proto__', 'post:bad\u0000id', 'a:'.padEnd(513, 'a')]) {
      const item = fixture(id);
      burning.bind(item.target);
    }
    burning.bind(asInvalid<WorldBurnTarget>({ ...fixture().target, id: null }));
    const huge = fixture('prop:oversized');
    huge.group.scale.setScalar(1000);
    burning.bind(huge.target);
    ignite(burning);
    expect(burning.isBurning(huge.target.id)).toBe(false);
    const safe = fixture('post:__proto__');
    burning.bind(safe.target);
    ignite(burning);
    expect(burning.isBurning(safe.target.id)).toBe(true);
  });

  it('ignores further calls after dispose and releases bindings without disposing originals', () => {
    const { target, group } = fixture();
    const burning = createWorldBurning({ ledger: new Set() });
    const release = burning.bind(target);
    release();
    ignite(burning);
    expect(burning.isBurning(target.id)).toBe(false);
    burning.bind(target);
    burning.dispose();
    ignite(burning);
    advance(burning, 8);
    expect(group.visible).toBe(true);
    burning.bind(target);
    expect(group.visible).toBe(true);
  });

  it('removes only the selected logical instance across shared batches and refreshes their bounds', () => {
    const scene = new THREE.Scene();
    scenes.push(scene);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    const first = new THREE.InstancedMesh(geometry, material, 2);
    const second = new THREE.InstancedMesh(geometry, material, 2);
    scene.add(first, second);
    for (const batch of [first, second]) {
      batch.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, batch === first ? 1 : 2, 5));
      batch.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, batch === first ? 1 : 2, 5));
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
    }
    const untouched = new THREE.Matrix4();
    first.getMatrixAt(1, untouched);
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    const obstacle: WorldObstacle = { x: 0, z: 5, radius: 0.5 };
    const target = createWorldInstanceBurnTarget('nature:pine:0', [first, second], 0, [obstacle]);
    const other = createWorldInstanceBurnTarget('nature:pine:1', [first, second], 1);
    const burning = createWorldBurning({ ledger: new Set() });
    burning.bind(target);
    burning.bind(other);
    const bounds = new THREE.Box3();
    expect(target.getBounds(bounds)).toBe(true);
    expect(bounds.min.toArray()).toEqual([-0.5, 0.5, 4.5]);
    expect(bounds.max.toArray()).toEqual([0.5, 2.5, 5.5]);
    const away = new THREE.Raycaster(new THREE.Vector3(4, 1, 0), new THREE.Vector3(0, 0, 1), 0, 22);
    expect(target.raycast!(away)).toBeNull();
    ignite(burning);
    advance(burning, 3.8);
    const intact = new THREE.Matrix4();
    first.getMatrixAt(0, intact);
    expect(intact.determinant()).toBe(1);
    advance(burning, 8);
    const matrix = new THREE.Matrix4();
    for (const batch of [first, second]) {
      batch.getMatrixAt(0, matrix);
      expect(matrix.determinant()).toBe(0);
      expect(batch.count).toBe(2);
      expect(batch.visible).toBe(true);
      batch.getMatrixAt(1, matrix);
      expect(matrix.elements[0]).toBe(1);
      expect(batch.boundingBox).toBeNull();
      expect(batch.boundingSphere).toBeNull();
    }
    first.getMatrixAt(1, matrix);
    expect(matrix.equals(untouched)).toBe(true);
    first.computeBoundingBox();
    first.computeBoundingSphere();
    expect(first.boundingBox!.max.x).toBe(4.5);
    expect(Number.isFinite(first.boundingSphere!.radius)).toBe(true);
    first.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 1, 5));
    burning.tick(0.1);
    first.getMatrixAt(0, matrix);
    expect(matrix.determinant()).toBe(0);
    expect(obstacle.enabled).toBe(false);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
  });

  it('follows fleeing humans through reduced motion and completes once with their final bounds', () => {
    const { target, group } = fixture('human:escaping');
    const onGone = vi.fn();
    const onUpdate = vi.fn((event: WorldBurnEvent) => event.bounds.makeEmpty());
    const burning = createWorldBurning({ ledger: new Set(), onGone, onUpdate });
    let initialized = false;
    burning.bind({
      ...target,
      completion: 'fall',
      onIgnite: () => {
        initialized = true;
      },
      getDuration: () => (initialized ? 12 : 1),
      applyProgress(progress) {
        group.position.set(progress * 194, progress > 0.9 ? -32 : 1, 5);
      },
    });
    expect(burning.ignite(target.id)).toBe(true);
    advance(burning, 7, true);
    expect(group.visible).toBe(true);
    expect(group.position.x).toBeGreaterThan(100);
    expect(group.scale.toArray()).toEqual([1, 1, 1]);
    expect(onGone).not.toHaveBeenCalled();
    advance(burning, 6, true);
    expect(group.visible).toBe(false);
    expect(onGone).toHaveBeenCalledExactlyOnceWith(
      target.id,
      expect.objectContaining({
        completion: 'fall',
        duration: 12,
        bounds: new THREE.Box3(new THREE.Vector3(193, -33, 4), new THREE.Vector3(195, -31, 6)),
      }),
    );
    expect(burning.ignite(target.id)).toBe(false);
    const replacement = fixture(target.id);
    burning.bind(replacement.target);
    advance(burning, 8);
    expect(replacement.group.visible).toBe(false);
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('caps direct secondary ignitions and custom lifetimes without bypassing physical eligibility', () => {
    const burning = createWorldBurning({ ledger: new Set() });
    expect(burning.ignite('human:missing')).toBe(false);
    const hidden = fixture('human:hidden');
    hidden.group.visible = false;
    burning.bind(hidden.target);
    expect(burning.ignite(hidden.target.id)).toBe(false);
    for (let index = 0; index <= WORLD_BURN_LIMITS.concurrent; index++) {
      const { target } = fixture(`human:bounded:${index}`);
      burning.bind({ ...target, getDuration: () => Infinity });
      expect(burning.ignite(target.id)).toBe(index < WORLD_BURN_LIMITS.concurrent);
    }
    advance(burning, 8);
    expect(burning.ignite(`human:bounded:${WORLD_BURN_LIMITS.concurrent}`)).toBe(true);
    const long = fixture('human:long');
    burning.bind({ ...long.target, getDuration: () => 1e6 });
    burning.ignite(long.target.id);
    advance(burning, WORLD_BURN_LIMITS.duration + 1);
    expect(long.group.visible).toBe(false);
  });
});
