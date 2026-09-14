import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorldArenaBattle } from './WorldArenaBattle';

describe('WorldArenaBattle', () => {
  it.each([
    ['fighting', 'Steel meets destiny', 'One knight. One brave steed. Two gladiators.'],
    ['victory', 'Victory!', 'Two gladiators fallen. A legend rides on.'],
    ['defeat', 'A glorious death', 'Knight and steed fought as one. Their courage echoes in eternity.'],
  ] as const)(
    'announces the %s result while leaving the scene unobstructed by a dialog',
    (phase, title, description) => {
      render(<WorldArenaBattle battle={{ phase, remaining: 15 }} reducedMotion={false} />);
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(description);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    },
  );

  it('updates the defeat countdown without repeating the death announcement every second', () => {
    const { rerender } = render(<WorldArenaBattle battle={{ phase: 'defeat', remaining: 15 }} reducedMotion />);
    const announcement = screen.getByRole('status');
    const countdown = screen.getByRole('timer', { name: 'Respawn countdown' });
    expect(countdown).toHaveTextContent('A new legend rises in15seconds');
    expect(countdown).toHaveAttribute('aria-live', 'off');
    rerender(<WorldArenaBattle battle={{ phase: 'defeat', remaining: 1 }} reducedMotion />);
    expect(countdown).toHaveTextContent('A new legend rises in1second');
    expect(screen.getByRole('status')).toBe(announcement);
    expect(screen.getByRole('region', { name: 'Arena battle' })).toHaveAttribute('data-reduced-motion', 'true');
  });
});
