import { WORLD_RADIUS, type WorldObstacle } from '@/libs/world/world-motion';
import type { WorldRideableId, WorldRideStatus } from '@/libs/world/world-types';

interface RideDefinition {
  id: WorldRideableId;
  name: string;
  position: readonly [number, number];
  rotation: number;
  speed: number;
  acceleration: number;
  radius: number;
  parkedRadius?: number;
  mountDistance?: number;
  turning?: number;
  stopping?: number;
  autonomous?: boolean;
  jumpSpeed: number;
  stunt: string;
  stuntDuration: number;
  flight?: {
    lift: number;
    response: number;
    ceiling: number;
    stuntAltitude: number;
    speed?: number;
    radius?: number;
    height?: number;
    stuntBounds?: { radius: number; below: number; above: number };
  };
}

export const JETPACK_CEILING = 48;

/** Parked discoveries; deliberately absent from the destination map and navigation. */
export const WORLD_RIDEABLES: readonly RideDefinition[] = [
  {
    id: 'skateboard',
    name: 'Skateboard',
    position: [-65, -37],
    rotation: 0.65,
    speed: 18,
    acceleration: 4.5,
    radius: 0.8,
    jumpSpeed: 10,
    stunt: 'Kickflip',
    stuntDuration: 0.7,
  },
  {
    id: 'jetpack',
    name: 'Jetpack',
    position: [-95, 12],
    rotation: 1.25,
    speed: 22,
    acceleration: 3.5,
    radius: 0.75,
    jumpSpeed: 0,
    stunt: 'Corkscrew',
    stuntDuration: 0.9,
    flight: { lift: 8, response: 6, ceiling: JETPACK_CEILING, stuntAltitude: 2.5 },
  },
  {
    id: 'kart',
    name: 'Kart',
    position: [98, 39],
    rotation: -0.85,
    speed: 30,
    acceleration: 3,
    radius: 1.45,
    jumpSpeed: 12,
    stunt: 'Barrel roll',
    stuntDuration: 0.85,
  },
  {
    id: 'bmx',
    name: 'BMX',
    position: [-38, 81],
    rotation: 0.25,
    speed: 23,
    acceleration: 3.8,
    radius: 1.05,
    jumpSpeed: 12,
    stunt: 'Backflip',
    stuntDuration: 0.85,
  },
  {
    id: 'hoverboard',
    name: 'Hoverboard',
    position: [59, -79],
    rotation: -0.6,
    speed: 25,
    acceleration: 3.8,
    radius: 0.9,
    jumpSpeed: 11,
    stunt: '360',
    stuntDuration: 0.8,
  },
  {
    id: 'dragon',
    name: 'Dragon',
    position: [112, 102],
    rotation: -0.75,
    speed: 20,
    acceleration: 2.1,
    turning: 3.5,
    stopping: 4,
    autonomous: true,
    radius: 4.1,
    parkedRadius: 4.1,
    mountDistance: 6,
    jumpSpeed: 0,
    stunt: 'Fire roll',
    stuntDuration: 1.1,
    flight: {
      lift: 7,
      response: 3.5,
      ceiling: 48,
      stuntAltitude: 6,
      speed: 27,
      radius: 5.3,
      height: 4.5,
      stuntBounds: { radius: 6.5, below: 6, above: 7 },
    },
  },
];

export const RIDE_MOUNT_DISTANCE = 3.6;
const GRAVITY = 24;
const STUNT_COOLDOWN = 1.25;
const ROOF_CLEARANCE = 0.08;
const FLYING_PERSON_HEIGHT = 3;

interface AutonomousRideMotion {
  phase: 'takeoff' | 'cruise' | 'landing' | 'descending';
  seed: number;
  target: { x: number; z: number } | null;
  altitude: number;
  routeTime: number;
  retrying: boolean;
}

export interface RideMotion {
  id: WorldRideableId;
  x: number;
  z: number;
  altitude: number;
  rotation: number;
  velocityX: number;
  velocityZ: number;
  velocityY: number;
  lean: number;
  stuntProgress: number | null;
  stuntCooldown: number;
  stuntUsed: boolean;
  autopilot?: AutonomousRideMotion;
}

