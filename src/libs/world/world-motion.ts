import { WORLD_RADIUS } from '@/libs/world/world-layout';

export interface WorldObstacle {
  x: number;
  z: number;
  radius: number;
  enabled?: boolean;
}

export { WORLD_RADIUS } from '@/libs/world/world-layout';
export const PERSONA_RADIUS = 0.65;

/** Camera-relative movement with equal speed on diagonals and bounded frame time. */
export function movementStep(x: number, z: number, yaw: number, seconds: number, running = false) {
  const length = Math.max(1, Math.hypot(x, z));
  const distance = (running ? 15 : 8) * Math.min(Math.max(seconds, 0), 0.05);
  return {
    x: ((x * Math.cos(yaw) + z * Math.sin(yaw)) / length) * distance,
    z: ((z * Math.cos(yaw) - x * Math.sin(yaw)) / length) * distance,
  };
}

/** Slide around small solid props while keeping visitors on the island. */
export function resolvePosition(x: number, z: number, obstacles: WorldObstacle[]) {
  for (const obstacle of obstacles) {
    if (obstacle.enabled === false) continue;
    const dx = x - obstacle.x;
    const dz = z - obstacle.z;
    const distance = Math.hypot(dx, dz);
    const clearance = obstacle.radius + PERSONA_RADIUS;
    if (distance < clearance) {
      x = obstacle.x + (distance > 0.001 ? dx / distance : 1) * clearance;
      z = obstacle.z + (distance > 0.001 ? dz / distance : 0) * clearance;
    }
  }
  const radius = Math.hypot(x, z);
  if (radius > WORLD_RADIUS) {
    x *= WORLD_RADIUS / radius;
    z *= WORLD_RADIUS / radius;
  }
  return { x, z };
}
