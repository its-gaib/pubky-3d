import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWorldShadows, worldPixelRatio } from './world-render-quality';

describe('bounded world rendering quality', () => {
  it('uses high-density pixels for small screens and bounds large render targets', () => {
    expect(worldPixelRatio(390, 844, 3)).toBe(2);
    expect(worldPixelRatio(1280, 800, 1)).toBe(1);
    const ratio = worldPixelRatio(1920, 1080, 2);
    expect(ratio).toBeGreaterThan(1);
    expect(1920 * 1080 * ratio ** 2).toBeLessThanOrEqual(3_200_001);
    expect(worldPixelRatio(3840, 2160, 3)).toBe(1);
    expect(worldPixelRatio(0, 0, Number.NaN)).toBe(1);
  });

  it('preserves the light direction and brings detailed shadows along the walking route', () => {
    const sun = new THREE.DirectionalLight();
    const update = createWorldShadows(sun);
    const focus = new THREE.Vector3(102, 0, -80);
    update(focus, false);
    expect(sun.target.position.distanceTo(focus)).toBeLessThan(0.06);
    expect(sun.shadow.camera.right - sun.shadow.camera.left).toBe(112);
    const direction = sun.position.clone().sub(sun.target.position).normalize();
    update(new THREE.Vector3(-70, 0, 90), true);
    expect(sun.target.position.length()).toBe(0);
    expect(sun.shadow.camera.right).toBeGreaterThan(160);
    expect(sun.position.clone().sub(sun.target.position).normalize().distanceTo(direction)).toBeLessThan(0.00001);
    expect(sun.shadow.camera.far).toBeGreaterThan(500);
    sun.shadow.dispose();
  });
});
