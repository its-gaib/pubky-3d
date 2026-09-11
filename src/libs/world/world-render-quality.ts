import * as THREE from 'three';
import { WORLD_DIMENSIONS } from '@/libs/world/world-layout';

const MAX_RENDER_PIXELS = 3_200_000;
const WALK_SHADOW_EXTENT = 56;

/** Crisp high-density screens without an unbounded fullscreen render target. */
export function worldPixelRatio(width: number, height: number, devicePixelRatio: number) {
  const area = Math.max(1, width) * Math.max(1, height);
  const density = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
  return Math.max(1, Math.min(2, density, Math.sqrt(MAX_RENDER_PIXELS / area)));
}

/**
 * Concentrate shadow texels around the walking camera, and cover the island in
 * overview. Snapping in the light's plane keeps stationary surface edges stable.
 */
export function createWorldShadows(sun: THREE.DirectionalLight) {
  const direction = new THREE.Vector3(-35, 65, 30).normalize();
  const orientation = new THREE.Matrix4().lookAt(direction, new THREE.Vector3(), THREE.Object3D.DEFAULT_UP);
  const inverse = orientation.clone().invert();
  const center = new THREE.Vector3();
  let previousOverview: boolean | null = null;

  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00012;

  return (focus: THREE.Vector3, overview: boolean) => {
    const extent = overview ? WORLD_DIMENSIONS.shadowExtent : WALK_SHADOW_EXTENT;
    if (previousOverview !== overview) {
      Object.assign(sun.shadow.camera, {
        left: -extent,
        right: extent,
        top: extent,
        bottom: -extent,
        near: 1,
        far: overview ? 560 : 320,
      });
      sun.shadow.camera.updateProjectionMatrix();
      previousOverview = overview;
    }
    if (overview) center.set(0, 0, 0);
    else center.set(focus.x, 0, focus.z);
    center.applyMatrix4(inverse);
    const texel = (extent * 2) / sun.shadow.mapSize.x;
    center.x = Math.round(center.x / texel) * texel;
    center.y = Math.round(center.y / texel) * texel;
    center.applyMatrix4(orientation);
    sun.target.position.copy(center);
    sun.position
      .copy(direction)
      .multiplyScalar(overview ? 320 : 160)
      .add(center);
    sun.target.updateMatrixWorld();
  };
}
