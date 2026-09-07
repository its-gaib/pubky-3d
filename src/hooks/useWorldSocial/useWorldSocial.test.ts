import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpMethod } from '@/libs/http/http.types';
import { useWorldSocial } from './useWorldSocial';

const key = (value: number) => value.toString(36).padStart(52, 'a');
const VIEWER = key(0);
const ALICE = key(1);
const BOB = key(2);
const CAROL = key(3);

const mocks = vi.hoisted(() => ({
  actor: null as string | null,
  hydrated: true,
  restoring: false,
  loggingOut: false,
  authenticated: true,
  network: 'staging',
  nexus: 'https://nexus.staging.pubky.app',
  edges: new Map<string, string[]>(),
  refreshIds: vi.fn(),
  hydrate: vi.fn(),
  details: vi.fn(),
  prepare: vi.fn(),
  postStream: vi.fn(),
  postDetails: vi.fn(),
  commitFollow: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/stores/auth/auth.store', () => {
  const state = () => ({
    currentUserPubky: mocks.actor,
    hasHydrated: mocks.hydrated,
    isRestoringSession: mocks.restoring,
    isLoggingOut: mocks.loggingOut,
    selectIsAuthenticated: () => mocks.authenticated,
  });
  return {
    useAuthStore: Object.assign(
      (selector?: (value: ReturnType<typeof state>) => unknown) => (selector ? selector(state()) : state()),
      { getState: state },
    ),
  };
});

vi.mock('@/libs/runtime-config/runtime-config', () => ({
  getDeployEnv: () => mocks.network,
  getNexusUrl: () => mocks.nexus,
  getCdnUrl: () => 'https://nexus.staging.pubky.app/static',
  getHomeserver: () => 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy',
  getHomeserverUrl: () => 'https://homeserver.staging.pubky.app',
}));

vi.mock('@/controllers/stream/users/users', () => ({
  StreamUserController: { refreshStreamIds: mocks.refreshIds, getOrFetchUsers: mocks.hydrate },
}));
vi.mock('@/controllers/user/user', () => ({
  UserController: { getManyDetails: mocks.details, commitFollow: mocks.commitFollow },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: (id: string, version?: number) => `https://nexus.staging.pubky.app/static/avatar/${id}?v=${version}`,
  },
}));
vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: { prepareStreamForInitialLoad: mocks.prepare, getOrFetchStreamSlice: mocks.postStream },
}));
vi.mock('@/controllers/post/post', () => ({ PostController: { getDetailsByIds: mocks.postDetails } }));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: mocks.toast }));
vi.mock('@/libs/logger/logger', () => ({ Logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type FollowingResponse = { nextPageIds: string[]; skip: number | undefined; isExhausted: boolean };

describe('useWorldSocial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor = VIEWER;
    mocks.hydrated = true;
    mocks.restoring = false;
    mocks.loggingOut = false;
    mocks.authenticated = true;
    mocks.network = 'staging';
    mocks.nexus = 'https://nexus.staging.pubky.app';
    mocks.edges = new Map([
      [VIEWER, [ALICE]],
      [ALICE, [BOB]],
    ]);
    mocks.refreshIds.mockImplementation(
      async ({ streamId, skip, limit }: { streamId: string; skip: number; limit: number }) => {
        const ids = (mocks.edges.get(streamId.split(':')[0]) ?? []).slice(skip, skip + limit);
        return { nextPageIds: ids, skip: skip + ids.length, isExhausted: ids.length < limit };
      },
    );
    mocks.hydrate.mockResolvedValue(undefined);
    mocks.details.mockImplementation(
      async ({ userIds }: { userIds: string[] }) =>
        new Map(
          userIds.map((id) => [
            id,
            {
              id,
              name: id === ALICE ? 'Alice' : 'A public person',
              bio: 'Public profile',
              image: 'https://untrusted.example/never-load-this',
              indexed_at: 17,
            },
          ]),
        ),
    );
    mocks.prepare.mockResolvedValue(undefined);
    mocks.postStream.mockResolvedValue({ nextPageIds: [], nextCursor: 0, reachedEnd: true });
    mocks.postDetails.mockResolvedValue([]);
    mocks.commitFollow.mockResolvedValue(undefined);
  });

  it('loads every direct ID and exactly two hops while hydrating only the visible directory window', async () => {
    const direct = Array.from({ length: 43 }, (_, index) => key(index + 1));
    mocks.edges = new Map([
      [VIEWER, direct],
      ...direct.map((id, index): [string, string[]] => [id, [key(index + 100)]]),
    ]);
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: null, directoryIds: direct }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.directCount).toBe(43);
    expect(result.current.discoveryCount).toBe(43);
    expect(result.current.people).toHaveLength(86);
    expect(result.current.relationships).toHaveLength(86);
    expect(result.current.complete).toBe(true);
    expect(mocks.hydrate).toHaveBeenCalledExactlyOnceWith({ userIds: direct.slice(0, 20) });
    expect(
      mocks.refreshIds.mock.calls.every(([params]) => params.limit === 20 && params.streamId.endsWith(':following')),
    ).toBe(true);
    const streams = mocks.refreshIds.mock.calls.map(([params]) => params.streamId);
    expect(streams).not.toContain(`${key(100)}:following`);
    expect(result.current.people.filter((person) => person.profileLoaded)).toHaveLength(20);
    expect(JSON.stringify(result.current.people)).not.toContain('untrusted.example');
    expect(result.current.people[0].avatarUrl).toContain(`/avatar/${ALICE}?v=17`);
  });

  it('pauses at a work budget, then continues without dropping any of a larger graph', async () => {
    const direct = Array.from({ length: 110 }, (_, index) => key(index + 1));
    mocks.edges = new Map([[VIEWER, direct]]);
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: null }));
    await waitFor(() => expect(result.current.status).toBe('paused'));
    expect(result.current.directCount).toBe(110);
    expect(result.current.people).toHaveLength(110);
    expect(result.current.complete).toBe(false);
    expect(mocks.refreshIds).toHaveBeenCalledTimes(100);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.complete).toBe(true);
    expect(result.current.people).toHaveLength(110);
    expect(mocks.refreshIds).toHaveBeenCalledTimes(116);
    expect(mocks.hydrate).not.toHaveBeenCalled();
  });

  it('supports an empty circle without fabricating people', async () => {
    mocks.edges.clear();
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: null }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.complete).toBe(true);
    expect(result.current.people).toEqual([]);
    expect(result.current.relationships).toEqual([]);
  });

  it('keeps placeholder membership when profile metadata is unavailable', async () => {
    mocks.details.mockResolvedValue(new Map());
    const { result } = renderHook(() =>
      useWorldSocial({ enabled: true, selectedId: null, directoryIds: [ALICE, BOB] }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.people.map((person) => person.id)).toEqual([ALICE, BOB]);
    expect(result.current.people.every((person) => person.profileLoaded === false)).toBe(true);
    expect(result.current.directCount).toBe(1);
  });

  it('reads a selected guest profile and its real latest post without reading a personal graph or enabling writes', async () => {
    mocks.actor = null;
    mocks.authenticated = false;
    mocks.postStream.mockResolvedValue({ nextPageIds: [`${ALICE}:recent1`], nextCursor: 1, reachedEnd: true });
    mocks.postDetails.mockResolvedValue([
      { id: `${ALICE}:recent1`, kind: 'short', content: 'The latest public post.' },
    ]);
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: ALICE }));
    await waitFor(() => expect(result.current.profile.status).toBe('ready'));
    expect(result.current.status).toBe('signed-out');
    expect(result.current.viewerId).toBeNull();
    expect(result.current.profile.person?.name).toBe('Alice');
    expect(result.current.profile.latestPost).toMatchObject({
      id: `${ALICE}:recent1`,
      author: 'Alice',
      text: 'The latest public post.',
    });
    expect(mocks.postStream.mock.calls[0][0]).toMatchObject({ streamId: `timeline:author:${ALICE}:all`, limit: 1 });
    expect(result.current.follow.canFollow).toBe(false);
    expect(mocks.refreshIds).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.follow.toggle();
    });
    expect(mocks.commitFollow).not.toHaveBeenCalled();
  });

  it.each(['hydrating', 'restoring', 'logging-out', 'no-session'])(
    'does not traverse or write with an ineligible %s actor',
    async (condition) => {
      if (condition === 'hydrating') mocks.hydrated = false;
      if (condition === 'restoring') mocks.restoring = true;
      if (condition === 'logging-out') mocks.loggingOut = true;
      if (condition === 'no-session') mocks.authenticated = false;
      const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: ALICE }));
      await act(async () => {
        await result.current.follow.toggle();
      });
      expect(result.current.viewerId).toBeNull();
      expect(mocks.refreshIds).not.toHaveBeenCalled();
      expect(mocks.commitFollow).not.toHaveBeenCalled();
    },
  );

  it('fails closed for production or a mismatched staging endpoint', async () => {
    mocks.nexus = 'https://nexus.pubky.app';
    const { result, rerender } = renderHook(() => useWorldSocial({ enabled: true, selectedId: ALICE }));
    expect(result.current.status).toBe('inactive');
    expect(result.current.viewerId).toBeNull();
    mocks.network = 'production';
    mocks.nexus = 'https://nexus.staging.pubky.app';
    rerender();
    await act(async () => {
      await result.current.follow.toggle();
    });
    expect(mocks.refreshIds).not.toHaveBeenCalled();
    expect(mocks.hydrate).not.toHaveBeenCalled();
    expect(mocks.commitFollow).not.toHaveBeenCalled();
  });

  it('hides a previous actor immediately and discards their late graph page', async () => {
    const oldPage = deferred<FollowingResponse>();
    mocks.refreshIds.mockImplementationOnce(() => oldPage.promise);
    const { result, rerender } = renderHook(() => useWorldSocial({ enabled: true, selectedId: null }));
    await waitFor(() => expect(mocks.refreshIds).toHaveBeenCalledTimes(1));
    mocks.actor = CAROL;
    rerender();
    expect(result.current.people).toEqual([]);
    await act(async () => {
      oldPage.resolve({ nextPageIds: [ALICE], skip: 1, isExhausted: true });
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.viewerId).toBe(CAROL);
    expect(result.current.people).toEqual([]);
    expect(mocks.refreshIds.mock.calls.some(([params]) => params.streamId === `${ALICE}:following`)).toBe(false);
  });

  it('discards pending data when disabled and never resumes old work after being enabled again', async () => {
    const oldPage = deferred<FollowingResponse>();
    mocks.refreshIds.mockImplementationOnce(() => oldPage.promise);
    const { result, rerender } = renderHook(({ enabled }) => useWorldSocial({ enabled, selectedId: null }), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(mocks.refreshIds).toHaveBeenCalledTimes(1));
    rerender({ enabled: false });
    expect(result.current.status).toBe('inactive');
    expect(result.current.people).toEqual([]);
    expect(result.current.viewerId).toBe(VIEWER);
    await act(async () => {
      oldPage.resolve({ nextPageIds: [CAROL], skip: 1, isExhausted: true });
    });
    expect(result.current.people).toEqual([]);
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.people.map((person) => person.id)).toEqual([ALICE, BOB]);
  });

  it('does not enable a follow mutation until the complete own-following stream is known', async () => {
    const rootPage = deferred<FollowingResponse>();
    mocks.refreshIds.mockImplementationOnce(() => rootPage.promise);
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: ALICE }));
    await waitFor(() => expect(mocks.refreshIds).toHaveBeenCalledTimes(1));
    expect(result.current.follow.canFollow).toBe(false);
    await act(async () => {
      await result.current.follow.toggle();
    });
    expect(mocks.commitFollow).not.toHaveBeenCalled();
    await act(async () => {
      rootPage.resolve({ nextPageIds: [ALICE], skip: 1, isExhausted: true });
    });
    await waitFor(() => expect(result.current.follow.canFollow).toBe(true));
    expect(result.current.follow.isFollowing).toBe(true);
  });

  it('shrinks an unfollowed selected marker immediately and blocks same-tick duplicate publication', async () => {
    const write = deferred<void>();
    mocks.commitFollow.mockImplementationOnce(() => write.promise);
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: ALICE }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let mutation!: Promise<void>;
    act(() => {
      mutation = result.current.follow.toggle();
      void result.current.follow.toggle();
    });
    expect(result.current.follow.isFollowing).toBe(false);
    expect(result.current.people.find((person) => person.id === ALICE)).toMatchObject({ degree: 2, parentIds: [] });
    expect(result.current.people.some((person) => person.id === BOB)).toBe(false);
    expect(result.current.follow.pending).toBe(true);
    expect(mocks.commitFollow).toHaveBeenCalledExactlyOnceWith(HttpMethod.DELETE, {
      follower: VIEWER,
      followee: ALICE,
    });
    await act(async () => {
      write.resolve();
      await mutation;
    });
    expect(result.current.follow.pending).toBe(false);
    expect(result.current.follow.error).toBeNull();
  });

  it('keeps a failed local preview explicit and retries the same intent only when requested', async () => {
    mocks.commitFollow.mockRejectedValueOnce(new TypeError('Test transport unavailable'));
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: ALICE }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.follow.toggle();
    });
    expect(result.current.follow.isFollowing).toBe(false);
    expect(result.current.follow.error).toContain('not confirmed on staging');
    expect(mocks.commitFollow).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.follow.toggle();
    });
    expect(mocks.commitFollow).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.follow.retry();
    });
    expect(mocks.commitFollow.mock.calls).toEqual([
      [HttpMethod.DELETE, { follower: VIEWER, followee: ALICE }],
      [HttpMethod.DELETE, { follower: VIEWER, followee: ALICE }],
    ]);
    expect(result.current.follow.error).toBeNull();
    expect(result.current.follow.isFollowing).toBe(false);
  });

  it('promotes a second-degree person immediately and discovers their own follows after following', async () => {
    mocks.edges.set(BOB, [CAROL]);
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: BOB }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.people.find((person) => person.id === BOB)?.degree).toBe(2);
    await act(async () => {
      await result.current.follow.toggle();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.people.find((person) => person.id === BOB)?.degree).toBe(1);
    expect(result.current.people.find((person) => person.id === CAROL)?.parentIds).toEqual([BOB]);
    expect(mocks.commitFollow).toHaveBeenCalledExactlyOnceWith(HttpMethod.PUT, { follower: VIEWER, followee: BOB });
  });

  it('rejects old rendered follow callbacks after an account switch or a selection change', async () => {
    const { result, rerender } = renderHook(({ selectedId }) => useWorldSocial({ enabled: true, selectedId }), {
      initialProps: { selectedId: ALICE },
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const oldToggle = result.current.follow.toggle;
    mocks.actor = CAROL;
    rerender({ selectedId: ALICE });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await oldToggle();
    });
    expect(mocks.commitFollow).not.toHaveBeenCalled();
    const previousSelection = result.current.follow.toggle;
    rerender({ selectedId: BOB });
    await act(async () => {
      await previousSelection();
    });
    expect(mocks.commitFollow).not.toHaveBeenCalled();
  });

  it('checks the actor and network at click time without requiring a React rerender', async () => {
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: ALICE }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    mocks.actor = null;
    await act(async () => {
      await result.current.follow.toggle();
    });
    mocks.actor = VIEWER;
    mocks.network = 'production';
    await act(async () => {
      await result.current.follow.toggle();
    });
    expect(mocks.commitFollow).not.toHaveBeenCalled();
  });

  it('does not attach a stale write failure to the next account and releases its pending guard', async () => {
    const write = deferred<void>();
    mocks.commitFollow.mockImplementationOnce(() => write.promise);
    const { result, rerender } = renderHook(() => useWorldSocial({ enabled: true, selectedId: ALICE }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let mutation!: Promise<void>;
    act(() => {
      mutation = result.current.follow.toggle();
    });
    mocks.actor = CAROL;
    rerender();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.follow.canFollow).toBe(false);
    await act(async () => {
      write.resolve();
      await mutation;
    });
    expect(result.current.follow.error).toBeNull();
    expect(result.current.follow.isFollowing).toBe(false);
    expect(result.current.follow.canFollow).toBe(true);
  });

  it('rejects a mismatched author or detail ID instead of attributing it to the selected person', async () => {
    mocks.postStream.mockResolvedValue({ nextPageIds: [`${BOB}:wrong`], nextCursor: 1, reachedEnd: true });
    const { result, rerender } = renderHook(({ selectedId }) => useWorldSocial({ enabled: true, selectedId }), {
      initialProps: { selectedId: ALICE },
    });
    await waitFor(() => expect(result.current.profile.status).toBe('empty'));
    expect(mocks.postDetails).not.toHaveBeenCalled();
    mocks.postStream.mockResolvedValue({ nextPageIds: [`${BOB}:valid`], nextCursor: 1, reachedEnd: true });
    mocks.postDetails.mockResolvedValue([{ id: `${ALICE}:wrong-detail`, kind: 'short', content: 'Wrong author.' }]);
    rerender({ selectedId: BOB });
    await waitFor(() => expect(result.current.profile.status).toBe('empty'));
    expect(result.current.profile.latestPost).toBeNull();
  });

  it('discards an old selected person’s delayed post when another profile is open', async () => {
    const oldPost = deferred<{ nextPageIds: string[]; nextCursor: number; reachedEnd: boolean }>();
    mocks.postStream.mockImplementationOnce(() => oldPost.promise);
    const { result, rerender } = renderHook(({ selectedId }) => useWorldSocial({ enabled: true, selectedId }), {
      initialProps: { selectedId: ALICE },
    });
    await waitFor(() => expect(mocks.postStream).toHaveBeenCalledTimes(1));
    rerender({ selectedId: BOB });
    await waitFor(() => expect(result.current.profile.status).toBe('empty'));
    await act(async () => {
      oldPost.resolve({ nextPageIds: [`${ALICE}:old`], nextCursor: 1, reachedEnd: true });
    });
    expect(result.current.profile.person?.id).toBe(BOB);
    expect(result.current.profile.latestPost).toBeNull();
    expect(mocks.postDetails).not.toHaveBeenCalled();
  });

  it('publishes the hydrated profile picture before a slower latest-post read finishes', async () => {
    const latest = deferred<{ nextPageIds: string[]; nextCursor: number; reachedEnd: boolean }>();
    mocks.postStream.mockImplementationOnce(() => latest.promise);
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: ALICE }));
    await waitFor(() => expect(mocks.postStream).toHaveBeenCalledTimes(1));
    expect(result.current.profile.status).toBe('loading');
    expect(result.current.profile.person).toMatchObject({
      id: ALICE,
      name: 'Alice',
      profileLoaded: true,
      avatarUrl: `https://nexus.staging.pubky.app/static/avatar/${ALICE}?v=17`,
    });
    expect(result.current.profile.latestPost).toBeNull();
    await act(async () => {
      latest.resolve({ nextPageIds: [], nextCursor: 0, reachedEnd: true });
    });
    expect(result.current.profile.status).toBe('empty');
  });

  it('keeps loaded graph IDs on read failure and resumes that page only after retry', async () => {
    mocks.refreshIds
      .mockImplementationOnce(async () => ({ nextPageIds: [ALICE], skip: 1, isExhausted: true }))
      .mockRejectedValueOnce(new TypeError('Test read unavailable'));
    const { result } = renderHook(() => useWorldSocial({ enabled: true, selectedId: null }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.people.map((person) => person.id)).toEqual([ALICE]);
    expect(result.current.complete).toBe(false);
    expect(mocks.refreshIds).toHaveBeenCalledTimes(2);
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.people.map((person) => person.id)).toEqual([ALICE, BOB]);
    expect(result.current.error).toBeNull();
  });
});
