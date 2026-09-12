import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorldBurnEscape, createWorldHumanBurnTarget, WORLD_BURN_ESCAPE } from '@/libs/world/world-burn-escape';
import { createWorldBurning, createWorldGroupBurnTarget, WORLD_BURN_LIMITS } from '@/libs/world/world-burning';
import { disposeObject } from '@/libs/world/world-geometry';

describe('burning human escape', () => {
  const scenes: THREE.Scene[] = [];
  afterEach(() => {
    scenes.forEach(disposeObject);
    scenes.length = 0;
  });

  it('chooses different outward routes that run to the shore before falling below it', () => {
    for (const origin of [
      new THREE.Vector3(0, 0.15, 0),
      new THREE.Vector3(70, 0.15, 98),
      new THREE.Vector3(-120, 0.15, 10),
    ]) {
      const headings = new Set<number>();
      for (const choice of [0.05, 0.25, 0.5, 0.75, 0.95]) {
        const random = vi.fn(() => choice);
        const escape = createWorldBurnEscape(origin, random);
        expect(escape.duration).toBeGreaterThan(WORLD_BURN_ESCAPE.fallSeconds);
        expect(escape.duration).toBeLessThan(25);
        const runningFraction = (escape.duration - WORLD_BURN_ESCAPE.fallSeconds) / escape.duration;
        const beforeEdge = escape.sample(runningFraction * 0.99);
        expect(beforeEdge.falling).toBe(false);
        expect(Math.hypot(beforeEdge.position.x, beforeEdge.position.z)).toBeLessThan(WORLD_BURN_ESCAPE.edgeRadius);
        expect(beforeEdge.position.y).toBeGreaterThanOrEqual(0.15);
        headings.add(beforeEdge.yaw);
        const below = escape.sample(1);
        expect(Math.hypot(below.position.x, below.position.z)).toBeGreaterThan(WORLD_BURN_ESCAPE.edgeRadius);
        expect(below.position.y).toBeLessThan(-30);
        expect(below.falling).toBe(true);
        expect(random).toHaveBeenCalledOnce();
      }
      expect(headings.size).toBe(5);
    }
  });

  it('keeps travel and the final fall in reduced motion without a running bob or stride', () => {
    const escape = createWorldBurnEscape(new THREE.Vector3(0, 0.15, 0), () => 0.4);
    const running = escape.sample(0.5, true);
    expect(running.position.length()).toBeGreaterThan(50);
    expect(running.position.y).toBe(0.15);
    expect(running.stride).toBe(0);
    expect(escape.sample(1, true).position.y).toBeLessThan(-30);
    for (const progress of [NaN, Infinity, -10, 10]) {
      expect(escape.sample(progress).position.toArray().every(Number.isFinite)).toBe(true);
    }
  });

  it('separates a human from exploding scenery and hides it only after its own escape', () => {
    const scene = new THREE.Scene();
    scenes.push(scene);
    const building = new THREE.Group();
    building.position.set(5, 0, 5);
    building.add(new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial()));
    scene.add(building);
    const person = new THREE.Group();
    person.position.set(4, 0.15, 0);
    person.add(new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshBasicMaterial()));
    building.add(person);
    const human = createWorldHumanBurnTarget('human:test', person, scene);
    const onGone = vi.fn();
    const burning = createWorldBurning({ ledger: new Set(), onGone });
    burning.bind(human);
    const scenery = createWorldGroupBurnTarget('prop:building', [building], [], {
      onIgnite: () => {
        burning.ignite(human.id);
      },
    });
    const bounds = new THREE.Box3();
    scenery.getBounds(bounds);
    expect(bounds.max.x).toBe(7); // Separately owned people are excluded from the building burst.
    burning.bind(scenery);
    burning.ignite(scenery.id);
    expect(person.parent).toBe(scene);
    expect(person.position.toArray()).toEqual([9, 0.15, 5]);
    for (let frame = 0; frame < 75; frame++) burning.tick(0.1);
    expect(building.visible).toBe(false);
    expect(person.visible).toBe(true);
    expect(person.scale.toArray()).toEqual([1, 1, 1]);
    expect(person.position.distanceTo(new THREE.Vector3(9, 0.15, 5))).toBeGreaterThan(50);
    for (let frame = 0; frame < 150; frame++) burning.tick(0.1);
    expect(person.visible).toBe(false);
    expect(person.position.y).toBeLessThan(-30);
    expect(onGone.mock.calls.map(([id, event]) => [id, event.completion])).toEqual([
      [scenery.id, 'explode'],
      [human.id, 'fall'],
    ]);
    person.visible = true;
    burning.tick(0);
    expect(person.visible).toBe(false);
    burning.dispose();
  });

  it('collapses burning zombies on the floor, releases fire capacity, then clears corpses after sixty seconds', () => {
    const scene = new THREE.Scene();
    scenes.push(scene);
    const onGone = vi.fn();
    const onExtinguish = vi.fn();
    const burning = createWorldBurning({ ledger: new Set(), onGone, onExtinguish });
    const people = Array.from({ length: WORLD_BURN_LIMITS.concurrent + 1 }, (_, index) => {
      const person = new THREE.Group();
      person.position.set(index * 2, 0.15, 0);
      person.add(
        new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.8, 0.8).translate(0, 1.4, 0), new THREE.MeshBasicMaterial()),
      );
      scene.add(person);
      const target = createWorldHumanBurnTarget(`human:zombie-${index}`, person, scene);
      burning.bind(target);
      // Targets may turn into zombies after they were registered as humans.
      person.userData.worldZombie = true;
      return { person, target };
    });
    for (const { target } of people.slice(0, WORLD_BURN_LIMITS.concurrent))
      expect(burning.ignite(target.id)).toBe(true);
    expect(burning.ignite(people.at(-1)!.target.id)).toBe(false);
    for (let tick = 0; tick < 14; tick++) burning.tick(0.1);
    const { person, target } = people[0];
    expect(person.visible).toBe(true);
    expect(person.position.x).toBe(0);
    expect(person.position.z).toBe(0);
    expect(person.rotation.x).toBeCloseTo(Math.PI / 2);
    expect(new THREE.Box3().setFromObject(person).min.y).toBeCloseTo(0.13);
    expect(burning.isBurning(target.id)).toBe(true);
    expect(burning.isGone(target.id)).toBe(false);
    expect(burning.ignite(target.id)).toBe(false);
    expect(burning.ignite(people.at(-1)!.target.id)).toBe(true);
    expect(onGone.mock.calls.every(([, event]) => event.completion === 'smolder')).toBe(true);
    for (let tick = 0; tick < 570; tick++) burning.tick(0.1);
    expect(person.visible).toBe(true);
    for (let tick = 0; tick < 50; tick++) burning.tick(0.1);
    expect(people.every(({ person }) => !person.visible)).toBe(true);
    expect(burning.isGone(target.id)).toBe(true);
    expect(onExtinguish).toHaveBeenCalledTimes(people.length);
    burning.dispose();
  });

  it('does not reignite zombies already knocked down by a weapon', () => {
    const scene = new THREE.Scene();
    scenes.push(scene);
    const figure = new THREE.Group();
    figure.add(new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshBasicMaterial()));
    scene.add(figure);
    const burning = createWorldBurning({ ledger: new Set() });
    const target = createWorldHumanBurnTarget('human:fallen', figure, scene);
    burning.bind(target);
    figure.userData.worldZombieFallen = true;
    expect(burning.ignite(target.id)).toBe(false);
    burning.dispose();
  });
});
