import type { WorldZoneId } from '@/libs/world/world-types';

/** Shared ground coordinates keep the scene, collisions, travel and pocket map aligned. */
export const WORLD_RADIUS = 180;
export const CINEMA_YAW = Math.PI * 0.75;

export const WORLD_DIMENSIONS = {
  landRadius: 188,
  coastRadius: 192,
  overviewDistance: 485,
  cameraNear: 0.5,
  cameraFar: 1400,
  shadowExtent: 208,
  shadowFar: 485,
} as const;

export const WORLD_ANCHORS = {
  plaza: [0, 8],
  forest: [36, -45],
  arena: [55, 48],
  university: [-26, -77],
  github: [-82, 22],
  bitkit: [-26, 94],
  hotSauce: [-108, -103],
  theater: [-86, -52],
  cinema: [-77, 91],
  conferences: [0, -101],
  chess: [91, -72],
  runner: [70, 98],
  tether: [30, -118],
  bank: [108, 22],
  trampoline: [102, -22],
  duck: [24, 101],
  portal: [-26, -120],
  satoshi: [-21, -29],
  balloon: [-120, 16],
} as const;

/** Three fixed gateways; arrivals leave enough room to clear the destination trigger. */
export const WORLD_PORTALS = [
  { name: 'Northern Lights', position: WORLD_ANCHORS.portal, color: '#C8FF03', yaw: 0 },
  { name: 'Violet Shortcut', position: [-115, 54], color: '#BA91FF', yaw: Math.PI / 2 },
  { name: 'Amber Detour', position: [115, 62], color: '#FFAA62', yaw: -Math.PI / 2 },
] as const;

export const WORLD_TREE_POSITIONS = [
  [25, -39],
  [41, -31],
  [55, -45],
  [46, -61],
  [26, -64],
  [12, -54],
] as const;

/** Arrive on the ground in front of a landmark; the arena and theater have open interiors. */
export function worldArrival(id: WorldZoneId) {
  const [x, z] = WORLD_ANCHORS[id];
  if (id === 'cinema') return { x: x + Math.sin(CINEMA_YAW) * 18, z: z + Math.cos(CINEMA_YAW) * 18 };
  if (id === 'bitkit') return { x, z: z - 11 };
  return { x, z: z + (id === 'arena' ? 2 : id === 'theater' ? 7 : id === 'chess' ? 16 : 11) };
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
  return Math.max(WORLD_DIMENSIONS.cameraFar, distance + WORLD_DIMENSIONS.coastRadius * 4);
}
