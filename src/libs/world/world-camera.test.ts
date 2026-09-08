import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clampWorldPitch, worldCameraVertical } from './world-camera';
import { CINEMA_SCREEN } from './world-cinema';
import { CINEMA_YAW, WORLD_ANCHORS, worldArrival } from './world-layout';

describe('walking camera sky view', () => {
  it('can frame every corner of the tall cinema screen from its walking arrival', () => {
    const arrival = worldArrival('cinema');
    const distance = 42;
    const targetHeight = 1.3;
    const pitch = clampWorldPitch(-0.43, false);
    const vertical = worldCameraVertical(pitch, distance, targetHeight);
    const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 1400);
    camera.position.set(
      arrival.x + Math.sin(CINEMA_YAW) * Math.cos(pitch) * distance,
      vertical.height,
      arrival.z + Math.cos(CINEMA_YAW) * Math.cos(pitch) * distance,
    );
    camera.lookAt(arrival.x, targetHeight + vertical.lookLift, arrival.z);
    camera.updateMatrixWorld();
    for (const x of [-CINEMA_SCREEN.width / 2, CINEMA_SCREEN.width / 2]) {
      for (const y of [-CINEMA_SCREEN.height / 2, CINEMA_SCREEN.height / 2]) {
        const corner = new THREE.Vector3(x, 27 + y, 0.56)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), CINEMA_YAW)
          .add(new THREE.Vector3(WORLD_ANCHORS.cinema[0], 0, WORLD_ANCHORS.cinema[1]))
          .project(camera);
        expect(Math.abs(corner.x)).toBeLessThan(1);
        expect(Math.abs(corner.y)).toBeLessThan(1);
        expect(corner.z).toBeGreaterThan(-1);
        expect(corner.z).toBeLessThan(1);
      }
    }
  });

  it('keeps all walking zoom levels above ground while allowing an upward view', () => {
    for (const zoom of [0.6, 1, 1.5]) {
      for (const pitch of [-0.55, -0.2, 0, 0.26, 1.25]) {
        const vertical = worldCameraVertical(pitch, 42 * zoom, 1.3);
        expect(vertical.height).toBeGreaterThanOrEqual(2.2);
        expect(vertical.lookLift).toBeGreaterThanOrEqual(0);
        if (pitch < 0) expect(1.3 + vertical.lookLift).toBeGreaterThan(vertical.height);
      }
    }
  });

  it('preserves the overview limits and recovers from non-finite pointer input', () => {
    expect(clampWorldPitch(-1, true)).toBe(0.16);
    expect(clampWorldPitch(-1, false)).toBe(-0.55);
    expect(clampWorldPitch(2, false)).toBe(1.25);
    expect(clampWorldPitch(NaN, false)).toBe(0.26);
    expect(clampWorldPitch(Infinity, true)).toBe(0.72);
  });
});
