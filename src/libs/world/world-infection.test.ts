import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createWorldInfection,
  createWorldInfectionPerson,
  WORLD_INFECTION,
  worldCrowdSpawn,
  worldCrowdSpawnClear,
  worldInfectionCanSee,
  type WorldInfectionPlayer,
} from '@/libs/world/world-infection';
import { worldRidePreventsZombieBite } from '@/libs/world/world-transport-motion';

const absentPlayer = (): WorldInfectionPlayer => ({
  position: new THREE.Vector3(0, 100, 0),
  zombie: false,
  canBeBitten: false,
  bite: false,
});
const person = (id: string, x: number, z: number, zombie = false) => {
  const actor = createWorldInfectionPerson(id, new THREE.Vector3(x, WORLD_INFECTION.floor, z), {
    zombie,
    random: () => 0,
  });
  actor.biteAt = 0;
  return actor;
};

describe('world infection', () => {
  it('moves zombies at one third of ordinary wandering speed', () => {
    const simulation = createWorldInfection([]);
    const human = person('human:walker', 60, 0);
    human.wandering = true;
    const zombie = person('human:zombie', -60, 0, true);
    simulation.add(human);
    simulation.add(zombie);
    for (let frame = 0; frame < 20; frame++) simulation.tick(0.05, absentPlayer());
    expect(human.position.z).toBeCloseTo(WORLD_INFECTION.humanSpeed);
    expect(zombie.position.z).toBeCloseTo(human.position.z / 3);
  });

  it('pursues visible people while weaker repulsion spreads nearby zombies', () => {
    const simulation = createWorldInfection([]);
    const left = person('human:left', -0.2, 0, true);
    const right = person('human:right', 0.2, 0, true);
    simulation.add(left);
    simulation.add(right);
    simulation.add(person('human:prey', 0, 12));
    for (let frame = 0; frame < 20; frame++) simulation.tick(0.05, absentPlayer());
    expect(left.position.z).toBeGreaterThan(1);
    expect(right.position.z).toBeGreaterThan(1);
    expect(right.position.x - left.position.x).toBeGreaterThan(0.4);
    expect(WORLD_INFECTION.separationForce).toBeLessThan(1);
  });

  it('separates overlapping zombies without NaN positions', () => {
    const simulation = createWorldInfection([]);
    const left = person('human:a', 0, 0, true);
    const right = person('human:b', 0, 0, true);
    simulation.add(left);
    simulation.add(right);
    simulation.tick(0.05, absentPlayer());
    expect(left.position.distanceTo(right.position)).toBeGreaterThan(0.01);
    expect(Number.isFinite(left.position.x + right.position.x)).toBe(true);
  });

  it('infects one victim per cooldown and never cascades through a crowd in one frame', () => {
    const simulation = createWorldInfection([]);
    simulation.add(person('human:first-zombie', 0, 0, true));
    simulation.add(person('human:a', 0.4, 0));
    simulation.add(person('human:b', 0.8, 0));
    simulation.add(person('human:c', 1.1, 0));
    expect(simulation.tick(0.05, absentPlayer()).zombies).toBe(2);
    for (let frame = 0; frame < 15; frame++) {
      expect(simulation.tick(0.05, absentPlayer()).zombies).toBe(2);
    }
    for (let frame = 0; frame < 10; frame++) simulation.tick(0.05, absentPlayer());
    expect(simulation.tick(0.05, absentPlayer()).zombies).toBeGreaterThan(2);
  });

  it('bites a nearby vulnerable player, but ignores protected riders and unreachable heights', () => {
    const simulation = createWorldInfection([]);
    simulation.add(person('human:zombie', 0, 0, true));
    const player = { ...absentPlayer(), position: new THREE.Vector3(0, 0.15, 0.8) };
    expect(simulation.tick(0.05, player).playerBitten).toBe(false);
    player.canBeBitten = true;
    player.position.y = 2.8;
    expect(simulation.tick(0.05, player).playerBitten).toBe(false);
    player.position.y = 0.15;
    expect(simulation.tick(0.05, player).playerBitten).toBe(true);
  });

  it('lets zombies bite a low-hovering jetpack rider but not one flying above their reach', () => {
    const simulation = createWorldInfection([]);
    const zombie = person('human:zombie', 0, 0, true);
    simulation.add(zombie);
    const ride = { id: 'jetpack' as const, altitude: 2.8 };
    const player = {
      ...absentPlayer(),
      position: new THREE.Vector3(0, WORLD_INFECTION.floor + ride.altitude, 0.8),
      canBeBitten: !worldRidePreventsZombieBite(ride),
    };
    expect(simulation.tick(0.05, player).playerBitten).toBe(false);
    ride.altitude = 0.5;
    player.position.y = WORLD_INFECTION.floor + ride.altitude;
    player.canBeBitten = !worldRidePreventsZombieBite(ride);
    expect(simulation.tick(0.05, player).playerBitten).toBe(true);

    // A zombie on higher ground can still reach a rider at that same height.
    zombie.biteAt = 0;
    zombie.position.y = 3;
    ride.altitude = 3.5;
    player.position.y = WORLD_INFECTION.floor + ride.altitude;
    player.canBeBitten = !worldRidePreventsZombieBite(ride);
    expect(simulation.tick(0.05, player).playerBitten).toBe(true);
  });

  it('requires the infected player to bite and applies the same cooldown', () => {
    const simulation = createWorldInfection([]);
    simulation.add(person('human:a', 0.4, 0));
    simulation.add(person('human:b', -0.4, 0));
    const player = { ...absentPlayer(), position: new THREE.Vector3(0, 0.15, 0), zombie: true };
    expect(simulation.tick(0.05, player).zombies).toBe(0);
    player.bite = true;
    expect(simulation.tick(0.05, player).zombies).toBe(1);
    expect(simulation.tick(0.05, player).zombies).toBe(1);
  });

  it('cannot see or bite through solid props, but can see underneath elevated signs', () => {
    const from = new THREE.Vector3(0, 0.15, 0);
    const to = new THREE.Vector3(1.3, 0.15, 0);
    const wall = { x: 0.65, z: 0, radius: 0.3, height: 5 };
    expect(worldInfectionCanSee(from, to, [wall])).toBe(false);
    expect(worldInfectionCanSee(from, to, [{ ...wall, minHeight: 3 }])).toBe(true);
    expect(worldInfectionCanSee(from, to, [{ ...wall, enabled: false }])).toBe(true);
    const simulation = createWorldInfection([wall]);
    simulation.add(person('human:zombie', 0, 0, true));
    simulation.add(person('human:prey', 1.3, 0));
    expect(simulation.tick(0.05, absentPlayer()).zombies).toBe(1);
  });

  it('keeps wanderers outside solid scenery and on the island during stalled frames', () => {
    const obstacle = { x: 0, z: 1.2, radius: 0.5 };
    const simulation = createWorldInfection([obstacle]);
    const walker = person('human:walker', 0, 0);
    walker.wandering = true;
    simulation.add(walker);
    simulation.tick(1000, absentPlayer());
    expect(walker.position.length()).toBeLessThan(0.3);
    for (let frame = 0; frame < 30; frame++) simulation.tick(0.05, absentPlayer());
    expect(Math.hypot(walker.position.x, walker.position.z - obstacle.z)).toBeGreaterThanOrEqual(
      obstacle.radius + WORLD_INFECTION.radius,
    );
    expect(Math.hypot(walker.position.x, walker.position.z)).toBeLessThan(180);
  });

  it('excludes burning, defeated and hidden actors from attraction, bites and counts', () => {
    const simulation = createWorldInfection([]);
    const corpse = person('human:corpse', 0, 0, true);
    corpse.active = false;
    const burning = person('human:burning', 0.2, 0);
    burning.active = false;
    simulation.add(corpse);
    simulation.add(burning);
    expect(
      simulation.tick(0.05, { ...absentPlayer(), position: new THREE.Vector3(), canBeBitten: true }),
    ).toMatchObject({
      humans: 0,
      zombies: 0,
      playerBitten: false,
    });
  });

  it('spawns clear of the arrival hub, scenery and other visitors even with a constant RNG', () => {
    const obstacles = [{ x: 0, z: 45, radius: 8 }];
    const positions: THREE.Vector3[] = [];
    for (let index = 0; index <= WORLD_INFECTION.humans; index++) {
      const position = worldCrowdSpawn(index, positions, obstacles, () => 0.2);
      expect(worldCrowdSpawnClear(position.x, position.z, obstacles)).toBe(true);
      expect(Math.hypot(position.x, position.z)).toBeGreaterThanOrEqual(WORLD_INFECTION.spawnInnerRadius);
      expect(positions.every((other) => other.distanceTo(position) > 3.9)).toBe(true);
      positions.push(position);
    }
  });
});
