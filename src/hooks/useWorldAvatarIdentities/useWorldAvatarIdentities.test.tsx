import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldData, WorldPerson, WorldSocialView } from '@/libs/world/world-types';
import { useWorldAvatarIdentities, useWorldVisibleProfileHydration } from './useWorldAvatarIdentities';

const mocks = vi.hoisted(() => ({
  account: null as { id: string; avatarUrl?: string; name: string } | null,
  restoring: false,
  signingOut: false,
  network: true,
  blur: true,
  revision: 0,
  listeners: new Set<() => void>(),
  moderation: vi.fn<(id: string) => Promise<{ is_moderated: boolean; is_blurred: boolean }>>(),
}));

vi.mock('@/hooks/useWorldAccount/useWorldAccount', () => ({
  useWorldAccount: () => ({
    identity: mocks.account,
    isRestoring: mocks.restoring,
    isSigningOut: mocks.signingOut,
  }),
}));
vi.mock('@/hooks/useWorldSocial/useWorldSocial.manager', () => ({ WORLD_SOCIAL_PROFILE_LIMIT: 20 }));
vi.mock('@/libs/world/world-network', () => ({ isWorldProductionConfigured: () => mocks.network }));
vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: (select: (state: { privacy: { blurCensored: boolean } }) => unknown) =>
    select({ privacy: { blurCensored: mocks.blur } }),
}));
vi.mock('@/controllers/moderation/moderation', () => ({
  ModerationController: { getModerationStatus: mocks.moderation },
}));
vi.mock('dexie-react-hooks', async () => {
  const { useEffect, useState, useSyncExternalStore } = await import('react');
  return {
    // Preserve the previous value until the replacement resolves, like Dexie's live query.
    useLiveQuery: (query: () => Promise<unknown>, deps: unknown[]) => {
      const [value, setValue] = useState<unknown>();
      const revision = useSyncExternalStore(
        (listener) => {
          mocks.listeners.add(listener);
          return () => mocks.listeners.delete(listener);
        },
        () => mocks.revision,
      );
      useEffect(() => {
        let active = true;
        void query().then((next) => {
          if (active) setValue(next);
        });
        return () => {
          active = false;
        };
        // The mock models the caller-controlled dependencies, plus a local DB notification.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [...deps, revision]);
      return value;
    },
  };
});

const ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';
const id = (value: number) =>
  `${'y'.repeat(49)}${ALPHABET[(value >> 10) & 31]}${ALPHABET[(value >> 5) & 31]}${ALPHABET[value & 31]}`;
const VIEWER = id(1023);
const url = (personId: string, version?: number) =>
  `https://nexus.pubky.app/static/avatar/${personId}${version === undefined ? '' : `?v=${version}`}`;
const clear = { is_moderated: false, is_blurred: false };
const ensureProfiles = vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(undefined);
const person = (index: number, overrides: Partial<WorldPerson> = {}): WorldPerson => ({
  id: id(index),
  name: `Person ${index}`,
  color: '#c8ff03',
  bio: '',
  position: [0, 0],
  profileLoaded: true,
  avatarUrl: url(id(index)),
  ...overrides,
});
const data = (people: WorldPerson[], source: WorldData['source'] = 'production'): WorldData => ({
  source,
  people,
  relationships: [],
  tags: [],
  trendingPosts: [],
});
const page = (index: number): WorldSocialView => ({ sector: 0, sectorKey: 'commons', page: index });
const overview: WorldSocialView = { sector: null, page: 0 };

function groupedPeople(followingPerSector = 14) {
  const perSector = followingPerSector + 3;
  const entries = Array.from({ length: perSector * 8 }, (_, index) => {
    const sector = Math.floor(index / perSector);
    return person(index, {
      degree: index % perSector < followingPerSector ? 1 : 2,
      parentIds: [id(sector * perSector)],
      profileTags: sector < 7 ? [{ label: `group ${sector}`, count: 1 }] : [],
      profileTagsStatus: 'loaded',
    });
  });
  const representatives = Array.from({ length: 8 }, (_, sector) => {
    const members = entries.slice(sector * perSector, (sector + 1) * perSector);
    return [
      members
        .slice(0, followingPerSector)
        .map((entry) => entry.id)
        .sort()[0],
      ...members
        .slice(followingPerSector)
        .map((entry) => entry.id)
        .sort(),
    ];
  }).flat();
  return { entries, representatives };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function databaseChanged() {
  await act(async () => {
    mocks.revision++;
    mocks.listeners.forEach((listener) => listener());
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.account = null;
  mocks.restoring = false;
  mocks.signingOut = false;
  mocks.network = true;
  mocks.blur = true;
  mocks.revision = 0;
  mocks.moderation.mockResolvedValue(clear);
  ensureProfiles.mockResolvedValue(undefined);
});

describe('world avatar identities', () => {
  it('keeps the guest player masked while allowing approved public profile images', async () => {
    const { result } = renderHook(() =>
      useWorldAvatarIdentities({
        data: data([person(0), person(1, { avatarUrl: undefined })]),
        socialView: page(0),
        socialViewerId: null,
        priorityProfileIds: [],
        ensureProfiles,
      }),
    );
    expect(result.current).toEqual({ viewer: null, people: [] });
    await waitFor(() => expect(result.current.people).toEqual([{ id: id(0), avatarUrl: url(id(0)) }]));
    expect(result.current.viewer).toBeNull();
    expect(ensureProfiles).not.toHaveBeenCalled();
    expect(mocks.moderation).not.toHaveBeenCalledWith(id(1), expect.anything());
  });

  it('fences stale account results during actor changes and logout', async () => {
    const first = deferred<typeof clear>();
    const second = deferred<typeof clear>();
    mocks.account = { id: VIEWER, name: 'Viewer', avatarUrl: url(VIEWER) };
    mocks.moderation.mockImplementation((actor) => (actor === VIEWER ? first.promise : second.promise));
    const { result, rerender } = renderHook(
      ({ actor }) =>
        useWorldAvatarIdentities({
          data: data([]),
          socialView: page(0),
          socialViewerId: actor,
          priorityProfileIds: [],
          ensureProfiles,
        }),
      { initialProps: { actor: VIEWER as string | null } },
    );
    expect(result.current.viewer).toBeNull();
    mocks.account = { id: id(1022), name: 'Next account', avatarUrl: url(id(1022)) };
    rerender({ actor: id(1022) });
    await act(async () => first.resolve(clear));
    expect(result.current.viewer).toBeNull();
    mocks.account = null;
    rerender({ actor: null });
    await act(async () => second.resolve(clear));
    expect(result.current.viewer).toBeNull();
  });

  it.each(['restoring', 'signingOut', 'network', 'mismatch', 'missing-image'] as const)(
    'removes an approved viewer immediately on %s',
    async (reason) => {
      mocks.account = { id: VIEWER, name: 'Viewer', avatarUrl: url(VIEWER) };
      const { result, rerender } = renderHook(
        ({ actor }) =>
          useWorldAvatarIdentities({
            data: data([]),
            socialView: page(0),
            socialViewerId: actor,
            priorityProfileIds: [],
            ensureProfiles,
          }),
        { initialProps: { actor: VIEWER } },
      );
      await waitFor(() => expect(result.current.viewer?.id).toBe(VIEWER));
      if (reason === 'network') mocks.network = false;
      if (reason === 'restoring') mocks.restoring = true;
      if (reason === 'signingOut') mocks.signingOut = true;
      if (reason === 'missing-image') mocks.account.avatarUrl = undefined;
      rerender({ actor: reason === 'mismatch' ? id(1022) : VIEWER });
      expect(result.current.viewer).toBeNull();
    },
  );

  it('reacts to profile unblur and reblur, while failed moderation remains masked', async () => {
    let blocked = true;
    mocks.moderation.mockImplementation(async (personId) => {
      if (personId === id(2)) throw new TypeError('Unavailable local moderation');
      return personId === id(0) ? { is_moderated: true, is_blurred: blocked } : clear;
    });
    const { result } = renderHook(() =>
      useWorldAvatarIdentities({
        data: data([person(0), person(1), person(2)]),
        socialView: page(0),
        socialViewerId: null,
        priorityProfileIds: [],
        ensureProfiles,
      }),
    );
    await waitFor(() => expect(result.current.people.map((entry) => entry.id)).toEqual([id(1)]));
    blocked = false;
    await databaseChanged();
    await waitFor(() => expect(result.current.people.map((entry) => entry.id).sort()).toEqual([id(0), id(1)].sort()));
    blocked = true;
    await databaseChanged();
    await waitFor(() => expect(result.current.people.map((entry) => entry.id)).toEqual([id(1)]));
  });

  it('rechecks global blur preferences and masks a new avatar version until approved', async () => {
    mocks.moderation.mockImplementation(async () => ({ is_moderated: true, is_blurred: mocks.blur }));
    const { result, rerender } = renderHook(
      ({ version }) =>
        useWorldAvatarIdentities({
          data: data([person(0, { avatarUrl: url(id(0), version) })]),
          socialView: page(0),
          socialViewerId: null,
          priorityProfileIds: [],
          ensureProfiles,
        }),
      { initialProps: { version: 1 } },
    );
    await waitFor(() => expect(mocks.moderation).toHaveBeenCalled());
    expect(result.current.people).toEqual([]);
    mocks.blur = false;
    rerender({ version: 1 });
    await waitFor(() => expect(result.current.people[0]?.avatarUrl).toBe(url(id(0), 1)));
    const pending = deferred<typeof clear>();
    mocks.moderation.mockReturnValue(pending.promise);
    rerender({ version: 2 });
    expect(result.current.people).toEqual([]);
    await act(async () => pending.resolve(clear));
    await waitFor(() => expect(result.current.people[0]?.avatarUrl).toBe(url(id(0), 2)));
    mocks.blur = true;
    rerender({ version: 2 });
    expect(result.current.people).toEqual([]);
  });

  it('rejects profile-supplied, mismatched, blob, and demo image URLs before querying moderation', async () => {
    const entries = [
      person(0, { avatarUrl: 'https://external.example/face.png' }),
      person(1, { avatarUrl: 'blob:local-profile' }),
      person(2, { avatarUrl: url(id(3)) }),
      person(3, { avatarUrl: `${url(id(3))}?token=secret` }),
    ];
    const { result, rerender } = renderHook(
      ({ source }) =>
        useWorldAvatarIdentities({
          data: data(source === 'demo' ? [person(0)] : entries, source),
          socialView: page(0),
          socialViewerId: null,
          priorityProfileIds: [],
          ensureProfiles,
        }),
      { initialProps: { source: 'production' as WorldData['source'] } },
    );
    await act(async () => undefined);
    expect(result.current).toEqual({ viewer: null, people: [] });
    expect(mocks.moderation).not.toHaveBeenCalled();
    rerender({ source: 'demo' });
    await act(async () => undefined);
    expect(result.current.people).toEqual([]);
    expect(mocks.moderation).not.toHaveBeenCalled();
  });

  it('keeps an unchanged approved neighbor while a new neighbor is still awaiting moderation', async () => {
    const { result, rerender } = renderHook(
      ({ people }) =>
        useWorldAvatarIdentities({
          data: data(people),
          socialView: page(0),
          socialViewerId: null,
          priorityProfileIds: [],
          ensureProfiles,
        }),
      { initialProps: { people: [person(0)] } },
    );
    await waitFor(() => expect(result.current.people).toHaveLength(1));
    const pending = deferred<typeof clear>();
    mocks.moderation.mockImplementation((personId) => (personId === id(1) ? pending.promise : Promise.resolve(clear)));
    rerender({ people: [person(0), person(1)] });
    expect(result.current.people).toEqual([{ id: id(0), avatarUrl: url(id(0)) }]);
    await act(async () => pending.resolve(clear));
    await waitFor(() => expect(result.current.people).toHaveLength(2));
  });

  it('hydrates actual overview representatives and keeps their selection stable when profiles arrive', async () => {
    mocks.account = { id: VIEWER, name: 'Viewer' };
    const { entries, representatives } = groupedPeople();
    const [blockedId, invalidUrlId, missingImageId] = representatives;
    mocks.moderation.mockImplementation(async (personId) =>
      personId === blockedId ? { is_moderated: true, is_blurred: true } : clear,
    );
    const placeholders: WorldPerson[] = entries.map((entry) => ({
      ...entry,
      profileLoaded: false,
      avatarUrl: undefined,
    }));
    const { result, rerender } = renderHook(
      ({ people }) =>
        useWorldAvatarIdentities({
          data: data(people),
          socialView: overview,
          socialViewerId: VIEWER,
          priorityProfileIds: [],
          ensureProfiles,
        }),
      { initialProps: { people: placeholders } },
    );
    await waitFor(() => expect(ensureProfiles).toHaveBeenCalledTimes(2));
    expect(ensureProfiles.mock.calls.map(([ids]) => ids.length)).toEqual([20, 12]);
    expect(ensureProfiles.mock.calls.flatMap(([ids]) => ids)).toEqual(representatives);
    expect(result.current.people).toEqual([]);

    const enriched = [...entries].reverse().map((entry) => ({
      ...entry,
      name: `Loaded ${entry.name}`,
      avatarUrl:
        entry.id === invalidUrlId
          ? 'https://external.example/profile.png'
          : entry.id === missingImageId
            ? undefined
            : entry.avatarUrl,
    }));
    rerender({ people: enriched });
    const approvedIds = representatives.filter(
      (personId) => ![blockedId, invalidUrlId, missingImageId].includes(personId),
    );
    await waitFor(() => expect(result.current.people.map((entry) => entry.id)).toEqual(approvedIds));
    expect(mocks.moderation).toHaveBeenCalledTimes(30);
    expect(mocks.moderation).not.toHaveBeenCalledWith(invalidUrlId, expect.anything());
    expect(mocks.moderation).not.toHaveBeenCalledWith(missingImageId, expect.anything());
    rerender({ people: enriched.map((entry) => ({ ...entry, name: 'Name changed again' })) });
    await act(async () => undefined);
    expect(ensureProfiles).toHaveBeenCalledTimes(2);
    expect(mocks.moderation).toHaveBeenCalledTimes(30);
    expect(result.current.people.map((entry) => entry.id)).toEqual(approvedIds);
  });

  it('bounds overview and page retention and clears representatives immediately when the account no longer matches', async () => {
    mocks.account = { id: VIEWER, name: 'Viewer' };
    const { entries, representatives } = groupedPeople(100);
    const { result, rerender } = renderHook(
      ({ view }) =>
        useWorldAvatarIdentities({
          data: data(entries),
          socialView: view,
          socialViewerId: VIEWER,
          priorityProfileIds: [],
          ensureProfiles,
        }),
      { initialProps: { view: overview } },
    );
    await waitFor(() => expect(result.current.people.map((entry) => entry.id)).toEqual(representatives));
    const commonsPage = entries
      .slice(7 * 103)
      .filter((entry) => entry.degree === 1)
      .map((entry) => entry.id)
      .sort()
      .slice(0, 96);
    const retained = new Set([...representatives, ...commonsPage]);
    rerender({ view: page(0) });
    await waitFor(() => expect(new Set(result.current.people.map((entry) => entry.id))).toEqual(retained));
    expect(result.current.people.length).toBeLessThanOrEqual(128);
    rerender({ view: overview });
    await waitFor(() => expect(new Set(result.current.people.map((entry) => entry.id))).toEqual(retained));

    const pending = deferred<typeof clear>();
    mocks.moderation.mockReturnValue(pending.promise);
    await databaseChanged();
    mocks.account = { id: id(1022), name: 'Next account' };
    rerender({ view: overview });
    expect(result.current.people).toEqual([]);
    await act(async () => pending.resolve(clear));
    expect(result.current.people).toEqual([]);
  });

  it('keeps only the current and outgoing pages, dropping old owners and removed profiles', async () => {
    mocks.account = { id: VIEWER, name: 'Viewer' };
    const entries = Array.from({ length: 500 }, (_, index) => person(index));
    const { result, rerender } = renderHook(
      ({ currentPage, people, actor }) =>
        useWorldAvatarIdentities({
          data: data(people),
          socialView: page(currentPage),
          socialViewerId: actor,
          priorityProfileIds: [],
          ensureProfiles,
        }),
      { initialProps: { currentPage: 0, people: entries, actor: VIEWER } },
    );
    await waitFor(() => expect(result.current.people).toHaveLength(96));
    expect(mocks.moderation).toHaveBeenCalledTimes(96);
    const firstPageIds = new Set(result.current.people.map((entry) => entry.id));
    rerender({ currentPage: 1, people: entries, actor: VIEWER });
    await waitFor(() => expect(result.current.people).toHaveLength(192));
    rerender({ currentPage: 2, people: entries, actor: VIEWER });
    await waitFor(() => expect(result.current.people).toHaveLength(192));
    expect(result.current.people.some((entry) => firstPageIds.has(entry.id))).toBe(false);
    mocks.account = { id: id(1022), name: 'Next account' };
    rerender({ currentPage: 2, people: entries, actor: id(1022) });
    expect(result.current.people).toEqual([]);
    await waitFor(() => expect(result.current.people).toHaveLength(96));
    const remaining = entries.slice(0, 5);
    rerender({ currentPage: 0, people: remaining, actor: id(1022) });
    await waitFor(() => expect(result.current.people).toHaveLength(5));
    expect(result.current.people.every((entry) => remaining.some((candidate) => candidate.id === entry.id))).toBe(true);
  });
});

describe('visible profile hydration', () => {
  it('advances through all 96 people in bounded batches and keeps directory requests first', async () => {
    const priority = [id(150), id(151)];
    const entries = Array.from({ length: 96 }, (_, index) => person(index, { profileLoaded: false }));
    const { rerender } = renderHook(
      ({ people }) =>
        useWorldVisibleProfileHydration({
          scope: VIEWER,
          enabled: true,
          people,
          priorityIds: priority,
          ensureProfiles,
        }),
      { initialProps: { people: entries } },
    );
    await waitFor(() => expect(ensureProfiles).toHaveBeenCalledTimes(6));
    expect(ensureProfiles.mock.calls[0][0]).toEqual(priority);
    expect(ensureProfiles.mock.calls.slice(1).flatMap(([ids]) => ids)).toEqual(entries.map((entry) => entry.id));
    expect(ensureProfiles.mock.calls.every(([ids]) => ids.length <= 20)).toBe(true);
    rerender({ people: entries.map((entry) => ({ ...entry, name: 'Metadata changed' })) });
    await act(async () => undefined);
    expect(ensureProfiles).toHaveBeenCalledTimes(6);
  });

  it('continues after a failed batch without retrying it on graph updates', async () => {
    const entries = Array.from({ length: 96 }, (_, index) => person(index, { profileLoaded: false }));
    ensureProfiles.mockRejectedValueOnce(new TypeError('Profile fetch unavailable'));
    const { rerender } = renderHook(
      ({ people }) =>
        useWorldVisibleProfileHydration({ scope: VIEWER, enabled: true, people, priorityIds: [], ensureProfiles }),
      { initialProps: { people: entries } },
    );
    await waitFor(() => expect(ensureProfiles).toHaveBeenCalledTimes(5));
    rerender({ people: entries.map((entry, index) => ({ ...entry, profileLoaded: index >= 20 })) });
    await act(async () => undefined);
    expect(ensureProfiles).toHaveBeenCalledTimes(5);
    expect(ensureProfiles.mock.calls.flatMap(([ids]) => ids)).toHaveLength(96);
    rerender({ people: [...entries.slice(1), person(100, { profileLoaded: false })] });
    await waitFor(() => expect(ensureProfiles).toHaveBeenCalledTimes(6));
    expect(ensureProfiles.mock.calls[5][0]).toEqual([id(100)]);
  });

  it('stops later batches when the actor changes or the work is disabled', async () => {
    const pending = deferred<void>();
    ensureProfiles.mockReturnValueOnce(pending.promise);
    const entries = Array.from({ length: 96 }, (_, index) => person(index, { profileLoaded: false }));
    const { rerender } = renderHook(
      ({ enabled, scope }) =>
        useWorldVisibleProfileHydration({ scope, enabled, people: entries, priorityIds: [], ensureProfiles }),
      { initialProps: { enabled: true, scope: VIEWER } },
    );
    await waitFor(() => expect(ensureProfiles).toHaveBeenCalledTimes(1));
    rerender({ enabled: false, scope: 'guest' });
    await act(async () => pending.resolve());
    expect(ensureProfiles).toHaveBeenCalledTimes(1);
    rerender({ enabled: true, scope: id(1022) });
    await waitFor(() => expect(ensureProfiles).toHaveBeenCalledTimes(6));
  });
});
