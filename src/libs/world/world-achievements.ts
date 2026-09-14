import { GITHUB_PROJECTS, UNIVERSITY_ARTICLES, WORLD_ZONES } from '@/libs/world/world-catalog';
import { JETPACK_CEILING, WORLD_RIDEABLES } from '@/libs/world/world-transport-motion';
import type { WorldStatus } from '@/libs/world/world-types';

export const WORLD_ACHIEVEMENTS = [
  { id: 'keymaster', title: 'Keymaster', description: 'Collect every key on the island.', target: 0 },
  { id: 'world-rider', title: 'World Rider', description: 'Unlock and ride every transport.', target: 0 },
  { id: 'plaguebreaker', title: 'Plaguebreaker', description: 'Defeat every living zombie on the island.', target: 0 },
  {
    id: 'arena-champion',
    title: 'Arena Champion',
    description: 'Win a mounted battle against both gladiators.',
    target: 1,
  },
  {
    id: 'glorious-end',
    title: 'Glorious End',
    description: 'Fall in a mounted arena battle against the gladiators.',
    target: 1,
  },
  { id: 'first-freedom', title: 'First Freedom', description: 'Spend a key and ride your first transport.', target: 1 },
  {
    id: 'island-explorer',
    title: 'Island Explorer',
    description: 'Visit every zone on the island.',
    target: WORLD_ZONES.length,
  },
  { id: 'dragon-whisperer', title: 'Dragon Whisperer', description: 'Ride the dragon for the first time.', target: 1 },
  {
    id: 'through-the-fire',
    title: 'Through the Fire',
    description: 'Complete 10 barrel rolls on the dragon.',
    target: 10,
  },
  {
    id: 'skys-the-limit',
    title: 'Sky’s the Limit',
    description: 'Reach the jetpack’s maximum altitude.',
    target: JETPACK_CEILING,
  },
  {
    id: 'frequent-flyer',
    title: 'Frequent Flyer',
    description: 'Spend 60 seconds airborne.',
    target: 60,
  },
  {
    id: 'stunt-collector',
    title: 'Stunt Collector',
    description: 'Complete a stunt on every ride that can perform one.',
    target: WORLD_RIDEABLES.filter(({ id }) => id !== 'horse').length,
  },
  {
    id: 'pedal-to-the-metal',
    title: 'Pedal to the Metal',
    description: 'Hold the kart near top speed for 5 seconds.',
    target: 5,
  },
  { id: 'bounce-knight', title: 'Bounce Knight', description: 'Complete 5 trampoline jumps.', target: 5 },
  { id: 'portal-pilgrim', title: 'Portal Pilgrim', description: 'Enter all 3 portals.', target: 3 },
  { id: 'dance-break', title: 'Dance Break', description: 'Dance in 3 different zones.', target: 3 },
  { id: 'zombie-jouster', title: 'Zombie Jouster', description: 'Knock down 10 zombies on horseback.', target: 10 },
  {
    id: 'walking-apocalypse',
    title: 'Walking Apocalypse',
    description: 'Infect 5 people with your own bites.',
    target: 5,
  },
  {
    id: 'island-photographer',
    title: 'Island Photographer',
    description: 'Successfully capture your first world photo.',
    target: 1,
  },
  {
    id: 'social-butterfly',
    title: 'Social Butterfly',
    description: 'Open the profiles of 5 different people.',
    target: 5,
  },
  {
    id: 'against-the-horde',
    title: 'Against the Horde',
    description: 'Remain human while living zombies reach half the island’s starting population.',
    target: 1,
  },
  {
    id: 'picture-this',
    title: 'Picture This',
    description: 'Successfully publish a world photo as a post.',
    target: 1,
  },
  {
    id: 'follow-the-signal',
    title: 'Follow the Signal',
    description: 'Follow someone from the Social Plaza.',
    target: 1,
  },
  {
    id: 'sovereign-scholar',
    title: 'Sovereign Scholar',
    description: 'Open 3 different Pubky University articles.',
    target: 3,
  },
  {
    id: 'synonym-circuit',
    title: 'Synonym Circuit',
    description: 'Explore information about Pubky, Synonym and Bitkit.',
    target: 3,
  },
  {
    id: 'open-source-adventurer',
    title: 'Open Source Adventurer',
    description: 'Open 2 different repository links in the Open Source Yard.',
    target: 2,
  },
] as const;

