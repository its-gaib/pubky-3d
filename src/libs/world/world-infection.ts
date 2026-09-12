import * as THREE from 'three';
import { WORLD_ANCHORS, WORLD_RADIUS } from '@/libs/world/world-layout';
import type { WorldObstacle } from '@/libs/world/world-motion';

export const WORLD_INFECTION = {
  humans: 100,
  maxPeople: 256,
  humanSpeed: 3.6,
  zombieSpeed: 1.2,
  sight: 36,
  sightHeight: 3.2,
  biteDistance: 1.45,
  biteHeight: 1.45,
  biteCooldown: 1.2,
  corpseSeconds: 60,
  collapseSeconds: 0.65,
  separationDistance: 5,
  separationForce: 0.34,
  radius: 0.48,
  height: 2.6,
  floor: 0.15,
  maxStep: 0.05,
  spawnInnerRadius: 38,
  spawnOuterRadius: WORLD_RADIUS - 5,
} as const;

export interface WorldInfectionPerson {
  id: string;
  position: THREE.Vector3;
  zombie: boolean;
  active: boolean;
  wandering: boolean;
  yaw: number;
  phase: number;
  stride: number;
  waiting: boolean;
  decisionAt: number;
  biteAt: number;
}

export interface WorldInfectionPlayer {
  position: THREE.Vector3;
  zombie: boolean;
  canBeBitten: boolean;
  bite: boolean;
}

export function worldCrowdRandom(random: () => number) {
  const value = random();
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1 - Number.EPSILON) : 0.5;
}

export function createWorldInfectionPerson(
  id: string,
  position: THREE.Vector3,
  options: { wandering?: boolean; zombie?: boolean; random?: () => number } = {},
): WorldInfectionPerson {
  const random = options.random ?? Math.random;
  return {
    id,
    position,
    zombie: options.zombie ?? false,
    active: true,
    wandering: options.wandering ?? false,
    yaw: worldCrowdRandom(random) * Math.PI * 2,
    phase: worldCrowdRandom(random) * Math.PI * 2,
    stride: 0,
    waiting: false,
    decisionAt: 2 + worldCrowdRandom(random) * 6,
    biteAt: WORLD_INFECTION.biteCooldown,
  };
}

function finitePosition(position: THREE.Vector3) {
  return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}

function blocksHeight(obstacle: WorldObstacle, low: number, high: number) {
  return (
    obstacle.enabled !== false &&
    obstacle.radius > 0 &&
    (obstacle.minHeight ?? 0) < high &&
    (obstacle.height ?? 4) > low
  );
}

/** Eye-level line of sight respects actual prop clearance, including elevated panels. */
export function worldInfectionCanSee(from: THREE.Vector3, to: THREE.Vector3, obstacles: readonly WorldObstacle[]) {
  if (!finitePosition(from) || !finitePosition(to) || Math.abs(from.y - to.y) > WORLD_INFECTION.sightHeight)
    return false;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distanceSquared = dx * dx + dz * dz;
  if (distanceSquared > WORLD_INFECTION.sight ** 2) return false;
  if (distanceSquared < 1e-8) return true;
  for (const obstacle of obstacles) {
    const along = ((obstacle.x - from.x) * dx + (obstacle.z - from.z) * dz) / distanceSquared;
    if (along <= 0 || along >= 1) continue;
    const eye = THREE.MathUtils.lerp(from.y, to.y, along) + 1.65;
    if (!blocksHeight(obstacle, eye, eye + 0.01)) continue;
    if (Math.hypot(from.x + dx * along - obstacle.x, from.z + dz * along - obstacle.z) < obstacle.radius) return false;
  }
  return true;
}

export function worldCrowdSpawnClear(x: number, z: number, obstacles: readonly WorldObstacle[]) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > WORLD_INFECTION.spawnOuterRadius) return false;
  return obstacles.every(
    (obstacle) =>
      !blocksHeight(obstacle, WORLD_INFECTION.floor + 0.1, WORLD_INFECTION.height) ||
      Math.hypot(x - obstacle.x, z - obstacle.z) >= obstacle.radius + WORLD_INFECTION.radius + 0.3,
  );
}

/** Random retries are bounded; a rotated golden-angle sweep also handles constant test RNGs. */
export function worldCrowdSpawn(
  index: number,
  existing: readonly THREE.Vector3[],
  obstacles: readonly WorldObstacle[],
  random: () => number = Math.random,
) {
  const rotation = worldCrowdRandom(random) * Math.PI * 2;
  let best = new THREE.Vector3(WORLD_INFECTION.spawnInnerRadius, WORLD_INFECTION.floor, 0);
  let bestClearance = -Infinity;
  for (let attempt = 0; attempt < 384; attempt++) {
    const yaw =
      attempt < 32 ? worldCrowdRandom(random) * Math.PI * 2 : rotation + (index * 19 + attempt) * 2.399963229728653;
    const fraction = attempt < 32 ? worldCrowdRandom(random) : ((attempt * 37 + index * 13) % 353) / 353;
    const radius = Math.sqrt(
      WORLD_INFECTION.spawnInnerRadius ** 2 +
        fraction * (WORLD_INFECTION.spawnOuterRadius ** 2 - WORLD_INFECTION.spawnInnerRadius ** 2),
    );
    const x = Math.sin(yaw) * radius;
    const z = Math.cos(yaw) * radius;
    if (!worldCrowdSpawnClear(x, z, obstacles)) continue;
    let clearance = Infinity;
    for (const person of existing) clearance = Math.min(clearance, Math.hypot(x - person.x, z - person.z));
    if (clearance > bestClearance) {
      best = new THREE.Vector3(x, WORLD_INFECTION.floor, z);
      bestClearance = clearance;
    }
    if (clearance > 4) return best;
  }
  return best;
}

