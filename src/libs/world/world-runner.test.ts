import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
});
