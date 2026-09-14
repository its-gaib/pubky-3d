import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { projectWorldShirtSpeaker } from '@/libs/world/world-shirt-speech';

describe('shirt speech projection', () => {
  function camera() {
    return new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 100);
  }

  it('tracks the original speaker when they move and the player orbits the camera', () => {
    const view = camera();
    const head = new THREE.Vector3(0, 0, -10);
    expect(projectWorldShirtSpeaker('human:crowd-0', head, view)).toEqual({ id: 'human:crowd-0', x: 0.5, y: 0.5 });
    head.x = 2;
    const moved = projectWorldShirtSpeaker('human:crowd-0', head, view)!;
    expect(moved.x).toBeGreaterThan(0.5);
    expect(moved.y).toBe(0.5);
    view.position.set(10, 4, -2);
    view.lookAt(head);
    const orbited = projectWorldShirtSpeaker('human:crowd-0', head, view)!;
    expect(orbited.id).toBe('human:crowd-0');
    expect(orbited.x).toBeCloseTo(0.5);
    expect(orbited.y).toBeCloseTo(0.5);
    expect(head.toArray()).toEqual([2, 0, -10]);
  });

  it.each([
    [0, 0, 10],
    [0, 0, 0],
    [0, 0, -0.1],
    [0, 0, -101],
    [20, 0, -10],
    [-20, 0, -10],
    [0, 20, -10],
    [0, -20, -10],
    [Number.NaN, 0, -10],
  ])('hides a speaker outside the camera view at (%s, %s, %s)', (x, y, z) => {
    expect(projectWorldShirtSpeaker('human:crowd-0', new THREE.Vector3(x, y, z), camera())).toBeNull();
  });
});
