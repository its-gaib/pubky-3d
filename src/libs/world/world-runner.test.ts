import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldBurning } from '@/libs/world/world-burning';
import { disposeObject } from '@/libs/world/world-geometry';
import { createRunner, RUNNER_TRACK, runnerFrame } from '@/libs/world/world-runner';

describe('decorative @halfin runner', () => {
  let scene: THREE.Scene;
  beforeEach(() => {
    scene = new THREE.Scene();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });
  afterEach(() => {
    disposeObject(scene);
    vi.restoreAllMocks();
  });

  it('runs continuously around the local oval while facing its actual direction of travel', () => {
    for (const time of [0, 0.5, 2.5, 7.5, 9.999, 10, 3600, 86400]) {
      const frame = runnerFrame(time);
      const next = runnerFrame(time + 0.0001);
      expect(frame.position.every(Number.isFinite)).toBe(true);
      expect(
        (frame.position[0] / RUNNER_TRACK.radiusX) ** 2 + (frame.position[2] / RUNNER_TRACK.radiusZ) ** 2,
      ).toBeCloseTo(1);
      const direction = new THREE.Vector2(
        next.position[0] - frame.position[0],
        next.position[2] - frame.position[2],
      ).normalize();
      expect(direction.dot(new THREE.Vector2(Math.sin(frame.yaw), Math.cos(frame.yaw)))).toBeGreaterThan(0.9999);
    }
    expect(runnerFrame(0).position[0]).toBeCloseTo(runnerFrame(RUNNER_TRACK.loopSeconds).position[0]);
    expect(runnerFrame(0).position[2]).toBeCloseTo(runnerFrame(RUNNER_TRACK.loopSeconds).position[2]);
  });

  it('uses bounded delta time so pause/resume cannot teleport the runner or rebuild its geometry', () => {
    const runner = createRunner(scene, [30, 40]);
    const initialObjects: THREE.Object3D[] = [];
    runner.group.traverse((object) => initialObjects.push(object));
    runner.animate(3600, 300);
    expect(runner.persona.position.toArray()).toEqual(runnerFrame(RUNNER_TRACK.maxDelta).position);
    runner.animate(7200, -1);
    expect(runner.persona.position.toArray()).toEqual(runnerFrame(RUNNER_TRACK.maxDelta).position);
    for (let frame = 0; frame < 2000; frame++) runner.animate(frame, 0.05);
    const finalObjects: THREE.Object3D[] = [];
    runner.group.traverse((object) => finalObjects.push(object));
    expect(finalObjects).toEqual(initialObjects);
  });

  it('holds a grounded still pose for reduced motion and resumes from the same track position', () => {
    const runner = createRunner(scene, [0, 0]);
    runner.animate(0, 0.05);
    runner.animate(0, 0.05, true);
    expect(runner.persona.position.y).toBe(0.08);
    runner.group.updateMatrixWorld(true);
    const matrices: number[][] = [];
    runner.group.traverse((object) => matrices.push(object.matrixWorld.toArray()));
    for (let index = 0; index < 100; index++) runner.animate(1e6, 1000, true);
    runner.group.updateMatrixWorld(true);
    const nextMatrices: number[][] = [];
    runner.group.traverse((object) => nextMatrices.push(object.matrixWorld.toArray()));
    expect(nextMatrices).toEqual(matrices);
    runner.animate(1e6, 0.05);
    expect(runner.persona.position.toArray()).toEqual(runnerFrame(0.1).position);
  });

  it('keeps the detailed rig within a small draw budget and releases every shared surface and joint mesh', () => {
    const runner = createRunner(scene, [0, 0]);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    let draws = 0;
    let triangles = 0;
    runner.persona.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      draws++;
      geometries.add(object.geometry);
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      for (const surface of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(surface);
    });
    expect(draws).toBeLessThanOrEqual(30);
    expect(triangles).toBeLessThan(26000);
    expect(materials.size).toBe(3);
    runner.animate(0, 0.01, true);
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(runner.persona.getObjectByName('runner-athletic-rig')!);
    expect(bounds.min.y).toBeGreaterThanOrEqual(0.04);
    expect(bounds.min.y).toBeLessThan(0.09);
    const releases = [...geometries, ...materials].map((resource) => vi.spyOn(resource, 'dispose'));
    disposeObject(runner.group);
    releases.forEach((release) => expect(release).toHaveBeenCalledOnce());
  });

  it('keeps the large mention attached to the moving persona and directly raycastable', () => {
    const runner = createRunner(scene, [-10, 20]);
    runner.animate(0, 0.05);
    scene.updateMatrixWorld(true);
    const mentionPosition = runner.mention.getWorldPosition(new THREE.Vector3());
    const personaPosition = runner.persona.getWorldPosition(new THREE.Vector3());
    expect(mentionPosition.y - personaPosition.y).toBeCloseTo(4.5);
    expect(runner.mention.name).toBe('@halfin mention pill');
    expect(runner.mention.scale.x).toBeGreaterThan(7);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.copy(mentionPosition).add(new THREE.Vector3(0, 0, 12));
    camera.lookAt(mentionPosition);
    camera.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    expect(raycaster.intersectObject(runner.mention)).toHaveLength(1);
  });

  it('runs away while burning, leaves the track intact, then falls without an explosion', () => {
    const runner = createRunner(scene, [70, 98]);
    const onGone = vi.fn();
    const burning = createWorldBurning({ ledger: new Set(), onGone });
    burning.bind(runner.burnTarget);
    const start = runner.persona.getWorldPosition(new THREE.Vector3());
    expect(burning.ignite(runner.burnTarget.id)).toBe(true);
    for (let frame = 0; frame < 40; frame++) {
      runner.animate(frame * 0.05, 0.05);
      burning.tick(0.05);
    }
    expect(runner.persona.parent).toBe(scene);
    expect(runner.persona.position.distanceTo(start)).toBeGreaterThan(25);
    expect(runner.mention.visible).toBe(false);
    expect(runner.group.visible).toBe(true);
    expect(runner.persona.scale.toArray()).toEqual([1, 1, 1]);
    expect(runner.persona.getObjectByName('runner-left-thigh')!.rotation.x).not.toBe(0);
    for (let frame = 0; frame < 400; frame++) {
      runner.animate(frame * 0.05, 0.05);
      burning.tick(0.05);
    }
    expect(runner.persona.visible).toBe(false);
    expect(runner.persona.position.y).toBeLessThan(-30);
    expect(onGone).toHaveBeenCalledExactlyOnceWith('human:halfin', expect.objectContaining({ completion: 'fall' }));
    burning.dispose();
  });
});
