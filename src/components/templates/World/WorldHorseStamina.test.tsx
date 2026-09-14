import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WORLD_HORSE } from '@/libs/world/world-horse';
import { WorldHorseStamina } from './WorldHorseStamina';

describe('WorldHorseStamina', () => {
  it.each([
    { remaining: WORLD_HORSE.rideSeconds, width: '100%', value: WORLD_HORSE.rideSeconds },
    { remaining: WORLD_HORSE.rideSeconds / 4, width: '25%', value: WORLD_HORSE.rideSeconds / 4 },
    { remaining: 0, width: '0%', value: 0 },
  ])('shows $width green with $remaining ride seconds left', ({ remaining, width, value }) => {
    render(<WorldHorseStamina anchor={{ x: 0.5, y: 0.4 }} remaining={remaining} />);
    const meter = screen.getByRole('progressbar', { name: 'Horse stamina' });
    expect(meter).toHaveAttribute('aria-valuenow', String(value));
    expect(meter).toHaveAttribute('aria-valuemax', String(WORLD_HORSE.rideSeconds));
    expect(meter).toHaveAttribute(
      'aria-valuetext',
      `${value} of ${WORLD_HORSE.rideSeconds} seconds of ride time remaining`,
    );
    expect(meter.firstElementChild).toHaveStyle({ width });
  });

  it('tracks the knight and preserves precise stamina while opting out of motion when requested', () => {
    const { rerender } = render(<WorldHorseStamina anchor={{ x: 0.5, y: 0.4 }} remaining={42.4} />);
    const meter = screen.getByRole('progressbar', { name: 'Horse stamina' });
    expect(meter).toHaveAttribute('aria-valuenow', '42.4');
    expect(meter).toHaveAttribute('aria-valuetext', '43 of 60 seconds of ride time remaining');
    expect(meter.parentElement).toHaveStyle({ '--horse-x': '50%', '--horse-y': '40%' });
    rerender(<WorldHorseStamina anchor={{ x: 0.3, y: 0.7 }} remaining={12} reducedMotion />);
    expect(screen.getByRole('progressbar')).toBe(meter);
    expect(meter.parentElement).toHaveStyle({ '--horse-x': '30%', '--horse-y': '70%' });
    expect(meter.parentElement).toHaveAttribute('data-reduced-motion', 'true');
  });
});
