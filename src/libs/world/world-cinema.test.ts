import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CINEMA_SCREEN, cinemaCollisionObstacles, createCinema } from '@/libs/world/world-cinema';
import { disposeObject } from '@/libs/world/world-geometry';
import { CINEMA_YAW, WORLD_ANCHORS, worldArrival } from '@/libs/world/world-layout';
import { resolvePosition } from '@/libs/world/world-motion';

describe('Midnight Cinema facade', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rotates both the entrance and collision footprint toward the plaza', () => {
    const anchor = WORLD_ANCHORS.cinema;
    const obstacles = cinemaCollisionObstacles();
    const expectedCenter = new THREE.Vector3(0, 0, -7.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), CINEMA_YAW);
    expect(obstacles[0].x).toBeCloseTo(anchor[0] + expectedCenter.x);
    expect(obstacles[0].z).toBeCloseTo(anchor[1] + expectedCenter.z);
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
    expect(CINEMA_SCREEN.width).toBeGreaterThan(15.6);
    expect(CINEMA_SCREEN.width / CINEMA_SCREEN.height).toBeCloseTo(16 / 9);
    expect(cinema.group.rotation.y).toBe(CINEMA_YAW);
    expect(cinema.screenFrame.getWorldDirection(new THREE.Vector3()).x).toBeCloseTo(Math.sin(CINEMA_YAW));
    expect(cinema.screenFrame.position.y - CINEMA_SCREEN.height / 2).toBeGreaterThan(7);
    expect(register).toHaveBeenCalledExactlyOnceWith(
      cinema.group,
      { kind: 'zone', id: 'cinema' },
      'Watch a film at Midnight Cinema',
    );
    expect(obstacle).toHaveBeenCalledTimes(3);
    disposeObject(scene);
  });
});