export interface RideInput {
  x: number;
  z: number;
  yaw: number;
  lift: number;
  brake?: boolean;
}

const finite = (value: number) => (Number.isFinite(value) ? value : 0);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const rideDefinition = (id: WorldRideableId) => WORLD_RIDEABLES.find((item) => item.id === id)!;
export const worldRideCanFly = (id: WorldRideableId | undefined) => !!id && !!rideDefinition(id).flight;
export const worldRideIsAutonomous = (id: WorldRideableId | undefined) => !!id && !!rideDefinition(id).autonomous;
export const worldRideMountDistance = (id: WorldRideableId | undefined) =>
  (id && rideDefinition(id).mountDistance) || RIDE_MOUNT_DISTANCE;

export function createRideMotion(
  id: WorldRideableId,
  x: number,
  z: number,
  rotation: number,
  autonomousSeed?: number,
): RideMotion {
  const motion: RideMotion = {
    id,
    x,
    z,
    altitude: 0,
    rotation,
    velocityX: 0,
    velocityZ: 0,
    velocityY: 0,
    lean: 0,
    stuntProgress: null,
    stuntCooldown: 0,
    stuntUsed: false,
  };
  if (worldRideIsAutonomous(id)) {
    motion.autopilot = {
      phase: 'takeoff',
      seed: Math.trunc(finite(autonomousSeed ?? Math.random() * 0xffffffff)) >>> 0,
      target: null,
      altitude: 26,
      routeTime: 0,
      retrying: false,
    };
  }
  return motion;
}

export function canMountRide(
  player: { x: number; y: number; z: number },
  item: { x: number; z: number },
  id?: WorldRideableId,
) {
  return player.y < 0.7 && Math.hypot(player.x - item.x, player.z - item.z) <= worldRideMountDistance(id);
}

/** Keep the existing walking solver intact; vehicles have their own footprint. */
export function resolveRidePosition(
  x: number,
  z: number,
  radius: number,
  obstacles: readonly WorldObstacle[],
  altitude = 0,
  flight = false,
  height = FLYING_PERSON_HEIGHT,
) {
  // A few relaxation passes also handle adjoining wall segments and moved chess pieces.
  for (let pass = 0; pass < 4; pass++) {
    for (const obstacle of obstacles) {
      if (
        obstacle.enabled === false ||
        ((obstacle.minHeight ?? 0) > 0 && (!flight || altitude + height + ROOF_CLEARANCE <= obstacle.minHeight!)) ||
        (flight && altitude >= (obstacle.height ?? 3) + ROOF_CLEARANCE)
      )
        continue;
      const dx = x - obstacle.x;
      const dz = z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      const clearance = obstacle.radius + radius;
      if (distance < clearance) {
        x = obstacle.x + (distance > 0.001 ? dx / distance : 1) * clearance;
        z = obstacle.z + (distance > 0.001 ? dz / distance : 0) * clearance;
      }
    }
    const edge = Math.hypot(x, z);
    if (edge > WORLD_RADIUS - radius) {
      x *= (WORLD_RADIUS - radius) / edge;
      z *= (WORLD_RADIUS - radius) / edge;
    }
  }
  return { x, z };
}

/** Step off beside the vehicle, never into a wall or outside the island. */
export function rideDismountPosition(motion: RideMotion, obstacles: readonly WorldObstacle[]) {
  if (motion.altitude > 0.12 || motion.stuntProgress !== null) return null;
  const distance = rideDefinition(motion.id).radius + 1;
  for (const offset of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
    const x = motion.x + Math.sin(motion.rotation + offset) * distance;
    const z = motion.z + Math.cos(motion.rotation + offset) * distance;
    if (Math.hypot(x, z) > WORLD_RADIUS - 0.65) continue;
    if (
      obstacles.every(
        (obstacle) =>
          obstacle.enabled === false ||
          (obstacle.minHeight ?? 0) > 0 ||
          Math.hypot(x - obstacle.x, z - obstacle.z) >= obstacle.radius + 0.65,
      )
    )
      return { x, z };
  }
  return null;
}

