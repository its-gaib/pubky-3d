import * as THREE from 'three';
import type { WorldObstacle } from '@/libs/world/world-motion';

export const WORLD_BURN_LIMITS = {
  targets: 4096,
  remembered: 8192,
  concurrent: 32,
  heatSeconds: 0.2,
  maxStep: 0.1,
  range: 80,
  halfAngle: Math.PI / 4,
  coordinate: 4096,
  extent: 400,
  duration: 60,
} as const;

export interface WorldBurnTarget {
  id: string;
  parentId?: string;
  roots?: readonly THREE.Object3D[];
  obstacles?: readonly WorldObstacle[];
  getBounds: (out: THREE.Box3) => boolean;
  /** Returns the closest physical hit in this ray's range, or null. */
  raycast?: (raycaster: THREE.Raycaster) => number | null;
  canIgnite?: () => boolean;
  /** People leave the island; other targets finish with an explosion. */
  completion?: 'explode' | 'fall';
  getDuration?: () => number;
  applyProgress?: (progress: number, reducedMotion?: boolean) => void;
  hide: () => void;
  onIgnite?: () => void;
}

export interface WorldBurnEvent {
  id: string;
  bounds: THREE.Box3;
  duration: number;
  completion: 'explode' | 'fall';
}

export interface WorldBurnOptions {
  /** In-memory only. Supplying a fresh Set gives an isolated scene/test session. */
  ledger?: Set<string>;
  onIgnite?: (event: WorldBurnEvent) => void;
  /** Moving human emitters follow the latest physical bounds during escape. */
  onUpdate?: (event: WorldBurnEvent) => void;
  onGone?: (id: string, event: WorldBurnEvent) => void;
}

export interface WorldFireExposure {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  range: number;
  halfAngle: number;
  seconds: number;
  excludeIds?: ReadonlySet<string>;
}

export interface WorldGroupBurnOptions {
  parentId?: string;
  canIgnite?: () => boolean;
  onIgnite?: () => void;
  onGone?: () => void;
}

// This module lives for the browser page, including client-side scene remounts.
// A document refresh starts with an empty Set; no application cache is touched.
const pageLedger = new Set<string>();
const RAY_SAMPLES = [
  [0, 0],
  [0.8, 0],
  [-0.8, 0],
  [0, 0.8],
  [0, -0.8],
  [0.56, 0.56],
  [-0.56, 0.56],
  [0.56, -0.56],
  [-0.56, -0.56],
] as const;

function validId(id: string) {
  return typeof id === 'string' && id.length <= 512 && /^[a-z][a-z0-9-]*:[^\p{Cc}\p{Cf}]+$/u.test(id);
}

function finitePoint(point: THREE.Vector3) {
  return (
    Number.isFinite(point.x) &&
    Math.abs(point.x) <= WORLD_BURN_LIMITS.coordinate &&
    Number.isFinite(point.y) &&
    Math.abs(point.y) <= WORLD_BURN_LIMITS.coordinate &&
    Number.isFinite(point.z) &&
    Math.abs(point.z) <= WORLD_BURN_LIMITS.coordinate
  );
}

function validBounds(bounds: THREE.Box3) {
  if (bounds.isEmpty() || !finitePoint(bounds.min) || !finitePoint(bounds.max)) return false;
  return (
    bounds.max.x - bounds.min.x <= WORLD_BURN_LIMITS.extent &&
    bounds.max.y - bounds.min.y <= WORLD_BURN_LIMITS.extent &&
    bounds.max.z - bounds.min.z <= WORLD_BURN_LIMITS.extent
  );
}

function visibleInWorld(object: THREE.Object3D) {
  for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
    if (!parent.visible) return false;
  }
  return true;
}

function ownedBy(object: THREE.Object3D, root: THREE.Object3D, id: string) {
  for (let parent: THREE.Object3D | null = object; parent && parent !== root; parent = parent.parent) {
    if (parent.userData.worldBurnId && parent.userData.worldBurnId !== id) return false;
  }
  return true;
}

function disableObstacles(obstacles: readonly WorldObstacle[] | undefined) {
  obstacles?.forEach((obstacle) => {
    obstacle.enabled = false;
  });
}

