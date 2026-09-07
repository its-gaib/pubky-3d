import type { WorldZoneId } from '@/libs/world/world-types';

/** Shared ground coordinates keep the scene, collisions, travel and pocket map aligned. */
export const WORLD_RADIUS = 112;

export const WORLD_DIMENSIONS = {
  landRadius: 120,
  coastRadius: 124,
  overviewDistance: 312,
  cameraNear: 0.5,
  cameraFar: 1000,
  shadowExtent: 140,
  shadowFar: 320,
} as const;

export const WORLD_ANCHORS = {
  plaza: [0, 8],
  forest: [44, -40],
  arena: [52, 42],
  university: [-28, -66],
  github: [-65, 27],
  bitkit: [-36, 73],
  theater: [-69, -24],
  cinema: [-72, -65],
  tether: [34, -88],
  bank: [88, 8],
  trampoline: [77, -24],
  duck: [24, 80],
  portal: [-4, -96],
  satoshi: [-21, -29],
  balloon: [-86, 47],
} as const;

export const WORLD_TREE_POSITIONS = [
  [33, -34],
  [49, -26],
  [63, -40],
  [54, -56],
  [34, -59],
  [20, -49],
] as const;

/** Arrive on the ground in front of a landmark; the arena and theater have open interiors. */
export function worldArrival(id: WorldZoneId) {
  const [x, z] = WORLD_ANCHORS[id];
  return { x, z: z + (id === 'arena' ? 2 : id === 'theater' ? 7 : id === 'cinema' ? 9 : 11) };
}

/** A deliberate front view used by the bank's beam-to-Bitkit action. */
export function worldLandmarkPose(id: WorldZoneId, aspect = 1) {
  const arrival = worldArrival(id);
  const [x, z] = WORLD_ANCHORS[id];
  const target: [number, number, number] = [x, id === 'bitkit' ? 6 : 4, z];
  const yaw = Math.atan2(arrival.x - x, arrival.z - z);
  const pitch = 0.46;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const distance = Math.max(32, 8.5 / (Math.tan(Math.PI / 9) * safeAspect));
  return {
    zone: id,
    arrival,
    facing: Math.atan2(x - arrival.x, z - arrival.z),
    target,
    yaw,
    pitch,
    distance,
    cameraPosition: [
      target[0] + Math.sin(yaw) * Math.cos(pitch) * distance,
      target[1] + Math.sin(pitch) * distance,
      target[2] + Math.cos(yaw) * Math.cos(pitch) * distance,
    ] as [number, number, number],
  };
}

/** Very narrow portrait views and zooming out must not clip the expanded island. */
export function worldCameraFar(distance: number) {
  return Math.max(WORLD_DIMENSIONS.cameraFar, distance + WORLD_DIMENSIONS.coastRadius * 2);
}