export type WorldAchievementId = (typeof WORLD_ACHIEVEMENTS)[number]['id'];

export const WORLD_INTERACTION_ACHIEVEMENT_IDS = [
  'picture-this',
  'follow-the-signal',
  'sovereign-scholar',
  'synonym-circuit',
  'open-source-adventurer',
] as const;
export type WorldInteractionAchievementId = (typeof WORLD_INTERACTION_ACHIEVEMENT_IDS)[number];

/** Event identities never leave memory; fixed catalogs also prevent repeat links counting twice. */
export function getWorldAchievementInteractionKey(id: WorldInteractionAchievementId, identity?: string) {
  if (id === 'picture-this' || id === 'follow-the-signal') return 'complete';
  if (typeof identity !== 'string' || identity.length > 2048) return null;
  if (id === 'synonym-circuit') return ['pubky', 'synonym', 'bitkit'].includes(identity) ? identity : null;
  const catalog =
    id === 'sovereign-scholar' ? UNIVERSITY_ARTICLES : id === 'open-source-adventurer' ? GITHUB_PROJECTS : [];
  const canonical = (url: string) => url.trim().split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase();
  const key = canonical(identity);
  return catalog.find(({ url }) => canonical(url) === key)?.url ?? null;
}

export interface WorldAchievementProgress {
  id: WorldAchievementId;
  /** Completed count, except Plaguebreaker which shows the living zombies remaining. */
  current: number;
  /** Zero means no fixed target is available; the outbreak population can change. */
  total: number;
  unlocked: boolean;
}

function validCount(value: number | undefined) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Scene observations are separate from earned badges, which can survive a new exploration. */
export function getWorldAchievementProgress(status?: WorldStatus): WorldAchievementProgress[] {
  const total = validCount(status?.keys?.total) ? status!.keys!.total : 0;
  const collected = validCount(status?.collected) ? Math.min(total, status!.collected) : 0;
  const transports = WORLD_RIDEABLES.length;
  const used = validCount(status?.keys?.unlocked) ? Math.min(transports, status!.keys!.unlocked) : 0;
  const zombies = validCount(status?.infection?.zombies) ? status!.infection!.zombies : 0;
  const victory = status?.arenaBattle?.phase === 'victory' || status?.achievementProgress?.['arena-champion'] === 1;
  const defeat = status?.arenaBattle?.phase === 'defeat' || status?.achievementProgress?.['glorious-end'] === 1;
  const sceneProgress: WorldAchievementProgress[] = [
    { id: 'keymaster', current: collected, total, unlocked: total > 0 && status?.collected === total },
    { id: 'world-rider', current: used, total: transports, unlocked: status?.keys?.unlocked === transports },
    { id: 'plaguebreaker', current: zombies, total: 0, unlocked: status?.infection?.zombies === 0 },
    { id: 'arena-champion', current: victory ? 1 : 0, total: 1, unlocked: victory },
    { id: 'glorious-end', current: defeat ? 1 : 0, total: 1, unlocked: defeat },
    { id: 'first-freedom', current: used > 0 ? 1 : 0, total: 1, unlocked: used > 0 },
  ];
  return WORLD_ACHIEVEMENTS.map(({ id, target }) => {
    const scene = sceneProgress.find((entry) => entry.id === id);
    if (scene) return scene;
    const observed = status?.achievementProgress?.[id];
    const value = typeof observed === 'number' && Number.isFinite(observed) && observed >= 0 ? observed : 0;
    return { id, current: Math.min(target, Math.floor(value)), total: target, unlocked: value >= target };
  });
}

/** Browser storage is untrusted: accept only a small, deduplicated catalog of known IDs. */
export function parseAchievementIds(raw: unknown): WorldAchievementId[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 2048) return [];
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value) || value.length > 32) return [];
  const ids = value;
  return WORLD_ACHIEVEMENTS.filter(({ id }) => ids.includes(id)).map(({ id }) => id);
}
