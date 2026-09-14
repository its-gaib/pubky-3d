import { describe, expect, it } from 'vitest';
import {
  getWorldAchievementInteractionKey,
  getWorldAchievementProgress,
  parseAchievementIds,
  WORLD_ACHIEVEMENTS,
} from '@/libs/world/world-achievements';
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
};

describe('world achievements', () => {
  it('offers the approved badges including Glorious End and never awards one before its world state is known', () => {
    expect(WORLD_ACHIEVEMENTS.map(({ id }) => id)).toEqual([
      'keymaster',
      'world-rider',
      'plaguebreaker',
      'arena-champion',
      'glorious-end',
      'first-freedom',
      'island-explorer',
      'dragon-whisperer',
      'through-the-fire',
      'skys-the-limit',
      'frequent-flyer',
      'stunt-collector',
      'pedal-to-the-metal',
      'bounce-knight',
      'portal-pilgrim',
      'dance-break',
      'zombie-jouster',
      'walking-apocalypse',
      'island-photographer',
      'social-butterfly',
      'against-the-horde',
      'picture-this',
      'follow-the-signal',
      'sovereign-scholar',
      'synonym-circuit',
      'open-source-adventurer',
    ]);
    for (const status of [undefined, initial, { ...initial, keys: { available: 0, total: 0, unlocked: 0 } }]) {
      expect(getWorldAchievementProgress(status).some(({ unlocked }) => unlocked)).toBe(false);
    }
  });

  it('uses each event target without rounding partial flight time or altitude up into an award', () => {
    for (const { id, target } of WORLD_ACHIEVEMENTS.slice(6)) {
      const progress = (value: number) =>
        getWorldAchievementProgress({ ...initial, achievementProgress: { [id]: value } }).find(
          (entry) => entry.id === id,
        )!;
      expect(progress(target - 0.01).unlocked).toBe(false);
      expect(progress(target)).toEqual({ id, current: target, total: target, unlocked: true });
      expect(progress(target + 100).current).toBe(target);
      for (const invalid of [NaN, Infinity, -1]) expect(progress(invalid).unlocked).toBe(false);
    }
    expect(WORLD_ACHIEVEMENTS.find(({ id }) => id === 'skys-the-limit')?.target).toBe(48);
    expect(WORLD_ACHIEVEMENTS.find(({ id }) => id === 'stunt-collector')?.target).toBe(6);
    expect(WORLD_ACHIEVEMENTS.find(({ id }) => id === 'through-the-fire')?.target).toBe(10);
  });

  it('accepts only actual university/repository links and the three circuit brands as distinct actions', () => {
    expect(getWorldAchievementInteractionKey('sovereign-scholar', UNIVERSITY_ARTICLES[0].url)).toBe(
      UNIVERSITY_ARTICLES[0].url,
    );
    expect(
      getWorldAchievementInteractionKey('sovereign-scholar', `${UNIVERSITY_ARTICLES[0].url}?utm_source=world#read`),
    ).toBe(UNIVERSITY_ARTICLES[0].url);
    expect(getWorldAchievementInteractionKey('open-source-adventurer', `${GITHUB_PROJECTS[0].url}/#readme`)).toBe(
      GITHUB_PROJECTS[0].url,
    );
    expect(getWorldAchievementInteractionKey('open-source-adventurer', 'https://example.com/repo')).toBeNull();
    expect(getWorldAchievementInteractionKey('sovereign-scholar', 'javascript:alert(1)')).toBeNull();
    expect(getWorldAchievementInteractionKey('sovereign-scholar', 'x'.repeat(2049))).toBeNull();
    for (const brand of ['pubky', 'synonym', 'bitkit'])
      expect(getWorldAchievementInteractionKey('synonym-circuit', brand)).toBe(brand);
    expect(getWorldAchievementInteractionKey('synonym-circuit', 'unrelated-brand')).toBeNull();
  });

  it('counts every collected key separately from transport unlocks when equipment has different key costs', () => {
    const status = { ...initial, collected: 11, keys: { available: 3, total: 11, unlocked: 6 } };
    expect(getWorldAchievementProgress(status)).toContainEqual({
      id: 'keymaster',
      current: 11,
      total: 11,
      unlocked: true,
    });
    expect(getWorldAchievementProgress(status)).toContainEqual({
      id: 'world-rider',
      current: 6,
      total: WORLD_RIDEABLES.length,
      unlocked: false,
    });
    expect(getWorldAchievementProgress(status)).toContainEqual({
      id: 'first-freedom',
      current: 1,
      total: 1,
      unlocked: true,
    });
    expect(
      getWorldAchievementProgress({
        ...status,
        keys: { available: 0, total: 11, unlocked: WORLD_RIDEABLES.length },
      }),
    ).toContainEqual({
      id: 'world-rider',
      current: WORLD_RIDEABLES.length,
      total: WORLD_RIDEABLES.length,
      unlocked: true,
    });
    expect(getWorldAchievementProgress({ ...status, collected: 10 })[0].unlocked).toBe(false);
    expect(
      getWorldAchievementProgress({ ...status, keys: { available: 9, total: 11, unlocked: 0 } }).find(
        ({ id }) => id === 'first-freedom',
      )?.unlocked,
    ).toBe(false);
  });

  it('awards Plaguebreaker only when a reported outbreak has no living zombies left', () => {
    expect(
      getWorldAchievementProgress({ ...initial, infection: { bitten: false, humans: 20, zombies: 1 } })[2],
    ).toEqual({
      id: 'plaguebreaker',
      current: 1,
      total: 0,
      unlocked: false,
    });
    expect(
      getWorldAchievementProgress({ ...initial, infection: { bitten: false, humans: 20, zombies: 0 } })[2],
    ).toEqual({
      id: 'plaguebreaker',
      current: 0,
      total: 0,
      unlocked: true,
    });
    for (const zombies of [NaN, Infinity, -1]) {
      expect(
        getWorldAchievementProgress({ ...initial, infection: { bitten: false, humans: 0, zombies } })[2].unlocked,
      ).toBe(false);
    }
  });

  it('requires arena victory, regardless of fight or defeat countdown progress', () => {
    for (const phase of ['fighting', 'defeat'] as const) {
      expect(getWorldAchievementProgress({ ...initial, arenaBattle: { phase, remaining: 0 } })[3].unlocked).toBe(false);
    }
    expect(getWorldAchievementProgress({ ...initial, arenaBattle: { phase: 'victory', remaining: 4 } })[3]).toEqual({
      id: 'arena-champion',
      current: 1,
      total: 1,
      unlocked: true,
    });
    expect(
      getWorldAchievementProgress({
        ...initial,
        arenaBattle: null,
        achievementProgress: { 'arena-champion': 1 },
      })[3].unlocked,
    ).toBe(true);
  });

  it('awards Glorious End only for defeat, including when the outcome survives the final countdown frame', () => {
    const gloriousEnd = (status: WorldStatus) =>
      getWorldAchievementProgress(status).find(({ id }) => id === 'glorious-end');
    for (const phase of ['fighting', 'victory'] as const) {
      expect(gloriousEnd({ ...initial, arenaBattle: { phase, remaining: 0 } })?.unlocked).toBe(false);
    }
    expect(gloriousEnd({ ...initial, arenaBattle: { phase: 'defeat', remaining: 15 } })).toEqual({
      id: 'glorious-end',
      current: 1,
      total: 1,
      unlocked: true,
    });
    expect(gloriousEnd({ ...initial, arenaBattle: null, achievementProgress: { 'glorious-end': 1 } })?.unlocked).toBe(
      true,
    );
  });

  it('accepts only bounded known persisted IDs and deduplicates them in catalog order', () => {
    expect(parseAchievementIds('["arena-champion","keymaster","keymaster","__proto__","invented",17]')).toEqual([
      'keymaster',
      'arena-champion',
    ]);
    expect(parseAchievementIds(['world-rider', 'plaguebreaker', 'world-rider'])).toEqual([
      'world-rider',
      'plaguebreaker',
    ]);
    const everyId = WORLD_ACHIEVEMENTS.map(({ id }) => id);
    expect(parseAchievementIds(JSON.stringify(everyId))).toEqual(everyId);
    for (const value of [
      null,
      undefined,
      0,
      {},
      'keymaster',
      'broken{',
      '{"keymaster":true}',
      '"keymaster"',
      ' '.repeat(2049),
      Array(33).fill('keymaster'),
    ]) {
      expect(parseAchievementIds(value)).toEqual([]);
    }
  });
});
