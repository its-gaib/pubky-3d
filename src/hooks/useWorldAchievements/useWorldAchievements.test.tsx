import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useWorldAchievements,
  WORLD_ACHIEVEMENTS_STORAGE_KEY,
} from '@/hooks/useWorldAchievements/useWorldAchievements';
import { WORLD_ACHIEVEMENTS } from '@/libs/world/world-achievements';
import { GITHUB_PROJECTS, UNIVERSITY_ARTICLES } from '@/libs/world/world-catalog';
import { WORLD_RIDEABLES } from '@/libs/world/world-transport-motion';
import type { WorldStatus } from '@/libs/world/world-types';

const initial: WorldStatus = {
  zone: 'plaza',
  position: [0, 0],
  nearby: null,
  collected: 0,
  theaterIndex: 0,
  theaterPaused: false,
  keys: { available: 0, total: 11, unlocked: 0 },
};
const allKeys: WorldStatus = {
  ...initial,
  collected: 11,
  keys: { available: 0, total: 11, unlocked: WORLD_RIDEABLES.length },
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useWorldAchievements', () => {
  it('restores earned badges without replaying their celebration or awarding empty initial progress', () => {
    localStorage.setItem(WORLD_ACHIEVEMENTS_STORAGE_KEY, '["keymaster","unknown"]');
    const { result } = renderHook(() => useWorldAchievements());
    expect(result.current.earned).toEqual(['keymaster']);
    expect(result.current.celebration).toBeNull();
    act(() => result.current.observe(initial));
    expect(result.current.earned).toEqual(['keymaster']);
    expect(result.current.progress[0]).toEqual({ id: 'keymaster', current: 0, total: 11, unlocked: true });
    expect(result.current.progress[2].unlocked).toBe(false);
  });

  it('queues each earned badge once, persists the allowlisted IDs, and retains them across respawn and remount', () => {
    const first = renderHook(() => useWorldAchievements());
    act(() => {
      first.result.current.observe(allKeys);
      first.result.current.observe(allKeys);
    });
    expect(first.result.current.earned).toEqual(['keymaster', 'world-rider', 'first-freedom']);
    expect(JSON.parse(localStorage.getItem(WORLD_ACHIEVEMENTS_STORAGE_KEY)!)).toEqual([
      'keymaster',
      'world-rider',
      'first-freedom',
    ]);
    expect(first.result.current.celebration).toBe('keymaster');
    act(() => first.result.current.dismissCelebration());
    expect(first.result.current.celebration).toBe('world-rider');
    act(() => first.result.current.resetProgress(initial));
    expect(first.result.current.progress[0]).toEqual({ id: 'keymaster', current: 0, total: 11, unlocked: true });
    expect(first.result.current.celebration).toBe('world-rider');
    act(() => {
      first.result.current.dismissCelebration();
      first.result.current.observe(allKeys);
    });
    expect(first.result.current.celebration).toBe('first-freedom');
    act(() => first.result.current.dismissCelebration());
    expect(first.result.current.celebration).toBeNull();
    first.unmount();
    const second = renderHook(() => useWorldAchievements());
    expect(second.result.current.earned).toEqual(['keymaster', 'world-rider', 'first-freedom']);
    expect(second.result.current.celebration).toBeNull();
    act(() => second.result.current.observe(allKeys));
    expect(second.result.current.celebration).toBeNull();
  });

  it.each([
    ['victory', 'arena-champion'],
    ['defeat', 'glorious-end'],
  ] as const)(
    'keeps the %s badge queued while battle overlays hide celebrations and through respawn',
    (phase, badge) => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useWorldAchievements());
      act(() => result.current.observe({ ...initial, arenaBattle: { phase: 'fighting', remaining: 8 } }));
      expect(result.current.celebration).toBeNull();
      act(() => result.current.observe({ ...initial, arenaBattle: { phase, remaining: 4 } }));
      act(() => vi.advanceTimersByTime(60_000));
      expect(result.current.celebration).toBe(badge);
      act(() => result.current.resetProgress());
      expect(result.current.progress.find(({ id }) => id === badge)?.unlocked).toBe(true);
      expect(result.current.celebration).toBe(badge);
      act(() => result.current.dismissCelebration());
      expect(result.current.celebration).toBeNull();
    },
  );

  it('saves Glorious End before an immediate respawn and restores it without replaying the animation', () => {
    const first = renderHook(() => useWorldAchievements());
    act(() => {
      first.result.current.observe({ ...initial, achievementProgress: { 'glorious-end': 1 } });
      first.result.current.resetProgress(initial);
    });
    expect(first.result.current.earned).toEqual(['glorious-end']);
    expect(first.result.current.celebration).toBe('glorious-end');
    expect(JSON.parse(localStorage.getItem(WORLD_ACHIEVEMENTS_STORAGE_KEY)!)).toEqual(['glorious-end']);
    first.unmount();
    const second = renderHook(() => useWorldAchievements());
    expect(second.result.current.earned).toEqual(['glorious-end']);
    expect(second.result.current.celebration).toBeNull();
  });

  it('continues playing and suppresses repeat awards when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage denied');
    });
    const { result } = renderHook(() => useWorldAchievements());
    const cleared = { ...initial, infection: { bitten: false, humans: 100, zombies: 0 } };
    act(() => result.current.observe(cleared));
    expect(result.current.celebration).toBe('plaguebreaker');
    act(() => {
      result.current.dismissCelebration();
      result.current.resetProgress();
      result.current.observe(cleared);
    });
    expect(result.current.earned).toEqual(['plaguebreaker']);
    expect(result.current.celebration).toBeNull();
  });

  it('preserves distinct UI actions across scene observations and clears unfinished action progress on respawn', () => {
    const { result } = renderHook(() => useWorldAchievements());
    const progress = (id: string) => result.current.progress.find((entry) => entry.id === id)!;
    act(() => {
      result.current.observe(initial);
      result.current.recordInteraction('sovereign-scholar', UNIVERSITY_ARTICLES[0].url);
      result.current.recordInteraction('sovereign-scholar', `${UNIVERSITY_ARTICLES[0].url}#read`);
      result.current.recordInteraction('sovereign-scholar', UNIVERSITY_ARTICLES[1].url);
      result.current.observe({ ...initial, achievementProgress: { 'zombie-jouster': 3 } });
    });
    expect(progress('sovereign-scholar').current).toBe(2);
    expect(progress('zombie-jouster').current).toBe(3);
    expect(progress('sovereign-scholar').unlocked).toBe(false);
    act(() => result.current.resetProgress(initial));
    expect(progress('sovereign-scholar').current).toBe(0);
    expect(progress('zombie-jouster').current).toBe(0);
    act(() => {
      for (const article of UNIVERSITY_ARTICLES.slice(0, 3))
        result.current.recordInteraction('sovereign-scholar', article.url);
      result.current.observe(initial);
    });
    expect(progress('sovereign-scholar').unlocked).toBe(true);
    expect(result.current.earned).toContain('sovereign-scholar');
    act(() => result.current.resetProgress(initial));
    expect(progress('sovereign-scholar')).toMatchObject({ current: 0, unlocked: true });
  });

  it('awards successful post/follow events and the complete brand/repository sets once, independently', () => {
    const { result } = renderHook(() => useWorldAchievements());
    act(() => {
      result.current.recordInteraction('picture-this');
      result.current.recordInteraction('picture-this');
      result.current.recordInteraction('follow-the-signal');
      result.current.recordInteraction('synonym-circuit', 'pubky');
      result.current.recordInteraction('synonym-circuit', 'pubky');
      result.current.recordInteraction('synonym-circuit', 'synonym');
      result.current.recordInteraction('open-source-adventurer', 'https://example.com/not-a-project');
      result.current.recordInteraction('open-source-adventurer', GITHUB_PROJECTS[0].url);
      result.current.recordInteraction('open-source-adventurer', `${GITHUB_PROJECTS[0].url}/`);
      result.current.observe(initial);
    });
    expect(result.current.earned).toEqual(['picture-this', 'follow-the-signal']);
    expect(result.current.progress.find(({ id }) => id === 'synonym-circuit')?.current).toBe(2);
    expect(result.current.progress.find(({ id }) => id === 'open-source-adventurer')?.current).toBe(1);
    act(() => {
      result.current.recordInteraction('synonym-circuit', 'bitkit');
      result.current.recordInteraction('open-source-adventurer', GITHUB_PROJECTS[1].url);
    });
    expect(result.current.earned).toEqual([
      'picture-this',
      'follow-the-signal',
      'synonym-circuit',
      'open-source-adventurer',
    ]);
    const messages: string[] = [];
    while (result.current.celebration) {
      messages.push(result.current.celebration);
      act(() => result.current.dismissCelebration());
    }
    expect(messages).toEqual(result.current.earned);
  });

  it('restores every earned badge from the bounded storage payload', () => {
    const ids = WORLD_ACHIEVEMENTS.map(({ id }) => id);
    localStorage.setItem(WORLD_ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(ids));
    const { result } = renderHook(() => useWorldAchievements());
    expect(result.current.earned).toEqual(ids);
    expect(result.current.progress.every(({ unlocked }) => unlocked)).toBe(true);
    expect(result.current.celebration).toBeNull();
  });
});
