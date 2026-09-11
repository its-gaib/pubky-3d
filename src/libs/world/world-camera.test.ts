import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clampWorldPitch, createWorldCameraFollow, worldCameraVertical } from './world-camera';
import { CINEMA_SCREEN } from './world-cinema';
import { CINEMA_YAW, WORLD_ANCHORS, worldArrival } from './world-layout';
import { movementStep } from './world-motion';

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

describe('walking camera follows travel', () => {
  const frame = (
    follow: ReturnType<typeof createWorldCameraFollow>,
    yaw: number,
    deltaX = 0.4,
    deltaZ = 0,
    enabled = true,
    seconds = 0.05,
  ) => follow.step({ yaw, deltaX, deltaZ, seconds, enabled });

  it('starts gently and catches up behind an unchanged held direction without steering it', () => {
    const follow = createWorldCameraFollow();
    let yaw = 0;
    let x = 0;
    let z = 0;
    for (let index = 0; index < 120; index++) {
      const movement = movementStep(1, 0, follow.movementYaw(yaw, 1, 0), 0.05);
      x += movement.x;
      z += movement.z;
      const nextYaw = frame(follow, yaw, movement.x, movement.z);
      if (index < 6) expect(nextYaw).toBe(0);
      expect(Math.abs(nextYaw - yaw)).toBeLessThanOrEqual(0.0360001);
      yaw = nextYaw;
    }
    expect(x).toBeCloseTo(48);
    expect(z).toBeCloseTo(0);
    expect(yaw).toBeCloseTo(-Math.PI / 2, 1);
    // A newly chosen direction uses the camera's current view again.
    expect(follow.movementYaw(yaw, 0, -1)).toBe(yaw);
  });

  it('preserves a touch hold when its pressure changes and releases its heading when stopped', () => {
    const follow = createWorldCameraFollow();
    expect(follow.movementYaw(0.6, 1, 0)).toBe(0.6);
    expect(follow.movementYaw(0.3, 0.5, 0)).toBe(0.6);
    expect(follow.movementYaw(0.3, 0, 0)).toBe(0.3);
    expect(follow.movementYaw(0.3, 1, 0)).toBe(0.3);
  });

  it('gives manual orbit priority while still letting the drag steer a held movement', () => {
    const follow = createWorldCameraFollow();
    follow.movementYaw(0, 1, 0);
    follow.orbit(0.5);
    expect(follow.movementYaw(0.5, 1, 0)).toBe(0.5);
    let yaw = 0.5;
    for (let index = 0; index < 39; index++) expect(frame(follow, yaw)).toBe(yaw);
    // A fresh drag restarts the grace period, including while the character moves.
    follow.orbit();
    for (let index = 0; index < 39; index++) expect(frame(follow, yaw)).toBe(yaw);
    for (let index = 0; index < 100; index++) yaw = frame(follow, yaw);
    expect(yaw).toBeLessThan(-1.3);
  });

  it('uses actual travel for autonomous rides and click-to-walk, with no keyboard hold', () => {
    const follow = createWorldCameraFollow();
    let yaw = 1;
    for (let index = 0; index < 120; index++) {
      follow.movementYaw(yaw, 0, 0);
      yaw = frame(follow, yaw, 0, -0.4);
    }
    expect(yaw).toBeCloseTo(0, 1);
  });

  it('stops following at rest and while disabled, then eases back in instead of snapping', () => {
    const follow = createWorldCameraFollow();
    let yaw = 0;
    for (let index = 0; index < 50; index++) yaw = frame(follow, yaw);
    const stoppedYaw = yaw;
    for (let index = 0; index < 40; index++) yaw = frame(follow, yaw, 0, 0);
    expect(yaw).toBe(stoppedYaw);
    for (let index = 0; index < 40; index++) yaw = frame(follow, yaw, -0.4, 0, false);
    expect(yaw).toBe(stoppedYaw);
    for (let index = 0; index < 6; index++) yaw = frame(follow, yaw, -0.4, 0);
    expect(yaw).toBe(stoppedYaw);
    yaw = frame(follow, yaw, -0.4, 0);
    expect(yaw).toBeGreaterThan(stoppedYaw);
    expect(yaw - stoppedYaw).toBeLessThan(0.001);
  });

  it('takes the short turn across the angle boundary', () => {
    const follow = createWorldCameraFollow();
    const start = Math.PI - 0.15;
    const target = -Math.PI + 0.15;
    let yaw = start;
    for (let index = 0; index < 80; index++) {
      const nextYaw = frame(follow, yaw, -Math.sin(target) * 0.4, -Math.cos(target) * 0.4);
      expect(nextYaw).toBeGreaterThanOrEqual(yaw);
      yaw = nextYaw;
    }
    expect(yaw - start).toBeGreaterThan(0.25);
    expect(yaw - start).toBeLessThan(0.3);
  });

  it('ignores teleports, invalid displacement and stalled-frame time spikes', () => {
    const follow = createWorldCameraFollow();
    let yaw = 0;
    for (let index = 0; index < 50; index++) yaw = frame(follow, yaw);
    expect(frame(follow, yaw, 100, 100)).toBe(yaw);
    expect(frame(follow, yaw, NaN, 0.4)).toBe(yaw);
    expect(frame(follow, yaw, 0.4, Infinity)).toBe(yaw);
    expect(frame(follow, yaw, 0.4, 0, true, -1)).toBe(yaw);
    expect(frame(follow, yaw, 0.4, 0, true, NaN)).toBe(yaw);
    const nextYaw = frame(follow, yaw, 0.4, 0, true, 30);
    expect(Math.abs(nextYaw - yaw)).toBeLessThanOrEqual(0.036);
    follow.reset();
    expect(follow.movementYaw(1, 1, 0)).toBe(1);
    expect(frame(follow, 1)).toBe(1);
  });
});
