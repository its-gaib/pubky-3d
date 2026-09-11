import { describe, expect, it } from 'vitest';
import { resolvePosition, WORLD_RADIUS, type WorldObstacle } from '@/libs/world/world-motion';
import {
  canMountRide,
  createRideMotion,
  JETPACK_CEILING,
  jumpRide,
  requestAutonomousRideLanding,
  resolveRidePosition,
  RIDE_MOUNT_DISTANCE,
  rideDefinition,
  rideDismountPosition,
  type RideInput,
  type RideMotion,
  rideStatus,
  startRideStunt,
  stepRide,
  WORLD_RIDEABLES,
  worldRideCanFly,
  worldRideIsAutonomous,
  worldRideMountDistance,
} from '@/libs/world/world-transport-motion';

const neutral: RideInput = { x: 0, z: 0, yaw: 0, lift: 0 };
const frame = 1 / 60;

function advance(motion: RideMotion, seconds: number, input: Partial<RideInput> = {}, obstacles: WorldObstacle[] = []) {
  for (let tick = 0; tick < Math.round(seconds / frame); tick++) {
    stepRide(motion, { ...neutral, ...input }, frame, obstacles);
  }
}

describe('world transport motion', () => {
  it('keeps the five vehicles and adds a distinct dragon while requiring nearby ground contact to mount', () => {
    expect(WORLD_RIDEABLES.map(({ id }) => id)).toEqual([
      'skateboard',
      'jetpack',
      'kart',
      'bmx',
      'hoverboard',
      'dragon',
    ]);
    expect(new Set(WORLD_RIDEABLES.map(({ speed }) => speed)).size).toBe(6);
    expect(new Set(WORLD_RIDEABLES.map(({ stunt }) => stunt)).size).toBe(6);
    const item = { x: 0, z: -10 };
    expect(canMountRide({ ...item, y: 0.15 }, item)).toBe(true);
    expect(canMountRide({ x: item.x + RIDE_MOUNT_DISTANCE, y: 0.15, z: item.z }, item)).toBe(true);
    expect(canMountRide({ x: item.x + RIDE_MOUNT_DISTANCE + 0.01, y: 0.15, z: item.z }, item)).toBe(false);
    expect(canMountRide({ ...item, y: 0.71 }, item)).toBe(false);
    const dragonDistance = worldRideMountDistance('dragon');
    const dragonEdge = { x: item.x + dragonDistance, y: 0.15, z: item.z };
    expect(dragonDistance).toBeGreaterThan(rideDefinition('dragon').parkedRadius! + 0.65);
    expect(canMountRide(dragonEdge, item, 'dragon')).toBe(true);
    expect(canMountRide({ ...dragonEdge, x: dragonEdge.x + 0.01 }, item, 'dragon')).toBe(false);
    expect(canMountRide({ ...dragonEdge, y: 0.71 }, item, 'dragon')).toBe(false);
    expect(canMountRide(dragonEdge, item, 'jetpack')).toBe(false);
    expect(worldRideMountDistance(undefined)).toBe(RIDE_MOUNT_DISTANCE);
    expect(WORLD_RIDEABLES.filter(({ id }) => worldRideCanFly(id)).map(({ id }) => id)).toEqual(['jetpack', 'dragon']);
    expect(worldRideCanFly(undefined)).toBe(false);
    expect(WORLD_RIDEABLES.filter(({ id }) => worldRideIsAutonomous(id)).map(({ id }) => id)).toEqual(['dragon']);
    expect(worldRideIsAutonomous(undefined)).toBe(false);
  });

  it('normalizes diagonals, moves relative to camera yaw, and brakes to a slower bounded speed', () => {
    const forward = createRideMotion('kart', 0, 0, 0);
    const diagonal = createRideMotion('kart', 0, 0, 0);
    const turned = createRideMotion('kart', 0, 0, 0);
    advance(forward, 3, { z: 1 });
    advance(diagonal, 3, { x: 1, z: 1 });
    advance(turned, 3, { z: 1, yaw: Math.PI / 2 });
    const speed = rideStatus(forward).speed;
    expect(speed).toBeLessThanOrEqual(rideDefinition('kart').speed);
    expect(speed).toBeGreaterThan(29);
    expect(rideStatus(diagonal).speed).toBeCloseTo(speed, 6);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(forward.z, 6);
    expect(turned.x).toBeCloseTo(forward.z, 6);
    expect(turned.z).toBeCloseTo(0, 6);
    expect(turned.rotation).toBeCloseTo(Math.PI / 2, 3);
    advance(forward, 2, { z: 1, brake: true });
    expect(rideStatus(forward).speed).toBeLessThan(11);
    advance(forward, 2);
    expect(rideStatus(forward).speed).toBe(0);
  });

  it('bounds stalled frames and ignores non-finite input without corrupting motion', () => {
    const stalled = createRideMotion('hoverboard', 0, 0, 0);
    const capped = createRideMotion('hoverboard', 0, 0, 0);
    stepRide(stalled, { ...neutral, x: 1 }, 50, []);
    stepRide(capped, { ...neutral, x: 1 }, 0.05, []);
    expect(stalled).toEqual(capped);
    for (const seconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const before = { ...stalled };
      stepRide(stalled, neutral, seconds, []);
      expect(stalled).toEqual(before);
    }
    stepRide(
      stalled,
      { x: Number.NaN, z: Number.POSITIVE_INFINITY, yaw: Number.NaN, lift: Number.NEGATIVE_INFINITY },
      frame,
      [],
    );
    expect(
      Object.values(stalled)
        .filter((value) => typeof value === 'number')
        .every(Number.isFinite),
    ).toBe(true);
  });

  it('resolves overlaps and keeps even a fast kart clear of thin props and the coastline', () => {
    const radius = rideDefinition('kart').radius;
    expect(resolveRidePosition(2, 3, radius, [{ x: 2, z: 3, radius: 2 }])).toEqual({ x: 4 + radius, z: 3 });
    const obstacles: WorldObstacle[] = [{ x: 0, z: 0, radius: 0.1 }];
    const kart = createRideMotion('kart', -4, 0, Math.PI / 2);
    kart.velocityX = 30;
    for (let tick = 0; tick < 60; tick++) {
      stepRide(kart, { ...neutral, x: 1 }, 0.05, obstacles);
      expect(Math.hypot(kart.x, kart.z)).toBeGreaterThanOrEqual(radius + 0.1 - 1e-7);
      expect(kart.x).toBeLessThan(0);
    }
    obstacles[0].enabled = false;
    advance(kart, 1, { x: 1 }, obstacles);
    expect(kart.x).toBeGreaterThan(0);
    kart.x = WORLD_RADIUS - radius - 0.01;
    kart.z = 0;
    advance(kart, 3, { x: 1 });
    expect(Math.hypot(kart.x, kart.z)).toBeLessThanOrEqual(WORLD_RADIUS - radius + 1e-7);
  });

  it('lets the jetpack rise, settle into a hover, and descend without exceeding either altitude limit', () => {
    const jetpack = createRideMotion('jetpack', 0, 0, 0);
    expect(jumpRide(jetpack)).toBe(false);
    advance(jetpack, 1, { lift: 1 });
    expect(jetpack.altitude).toBeGreaterThan(5);
    advance(jetpack, 2);
    const hoveringAt = jetpack.altitude;
    advance(jetpack, 1);
    expect(Math.abs(jetpack.altitude - hoveringAt)).toBeLessThan(0.001);
    advance(jetpack, 10, { lift: 1 });
    expect(jetpack.altitude).toBe(JETPACK_CEILING);
    expect(jetpack.velocityY).toBe(0);
    advance(jetpack, 10, { lift: -1 });
    expect(jetpack.altitude).toBe(0);
    expect(jetpack.velocityY).toBe(0);
    expect(rideStatus(jetpack).grounded).toBe(true);
  });

  it('takes off and wanders automatically while ignoring every passenger movement and lift input', () => {
    const dragon = createRideMotion('dragon', 0, 0, 0, 42);
    const pressingControls = createRideMotion('dragon', 0, 0, 0, 42);
    expect(jumpRide(dragon)).toBe(false);
    advance(dragon, 1);
    advance(pressingControls, 1, { x: 1, z: -1, lift: -1, yaw: 2, brake: true });
    expect(dragon.altitude).toBeGreaterThan(4);
    expect(dragon.x).toBe(0);
    expect(dragon.z).toBe(0);
    expect(pressingControls).toEqual(dragon);
    expect(rideDismountPosition(dragon, [])).toBeNull();
    advance(dragon, 29);
    advance(pressingControls, 29, { x: -1, z: 1, lift: 1, yaw: -3, brake: true });
    expect(pressingControls).toEqual(dragon);
    expect(Math.hypot(dragon.x, dragon.z)).toBeGreaterThan(30);
    expect(dragon.altitude).toBeGreaterThan(20);
    expect(rideStatus(dragon).speed).toBeLessThanOrEqual(rideDefinition('dragon').flight!.speed!);
    const otherRoute = createRideMotion('dragon', 0, 0, 0, 927);
    advance(otherRoute, 30);
    expect(Math.hypot(otherRoute.x - dragon.x, otherRoute.z - dragon.z)).toBeGreaterThan(10);
  });

  it('plans flight above buildings and keeps the wandering dragon within the island and collision limits', () => {
    const definition = rideDefinition('dragon');
    const obstacles: WorldObstacle[] = [
      { x: 0, z: -45, radius: 40, height: 40 },
      { x: 90, z: 20, radius: 12, minHeight: 6, height: 15 },
      { x: -55, z: 50, radius: 12, height: 18 },
    ];
    const dragon = createRideMotion('dragon', 0, -120, 0, 1);
    let highest = 0;
    for (let tick = 0; tick < 3600; tick++) {
      stepRide(dragon, neutral, frame, obstacles);
      highest = Math.max(highest, dragon.altitude);
      if (tick % 15 !== 0) continue;
      const radius = dragon.altitude > 0.12 ? definition.flight!.radius! : definition.radius;
      expect(Math.hypot(dragon.x, dragon.z)).toBeLessThanOrEqual(WORLD_RADIUS - radius + 1e-6);
      expect(dragon.altitude).toBeGreaterThanOrEqual(0);
      expect(dragon.altitude).toBeLessThanOrEqual(definition.flight!.ceiling);
      for (const obstacle of obstacles) {
        const over = dragon.altitude >= obstacle.height! + 0.08;
        const under = dragon.altitude + definition.flight!.height! + 0.08 <= (obstacle.minHeight ?? 0);
        if (!over && !under)
          expect(Math.hypot(dragon.x - obstacle.x, dragon.z - obstacle.z)).toBeGreaterThanOrEqual(
            obstacle.radius + radius - 1e-6,
          );
      }
    }
    expect(highest).toBeGreaterThan(40);
    expect(Math.hypot(dragon.x, dragon.z + 120)).toBeGreaterThan(30);
  });

  it('requires enough altitude for the dragon roll and keeps its timed cooldown', () => {
    const dragon = createRideMotion('dragon', 0, 0, 0);
    const definition = rideDefinition('dragon');
    expect(startRideStunt(dragon)).toBe(false);
    dragon.altitude = definition.flight!.stuntAltitude - 0.01;
    expect(startRideStunt(dragon)).toBe(false);
    dragon.altitude = definition.flight!.stuntAltitude;
    expect(startRideStunt(dragon)).toBe(true);
    expect(rideStatus(dragon).stunt).toBe('Fire roll');
    expect(startRideStunt(dragon)).toBe(false);
    advance(dragon, 0.5);
    expect(dragon.stuntProgress).toBeGreaterThan(0.4);
    expect(dragon.stuntProgress).toBeLessThan(0.5);
    advance(dragon, 0.7);
    expect(dragon.stuntProgress).toBeNull();
    expect(startRideStunt(dragon)).toBe(false);
    advance(dragon, 0.1);
    expect(startRideStunt(dragon)).toBe(true);
  });

  it('finishes a roll before obeying a landing request and preserves its ground and roof clearances', () => {
    const definition = rideDefinition('dragon');
    const bounds = definition.flight!.stuntBounds!;
    const ground = createRideMotion('dragon', 0, 0, 0);
    ground.altitude = definition.flight!.stuntAltitude;
    ground.velocityY = -7;
    expect(startRideStunt(ground)).toBe(true);
    expect(requestAutonomousRideLanding(ground, [])).toBe(true);
    expect(rideStatus(ground).landing).toBe(true);
    advance(ground, 0.5);
    expect(ground.stuntProgress).not.toBeNull();
    expect(ground.altitude).toBe(bounds.below);
    expect(ground.velocityY).toBe(0);
    advance(ground, 1);
    expect(ground.stuntProgress).toBeNull();
    expect(ground.altitude).toBeLessThan(bounds.below);
    expect(startRideStunt(ground)).toBe(false);

    const roof: WorldObstacle = { x: 0, z: 0, radius: 2, height: 8 };
    const dragon = createRideMotion('dragon', 0, 0, 0);
    dragon.altitude = 10;
    expect(startRideStunt(dragon, [roof])).toBe(false);
    expect(dragon.stuntProgress).toBeNull();
    dragon.altitude = 15;
    dragon.velocityY = -7;
    expect(startRideStunt(dragon, [roof])).toBe(true);
    expect(requestAutonomousRideLanding(dragon, [roof])).toBe(true);
    advance(dragon, 0.3, {}, [roof]);
    expect(dragon.altitude).toBeGreaterThanOrEqual(roof.height! + bounds.below + 0.08);
    expect(dragon.x).toBe(0);
    expect(dragon.z).toBe(0);
  });

  it('finds a nearby clear landing spot above a building and treats repeated landing requests as one approach', () => {
    const dragon = createRideMotion('dragon', 0, 0, 0, 42);
    advance(dragon, 15);
    const roof: WorldObstacle = { x: dragon.x, z: dragon.z, radius: 12, height: 20 };
    expect(requestAutonomousRideLanding(dragon, [roof])).toBe(true);
    const target = dragon.autopilot!.target;
    expect(target).not.toBeNull();
    expect(requestAutonomousRideLanding(dragon, [roof])).toBe(false);
    expect(dragon.autopilot!.target).toBe(target);
    expect(rideStatus(dragon).landing).toBe(true);
    expect(startRideStunt(dragon, [roof])).toBe(false);
    advance(dragon, 30, { x: 1, z: -1, lift: 1 }, [roof]);
    expect(dragon.altitude).toBe(0);
    expect(dragon.velocityY).toBe(0);
    expect(Math.hypot(dragon.x - roof.x, dragon.z - roof.z)).toBeGreaterThan(
      roof.radius + rideDefinition('dragon').radius,
    );
    const exit = rideDismountPosition(dragon, [roof])!;
    expect(exit).not.toBeNull();
    expect(Math.hypot(exit.x - roof.x, exit.z - roof.z)).toBeGreaterThan(roof.radius + 0.65);
    expect(Math.hypot(exit.x, exit.z)).toBeLessThan(WORLD_RADIUS - 0.65);
    expect(requestAutonomousRideLanding(createRideMotion('jetpack', 0, 0, 0), [])).toBe(false);
  });

  it('chooses a new landing column if an obstacle moves into its previous destination', () => {
    const dragon = createRideMotion('dragon', 0, 0, 0, 34);
    advance(dragon, 15);
    expect(requestAutonomousRideLanding(dragon, [])).toBe(true);
    const previous = { ...dragon.autopilot!.target! };
    const blocker: WorldObstacle = { ...previous, radius: 5, height: 10 };
    advance(dragon, 30, {}, [blocker]);
    expect(dragon.altitude).toBe(0);
    expect(dragon.autopilot!.target).not.toEqual(previous);
    expect(Math.hypot(dragon.x - blocker.x, dragon.z - blocker.z)).toBeGreaterThan(
      blocker.radius + rideDefinition('dragon').radius,
    );
    expect(rideDismountPosition(dragon, [blocker])).not.toBeNull();
  });

  it('clears roofs only at flight height and holds a descending jetpack above their surface', () => {
    const roof: WorldObstacle = { x: 0, z: 0, radius: 2, height: 3 };
    const radius = rideDefinition('jetpack').radius;
    const blocked = resolveRidePosition(0, 0, radius, [roof], 2, true);
    expect(Math.hypot(blocked.x, blocked.z)).toBeCloseTo(2 + radius);
    expect(resolveRidePosition(0, 0, radius, [roof], 4, true)).toEqual({ x: 0, z: 0 });
    expect(resolveRidePosition(0, 0, radius, [{ ...roof, enabled: false }], 0, true)).toEqual({ x: 0, z: 0 });
    const jetpack = createRideMotion('jetpack', 0, 0, 0);
    jetpack.altitude = 4;
    advance(jetpack, 2, { lift: -1 }, [roof]);
    expect(jetpack.x).toBe(0);
    expect(jetpack.z).toBe(0);
    expect(jetpack.altitude).toBeCloseTo(3.08, 6);
    expect(jetpack.velocityY).toBe(0);
    expect(rideDismountPosition(jetpack, [roof])).toBeNull();
    advance(jetpack, 2, { x: 1, lift: -1 }, [roof]);
    expect(jetpack.x).toBeGreaterThan(roof.radius + radius);
    expect(jetpack.altitude).toBe(0);
  });

  it('never drops through a roof when descending from the lowest legal flight clearance', () => {
    const roof: WorldObstacle = { x: 0, z: 0, radius: 2, height: 3 };
    for (const altitude of [3.06, 3.08]) {
      const jetpack = createRideMotion('jetpack', 0, 0, 0);
      jetpack.altitude = altitude;
      stepRide(jetpack, { ...neutral, lift: -1 }, 0.05, [roof]);
      if (altitude < 3.08) {
        expect(Math.hypot(jetpack.x, jetpack.z)).toBeGreaterThanOrEqual(roof.radius + rideDefinition('jetpack').radius);
      } else {
        expect(jetpack.altitude).toBeGreaterThanOrEqual(3.08);
        expect(jetpack.x).toBe(0);
        expect(jetpack.z).toBe(0);
      }
    }
  });

  it('preserves passage under elevated panels while stopping flight against their sides, underside and top', () => {
    const panel: WorldObstacle = { x: 0, z: 0, radius: 2, minHeight: 6, height: 8 };
    const radius = rideDefinition('jetpack').radius;
    expect(resolvePosition(0, 0, [panel])).toEqual({ x: 0, z: 0 });
    expect(resolveRidePosition(0, 0, rideDefinition('kart').radius, [panel])).toEqual({ x: 0, z: 0 });
    expect(rideDismountPosition(createRideMotion('skateboard', 0, 0, 0), [panel])).not.toBeNull();
    expect(resolveRidePosition(0, 0, radius, [panel], 1, true)).toEqual({ x: 0, z: 0 });
    const rising = createRideMotion('jetpack', 0, 0, 0);
    rising.altitude = 1;
    advance(rising, 2, { lift: 1 }, [panel]);
    expect(rising.altitude).toBeCloseTo(6 - 3 - 0.08, 6);
    expect(rising.velocityY).toBe(0);
    expect(rising.x).toBe(0);
    expect(rising.z).toBe(0);
    const above = createRideMotion('jetpack', 0, 0, 0);
    above.altitude = 9;
    advance(above, 2, { lift: -1 }, [panel]);
    expect(above.altitude).toBeCloseTo(8.08, 6);
    expect(above.velocityY).toBe(0);
    const sideways = createRideMotion('jetpack', -6, 0, Math.PI / 2);
    sideways.altitude = 4;
    sideways.velocityX = 22;
    advance(sideways, 1, { x: 1 }, [panel]);
    expect(sideways.x).toBeLessThanOrEqual(-panel.radius - radius + 1e-6);
    expect(sideways.altitude).toBe(4);
  });

  it.each(['skateboard', 'kart', 'bmx', 'hoverboard'] as const)(
    '%s completes one timed stunt without allowing another air jump',
    (kind) => {
      const motion = createRideMotion(kind, 0, 0, 0);
      expect(startRideStunt(motion)).toBe(true);
      expect(startRideStunt(motion)).toBe(false);
      expect(jumpRide(motion)).toBe(false);
      expect(rideStatus(motion).stunt).toBe(rideDefinition(kind).stunt);
      advance(motion, rideDefinition(kind).stuntDuration / 2);
      expect(motion.altitude).toBeGreaterThan(0);
      expect(motion.stuntProgress).toBeGreaterThan(0.4);
      expect(motion.stuntProgress).toBeLessThan(0.6);
      expect(jumpRide(motion)).toBe(false);
      advance(motion, 0.8);
      expect(motion.altitude).toBe(0);
      expect(motion.stuntProgress).toBeNull();
      expect(motion.stuntUsed).toBe(false);
      advance(motion, 0.5);
      expect(startRideStunt(motion)).toBe(true);
    },
  );

  it('rejects a stunt too close to landing and requires enough height for a jetpack corkscrew', () => {
    const falling = createRideMotion('bmx', 0, 0, 0);
    falling.altitude = 0.2;
    falling.velocityY = -4;
    expect(startRideStunt(falling)).toBe(false);
    expect(falling.stuntProgress).toBeNull();
    const jetpack = createRideMotion('jetpack', 0, 0, 0);
    expect(startRideStunt(jetpack)).toBe(false);
    jetpack.altitude = 4;
    expect(startRideStunt(jetpack)).toBe(true);
    advance(jetpack, 1);
    expect(jetpack.stuntProgress).toBeNull();
    expect(startRideStunt(jetpack)).toBe(false);
    advance(jetpack, 0.3);
    expect(startRideStunt(jetpack)).toBe(true);
  });

  it('selects another clear dismount side and refuses surrounded, airborne or off-island exits', () => {
    const motion = createRideMotion('kart', 0, 0, 0);
    const distance = rideDefinition('kart').radius + 1;
    const first = rideDismountPosition(motion, [])!;
    expect(first.x).toBeCloseTo(distance);
    expect(first.z).toBeCloseTo(0);
    const obstacles: WorldObstacle[] = [{ ...first, radius: 0.1 }];
    const other = rideDismountPosition(motion, obstacles)!;
    expect(other.x).toBeCloseTo(-distance);
    expect(Math.hypot(other.x - obstacles[0].x, other.z - obstacles[0].z)).toBeGreaterThan(0.75);
    obstacles.push({ ...other, radius: 0.1 }, { x: 0, z: -distance, radius: 0.1 }, { x: 0, z: distance, radius: 0.1 });
    expect(rideDismountPosition(motion, obstacles)).toBeNull();
    motion.altitude = 1;
    expect(rideDismountPosition(motion, [])).toBeNull();
    motion.altitude = 0;
    motion.stuntProgress = 0.5;
    expect(rideDismountPosition(motion, [])).toBeNull();
    motion.stuntProgress = null;
    motion.x = WORLD_RADIUS - rideDefinition('kart').radius;
    const inland = rideDismountPosition(motion, [])!;
    expect(inland.x).toBeLessThan(motion.x);
    expect(Math.hypot(inland.x, inland.z)).toBeLessThan(WORLD_RADIUS - 0.65);
  });
});
