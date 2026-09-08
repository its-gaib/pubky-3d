import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CINEMA_DIMENSIONS, CINEMA_SCREEN, cinemaCollisionObstacles, createCinema } from '@/libs/world/world-cinema';
import { disposeObject } from '@/libs/world/world-geometry';
import { CINEMA_YAW, WORLD_ANCHORS, worldArrival } from '@/libs/world/world-layout';
import { resolvePosition } from '@/libs/world/world-motion';

describe('Midnight Cinema facade', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rotates both the entrance and collision footprint toward the plaza', () => {
    const anchor = WORLD_ANCHORS.cinema;
    const obstacles = cinemaCollisionObstacles();
    const expectedCenter = new THREE.Vector3(0, 0, -15).applyAxisAngle(new THREE.Vector3(0, 1, 0), CINEMA_YAW);
    expect(obstacles[0].x).toBeCloseTo(anchor[0] + expectedCenter.x);
    expect(obstacles[0].z).toBeCloseTo(anchor[1] + expectedCenter.z);
    expect(obstacles.map(({ radius }) => radius)).toEqual([14, 8.8, 8.8]);
    const arrival = worldArrival('cinema');
    expect(resolvePosition(arrival.x, arrival.z, obstacles)).toEqual(arrival);
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), CINEMA_YAW);
    const towardPlaza = new THREE.Vector3(-anchor[0], 0, WORLD_ANCHORS.plaza[1] - anchor[1]).normalize();
    expect(forward.dot(towardPlaza)).toBeGreaterThan(0.95);
  });

  it('exposes a real screen plane larger than the Trending Theater and aligned with the rotated facade', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const scene = new THREE.Scene();
    const register = vi.fn();
    const obstacle = vi.fn();
    const cinema = createCinema(scene, register, obstacle);
    scene.updateMatrixWorld(true);
    expect(CINEMA_SCREEN).toEqual({ width: 36, height: 20.25 });
    expect(CINEMA_SCREEN.width / CINEMA_SCREEN.height).toBeCloseTo(16 / 9);
    expect(cinema.group.rotation.y).toBe(CINEMA_YAW);
    expect(cinema.screenFrame.getWorldDirection(new THREE.Vector3()).x).toBeCloseTo(Math.sin(CINEMA_YAW));
    expect(cinema.screenFrame.position.y - CINEMA_SCREEN.height / 2).toBeGreaterThan(16);
    // The backing artwork and the DOM projection share real world dimensions;
    // scaling the architecture must never scale the movie rectangle twice.
    expect(cinema.screenFrame.getWorldScale(new THREE.Vector3()).toArray()).toEqual([1, 1, 1]);
    const backing = cinema.group.getObjectByName('Midnight Cinema backing screen') as THREE.Mesh;
    const unrotated = new THREE.Matrix4().copy(cinema.group.matrixWorld).invert();
    backing.geometry.computeBoundingBox();
    const screenBounds = backing.geometry
      .boundingBox!.clone()
      .applyMatrix4(new THREE.Matrix4().multiplyMatrices(unrotated, backing.matrixWorld));
    const screenSize = screenBounds.getSize(new THREE.Vector3());
    expect(screenSize.x).toBeCloseTo(CINEMA_SCREEN.width);
    expect(screenSize.y).toBeCloseTo(CINEMA_SCREEN.height);
    const footprint = new THREE.Box3();
    cinema.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.computeBoundingBox();
      footprint.union(
        object.geometry
          .boundingBox!.clone()
          .applyMatrix4(new THREE.Matrix4().multiplyMatrices(unrotated, object.matrixWorld)),
      );
    });
    expect(footprint.min.x).toBeGreaterThanOrEqual(-CINEMA_DIMENSIONS.halfWidth - 0.01);
    expect(footprint.max.x).toBeLessThanOrEqual(CINEMA_DIMENSIONS.halfWidth + 0.01);
    expect(footprint.min.z).toBeGreaterThanOrEqual(-CINEMA_DIMENSIONS.back - 0.01);
    expect(footprint.max.z).toBeLessThanOrEqual(CINEMA_DIMENSIONS.front + 0.01);
    expect(footprint.max.y).toBeCloseTo(CINEMA_DIMENSIONS.height);
    const labels: THREE.Sprite[] = [];
    cinema.group.traverse((object) => {
      if (object instanceof THREE.Sprite) labels.push(object);
    });
    expect(labels).toHaveLength(1);
    expect(register).toHaveBeenCalledExactlyOnceWith(
      cinema.group,
      { kind: 'zone', id: 'cinema' },
      'Watch a film at Midnight Cinema',
    );
    expect(obstacle).toHaveBeenCalledTimes(3);
    disposeObject(scene);
  });
});
