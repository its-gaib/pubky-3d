import { WORLD_PORTALS } from '@/libs/world/world-layout';

export const PORTAL_TRANSIT = {
  enterRadius: 1.8,
  leaveRadius: 5,
  arrivalDistance: 6,
  cooldown: 1.5,
} as const;

export interface PortalTransfer {
  from: number;
  to: number;
  x: number;
  z: number;
  facing: number;
  cameraYaw: number;
}

interface GroundPosition {
  x: number;
  z: number;
}

/** Observes all positions, but only a deliberate walking entry can start a trip. */
export function createPortalTransit(
  random: () => number = Math.random,
  isAvailable: (index: number) => boolean = () => true,
) {
  let occupied: boolean[] | null = null;
  let leaveDestination: number | null = null;
  let availableAt = 0;

  return {
    step(position: GroundPosition, time: number, walking: boolean): PortalTransfer | null {
      if (![position.x, position.z, time].every(Number.isFinite) || time < 0) return null;
      const distances = WORLD_PORTALS.map((portal) =>
        Math.hypot(position.x - portal.position[0], position.z - portal.position[1]),
      );
      const inside = distances.map((distance) => distance <= PORTAL_TRANSIT.enterRadius);
      const previous = occupied;
      occupied = inside;
      if (leaveDestination !== null && distances[leaveDestination] > PORTAL_TRANSIT.leaveRadius)
        leaveDestination = null;
      if (!previous || !walking || time < availableAt || leaveDestination !== null) return null;
      const from = inside.findIndex((value, index) => value && !previous[index] && isAvailable(index));
      if (from < 0) return null;
      const exits = WORLD_PORTALS.map((_, index) => index).filter((index) => index !== from && isAvailable(index));
      if (!exits.length) return null;
      const sample = random();
      const choice = Number.isFinite(sample) ? Math.max(0, Math.min(1 - Number.EPSILON, sample)) : 0;
      const to = exits[Math.floor(choice * exits.length)];
      const destination = WORLD_PORTALS[to];
      const x = destination.position[0] + Math.sin(destination.yaw) * PORTAL_TRANSIT.arrivalDistance;
      const z = destination.position[1] + Math.cos(destination.yaw) * PORTAL_TRANSIT.arrivalDistance;
      availableAt = time + PORTAL_TRANSIT.cooldown;
      leaveDestination = to;
      // The next observation must belong to the arrived persona, not the entry gate.
      occupied = WORLD_PORTALS.map(
        (portal) => Math.hypot(x - portal.position[0], z - portal.position[1]) <= PORTAL_TRANSIT.enterRadius,
      );
      return { from, to, x, z, facing: destination.yaw, cameraYaw: destination.yaw + Math.PI };
    },
    reset() {
      occupied = null;
      leaveDestination = null;
      availableAt = 0;
    },
  };
}
