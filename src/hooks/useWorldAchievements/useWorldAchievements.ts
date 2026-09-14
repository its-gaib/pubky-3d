'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getWorldAchievementInteractionKey,
  getWorldAchievementProgress,
  parseAchievementIds,
  WORLD_ACHIEVEMENTS,
  WORLD_INTERACTION_ACHIEVEMENT_IDS,
  type WorldAchievementId,
  type WorldAchievementProgress,
  type WorldInteractionAchievementId,
} from '@/libs/world/world-achievements';
import type { WorldStatus } from '@/libs/world/world-types';

export const WORLD_ACHIEVEMENTS_STORAGE_KEY = 'pubky-world-achievements-v1';

interface AchievementSession {
  loaded: boolean;
  earned: Set<WorldAchievementId>;
  pending: WorldAchievementId[];
  progress: WorldAchievementProgress[];
  status?: WorldStatus;
  interactions: Map<WorldInteractionAchievementId, Set<string>>;
}

function earnedIds(session: AchievementSession) {
  return WORLD_ACHIEVEMENTS.filter(({ id }) => session.earned.has(id)).map(({ id }) => id);
}

function hydrate(session: AchievementSession) {
  if (session.loaded) return false;
  session.loaded = true;
  if (typeof window !== 'undefined') {
    try {
      for (const id of parseAchievementIds(window.localStorage.getItem(WORLD_ACHIEVEMENTS_STORAGE_KEY))) {
        session.earned.add(id);
      }
    } catch {
      // This mounted world still remembers earned badges when browser storage is unavailable.
    }
  }
  return true;
}

function save(session: AchievementSession) {
  try {
    window.localStorage.setItem(WORLD_ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(earnedIds(session)));
  } catch {
    // Storage restrictions never interrupt the game or replay an award in this world.
  }
}

function withEarned(progress: WorldAchievementProgress[], earned: ReadonlySet<WorldAchievementId>) {
  return progress.map((entry) => ({ ...entry, unlocked: entry.unlocked || earned.has(entry.id) }));
}

function snapshot(session: AchievementSession) {
  return {
    earned: earnedIds(session),
    progress: session.progress,
    celebration: session.pending[0] ?? null,
  };
}

/** The outer world owns this hook so scene respawns preserve awards and queued celebrations. */
export function useWorldAchievements() {
  const session = useRef<AchievementSession>({
    loaded: false,
    earned: new Set(),
    pending: [],
    progress: getWorldAchievementProgress(),
    interactions: new Map(),
  });
  const [state, setState] = useState<{
    earned: WorldAchievementId[];
    progress: WorldAchievementProgress[];
    celebration: WorldAchievementId | null;
  }>({ earned: [], progress: getWorldAchievementProgress(), celebration: null });

  useEffect(() => {
    const current = session.current;
    if (!hydrate(current)) return;
    current.progress = withEarned(current.progress, current.earned);
    setState(snapshot(current));
  }, []);

  function updateProgress() {
    const current = session.current;
    const loaded = hydrate(current);
    const observations = getWorldAchievementProgress(current.status).map((entry) => {
      const interactionId = WORLD_INTERACTION_ACHIEVEMENT_IDS.find((id) => id === entry.id);
      if (!interactionId) return entry;
      const count = current.interactions.get(interactionId)?.size ?? 0;
      return { ...entry, current: count, unlocked: count >= entry.total };
    });
    let awarded = false;
    for (const entry of observations) {
      if (!entry.unlocked || current.earned.has(entry.id)) continue;
      current.earned.add(entry.id);
      current.pending.push(entry.id);
      awarded = true;
    }
    const progress = withEarned(observations, current.earned);
    const changed = progress.some(
      (entry, index) =>
        entry.current !== current.progress[index].current ||
        entry.total !== current.progress[index].total ||
        entry.unlocked !== current.progress[index].unlocked,
    );
    if (!loaded && !awarded && !changed) return;
    current.progress = progress;
    if (awarded) save(current);
    setState(snapshot(current));
  }

  function observe(status: WorldStatus) {
    session.current.status = status;
    updateProgress();
  }

  function recordInteraction(id: WorldInteractionAchievementId, identity?: string) {
    const key = getWorldAchievementInteractionKey(id, identity);
    if (!key) return;
    const current = session.current;
    const entries = current.interactions.get(id) ?? new Set<string>();
    const target = WORLD_ACHIEVEMENTS.find((entry) => entry.id === id)?.target ?? 0;
    if (entries.has(key) || entries.size >= target) return;
    entries.add(key);
    current.interactions.set(id, entries);
    updateProgress();
  }

  function dismissCelebration() {
    const current = session.current;
    if (!current.pending.length) return;
    current.pending.shift();
    setState(snapshot(current));
  }

  function resetProgress(status?: WorldStatus) {
    const current = session.current;
    hydrate(current);
    current.status = status;
    current.interactions.clear();
    current.progress = withEarned(getWorldAchievementProgress(status), current.earned);
    setState(snapshot(current));
  }

  return { ...state, observe, recordInteraction, dismissCelebration, resetProgress };
}
