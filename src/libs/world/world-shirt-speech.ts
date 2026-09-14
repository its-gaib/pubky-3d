import type * as THREE from 'three';
import { projectWorldScreenAnchor, type WorldScreenAnchor } from '@/libs/world/world-screen-projection';

export interface WorldShirtSpeaker extends WorldScreenAnchor {
  /** A local crowd actor, so the bubble never jumps to a different nearby wearer. */
  id: string;
}

/** Screen-space speech must disappear when its speaker leaves the camera's view. */
export function projectWorldShirtSpeaker(
  id: string,
  position: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
): WorldShirtSpeaker | null {
  const anchor = projectWorldScreenAnchor(position, camera);
  return anchor ? { id, ...anchor } : null;
}