const landingPhase = (phase: AutonomousRideMotion['phase'] | undefined) =>
  phase === 'landing' || phase === 'descending';

function nextAutonomousRandom(autopilot: AutonomousRideMotion) {
  autopilot.seed = (Math.imul(autopilot.seed, 1664525) + 1013904223) >>> 0;
  return autopilot.seed / 0x100000000;
}

/** Leave room for a roll above every building crossed by a planned flight leg. */
function routeAltitude(motion: RideMotion, target: { x: number; z: number }, obstacles: readonly WorldObstacle[]) {
  const flight = rideDefinition(motion.id).flight!;
  const dx = target.x - motion.x;
  const dz = target.z - motion.z;
  const lengthSquared = dx * dx + dz * dz;
  let altitude = 0;
  for (const obstacle of obstacles) {
    if (obstacle.enabled === false) continue;
    const along = lengthSquared
      ? clamp(((obstacle.x - motion.x) * dx + (obstacle.z - motion.z) * dz) / lengthSquared, 0, 1)
      : 0;
    if (
      Math.hypot(obstacle.x - motion.x - along * dx, obstacle.z - motion.z - along * dz) <
      obstacle.radius + (flight.stuntBounds?.radius ?? flight.radius ?? 1) + 2
    )
      altitude = Math.max(altitude, (obstacle.height ?? 3) + (flight.stuntBounds?.below ?? 3) + 1 + ROOF_CLEARANCE);
  }
  return altitude;
}

function chooseAutonomousRoute(motion: RideMotion, obstacles: readonly WorldObstacle[]) {
  const autopilot = motion.autopilot!;
  const ceiling = rideDefinition(motion.id).flight!.ceiling - 0.5;
  const inland = Math.hypot(motion.x, motion.z) > WORLD_RADIUS - 55;
  for (let attempt = 0; attempt < 8; attempt++) {
    const turn = (nextAutonomousRandom(autopilot) - 0.5) * 1.8;
    const heading = (inland || attempt > 3 ? Math.atan2(-motion.x, -motion.z) : motion.rotation) + turn;
    const length = 65 + nextAutonomousRandom(autopilot) * 55;
    const target = { x: motion.x + Math.sin(heading) * length, z: motion.z + Math.cos(heading) * length };
    const edge = Math.hypot(target.x, target.z);
    if (edge > WORLD_RADIUS - 24) {
      target.x *= (WORLD_RADIUS - 24) / edge;
      target.z *= (WORLD_RADIUS - 24) / edge;
    }
    if (Math.hypot(target.x - motion.x, target.z - motion.z) < 25) continue;
    const altitude = Math.max(24 + nextAutonomousRandom(autopilot) * 8, routeAltitude(motion, target, obstacles));
    if (altitude > ceiling) continue;
    autopilot.target = target;
    autopilot.altitude = altitude;
    autopilot.routeTime = 7 + nextAutonomousRandom(autopilot) * 3;
    autopilot.retrying = false;
    return;
  }
  // A newly moved obstacle can block a route. Hover and retry at a bounded rate.
  autopilot.target = { x: motion.x, z: motion.z };
  autopilot.altitude = clamp(Math.max(motion.altitude, 24), 0, ceiling);
  autopilot.routeTime = 1;
  autopilot.retrying = true;
}

function landingSpotIsClear(motion: RideMotion, target: { x: number; z: number }, obstacles: readonly WorldObstacle[]) {
  const definition = rideDefinition(motion.id);
  const clearance = Math.max(definition.radius + 2, (definition.flight?.radius ?? definition.radius) + 2);
  return (
    Math.hypot(target.x, target.z) <= WORLD_RADIUS - clearance - 1 &&
    obstacles.every(
      (obstacle) =>
        obstacle.enabled === false ||
        Math.hypot(target.x - obstacle.x, target.z - obstacle.z) >= obstacle.radius + clearance,
    )
  );
}