/** Group ownership keeps labels/children together without touching shared materials. */
export function createWorldGroupBurnTarget(
  id: string,
  roots: readonly THREE.Object3D[],
  obstacles: readonly WorldObstacle[] = [],
  options: WorldGroupBurnOptions = {},
): WorldBurnTarget {
  const box = new THREE.Box3();
  const hits: THREE.Intersection[] = [];
  const physical: THREE.Object3D[] = [];
  let hidden = false;
  for (const root of roots) root.userData.worldBurnId = id;

  return {
    id,
    roots,
    obstacles,
    parentId: options.parentId,
    onIgnite: options.onIgnite,
    canIgnite: () => !hidden && roots.some(visibleInWorld) && (options.canIgnite?.() ?? true),
    getBounds(out) {
      out.makeEmpty();
      if (hidden) return false;
      for (const root of roots) {
        if (!visibleInWorld(root)) continue;
        root.updateWorldMatrix(true, true);
        root.traverseVisible((object) => {
          if (!(object instanceof THREE.Mesh) || !ownedBy(object, root, id)) return;
          if (object instanceof THREE.InstancedMesh) {
            if (!object.boundingBox) object.computeBoundingBox();
            if (object.boundingBox) out.union(box.copy(object.boundingBox).applyMatrix4(object.matrixWorld));
          } else {
            if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
            if (object.geometry.boundingBox)
              out.union(box.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld));
          }
        });
      }
      return !out.isEmpty();
    },
    raycast(raycaster) {
      if (hidden) return null;
      physical.length = 0;
      for (const root of roots) {
        if (!visibleInWorld(root)) continue;
        root.updateWorldMatrix(true, true);
        root.traverseVisible((object) => {
          if (object instanceof THREE.Mesh && ownedBy(object, root, id)) physical.push(object);
        });
      }
      hits.length = 0;
      raycaster.intersectObjects(physical, false, hits);
      return hits[0]?.distance ?? null;
    },
    hide() {
      const firstHide = !hidden;
      hidden = true;
      for (const root of roots) root.visible = false;
      disableObstacles(obstacles);
      if (firstHide) options.onGone?.();
    },
  };
}

/** One logical plant/lamp may own the same slot in several shared mesh batches. */
export function createWorldInstanceBurnTarget(
  id: string,
  batches: readonly THREE.InstancedMesh[],
  index: number | readonly number[],
  obstacles: readonly WorldObstacle[] = [],
  parentId?: string,
): WorldBurnTarget {
  const indices = [...new Set(typeof index === 'number' ? [index] : index)].slice(0, 256);
  const slots: { batch: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4 }[] = [];
  for (const batch of batches) {
    for (const slot of indices) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= batch.count) continue;
      const matrix = new THREE.Matrix4();
      batch.getMatrixAt(slot, matrix);
      slots.push({ batch, index: slot, matrix });
    }
  }
  const current = new THREE.Matrix4();
  const desired = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const scaleVector = new THREE.Vector3();
  const box = new THREE.Box3();
  const hits: THREE.Intersection[] = [];
  // The scratch mesh borrows original resources and never enters the scene.
  const proxy = batches[0] ? new THREE.Mesh(batches[0].geometry, batches[0].material) : null;
  let hidden = false;

  function scaleSlots(scale: number) {
    scaleVector.setScalar(scale);
    for (const slot of slots) {
      desired.copy(slot.matrix).scale(scaleVector);
      slot.batch.getMatrixAt(slot.index, current);
      if (current.equals(desired)) continue;
      slot.batch.setMatrixAt(slot.index, desired);
      slot.batch.instanceMatrix.needsUpdate = true;
      // Both render culling and raycasting lazily rebuild these after all edits.
      slot.batch.boundingBox = null;
      slot.batch.boundingSphere = null;
    }
  }

  return {
    id,
    parentId,
    obstacles,
    canIgnite: () => !hidden && slots.some((slot) => visibleInWorld(slot.batch)),
    getBounds(out) {
      out.makeEmpty();
      if (hidden) return false;
      for (const { batch, matrix } of slots) {
        if (!visibleInWorld(batch)) continue;
        batch.updateWorldMatrix(true, false);
        if (!batch.geometry.boundingBox) batch.geometry.computeBoundingBox();
        if (!batch.geometry.boundingBox) continue;
        world.multiplyMatrices(batch.matrixWorld, matrix);
        out.union(box.copy(batch.geometry.boundingBox).applyMatrix4(world));
      }
      return !out.isEmpty();
    },
    raycast(raycaster) {
      if (hidden || !proxy) return null;
      let closest = Infinity;
      for (const { batch, matrix } of slots) {
        if (!visibleInWorld(batch)) continue;
        batch.updateWorldMatrix(true, false);
        proxy.geometry = batch.geometry;
        proxy.material = batch.material;
        proxy.matrixWorld.multiplyMatrices(batch.matrixWorld, matrix);
        hits.length = 0;
        proxy.raycast(raycaster, hits);
        for (const hit of hits) closest = Math.min(closest, hit.distance);
      }
      return Number.isFinite(closest) ? closest : null;
    },
    hide() {
      hidden = true;
      // Reapply after ordinary animation so a reused instance cannot reappear.
      scaleSlots(0);
      disableObstacles(obstacles);
    },
  };
}

