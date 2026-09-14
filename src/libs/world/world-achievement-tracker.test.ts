import { describe, expect, it } from 'vitest';
import { createWorldAchievementTracker, type WorldAchievementFrame } from '@/libs/world/world-achievement-tracker';
import { WORLD_ZONES } from '@/libs/world/world-catalog';
import { WORLD_PORTALS } from '@/libs/world/world-layout';
import { JETPACK_CEILING, WORLD_RIDEABLES } from '@/libs/world/world-transport-motion';
import type { WorldRideableId, WorldRideStatus, WorldZoneId } from '@/libs/world/world-types';
import { asInvalid } from '@/test-utils/type-assertions';

const frame = (overrides: Partial<WorldAchievementFrame> = {}): WorldAchievementFrame => ({
  seconds: 0.05,
  ride: null,
  airborne: false,
  zombie: false,
  humans: 100,
  zombies: 1,
  alive: true,
  initialPopulation: 101,
  ...overrides,
});

const ride = (id: WorldRideableId, overrides: Partial<WorldRideStatus> = {}): WorldRideStatus => ({
  id,
  name: id,
  speed: 0,
  altitude: 0,
  grounded: true,
  stunt: null,
  ...overrides,
});

describe('world achievement telemetry', () => {
  it('counts distinct valid zones, portal entrances, dance locations and viewed profiles', () => {
    const tracker = createWorldAchievementTracker();
    for (const { id } of WORLD_ZONES) {
      tracker.visitZone(id);
      tracker.visitZone(id);
      tracker.dance(id);
      tracker.dance(id);
    }
    tracker.visitZone(asInvalid<WorldZoneId>('unknown'));
    tracker.dance(asInvalid<WorldZoneId>('unknown'));
    for (let index = 0; index < WORLD_PORTALS.length; index++) {
      tracker.portal(index);
      tracker.portal(index);
    }
    for (const invalid of [-1, 0.5, Number.NaN, WORLD_PORTALS.length]) tracker.portal(invalid);
    tracker.viewProfile('');
    tracker.viewProfile(' ');
    tracker.viewProfile('x'.repeat(513));
    for (let index = 0; index < 20; index++) {
      tracker.viewProfile(`profile-${index}`);
      tracker.viewProfile(`profile-${index}`);
    }
    expect(tracker.getProgress()).toMatchObject({
      'island-explorer': WORLD_ZONES.length,
      'dance-break': 3,
      'portal-pilgrim': WORLD_PORTALS.length,
      'social-butterfly': 5,
    });
  });

  it('tracks successful dragon mounts and all six accepted transport stunts, excluding the horse', () => {
    const tracker = createWorldAchievementTracker();
    tracker.mountRide('horse');
    expect(tracker.getProgress()['dragon-whisperer']).toBeUndefined();
    tracker.mountRide('dragon');
    for (const { id } of WORLD_RIDEABLES) {
      tracker.stunt(id);
      tracker.stunt(id);
    }
    tracker.stunt(asInvalid<WorldRideableId>('unknown'));
    expect(tracker.getProgress()).toMatchObject({
      'dragon-whisperer': 1,
      'stunt-collector': WORLD_RIDEABLES.length - 1,
      'through-the-fire': 2,
    });
    for (let index = 0; index < 20; index++) tracker.stunt('dragon');
    expect(tracker.getProgress()['through-the-fire']).toBe(10);
  });

  it('adds actual knockdowns, personal infections, completed trampoline jumps and successful photos', () => {
    const tracker = createWorldAchievementTracker();
    for (const count of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      tracker.knockDownZombies(count);
      tracker.infectPerson(count);
    }
    expect(tracker.getProgress()['zombie-jouster']).toBe(0);
    expect(tracker.getProgress()['walking-apocalypse']).toBe(0);
    tracker.knockDownZombies(3);
    tracker.knockDownZombies(4);
    tracker.infectPerson(2);
    for (let index = 0; index < 4; index++) tracker.trampolineJump();
    tracker.photo();
    tracker.photo();
    expect(tracker.getProgress()).toMatchObject({
      'zombie-jouster': 7,
      'walking-apocalypse': 2,
      'bounce-knight': 4,
      'island-photographer': 1,
    });
    tracker.knockDownZombies(100);
    tracker.infectPerson(100);
    tracker.trampolineJump();
    tracker.trampolineJump();
    expect(tracker.getProgress()).toMatchObject({
      'zombie-jouster': 10,
      'walking-apocalypse': 5,
      'bounce-knight': 5,
    });
  });

  it('requires the actual jetpack ceiling and never awards it for dragon flight or lower altitudes', () => {
    const tracker = createWorldAchievementTracker();
    tracker.tick(frame({ ride: ride('dragon', { altitude: JETPACK_CEILING }), airborne: true }));
    expect(tracker.getProgress()['skys-the-limit']).toBeUndefined();
    tracker.tick(frame({ ride: ride('jetpack', { altitude: JETPACK_CEILING - 0.1 }) }));
    expect(tracker.getProgress()['skys-the-limit']).toBe(JETPACK_CEILING - 0.1);
    tracker.tick(frame({ ride: ride('jetpack', { altitude: Number.POSITIVE_INFINITY }) }));
    expect(tracker.getProgress()['skys-the-limit']).toBe(JETPACK_CEILING - 0.1);
    tracker.tick(frame({ ride: ride('jetpack', { altitude: JETPACK_CEILING }) }));
    tracker.tick(frame({ ride: ride('jetpack', { altitude: 2 }) }));
    expect(tracker.getProgress()['skys-the-limit']).toBe(JETPACK_CEILING);
  });

  it('totals all actual airborne time while excluding grounded, dead and disabled frames', () => {
    const tracker = createWorldAchievementTracker();
    for (let index = 0; index < 400; index++) {
      tracker.tick(frame({ airborne: true }));
      tracker.tick(frame({ airborne: true, ride: ride('bmx', { altitude: 1 }) }));
      tracker.tick(frame({ airborne: true, ride: ride('jetpack', { altitude: 10 }) }));
      tracker.tick(frame({ airborne: true, enabled: false }));
      tracker.tick(frame({ airborne: true, alive: false }));
      tracker.tick(frame());
    }
    expect(tracker.getProgress()['frequent-flyer']).toBe(60);
    tracker.tick(frame({ airborne: true }));
    expect(tracker.getProgress()['frequent-flyer']).toBe(60);
    const fresh = createWorldAchievementTracker();
    fresh.tick(frame({ airborne: true, seconds: 1000 }));
    fresh.tick(frame({ airborne: true, seconds: Number.NaN }));
    fresh.tick(frame({ airborne: true, seconds: -10 }));
    expect(fresh.getProgress()['frequent-flyer']).toBe(0.05);
  });

  it('requires five consecutive seconds near configured kart top speed and does not add interrupted streaks', () => {
    const tracker = createWorldAchievementTracker();
    const top = WORLD_RIDEABLES.find(({ id }) => id === 'kart')!.speed;
    const speeding = frame({ ride: ride('kart', { speed: top * 0.95 }) });
    for (let index = 0; index < 80; index++) tracker.tick(speeding);
    tracker.tick(frame({ ride: ride('kart', { speed: top * 0.95 - 0.01 }) }));
    for (let index = 0; index < 80; index++) tracker.tick(speeding);
    expect(tracker.getProgress()['pedal-to-the-metal']).toBeCloseTo(4);
    for (let index = 0; index < 20; index++) tracker.tick(speeding);
    expect(tracker.getProgress()['pedal-to-the-metal']).toBe(5);
    tracker.tick(frame());
    expect(tracker.getProgress()['pedal-to-the-metal']).toBe(5);
    const otherRide = createWorldAchievementTracker();
    for (let index = 0; index < 101; index++) otherRide.tick(frame({ ride: ride('hoverboard', { speed: top * 2 }) }));
    expect(otherRide.getProgress()['pedal-to-the-metal']).toBeUndefined();
  });

  it('requires a living human when at least half the initial population is infected', () => {
    const tracker = createWorldAchievementTracker();
    tracker.tick(frame({ zombies: 50 }));
    tracker.tick(frame({ zombies: 51, zombie: true }));
    tracker.tick(frame({ zombies: 51, alive: false }));
    tracker.tick(frame({ zombies: 51, enabled: false }));
    tracker.tick(frame({ zombies: 51, initialPopulation: 0 }));
    expect(tracker.getProgress()['against-the-horde']).toBeUndefined();
    tracker.tick(frame({ zombies: 51 }));
    expect(tracker.getProgress()['against-the-horde']).toBe(1);
  });

  it('returns isolated progress snapshots and starts fresh for each respawn', () => {
    const tracker = createWorldAchievementTracker();
    tracker.photo();
    const snapshot = tracker.getProgress();
    snapshot['island-photographer'] = 0;
    expect(tracker.getProgress()['island-photographer']).toBe(1);
    expect(createWorldAchievementTracker().getProgress()).toEqual({});
  });
});
