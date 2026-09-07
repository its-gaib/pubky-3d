import { describe, expect, it } from 'vitest';
import { BANK_BILL_COUNT, bankBillFrame } from './world-bank';

describe('bank bill life cycles', () => {
  it('keeps the reusable pool staggered instead of fading every bill together', () => {
    const frames = Array.from({ length: BANK_BILL_COUNT }, (_, index) => bankBillFrame(0, index));
    expect(frames.some((frame) => frame.opacity === 1)).toBe(true);
    expect(frames.some((frame) => frame.opacity > 0 && frame.opacity < 0.3)).toBe(true);
    expect(frames.some((frame) => frame.scale < 0.3)).toBe(true);
    expect(new Set(frames.map((frame) => frame.position[1])).size).toBeGreaterThan(10);
  });

  it('fades and shrinks an individual bill before recycling its own launch position', () => {
    const fresh = bankBillFrame(1, 0);
    const evaporating = bankBillFrame(6.8, 0);
    expect(fresh.opacity).toBe(1);
    expect(evaporating.opacity).toBeLessThan(0.05);
    expect(evaporating.scale).toBeLessThan(0.2);
    const recycled = bankBillFrame(8, 0);
    expect(recycled.opacity).toBeCloseTo(fresh.opacity);
    recycled.position.forEach((value, index) => expect(value).toBeCloseTo(fresh.position[index]));
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
        expect(Math.hypot(frame.position[0] - 1.8, frame.position[2] + 0.4)).toBeLessThan(5.2);
      }
    }
  });
});
