import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BANK_BILL_COUNT, BANK_BILL_LIFETIME, bankBillFrame } from './world-bank';

describe('bank bill life cycles', () => {
  it('keeps the reusable pool staggered instead of fading every bill together', () => {
    const frames = Array.from({ length: BANK_BILL_COUNT }, (_, index) => bankBillFrame(0, index));
    expect(frames.some((frame) => frame.opacity === 1)).toBe(true);
    expect(frames.some((frame) => frame.opacity > 0 && frame.opacity < 0.3)).toBe(true);
    expect(frames.some((frame) => frame.scale < 0.3)).toBe(true);
    expect(new Set(frames.map((frame) => frame.position[1])).size).toBeGreaterThan(10);
  });

  it('fades and shrinks an individual bill before recycling its own launch position', () => {
    const fresh = bankBillFrame(10, 0);
    const evaporating = bankBillFrame(68, 0);
    expect(fresh.opacity).toBe(1);
    expect(evaporating.opacity).toBeLessThan(0.05);
    expect(evaporating.scale).toBeLessThan(0.2);
    const recycled = bankBillFrame(BANK_BILL_LIFETIME + 10, 0);
    expect(recycled.opacity).toBeCloseTo(fresh.opacity);
    recycled.position.forEach((value, index) => expect(value).toBeCloseTo(fresh.position[index]));
  });

  it('lets some individual bills settle on the ground while others remain airborne', () => {
    const landed = bankBillFrame(42, 0);
    const resting = bankBillFrame(50, 0);
    const drifting = bankBillFrame(42, 2);
    expect(BANK_BILL_LIFETIME).toBe(70);
    expect(landed.settled).toBe(true);
    expect(resting.settled).toBe(true);
    expect(landed.position[1]).toBeCloseTo(0.24);
    expect(resting.position).toEqual(landed.position);
    expect(resting.opacity).toBe(1);
    expect(drifting.settled).toBe(false);
    expect(drifting.position[1]).toBeGreaterThan(1);
    expect(Math.hypot(landed.position[0] - 1.8, landed.position[2] + 0.4)).toBeGreaterThan(10);
  });

  it('lays settled notes flat at every heading instead of tilting them through the floor', () => {
    let checked = 0;
    for (const time of [0, 14, 42, 60]) {
      for (let index = 0; index < BANK_BILL_COUNT; index++) {
        const frame = bankBillFrame(time, index);
        if (!frame.settled) continue;
        const normal = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(...frame.rotation, 'XYZ'));
        expect(Math.abs(normal.y)).toBeCloseTo(1, 9);
        expect(normal.x).toBeCloseTo(0, 9);
        expect(normal.z).toBeCloseTo(0, 9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('stays finite, translucent and local during a long session', () => {
    for (const time of [0, 0.1, 35, 3600, 86400]) {
      for (let index = 0; index < BANK_BILL_COUNT; index++) {
        const frame = bankBillFrame(time, index);
        expect(frame.position.every(Number.isFinite)).toBe(true);
        expect(frame.rotation.every(Number.isFinite)).toBe(true);
        expect(frame.opacity).toBeGreaterThanOrEqual(0);
        expect(frame.opacity).toBeLessThanOrEqual(1);
        expect(frame.scale).toBeGreaterThanOrEqual(0.15);
        expect(Math.hypot(frame.position[0] - 1.8, frame.position[2] + 0.4)).toBeLessThan(22);
      }
    }
  });
});