function chooseLandingSpot(motion: RideMotion, obstacles: readonly WorldObstacle[]) {
  for (const radius of [0, 10, 20, 30, 45, 60, 85, 115, 150, 190, 240, 300, 350]) {
    const count = radius === 0 ? 1 : 24;
    for (let index = 0; index < count; index++) {
      const angle = motion.rotation + (index / count) * Math.PI * 2;
      const target = { x: motion.x + Math.sin(angle) * radius, z: motion.z + Math.cos(angle) * radius };
      if (
        landingSpotIsClear(motion, target, obstacles) &&
        routeAltitude(motion, target, obstacles) <= rideDefinition(motion.id).flight!.ceiling - 0.5
      )
        return target;
    }
  }
  return null;
}

/** E requests one landing; repeated requests preserve the chosen approach. */
export function requestAutonomousRideLanding(motion: RideMotion, obstacles: readonly WorldObstacle[]) {
  const autopilot = motion.autopilot;
  if (!autopilot || landingPhase(autopilot.phase)) return false;
  autopilot.phase = 'landing';
  autopilot.target = chooseLandingSpot(motion, obstacles);
  autopilot.altitude = Math.max(
    motion.altitude,
    autopilot.target ? routeAltitude(motion, autopilot.target, obstacles) : 0,
  );
  autopilot.routeTime = 1;
  return true;
}

/** Passenger input never steers an autonomous ride; only its local route state does. */
function autonomousRideInput(motion: RideMotion, seconds: number, obstacles: readonly WorldObstacle[]): RideInput {
  const autopilot = motion.autopilot!;
  const definition = rideDefinition(motion.id);
  const flight = definition.flight!;
  autopilot.routeTime = Math.max(0, autopilot.routeTime - seconds);
  const hold: RideInput = { x: 0, z: 0, yaw: 0, lift: 0 };

  if (landingPhase(autopilot.phase)) {
    // Complete a requested roll before changing the flight path or descending.
    if (motion.stuntProgress !== null) return hold;
    if (autopilot.target && !landingSpotIsClear(motion, autopilot.target, obstacles)) {
      autopilot.target = null;
      autopilot.phase = 'landing';
      autopilot.routeTime = 0;
    }
    if (!autopilot.target && autopilot.routeTime === 0) {
      autopilot.target = chooseLandingSpot(motion, obstacles);
      autopilot.altitude = Math.max(
        motion.altitude,
        autopilot.target ? routeAltitude(motion, autopilot.target, obstacles) : 0,
      );
      autopilot.routeTime = 1;
    }
    if (!autopilot.target) return hold;
    const dx = autopilot.target.x - motion.x;
    const dz = autopilot.target.z - motion.z;
    const distance = Math.hypot(dx, dz);
    const speed = Math.hypot(motion.velocityX, motion.velocityZ);
    const speedLimit = motion.altitude > 0.12 ? (flight.speed ?? definition.speed) : definition.speed;
    const strength = Math.min(15, distance * 1.1) / speedLimit;
    if (autopilot.phase === 'landing' && distance < 0.6 && speed < 0.8) autopilot.phase = 'descending';
    const lift =
      autopilot.phase === 'descending'
        ? -clamp(motion.altitude / 4, 0.16, 1)
        : clamp((autopilot.altitude - motion.altitude) * 0.45, -1, 1);
    const canApproach = motion.altitude >= autopilot.altitude - 0.75 || autopilot.phase === 'descending';
    return {
      x: canApproach && distance > 0.01 ? (dx / distance) * strength : 0,
      z: canApproach && distance > 0.01 ? (dz / distance) * strength : 0,
      yaw: 0,
      lift,
    };
  }

  const distance = autopilot.target ? Math.hypot(autopilot.target.x - motion.x, autopilot.target.z - motion.z) : 0;
  if (
    !autopilot.target ||
    (autopilot.phase === 'cruise' && ((!autopilot.retrying && distance < 14) || autopilot.routeTime === 0))
  ) {
    chooseAutonomousRoute(motion, obstacles);
  }
  if (autopilot.phase === 'takeoff' && motion.altitude >= autopilot.altitude - 0.75) autopilot.phase = 'cruise';
  const target = autopilot.target!;
  const dx = target.x - motion.x;
  const dz = target.z - motion.z;
  const length = Math.hypot(dx, dz);
  const canCruise = autopilot.phase === 'cruise' && motion.altitude >= autopilot.altitude - 0.75;
  return {
    x: canCruise && length > 1 ? (dx / length) * 0.8 : 0,
    z: canCruise && length > 1 ? (dz / length) * 0.8 : 0,
    yaw: 0,
    lift: clamp((autopilot.altitude - motion.altitude) * 0.45, -1, 1),
  };
}

