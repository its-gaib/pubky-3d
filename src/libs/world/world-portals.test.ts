import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeObject } from '@/libs/world/world-geometry';
import { createLandmarks } from '@/libs/world/world-landmarks';
import { WORLD_PORTALS, WORLD_RADIUS } from '@/libs/world/world-layout';
import { createPortalTransit, PORTAL_TRANSIT } from './world-portals';

function point(index: number, distance = 0) {
  const portal = WORLD_PORTALS[index];
  return {
    x: portal.position[0] + Math.sin(portal.yaw) * distance,
    z: portal.position[1] + Math.cos(portal.yaw) * distance,
  };
}

describe('three portal transit', () => {
  it('can choose either other portal from every entrance and arrives facing safely away from its trigger', () => {
    for (let from = 0; from < WORLD_PORTALS.length; from++) {
      const destinations = new Set<number>();
      for (const sample of [0, 0.99999]) {
        const portals = createPortalTransit(() => sample);
        expect(portals.step(point(from, 8), 0, true)).toBeNull();
        const trip = portals.step(point(from), 1, true)!;
        expect(trip.from).toBe(from);
        expect(trip.to).not.toBe(from);
        expect([trip.x, trip.z]).toEqual(Object.values(point(trip.to, PORTAL_TRANSIT.arrivalDistance)));
        expect(Math.hypot(trip.x, trip.z)).toBeLessThan(WORLD_RADIUS - 1);
        expect(trip.facing).toBe(WORLD_PORTALS[trip.to].yaw);
        expect(trip.cameraYaw).toBe(trip.facing + Math.PI);
        destinations.add(trip.to);
      }
      expect(destinations.size).toBe(2);
    }
  });

  it('does not teleport on initial spawn, a non-walking beam or merely enabling walking while inside', () => {
    const portals = createPortalTransit(() => 0);
    expect(portals.step(point(0), 0, true)).toBeNull();
    expect(portals.step(point(0), 1, true)).toBeNull();
    expect(portals.step(point(1), 2, false)).toBeNull();
    expect(portals.step(point(1), 3, true)).toBeNull();
    expect(portals.step(point(1, 8), 4, true)).toBeNull();
    expect(portals.step(point(1), 5, true)?.from).toBe(1);
  });

  it('requires leaving the destination vicinity before another trip even after cooldown', () => {
    const portals = createPortalTransit(() => 0);
    portals.step(point(0, 8), 0, true);
    const trip = portals.step(point(0), 1, true)!;
    expect(portals.step(point(trip.to), 1.1, true)).toBeNull();
    expect(portals.step(point(trip.to), 3, true)).toBeNull();
    expect(portals.step(point(trip.to, 4), 3.1, true)).toBeNull();
    expect(portals.step(point(trip.to), 3.2, true)).toBeNull();
    expect(portals.step(point(trip.to, 6), 3.3, true)).toBeNull();
    expect(portals.step(point(trip.to), 3.4, true)?.from).toBe(trip.to);
  });

  it('retains cooldown after leaving and never fires later just because the timer expired inside', () => {
    const portals = createPortalTransit(() => 0);
    portals.step(point(0, 8), 0, true);
    const trip = portals.step(point(0), 1, true)!;
    expect(portals.step(point(trip.to, 6), 1.1, true)).toBeNull();
    expect(portals.step(point(trip.to), 1.2, true)).toBeNull();
    expect(portals.step(point(trip.to), 3, true)).toBeNull();
    expect(portals.step(point(trip.to, 6), 3.1, true)).toBeNull();
    expect(portals.step(point(trip.to), 3.2, true)).not.toBeNull();
  });

  it('resets observations for external travel and rejects invalid positions/times without consuming randomness', () => {
    const random = vi.fn(() => 0.5);
    const portals = createPortalTransit(random);
    portals.step(point(0, 8), 0, true);
    expect(portals.step({ x: Number.NaN, z: 0 }, 1, true)).toBeNull();
    expect(portals.step(point(0), Number.POSITIVE_INFINITY, true)).toBeNull();
    expect(portals.step(point(0), -1, true)).toBeNull();
    expect(random).not.toHaveBeenCalled();
    portals.reset();
    expect(portals.step(point(2), 1, true)).toBeNull();
    portals.step(point(2, 8), 2, true);
    expect(portals.step(point(2), 3, true)?.to).toBe(1);
    expect(random).toHaveBeenCalledOnce();
  });

  it('bounds the injected sample so an endpoint never selects the entrance or an absent exit', () => {
    for (const sample of [-1, 0, 0.5, 1, Number.NaN]) {
      const portals = createPortalTransit(() => sample);
      portals.step(point(1, 8), 0, true);
      expect([0, 2]).toContain(portals.step(point(1), 1, true)?.to);
    }
  });
});

describe('portal geometry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('places three distinct gateways at the exact transit anchors and orientations', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const scene = new THREE.Scene();
    const register = vi.fn();
    const landmarks = createLandmarks(scene, register, vi.fn());
    const gateways = register.mock.calls.filter(([, interaction]) => interaction.kind === 'portal');
    expect(gateways).toHaveLength(3);
    gateways.forEach(([group, interaction], index) => {
      expect(interaction).toEqual({ kind: 'portal', index });
      expect(group.position.toArray()).toEqual([WORLD_PORTALS[index].position[0], 0, WORLD_PORTALS[index].position[1]]);
      expect(group.rotation.y).toBe(WORLD_PORTALS[index].yaw);
      expect(group.name).toContain(WORLD_PORTALS[index].name);
    });
    landmarks.animate(5, 0.03);
    landmarks.dispose();
    disposeObject(scene);
  });
});