function tryMove(person: WorldInfectionPerson, dx: number, dz: number, obstacles: readonly WorldObstacle[]) {
  const { position } = person;
  const clear = (x: number, z: number) => {
    if (Math.hypot(x, z) > WORLD_RADIUS - WORLD_INFECTION.radius) return false;
    for (const obstacle of obstacles) {
      if (!blocksHeight(obstacle, position.y + 0.1, position.y + WORLD_INFECTION.height)) continue;
      const clearance = obstacle.radius + WORLD_INFECTION.radius;
      const distance = Math.hypot(x - obstacle.x, z - obstacle.z);
      // An infected seated actor may start inside its bench's footprint. It can
      // leave that footprint, but cannot move farther into another solid prop.
      if (distance < clearance && distance <= Math.hypot(position.x - obstacle.x, position.z - obstacle.z) + 1e-8)
        return false;
    }
    return true;
  };
  if (clear(position.x + dx, position.z + dz)) {
    position.x += dx;
    position.z += dz;
    return Math.hypot(dx, dz);
  }
  if (Math.abs(dx) > 1e-8 && clear(position.x + dx, position.z)) {
    position.x += dx;
    return Math.abs(dx);
  }
  if (Math.abs(dz) > 1e-8 && clear(position.x, position.z + dz)) {
    position.z += dz;
    return Math.abs(dz);
  }
  return 0;
}

function sightseeingYaw(person: WorldInfectionPerson, random: () => number) {
  let closest = 55 ** 2;
  let result = worldCrowdRandom(random) * Math.PI * 2;
  for (const [x, z] of Object.values(WORLD_ANCHORS)) {
    const distance = (person.position.x - x) ** 2 + (person.position.z - z) ** 2;
    if (distance < closest && distance > 5 ** 2) {
      closest = distance;
      result = Math.atan2(x - person.position.x, z - person.position.z);
    }
  }
  return result;
}

