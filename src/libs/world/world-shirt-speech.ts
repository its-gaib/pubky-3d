import * as THREE from 'three';

export interface WorldShirtSpeaker {
  /** A local crowd actor, so the bubble never jumps to a different nearby wearer. */
  id: string;
  /** Viewport coordinates, each in the range 0–1. */
  x: number;
  y: number;
}

/** Screen-space speech must disappear when its speaker leaves the camera's view. */
export function projectWorldShirtSpeaker(
  id: string,
  position: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
): WorldShirtSpeaker | null {
  camera.updateWorldMatrix(true, false);
  const projected = position.clone().applyMatrix4(camera.matrixWorldInverse);
  if (projected.z >= 0) return null;
  projected.applyMatrix4(camera.projectionMatrix);
  if (
    !Number.isFinite(projected.x) ||
    !Number.isFinite(projected.y) ||
    !Number.isFinite(projected.z) ||
    Math.abs(projected.x) > 1 ||
    Math.abs(projected.y) > 1 ||
    Math.abs(projected.z) > 1
  )
    return null;
  return { id, x: (projected.x + 1) / 2, y: (1 - projected.y) / 2 };
}