export function jumpRide(motion: RideMotion) {
  if (worldRideCanFly(motion.id) || motion.altitude > 0.01 || motion.velocityY > 0) return false;
  motion.velocityY = rideDefinition(motion.id).jumpSpeed;
  return true;
}

export function startRideStunt(motion: RideMotion, obstacles: readonly WorldObstacle[] = []) {
  if (motion.stuntProgress !== null || motion.stuntCooldown > 0) return false;
  if (landingPhase(motion.autopilot?.phase)) return false;
  const definition = rideDefinition(motion.id);
  if (definition.flight) {
    if (motion.altitude < definition.flight.stuntAltitude) return false;
    const bounds = definition.flight.stuntBounds;
    if (
      bounds &&
      obstacles.some(
        (obstacle) =>
          obstacle.enabled !== false &&
          Math.hypot(motion.x - obstacle.x, motion.z - obstacle.z) < bounds.radius + obstacle.radius &&
          motion.altitude - bounds.below < (obstacle.height ?? 3) + ROOF_CLEARANCE &&
          motion.altitude + bounds.above + ROOF_CLEARANCE > (obstacle.minHeight ?? 0),
      )
    )
      return false;
  } else {
    if (motion.stuntUsed) return false;
    if (motion.altitude <= 0.01) jumpRide(motion);
    const airtime = (motion.velocityY + Math.sqrt(motion.velocityY ** 2 + 2 * GRAVITY * motion.altitude)) / GRAVITY;
    if (airtime < definition.stuntDuration + 0.03) return false;
    motion.stuntUsed = true;
  }
  motion.stuntProgress = 0;
  motion.stuntCooldown = STUNT_COOLDOWN;
  return true;
}

