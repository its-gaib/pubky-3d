import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { disposeObject } from '@/libs/world/world-geometry';
import {
  animateWorldHorse,
  createWorldHorseModel,
  createWorldHorseStamina,
  WORLD_HORSE,
} from '@/libs/world/world-horse';

describe('horse stamina and model', () => {
  const models: THREE.Group[] = [];
  afterEach(() => models.splice(0).forEach(disposeObject));

  it('keeps used stamina across voluntary dismounts and restores it only after a full two-minute rest', () => {
    const stamina = createWorldHorseStamina();
    for (let frame = 0; frame < 400; frame++) stamina.step(0.05, true);
    stamina.dismounted();
    for (let frame = 0; frame < 100; frame++) stamina.step(0.05, false);
    expect(stamina.getStatus().remaining).toBeCloseTo(40);
    expect(stamina.canMount()).toBe(true);
    for (let frame = 0; frame < 800; frame++) stamina.step(0.05, true);
    expect(stamina.getStatus().tired).toBe(true);
    expect(stamina.canMount()).toBe(false);
    stamina.dismounted();
    expect(stamina.getStatus().rest).toBe(120);
    for (let frame = 0; frame < 2399; frame++) stamina.step(0.05, false);
    expect(stamina.canMount()).toBe(false);
    stamina.step(0.05, false);
    expect(stamina.getStatus()).toEqual({ remaining: 60, rest: 0, tired: false });
  });

  it('bounds invalid and stalled frame times and never recharges an exhausted mounted horse', () => {
    const stamina = createWorldHorseStamina();
    for (const delta of [NaN, Infinity, -5]) stamina.step(delta, true);
    expect(stamina.getStatus().remaining).toBe(60);
    stamina.step(1000, true);
    expect(stamina.getStatus().remaining).toBeCloseTo(59.95);
    for (let frame = 0; frame < 1300; frame++) stamina.step(0.05, true);
    expect(stamina.getStatus()).toEqual({ remaining: 0, rest: 0, tired: true });
  });

  it('places a saddle and separate armor beside a four-legged horse with its hooves above the floor', () => {
    const horse = createWorldHorseModel();
    models.push(horse);
    expect(horse.name).toBe('transport-horse');
    expect(horse.getObjectByName('horse-saddle')!.position.toArray()).toEqual(WORLD_HORSE.saddle);
    expect(horse.getObjectByName('horse-knight-armor')!.position.x).toBeGreaterThan(2);
    for (const front of ['front', 'rear']) {
      for (const side of ['left', 'right']) expect(horse.getObjectByName(`horse-${front}-${side}-leg`)).toBeDefined();
    }
    const bounds = new THREE.Box3().setFromObject(horse.getObjectByName('horse-body')!);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(bounds.max.y).toBeLessThan(4.1);
    expect(bounds.max.z).toBeGreaterThan(2);
  });

  it('gallops with articulated knees, hides mounted/burning armor, and keeps reduced motion still', () => {
    const horse = createWorldHorseModel();
    models.push(horse);
    const leg = horse.getObjectByName('horse-front-left-leg')!;
    const armor = horse.getObjectByName('horse-knight-armor')!;
    animateWorldHorse(horse, { mounted: true, speed: 20, time: 0.2 });
    expect(leg.rotation.x).not.toBe(0);
    expect(armor.visible).toBe(false);
    animateWorldHorse(horse, { mounted: false, speed: 0, time: 2, reducedMotion: true, tired: true });
    expect(leg.rotation.x).toBe(0);
    expect(armor.visible).toBe(true);
    expect(horse.getObjectByName('horse-head')!.rotation.x).toBe(0.2);
    horse.userData.worldBurnPending = true;
    animateWorldHorse(horse, { mounted: false, speed: 16, time: 2.5 });
    expect(armor.visible).toBe(false);
    expect(leg.rotation.x).not.toBe(0);
  });
});
