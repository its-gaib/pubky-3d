import type { WorldZoneId } from '@/libs/world/world-types';

/** Shared ground coordinates keep the scene, collisions, travel and pocket map aligned. */
export const WORLD_RADIUS = 76;

export const WORLD_DIMENSIONS = {
  landRadius: 82,
  coastRadius: 85,
  overviewDistance: 212,
  cameraNear: 0.5,
  cameraFar: 900,
  shadowExtent: 100,
  shadowFar: 230,
} as const;

export const WORLD_ANCHORS = {
  plaza: [0, 8],
  forest: [34, -34],
  arena: [40, 27],
  university: [-24, -48],
  github: [-45, 15],
  bitkit: [-28, 48],
  theater: [-53, -18],
  bank: [64, 5],
  trampoline: [55, -15],
  duck: [17, 54],
  portal: [-2, -62],
  satoshi: [-17, -14],
  balloon: [-60, 34],
} as const;

export const WORLD_TREE_POSITIONS = [
  [24, -30],
  [38, -24],
  [50, -33],
  [41, -46],
  [25, -47],
  [13, -40],
] as const;

/** Arrive on the ground in front of a landmark; the arena and theater have open interiors. */
export function worldArrival(id: WorldZoneId) {
  const [x, z] = WORLD_ANCHORS[id];
  return { x, z: z + (id === 'arena' ? 2 : id === 'theater' ? 7 : 11) };
}

/** Very narrow portrait views and zooming out must not clip the expanded island. */
export function worldCameraFar(distance: number) {
  return Math.max(WORLD_DIMENSIONS.cameraFar, distance + WORLD_DIMENSIONS.coastRadius * 2);
}