/** Local scene state: no profile data, clocks, persistence, network calls, or timers. */
export function createWorldInfection(obstacles: readonly WorldObstacle[], random: () => number = Math.random) {
  const people: WorldInfectionPerson[] = [];
  const zombies: WorldInfectionPerson[] = [];
  const infected: string[] = [];
  let elapsed = 0;
  let playerBiteAt = 0;

  function infect(person: WorldInfectionPerson) {
    person.zombie = true;
    person.waiting = false;
    person.biteAt = elapsed + WORLD_INFECTION.biteCooldown;
    infected.push(person.id);
  }

  return {
    add(person: WorldInfectionPerson) {
      if (people.length >= WORLD_INFECTION.maxPeople || people.some((entry) => entry.id === person.id)) return false;
      people.push(person);
      return true;
    },
    remove(id: string) {
      const index = people.findIndex((person) => person.id === id);
      if (index !== -1) people.splice(index, 1);
    },
    tick(seconds: number, player: WorldInfectionPlayer) {
      const delta = Number.isFinite(seconds) ? THREE.MathUtils.clamp(seconds, 0, WORLD_INFECTION.maxStep) : 0;
      elapsed += delta;
      infected.length = 0;
      zombies.length = 0;
      for (const person of people) {
        if (person.active && person.zombie && finitePosition(person.position)) zombies.push(person);
      }
      let playerBitten = false;
      for (const person of people) {
        if (!person.active || !finitePosition(person.position) || person.zombie || !person.wandering) continue;
        if (elapsed >= person.decisionAt) {
          person.waiting = !person.waiting && worldCrowdRandom(random) < 0.72;
          person.yaw = person.waiting
            ? sightseeingYaw(person, random)
            : person.yaw + (worldCrowdRandom(random) - 0.5) * Math.PI * 1.8;
          person.decisionAt = elapsed + (person.waiting ? 1.5 : 3.5) + worldCrowdRandom(random) * 4;
        }
        if (person.waiting) {
          person.stride = 0;
          continue;
        }
        const distance = WORLD_INFECTION.humanSpeed * delta;
        const moved = tryMove(person, Math.sin(person.yaw) * distance, Math.cos(person.yaw) * distance, obstacles);
        if (moved < distance * 0.2) person.yaw += delta * 2.5;
        person.phase += moved * 3.4;
        person.stride = moved ? Math.sin(person.phase) : 0;
      }

      for (const zombie of zombies) {
        let prey: WorldInfectionPerson | 'player' | null = null;
        let target: THREE.Vector3 | null = null;
        let nearest = WORLD_INFECTION.sight ** 2;
        for (const person of people) {
          if (!person.active || person.zombie) continue;
          const distance = zombie.position.distanceToSquared(person.position);
          if (distance > nearest || !worldInfectionCanSee(zombie.position, person.position, obstacles)) continue;
          prey = person;
          target = person.position;
          nearest = distance;
        }
        if (player.canBeBitten && !player.zombie && !playerBitten) {
          const distance = zombie.position.distanceToSquared(player.position);
          if (distance < nearest && worldInfectionCanSee(zombie.position, player.position, obstacles)) {
            prey = 'player';
            target = player.position;
            nearest = distance;
          }
        }

        let dx = target ? target.x - zombie.position.x : Math.sin(zombie.yaw);
        let dz = target ? target.z - zombie.position.z : Math.cos(zombie.yaw);
        const length = Math.hypot(dx, dz);
        if (length > 1e-8) {
          dx /= length;
          dz /= length;
        }
        let repelX = 0;
        let repelZ = 0;
        for (const other of zombies) {
          if (other === zombie || Math.abs(other.position.y - zombie.position.y) > WORLD_INFECTION.sightHeight)
            continue;
          const rx = zombie.position.x - other.position.x;
          const rz = zombie.position.z - other.position.z;
          const separation = Math.hypot(rx, rz);
          if (separation >= WORLD_INFECTION.separationDistance) continue;
          if (separation < 0.001) {
            repelX += zombie.id < other.id ? 1 : -1;
            continue;
          }
          const weight = 1 - separation / WORLD_INFECTION.separationDistance;
          repelX += (rx / separation) * weight;
          repelZ += (rz / separation) * weight;
        }
        const repulsion = Math.max(1, Math.hypot(repelX, repelZ));
        dx += (repelX / repulsion) * WORLD_INFECTION.separationForce;
        dz += (repelZ / repulsion) * WORLD_INFECTION.separationForce;
        if (!target && elapsed >= zombie.decisionAt) {
          zombie.yaw += (worldCrowdRandom(random) - 0.5) * Math.PI;
          zombie.decisionAt = elapsed + 3 + worldCrowdRandom(random) * 4;
          dx = Math.sin(zombie.yaw) + (repelX / repulsion) * WORLD_INFECTION.separationForce;
          dz = Math.cos(zombie.yaw) + (repelZ / repulsion) * WORLD_INFECTION.separationForce;
        }
        const steering = Math.hypot(dx, dz);
        const speed = steering > 1e-8 ? (WORLD_INFECTION.zombieSpeed * delta) / steering : 0;
        const moved = tryMove(zombie, dx * speed, dz * speed, obstacles);
        if (steering > 1e-8) {
          const yaw = Math.atan2(dx, dz);
          zombie.yaw += Math.atan2(Math.sin(yaw - zombie.yaw), Math.cos(yaw - zombie.yaw)) * Math.min(1, delta * 5);
        }
        if (moved < WORLD_INFECTION.zombieSpeed * delta * 0.2) zombie.yaw += delta * 3;
        zombie.phase += moved * 4.2;
        zombie.stride = moved ? Math.sin(zombie.phase) : 0;
        // A person rising from a theater seat steps down to the same island floor.
        zombie.position.y = THREE.MathUtils.damp(zombie.position.y, WORLD_INFECTION.floor, 2, delta);

        if (
          prey &&
          target &&
          elapsed >= zombie.biteAt &&
          Math.abs(zombie.position.y - target.y) <= WORLD_INFECTION.biteHeight &&
          Math.hypot(zombie.position.x - target.x, zombie.position.z - target.z) <= WORLD_INFECTION.biteDistance &&
          worldInfectionCanSee(zombie.position, target, obstacles)
        ) {
          zombie.biteAt = elapsed + WORLD_INFECTION.biteCooldown;
          if (prey === 'player') playerBitten = true;
          else infect(prey);
        }
      }

      if (player.zombie && player.bite && elapsed >= playerBiteAt && finitePosition(player.position)) {
        let prey: WorldInfectionPerson | null = null;
        let nearest = WORLD_INFECTION.biteDistance ** 2;
        for (const person of people) {
          if (
            !person.active ||
            person.zombie ||
            Math.abs(person.position.y - player.position.y) > WORLD_INFECTION.biteHeight
          )
            continue;
          const distance = (person.position.x - player.position.x) ** 2 + (person.position.z - player.position.z) ** 2;
          if (distance > nearest || !worldInfectionCanSee(player.position, person.position, obstacles)) continue;
          prey = person;
          nearest = distance;
        }
        if (prey) {
          playerBiteAt = elapsed + WORLD_INFECTION.biteCooldown;
          infect(prey);
        }
      }
      let humans = 0;
      let zombieCount = 0;
      for (const person of people) {
        if (!person.active) continue;
        if (person.zombie) zombieCount++;
        else humans++;
      }
      return { playerBitten, humans, zombies: zombieCount, infected };
    },
    dispose() {
      people.length = 0;
      zombies.length = 0;
      infected.length = 0;
    },
  };
}
