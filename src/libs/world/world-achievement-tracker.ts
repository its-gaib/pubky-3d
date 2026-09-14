import type { WorldAchievementId } from '@/libs/world/world-achievements';
import { WORLD_ZONES } from '@/libs/world/world-catalog';
import { WORLD_PORTALS } from '@/libs/world/world-layout';
import { JETPACK_CEILING, WORLD_RIDEABLES } from '@/libs/world/world-transport-motion';
import type { WorldRideableId, WorldRideStatus, WorldZoneId } from '@/libs/world/world-types';

export interface WorldAchievementFrame {
  /** Active simulation time; match the world's bounded physics timestep. */
  seconds: number;
  ride: WorldRideStatus | null;
  airborne: boolean;
  zombie: boolean;
  humans: number;
  zombies: number;
  alive: boolean;
  initialPopulation: number;
  enabled?: boolean;
}

const positiveCount = (value: number) => (Number.isSafeInteger(value) && value > 0 ? value : 0);
const addProgress = (current: number, value: number, target: number) => {
  const next = current + value;
  return next >= target - 1e-8 ? target : Math.min(target, next);
};

/** Scene-local event telemetry. Persistent earned badges are owned by the UI's achievement hook. */
export function createWorldAchievementTracker() {
  const validZones = new Set(WORLD_ZONES.map(({ id }) => id));
  const validRides = new Set(WORLD_RIDEABLES.map(({ id }) => id));
  const zones = new Set<WorldZoneId>();
  const dances = new Set<WorldZoneId>();
  const stunts = new Set<WorldRideableId>();
  const portals = new Set<number>();
  const profiles = new Set<string>();
  const kartSpeed = WORLD_RIDEABLES.find(({ id }) => id === 'kart')!.speed;
  const progress: Partial<Record<WorldAchievementId, number>> = {};
  let kartStreak = 0;

  const increase = (id: WorldAchievementId, count: number, target: number) => {
    progress[id] = addProgress(progress[id] ?? 0, positiveCount(count), target);
  };

  return {
    visitZone(id: WorldZoneId) {
      if (!validZones.has(id)) return;
      zones.add(id);
      progress['island-explorer'] = zones.size;
    },
    mountRide(id: WorldRideableId) {
      if (id === 'dragon') progress['dragon-whisperer'] = 1;
    },
    /** Call only after the accepted stunt completes, never on an unsuccessful or cancelled input. */
    stunt(id: WorldRideableId) {
      if (id === 'horse' || !validRides.has(id)) return;
      stunts.add(id);
      progress['stunt-collector'] = stunts.size;
      if (id === 'dragon') increase('through-the-fire', 1, 10);
    },
    /** A completed trampoline launch/landing pair, not every frame above the trampoline. */
    trampolineJump() {
      increase('bounce-knight', 1, 5);
    },
    portal(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= WORLD_PORTALS.length) return;
      portals.add(index);
      progress['portal-pilgrim'] = portals.size;
    },
    dance(zone: WorldZoneId) {
      if (!validZones.has(zone)) return;
      dances.add(zone);
      progress['dance-break'] = Math.min(3, dances.size);
    },
    knockDownZombies(count: number) {
      increase('zombie-jouster', count, 10);
    },
    infectPerson(count: number) {
      increase('walking-apocalypse', count, 5);
    },
    photo() {
      progress['island-photographer'] = 1;
    },
    viewProfile(id: string) {
      if (typeof id !== 'string' || !id.trim() || id.length > 512 || profiles.size >= 5) return;
      profiles.add(id);
      progress['social-butterfly'] = profiles.size;
    },
    tick(frame: WorldAchievementFrame) {
      if (!frame.alive) {
        kartStreak = 0;
        return;
      }
      if (frame.enabled === false) return;
      const seconds = Number.isFinite(frame.seconds) ? Math.max(0, Math.min(0.05, frame.seconds)) : 0;
      if (frame.airborne) progress['frequent-flyer'] = addProgress(progress['frequent-flyer'] ?? 0, seconds, 60);
      const ride = frame.ride;
      if (ride?.id === 'jetpack' && Number.isFinite(ride.altitude))
        progress['skys-the-limit'] = Math.max(
          progress['skys-the-limit'] ?? 0,
          Math.min(JETPACK_CEILING, Math.max(0, ride.altitude)),
        );
      if (ride?.id === 'kart' && Number.isFinite(ride.speed) && ride.speed >= kartSpeed * 0.95) {
        kartStreak = addProgress(kartStreak, seconds, 5);
        progress['pedal-to-the-metal'] = Math.max(progress['pedal-to-the-metal'] ?? 0, kartStreak);
      } else kartStreak = 0;
      if (
        !frame.zombie &&
        Number.isSafeInteger(frame.humans) &&
        frame.humans >= 0 &&
        Number.isSafeInteger(frame.zombies) &&
        frame.zombies >= 0 &&
        Number.isSafeInteger(frame.initialPopulation) &&
        frame.initialPopulation > 0 &&
        frame.zombies >= frame.initialPopulation * 0.5
      )
        progress['against-the-horde'] = 1;
    },
    getProgress: () => ({ ...progress }),
  };
}
