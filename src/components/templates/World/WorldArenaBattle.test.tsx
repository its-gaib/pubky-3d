import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldArenaBattle } from './WorldArenaBattle';

describe('WorldArenaBattle', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
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

  it('starts fullscreen confetti on victory without restarting it as the remaining time changes', () => {
    const { rerender } = render(
      <WorldArenaBattle battle={{ phase: 'fighting', remaining: 8 }} reducedMotion={false} />,
    );
    expect(screen.queryByTestId('arena-victory-confetti')).not.toBeInTheDocument();

    rerender(<WorldArenaBattle battle={{ phase: 'victory', remaining: 10 }} reducedMotion={false} />);
    const confetti = screen.getByTestId('arena-victory-confetti');
    const flag = screen.getByRole('img', { name: 'Glory flag for the arena champion' });
    const firstPiece = confetti.firstElementChild;
    expect(confetti).toHaveAttribute('aria-hidden', 'true');
    // The viewport layer must stay outside the transformed, narrow announcement banner.
    expect(screen.getByRole('region', { name: 'Arena battle' })).not.toContainElement(confetti);
    expect(firstPiece).not.toBeNull();

    rerender(<WorldArenaBattle battle={{ phase: 'victory', remaining: 1 }} reducedMotion={false} />);
    expect(screen.getByTestId('arena-victory-confetti')).toBe(confetti);
    expect(confetti.firstElementChild).toBe(firstPiece);
    expect(screen.getByRole('img', { name: 'Glory flag for the arena champion' })).toBe(flag);

    rerender(<WorldArenaBattle battle={{ phase: 'defeat', remaining: 15 }} reducedMotion={false} />);
    expect(screen.queryByTestId('arena-victory-confetti')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Glory flag for the arena champion' })).not.toBeInTheDocument();
  });

  it('removes confetti when victory ends and creates a fresh celebration for the next victory', () => {
    const { rerender, unmount } = render(
      <WorldArenaBattle battle={{ phase: 'victory', remaining: 10 }} reducedMotion={false} />,
    );
    const firstCelebration = screen.getByTestId('arena-victory-confetti');
    rerender(<WorldArenaBattle battle={{ phase: 'fighting', remaining: 8 }} reducedMotion={false} />);
    expect(firstCelebration).not.toBeInTheDocument();

    rerender(<WorldArenaBattle battle={{ phase: 'victory', remaining: 10 }} reducedMotion={false} />);
    expect(screen.getByTestId('arena-victory-confetti')).not.toBe(firstCelebration);
    unmount();
    expect(screen.queryByTestId('arena-victory-confetti')).not.toBeInTheDocument();
  });

  it('respects reduced motion while keeping the victory announcement visible', () => {
    const { rerender } = render(<WorldArenaBattle battle={{ phase: 'victory', remaining: 10 }} reducedMotion />);
    expect(screen.queryByTestId('arena-victory-confetti')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Victory!' })).toBeInTheDocument();

    rerender(<WorldArenaBattle battle={{ phase: 'victory', remaining: 3 }} reducedMotion={false} />);
    expect(screen.getByTestId('arena-victory-confetti')).toBeInTheDocument();
    rerender(<WorldArenaBattle battle={{ phase: 'victory', remaining: 2 }} reducedMotion />);
    expect(screen.queryByTestId('arena-victory-confetti')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Victory!' })).toBeInTheDocument();
  });
});
