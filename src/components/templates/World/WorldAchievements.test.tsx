import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWorldAchievementProgress, WORLD_ACHIEVEMENTS } from '@/libs/world/world-achievements';
import { WorldAchievements } from './WorldAchievements';

function props() {
  return {
    earned: [],
    progress: getWorldAchievementProgress(),
    celebration: null,
    showCelebration: true,
    reducedMotion: false,
    onDismissCelebration: vi.fn(),
    onOpenChange: vi.fn(),
    onReturnFocus: vi.fn(),
  };
}

afterEach(() => vi.useRealTimers());

describe('WorldAchievements', () => {
  it('celebrates zombie achievements and keeps their collection available', () => {
    render(<WorldAchievements {...props()} celebration="walking-apocalypse" zombie />);
    expect(screen.getByRole('status', { name: 'Achievement unlocked' })).toHaveTextContent('Walking Apocalypse');
    fireEvent.click(screen.getByRole('button', { name: 'View achievements' }));
    expect(screen.getByRole('dialog', { name: 'Your achievements' })).toBeInTheDocument();
  });
  it('reveals earned badges while keeping every other badge anonymous, including its icon and progress', () => {
    const callbacks = props();
    render(
      <WorldAchievements
        {...callbacks}
        earned={['arena-champion']}
        progress={getWorldAchievementProgress({
          zone: 'arena',
          position: [55, 48],
          nearby: null,
          collected: 3,
          keys: { available: 1, total: 11, unlocked: 2 },
          theaterIndex: 0,
          theaterPaused: false,
          infection: { bitten: false, humans: 80, zombies: 21 },
        })}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'View achievements' });
    expect(trigger).toHaveTextContent(`1/${WORLD_ACHIEVEMENTS.length}`);
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Your achievements' });
    expect(within(dialog).getByRole('article', { name: 'Arena Champion' })).toHaveTextContent(
      'Win a mounted battle against both gladiators.',
    );
    expect(within(dialog).getByText('Earned')).toBeInTheDocument();
    for (const { id, title, description } of WORLD_ACHIEVEMENTS) {
      if (id === 'arena-champion') continue;
      expect(dialog.outerHTML).not.toContain(title);
      expect(dialog.outerHTML).not.toContain(description);
    }
    const locked = within(dialog).getAllByRole('article', { name: 'Locked achievement' });
    expect(locked).toHaveLength(WORLD_ACHIEVEMENTS.length - 1);
    for (const card of locked) {
      expect(within(card).getByRole('heading', { name: 'Mystery badge' })).toBeInTheDocument();
      expect(within(card).getByText('Locked')).toBeInTheDocument();
      expect(card.querySelectorAll('svg')).toHaveLength(1);
      expect(card.querySelector('svg')).toHaveClass('lucide-lock-keyhole');
    }
    expect(within(dialog).queryByText('21 zombies remaining')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(callbacks.onOpenChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close achievements' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callbacks.onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('reveals Glorious End and its celebration after an arena defeat unlocks it', () => {
    render(<WorldAchievements {...props()} earned={['glorious-end']} celebration="glorious-end" />);
    expect(screen.getByRole('status', { name: 'Achievement unlocked' })).toHaveTextContent('Glorious End');
    fireEvent.click(screen.getByRole('button', { name: 'View achievements' }));
    expect(screen.getByRole('article', { name: 'Glorious End' })).toHaveTextContent(
      'Fall in a mounted arena battle against the gladiators.',
    );
  });

  it('starts a badge animation only when gameplay can display it and dismisses it after six visible seconds', async () => {
    vi.useFakeTimers();
    const callbacks = props();
    const { rerender } = render(
      <WorldAchievements {...callbacks} celebration="arena-champion" showCelebration={false} />,
    );
    await act(async () => vi.advanceTimersByTime(10000));
    expect(screen.queryByRole('status', { name: 'Achievement unlocked' })).not.toBeInTheDocument();
    expect(callbacks.onDismissCelebration).not.toHaveBeenCalled();
    rerender(<WorldAchievements {...callbacks} celebration="arena-champion" reducedMotion />);
    expect(screen.getByRole('status', { name: 'Achievement unlocked' })).toHaveTextContent('Arena Champion');
    expect(screen.getByRole('status', { name: 'Achievement unlocked' })).toHaveAttribute('data-reduced-motion', 'true');
    await act(async () => vi.advanceTimersByTime(5999));
    expect(callbacks.onDismissCelebration).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(callbacks.onDismissCelebration).toHaveBeenCalledOnce();
  });

  it('pauses celebration dismissal while the collection is open', async () => {
    vi.useFakeTimers();
    const callbacks = props();
    render(<WorldAchievements {...callbacks} celebration="keymaster" />);
    fireEvent.click(screen.getByRole('button', { name: 'View achievements' }));
    expect(screen.queryByRole('status', { name: 'Achievement unlocked' })).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(10000));
    expect(callbacks.onDismissCelebration).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close achievements' }));
    expect(screen.getByRole('status', { name: 'Achievement unlocked' })).toHaveTextContent('Keymaster');
    await act(async () => vi.advanceTimersByTime(6000));
    expect(callbacks.onDismissCelebration).toHaveBeenCalledOnce();
  });
});