/** Bounded local heat/burn state. No timers, DOM, IO, or original resource disposal. */
export function createWorldBurning(options: WorldBurnOptions = {}) {
  const ledger = options.ledger ?? pageLedger;
  const targets = new Map<string, { target: WorldBurnTarget; bounds: THREE.Box3; heat: number; exposedAt: number }>();
  const active = new Map<string, { elapsed: number; event: WorldBurnEvent }>();
  const candidates: { id: string; target: WorldBurnTarget; bounds: THREE.Box3 }[] = [];
  const heated = new Set<string>();
  const completed: WorldBurnEvent[] = [];
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const point = new THREE.Vector3();
  const size = new THREE.Vector3();
  let clock = 0;
  let disposed = false;
  let reduceMotion = false;

  function copyEvent(event: WorldBurnEvent): WorldBurnEvent {
    return { ...event, bounds: event.bounds.clone() };
  }

  function lineage(id: string, predicate: (key: string) => boolean) {
    let key: string | undefined = id;
    // A hard depth limit also safely terminates malformed parent cycles.
    for (let depth = 0; key && depth < 16; depth++) {
      if (predicate(key)) return true;
      key = targets.get(key)?.target.parentId;
    }
    return false;
  }

  function isGone(id: string) {
    return lineage(id, (key) => ledger.has(key) && !active.has(key));
  }

  function isBurning(id: string) {
    return !isGone(id) && lineage(id, (key) => active.has(key));
  }

  function applyAvailability() {
    for (const [id, record] of targets) {
      if (isGone(id)) {
        record.target.hide();
        disableObstacles(record.target.obstacles);
      } else if (isBurning(id)) {
        disableObstacles(record.target.obstacles);
      }
    }
  }

  function ignite(id: string) {
    const record = targets.get(id);
    if (
      disposed ||
      !record ||
      isGone(id) ||
      isBurning(id) ||
      active.size >= WORLD_BURN_LIMITS.concurrent ||
      ledger.size >= WORLD_BURN_LIMITS.remembered ||
      record.target.canIgnite?.() === false ||
      !record.target.getBounds(record.bounds) ||
      !validBounds(record.bounds)
    )
      return false;
    const event: WorldBurnEvent = {
      id,
      bounds: record.bounds.clone(),
      duration: 4 + Math.min(3, record.bounds.getSize(size).length() * 0.075),
      completion: record.target.completion === 'fall' ? 'fall' : 'explode',
    };
    ledger.add(id);
    active.set(id, { elapsed: 0, event });
    disableObstacles(record.target.obstacles);
    record.target.onIgnite?.();
    const customDuration = record.target.getDuration?.();
    if (customDuration !== undefined && Number.isFinite(customDuration))
      event.duration = THREE.MathUtils.clamp(customDuration, 1, WORLD_BURN_LIMITS.duration);
    options.onIgnite?.(copyEvent(event));
    applyAvailability();
    return true;
  }

  return {
    bind(target: WorldBurnTarget) {
      if (
        disposed ||
        !validId(target.id) ||
        (target.parentId !== undefined && (!validId(target.parentId) || target.parentId === target.id)) ||
        (!targets.has(target.id) && targets.size >= WORLD_BURN_LIMITS.targets)
      )
        return () => {};
      const record = { target, bounds: new THREE.Box3(), heat: 0, exposedAt: -Infinity };
      targets.set(target.id, record);
      applyAvailability();
      if (!isGone(target.id)) {
        const burning = active.get(target.id);
        if (burning) {
          target.onIgnite?.();
          target.applyProgress?.(burning.elapsed / burning.event.duration, reduceMotion);
        }
      }
      return () => {
        if (targets.get(target.id) === record) targets.delete(target.id);
      };
    },
    expose(exposure: WorldFireExposure) {
      if (
        disposed ||
        !finitePoint(exposure.origin) ||
        !finitePoint(exposure.direction) ||
        exposure.direction.lengthSq() < 1e-12 ||
        !Number.isFinite(exposure.range) ||
        exposure.range <= 0 ||
        !Number.isFinite(exposure.halfAngle) ||
        exposure.halfAngle < 0 ||
        !Number.isFinite(exposure.seconds) ||
        exposure.seconds <= 0
      )
        return;
      const seconds = Math.min(exposure.seconds, WORLD_BURN_LIMITS.maxStep);
      const spread = Math.tan(Math.min(exposure.halfAngle, WORLD_BURN_LIMITS.halfAngle));
      forward.copy(exposure.direction).normalize();
      up.set(Math.abs(forward.y) > 0.95 ? 1 : 0, Math.abs(forward.y) > 0.95 ? 0 : 1, 0);
      right.crossVectors(forward, up).normalize();
      up.crossVectors(right, forward).normalize();
      raycaster.near = 0;
      raycaster.far = Math.min(exposure.range, WORLD_BURN_LIMITS.range);
      candidates.length = 0;
      heated.clear();
      for (const [id, record] of targets) {
        if (
          isGone(id) ||
          lineage(id, (key) => exposure.excludeIds?.has(key) ?? false) ||
          (record.target.parentId && isBurning(record.target.parentId)) ||
          record.target.canIgnite?.() === false ||
          !record.target.getBounds(record.bounds) ||
          !validBounds(record.bounds)
        )
          continue;
        if (record.bounds.distanceToPoint(exposure.origin) > raycaster.far) continue;
        candidates.push({ id, target: record.target, bounds: record.bounds });
      }
      for (const [x, y] of spread === 0 ? RAY_SAMPLES.slice(0, 1) : RAY_SAMPLES) {
        point
          .copy(forward)
          .addScaledVector(right, x * spread)
          .addScaledVector(up, y * spread)
          .normalize();
        raycaster.set(exposure.origin, point);
        let closest = raycaster.far + 1e-6;
        let winner: string | null = null;
        for (const candidate of candidates) {
          const broad = raycaster.ray.intersectBox(candidate.bounds, point);
          if (!broad) continue;
          const broadDistance = candidate.bounds.containsPoint(exposure.origin) ? 0 : broad.distanceTo(exposure.origin);
          if (broadDistance > closest) continue;
          const hit = candidate.target.raycast ? candidate.target.raycast(raycaster) : broadDistance;
          if (hit === null || !Number.isFinite(hit) || hit < 0 || hit > raycaster.far) continue;
          if (
            hit < closest - 1e-6 ||
            (Math.abs(hit - closest) <= 1e-6 && winner && lineage(candidate.id, (key) => key === winner))
          ) {
            closest = hit;
            winner = candidate.id;
          }
        }
        if (winner) heated.add(winner);
      }
      for (const id of heated) {
        const record = targets.get(id)!;
        if (isBurning(id)) continue;
        record.heat += seconds;
        record.exposedAt = clock;
        if (record.heat + 1e-8 >= WORLD_BURN_LIMITS.heatSeconds) ignite(id);
      }
      if (heated.size) applyAvailability();
    },
    tick(seconds: number, reducedMotion = false) {
      if (disposed || !Number.isFinite(seconds) || seconds < 0) return;
      const delta = Math.min(seconds, WORLD_BURN_LIMITS.maxStep);
      clock += delta;
      reduceMotion = reducedMotion;
      completed.length = 0;
      for (const record of targets.values()) {
        if (clock - record.exposedAt > 0.12) record.heat = Math.max(0, record.heat - delta);
      }
      for (const [id, state] of active) {
        const record = targets.get(id);
        state.elapsed = Math.min(state.event.duration, state.elapsed + delta);
        record?.target.applyProgress?.(state.elapsed / state.event.duration, reducedMotion);
        if (state.event.completion === 'fall') {
          if (record?.target.getBounds(record.bounds) && validBounds(record.bounds))
            state.event.bounds.copy(record.bounds);
          options.onUpdate?.(copyEvent(state.event));
        }
        if (state.elapsed >= state.event.duration) {
          active.delete(id);
          completed.push(copyEvent(state.event));
        }
      }
      applyAvailability();
      for (const event of completed) options.onGone?.(event.id, event);
    },
    /** Secondary scenery fires use the same capacity, bounds and lifetime rules. */
    ignite,
    isBurning,
    isGone,
    dispose() {
      disposed = true;
      targets.clear();
      active.clear();
      candidates.length = 0;
      heated.clear();
      completed.length = 0;
    },
  };
}
