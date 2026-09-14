import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeObject } from '@/libs/world/world-geometry';
import { createWorldKnightSweep, WORLD_KNIGHT_SWEEP } from '@/libs/world/world-knight-sweep';

const createRig = () => {
  const body = new THREE.Group();
  const head = new THREE.Group();
  const rightArm = new THREE.Group();
  rightArm.position.set(0.55, 0.665, 0.005);
  rightArm.scale.x = -1;
  const rightElbow = new THREE.Group();
  rightElbow.position.y = -0.343;
  const sword = new THREE.Group();
  sword.position.set(0, -0.43, 0.045);
  rightElbow.add(sword);
  rightArm.add(rightElbow);
  body.add(head, rightArm);
  const sweep = createWorldKnightSweep({ body, head, rightArm, rightElbow, sword });
  const trail = body.getObjectByName('knight-sword-sweep-trail') as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >;
  return { body, rightArm, sweep, trail };
};

describe('mounted knight sword sweep', () => {
  it('finishes each full circle without being restarted by consecutive zombie hits', () => {
    const { body, rightArm, sweep, trail } = createRig();
    expect(sweep.trigger(0)).toBe(true);
    sweep.update(0.4, false);
    const yaw = rightArm.rotation.y;
    for (let hit = 0; hit < 100; hit++) expect(sweep.trigger(0.4)).toBe(false);
    sweep.update(0.7, false);
    expect(rightArm.rotation.y).toBeLessThan(yaw);
    // At most one follow-up starts after the first whole attack, even after a crowd-sized burst.
    sweep.update(WORLD_KNIGHT_SWEEP.durationSeconds + 0.4, false);
    expect(trail.visible).toBe(true);
    sweep.update(WORLD_KNIGHT_SWEEP.durationSeconds * 2 + 0.01, false);
    expect(trail.visible).toBe(false);
    disposeObject(body);
  });

  it('reuses bounded trail buffers for every strike and releases them through scene teardown', () => {
    const { body, sweep, trail } = createRig();
    const geometry = trail.geometry;
    const material = trail.material;
    const positions = geometry.getAttribute('position');
    const disposeGeometry = vi.spyOn(geometry, 'dispose');
    const disposeMaterial = vi.spyOn(material, 'dispose');
    for (let hit = 0; hit < 50; hit++) {
      const start = hit * 2;
      sweep.trigger(start);
      sweep.update(start + 0.4, false);
      expect(trail.geometry).toBe(geometry);
      expect(trail.material).toBe(material);
      expect(trail.geometry.getAttribute('position')).toBe(positions);
      expect(positions.array.every(Number.isFinite)).toBe(true);
      expect(positions.count).toBeLessThan(100);
      sweep.update(start + 1.5, false);
    }
    expect(body.children.filter((part) => part instanceof THREE.Mesh)).toHaveLength(1);
    disposeObject(body);
    expect(disposeGeometry).toHaveBeenCalledOnce();
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });

  it('cancels invalid clocks and skips obsolete queued attacks after a hidden-tab gap', () => {
    const { body, sweep, trail } = createRig();
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -1]) expect(sweep.trigger(invalid)).toBe(false);
    sweep.trigger(3599.8);
    sweep.trigger(3599.9);
    sweep.update(3600.2, false);
    expect(trail.visible).toBe(true);
    sweep.update(7200, false);
    expect(trail.visible).toBe(false);
    sweep.trigger(7200);
    sweep.update(7199, false);
    expect(trail.visible).toBe(false);
    sweep.trigger(7300);
    sweep.update(Number.NaN, false);
    expect(trail.visible).toBe(false);
    disposeObject(body);
  });
});
