import { describe, expect, it } from 'vitest';
import { WORLD_ZONES } from './world-catalog';
import { CINEMA_DIMENSIONS } from './world-cinema';
import {
  CINEMA_YAW,
  WORLD_ANCHORS,
  WORLD_DIMENSIONS,
  WORLD_PORTALS,
  WORLD_RADIUS,
  WORLD_TREE_POSITIONS,
  worldArrival,
  worldCameraFar,
  worldLandmarkPose,
} from './world-layout';
import { resolvePosition } from './world-motion';

describe('expanded world layout', () => {
  it('arrives inside the walkable coast and within the intended district for every destination', () => {
    for (const zone of WORLD_ZONES) {
      const arrival = worldArrival(zone.id);
      expect(Math.hypot(arrival.x, arrival.z)).toBeLessThan(WORLD_RADIUS);
      expect(resolvePosition(arrival.x, arrival.z, [])).toEqual(arrival);
      const ownDistance = Math.hypot(zone.position[0] - arrival.x, zone.position[1] - arrival.z);
      for (const other of WORLD_ZONES.filter((candidate) => candidate.id !== zone.id)) {
        expect(ownDistance).toBeLessThan(Math.hypot(other.position[0] - arrival.x, other.position[1] - arrival.z));
      }
    }
  });

  it('gives the previously crowded buildings space without enlarging their models', () => {
    for (const [left, right] of [
      ['theater', 'university'],
      ['theater', 'github'],
      ['bank', 'arena'],
      ['bank', 'forest'],
      ['theater', 'cinema'],
      ['university', 'cinema'],
    ] as const) {
      const a = WORLD_ANCHORS[left];
      const b = WORLD_ANCHORS[right];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(30);
    }
  });

  it('leaves room around every tree for its canopy and hanging posts', () => {
    for (let index = 0; index < WORLD_TREE_POSITIONS.length; index++) {
      const tree = WORLD_TREE_POSITIONS[index];
      expect(Math.hypot(...tree) + 5).toBeLessThan(WORLD_RADIUS);
      for (const neighbor of WORLD_TREE_POSITIONS.slice(index + 1)) {
        expect(Math.hypot(tree[0] - neighbor[0], tree[1] - neighbor[1])).toBeGreaterThan(12);
      }
    }
  });

  it('keeps peripheral props and their decoration on the island', () => {
    for (const id of ['bank', 'duck', 'portal', 'trampoline', 'satoshi', 'balloon', 'tether'] as const) {
      expect(Math.hypot(...WORLD_ANCHORS[id]) + 8).toBeLessThan(WORLD_DIMENSIONS.landRadius);
    }
  });

  it('adds walkable new ground around the cinema, its front entry and the Tether monument', () => {
    expect(WORLD_RADIUS).toBeGreaterThan(112);
    for (const side of [-1, 1])
      for (const z of [-CINEMA_DIMENSIONS.back, CINEMA_DIMENSIONS.front]) {
        const x = side * CINEMA_DIMENSIONS.halfWidth;
        expect(
          Math.hypot(
            WORLD_ANCHORS.cinema[0] + Math.cos(CINEMA_YAW) * x + Math.sin(CINEMA_YAW) * z,
            WORLD_ANCHORS.cinema[1] - Math.sin(CINEMA_YAW) * x + Math.cos(CINEMA_YAW) * z,
          ),
        ).toBeLessThan(WORLD_DIMENSIONS.landRadius);
      }
    const arrival = worldArrival('cinema');
    const forward =
      (arrival.x - WORLD_ANCHORS.cinema[0]) * Math.sin(CINEMA_YAW) +
      (arrival.z - WORLD_ANCHORS.cinema[1]) * Math.cos(CINEMA_YAW);
    expect(forward).toBeGreaterThan(CINEMA_DIMENSIONS.front);
    expect(Math.hypot(WORLD_ANCHORS.tether[0], WORLD_ANCHORS.tether[1]) + 10).toBeLessThan(WORLD_RADIUS);
  });

  it('separates the theaters into distant districts and gives new attractions open ground', () => {
    const [tx, tz] = WORLD_ANCHORS.theater;
    const [cx, cz] = WORLD_ANCHORS.cinema;
    expect(Math.hypot(tx - cx, tz - cz)).toBeGreaterThan(130);
    expect(Math.abs(CINEMA_YAW)).toBeGreaterThan(Math.PI / 2);
    for (const [id, clearance] of [
      ['chess', 20],
      ['runner', 12],
    ] as const) {
      const [x, z] = WORLD_ANCHORS[id];
      expect(Math.hypot(x, z) + clearance).toBeLessThan(WORLD_RADIUS);
      for (const zone of WORLD_ZONES.filter((zone) => zone.id !== id)) {
        expect(Math.hypot(x - zone.position[0], z - zone.position[1])).toBeGreaterThan(clearance + 15);
      }
    }
    for (const portal of WORLD_PORTALS) {
      expect(Math.hypot(...portal.position) + 7).toBeLessThan(WORLD_RADIUS);
    }
  });

  it('keeps the far coastline visible when portrait views pull the overview camera back', () => {
    for (const aspect of [1.6, 390 / 844, 0.25]) {
      const distance = WORLD_DIMENSIONS.overviewDistance * Math.max(1, 1 / aspect) * 1.5;
      expect(worldCameraFar(distance)).toBeGreaterThan(distance + WORLD_DIMENSIONS.coastRadius);
    }
  });

  it('beams in front of Bitkit with the avatar and portrait-safe camera facing the actual beacon', () => {
    for (const aspect of [1.6, 390 / 844]) {
      const pose = worldLandmarkPose('bitkit', aspect);
      expect(pose.arrival).toEqual(worldArrival('bitkit'));
      expect(pose.arrival.z).toBeGreaterThan(WORLD_ANCHORS.bitkit[1] + 5);
      expect(Math.sin(pose.facing)).toBeCloseTo(0);
      expect(Math.cos(pose.facing)).toBeCloseTo(-1);
      expect(pose.target).toEqual([WORLD_ANCHORS.bitkit[0], 6, WORLD_ANCHORS.bitkit[1]]);
      expect(pose.cameraPosition[2]).toBeGreaterThan(pose.arrival.z);
      expect(2 * Math.tan(Math.PI / 9) * pose.distance * aspect).toBeGreaterThanOrEqual(17);
    }
  });
});