/** Local, bounded movement only: no account state, network or persistence. */
export function stepRide(motion: RideMotion, input: RideInput, seconds: number, obstacles: readonly WorldObstacle[]) {
  const dt = clamp(finite(seconds), 0, 0.05);
  if (!dt) return;
  if (motion.autopilot) input = autonomousRideInput(motion, dt, obstacles);
  const definition = rideDefinition(motion.id);
  const flight = definition.flight;
  const airborne = !!flight && motion.altitude > 0.12;
  const stuntBounds = motion.stuntProgress !== null ? flight?.stuntBounds : undefined;
  const radius = airborne ? (stuntBounds?.radius ?? flight?.radius ?? definition.radius) : definition.radius;
  const below = stuntBounds?.below ?? 0;
  const above = stuntBounds?.above ?? flight?.height ?? FLYING_PERSON_HEIGHT;
  const inputX = clamp(finite(input.x), -1, 1);
  const inputZ = clamp(finite(input.z), -1, 1);
  const length = Math.max(1, Math.hypot(inputX, inputZ));
  const yaw = finite(input.yaw);
  const directionX = (inputX * Math.cos(yaw) + inputZ * Math.sin(yaw)) / length;
  const directionZ = (inputZ * Math.cos(yaw) - inputX * Math.sin(yaw)) / length;
  const speedLimit = (airborne ? (flight?.speed ?? definition.speed) : definition.speed) * (input.brake ? 0.35 : 1);
  const steering = 1 - Math.exp(-dt * (inputX || inputZ ? definition.acceleration : (definition.stopping ?? 7)));
  motion.velocityX += (directionX * speedLimit - motion.velocityX) * steering;
  motion.velocityZ += (directionZ * speedLimit - motion.velocityZ) * steering;
  if (Math.hypot(motion.velocityX, motion.velocityZ) < 0.03) motion.velocityX = motion.velocityZ = 0;
  const speed = Math.hypot(motion.velocityX, motion.velocityZ);
  let turn = 0;
  if (speed > 0.08) {
    const desired = Math.atan2(motion.velocityX, motion.velocityZ);
    turn = Math.atan2(Math.sin(desired - motion.rotation), Math.cos(desired - motion.rotation));
    motion.rotation += turn * Math.min(1, dt * (definition.turning ?? 8));
  }
  motion.lean += (clamp(-turn * 0.45, -0.4, 0.4) - motion.lean) * Math.min(1, dt * 6);

  if (flight) {
    const targetLift = clamp(finite(input.lift), -1, 1) * flight.lift;
    motion.velocityY += (targetLift - motion.velocityY) * (1 - Math.exp(-dt * flight.response));
  } else motion.velocityY -= GRAVITY * dt;

  // At most eight short advances per frame prevent fast cars crossing thin props.
  const steps = Math.max(1, Math.min(8, Math.ceil((speed * dt) / 0.22)));
  for (let index = 0; index < steps; index++) {
    const step = dt / steps;
    const nextAltitude = clamp(motion.altitude + motion.velocityY * step, 0, flight?.ceiling ?? JETPACK_CEILING);
    const position = resolveRidePosition(
      motion.x + motion.velocityX * step,
      motion.z + motion.velocityZ * step,
      radius,
      obstacles,
      motion.altitude - below,
      !!flight,
      above + below,
    );
    const deltaX = position.x - motion.x;
    const deltaZ = position.z - motion.z;
    motion.x = position.x;
    motion.z = position.z;
    if (speed > 0.2 && Math.hypot(deltaX, deltaZ) < speed * step * 0.1) {
      motion.velocityX *= 0.65;
      motion.velocityZ *= 0.65;
    }
    // Hover above roofs and props rather than descending through them. To step
    // off a flying ride, move over clear ground and descend to the island surface.
    let floor = below;
    let ceiling = flight?.ceiling ?? JETPACK_CEILING;
    if (flight && motion.velocityY > 0) {
      for (const obstacle of obstacles) {
        if (obstacle.enabled === false || !obstacle.minHeight) continue;
        const underside = obstacle.minHeight - above - ROOF_CLEARANCE;
        if (
          motion.altitude <= underside &&
          nextAltitude > underside &&
          Math.hypot(motion.x - obstacle.x, motion.z - obstacle.z) < obstacle.radius + radius
        )
          ceiling = Math.min(ceiling, underside);
      }
    }
    if (flight && motion.velocityY < 0) {
      for (const obstacle of obstacles) {
        if (obstacle.enabled === false) continue;
        const top = (obstacle.height ?? 3) + ROOF_CLEARANCE + below;
        if (
          motion.altitude >= top &&
          nextAltitude < top &&
          Math.hypot(motion.x - obstacle.x, motion.z - obstacle.z) < obstacle.radius + radius
        )
          floor = Math.max(floor, top);
      }
    }
    motion.altitude = Math.min(ceiling, Math.max(floor, nextAltitude));
    if (motion.altitude === floor || motion.altitude === 0 || motion.altitude === ceiling) motion.velocityY = 0;
  }

  motion.stuntCooldown = Math.max(0, motion.stuntCooldown - dt);
  if (motion.stuntProgress !== null) {
    motion.stuntProgress += dt / definition.stuntDuration;
    if (motion.stuntProgress >= 1 || (!flight && motion.altitude === 0)) motion.stuntProgress = null;
  }
  if (motion.altitude === 0 && motion.velocityY === 0) motion.stuntUsed = false;
}

export function rideStatus(motion: RideMotion): WorldRideStatus {
  const definition = rideDefinition(motion.id);
  return {
    id: motion.id,
    name: definition.name,
    speed: Math.hypot(motion.velocityX, motion.velocityZ),
    altitude: motion.altitude,
    grounded: motion.altitude <= 0.12,
    stunt: motion.stuntProgress === null ? null : definition.stunt,
    ...(landingPhase(motion.autopilot?.phase) ? { landing: true } : {}),
  };
}
