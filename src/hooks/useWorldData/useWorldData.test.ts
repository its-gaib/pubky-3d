import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldData } from '@/libs/world/world-types';
import { type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import type { UserStreamId } from '@/models/stream/user/userStream.types';
import type { NexusHotTag, NexusUserDetails } from '@/services/nexus/nexus.types';
import { NexusPostStreamService } from '@/services/nexus/stream/posts/postStream';
import { createPostStreamParams } from '@/services/nexus/stream/posts/postStream.utils';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { useWorldData } from './useWorldData';

const mocks = vi.hoisted(() => ({
  getDeployEnv: vi.fn(),
  getNexusUrl: vi.fn(),
  getCdnUrl: vi.fn(),
  getHotTags: vi.fn(),
  getPostStream: vi.fn(),
  preparePostStream: vi.fn(),
  getPostDetails: vi.fn(),
  getPostTags: vi.fn(),
  getUserStream: vi.fn(),
  getUserDetails: vi.fn(),
  queryNexus: vi.fn(),
}));

vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>()),
  getDeployEnv: mocks.getDeployEnv,
  getNexusUrl: mocks.getNexusUrl,
  getCdnUrl: mocks.getCdnUrl,
}));
vi.mock('@/controllers/hot/hot', () => ({ HotController: { getOrFetch: mocks.getHotTags } }));
vi.mock('@/controllers/post/post', () => ({
  PostController: { getDetailsByIds: mocks.getPostDetails, getTags: mocks.getPostTags },
}));
vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: {
    getOrFetchStreamSlice: mocks.getPostStream,
    prepareStreamForInitialLoad: mocks.preparePostStream,
  },
}));
vi.mock('@/controllers/stream/users/users', () => ({
  StreamUserController: { getOrFetchStreamSlice: mocks.getUserStream },
}));
vi.mock('@/controllers/user/user', () => ({ UserController: { getManyDetails: mocks.getUserDetails } }));
vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/nexus/nexus.utils')>()),
  queryNexus: mocks.queryNexus,
}));
vi.mock('@/libs/error/error.factories', () => ({
  Err: { timeout: () => ({ code: 'REQUEST_TIMEOUT' }) },
}));

const ALICE = 'y'.repeat(52);
const BOB = 'b'.repeat(52);
const CAROL = 'n'.repeat(52);
const POST_ONE = `${ALICE}:POST_ONE`;
const POST_TWO = `${BOB}:POST_TWO`;
const TRENDING_POST = `${CAROL}:TRENDING_POST`;

function profile(id: string, name: string): NexusUserDetails {
  return { id, name, bio: 'A person on staging.', image: null, links: null, status: null, indexed_at: 1 };
}

function hotTag(label: string): NexusHotTag {
  return { label, tagged_count: 5_000, taggers_count: 99, taggers_id: [ALICE] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('useWorldData', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getDeployEnv.mockReturnValue('staging');
    mocks.getNexusUrl.mockReturnValue('https://nexus.staging.pubky.app');
    mocks.getCdnUrl.mockReturnValue('https://nexus.staging.pubky.app/static');
    mocks.getHotTags.mockResolvedValue([hotTag('pubky')]);
    mocks.getUserStream.mockImplementation(async ({ streamId }: { streamId: string }) => ({
      nextPageIds:
        streamId === 'most_followed:all:all' ? [ALICE, BOB, CAROL] : streamId === `${ALICE}:following` ? [BOB] : [],
      skip: undefined,
      isExhausted: true,
    }));
    mocks.getUserDetails.mockImplementation(async ({ userIds }: { userIds: string[] }) => {
      const people = new Map([
        [ALICE, profile(ALICE, 'Alice')],
        [BOB, profile(BOB, 'Bob')],
        [CAROL, profile(CAROL, 'Carol')],
      ]);
      return new Map(userIds.flatMap((id) => (people.has(id) ? [[id, people.get(id)]] : [])));
    });
    mocks.preparePostStream.mockResolvedValue(undefined);
    mocks.getPostStream.mockImplementation(async ({ streamId }: { streamId: PostStreamId }) => ({
      nextPageIds: streamId === PostStreamTypes.POPULARITY_ALL_ALL ? [TRENDING_POST, POST_TWO] : [POST_ONE, POST_TWO],
      nextCursor: undefined,
    }));
    mocks.getPostDetails.mockImplementation(async ({ compositeIds }: { compositeIds: string[] }) =>
      compositeIds.map((id) => ({
        id,
        content: 'A real tagged post.',
        indexed_at: 1,
        kind: 'short',
        uri: '',
        attachments: null,
      })),
    );
    mocks.getPostTags.mockImplementation(async ({ compositeId }: { compositeId: string }) => [
      { id: compositeId, tags: [{ label: 'pubky', taggers: [], taggers_count: 1, relationship: false }] },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with demo data and makes no network reads before the explicit action', () => {
    const { result } = renderHook(() => useWorldData());
    expect(result.current.data.source).toBe('demo');
    expect(result.current.status).toBe('demo');
    expect(mocks.getHotTags).not.toHaveBeenCalled();
    expect(mocks.getUserStream).not.toHaveBeenCalled();
    expect(mocks.preparePostStream).not.toHaveBeenCalled();
    expect(mocks.getPostStream).not.toHaveBeenCalled();
  });

  it.each([
    ['production', 'https://nexus.staging.pubky.app'],
    ['staging', 'https://nexus.pubky.app'],
    ['staging', 'https://nexus.staging.pubky.app.example.com'],
    ['staging', 'https://nexus.staging.pubky.app?target=production'],
    ['staging', 'http://nexus.staging.pubky.app'],
  ])('rejects a mismatched network before reading (%s, %s)', async (environment, nexusUrl) => {
    mocks.getDeployEnv.mockReturnValue(environment);
    mocks.getNexusUrl.mockReturnValue(nexusUrl);
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());
    expect(result.current.status).toBe('error');
    expect(result.current.data.source).toBe('demo');
    expect(mocks.getHotTags).not.toHaveBeenCalled();
    expect(mocks.getUserStream).not.toHaveBeenCalled();
    expect(mocks.preparePostStream).not.toHaveBeenCalled();
  });

  it('uses only confirmed tagged posts, actual follow edges, and the displayed sample count', async () => {
    mocks.getPostStream.mockResolvedValue({
      nextPageIds: [POST_ONE, POST_TWO, 'invalid:../post'],
      nextCursor: undefined,
    });
    mocks.getPostTags.mockImplementation(async ({ compositeId }: { compositeId: string }) => [
      { id: compositeId, tags: [{ label: compositeId === POST_ONE ? 'pubky' : 'unrelated' }] },
    ]);
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());

    expect(result.current.status).toBe('staging');
    expect(result.current.data.source).toBe('staging');
    expect(result.current.data.tags).toEqual([
      {
        label: 'pubky',
        count: 1,
        posts: [
          {
            id: POST_ONE,
            author: 'Alice',
            text: 'A real tagged post.',
            tags: ['pubky'],
            url: `/post/${ALICE}/POST_ONE`,
          },
        ],
      },
    ]);
    expect(result.current.data.people.map((person) => person.id)).toEqual([ALICE, BOB, CAROL]);
    expect(result.current.data.relationships).toEqual([{ from: ALICE, to: BOB, label: 'follows' }]);
    expect(mocks.getPostDetails).toHaveBeenCalledWith({ compositeIds: [POST_ONE, POST_TWO] });
  });

  it('derives profile pictures from validated IDs instead of profile-supplied image URLs', async () => {
    const profiles = new Map([
      [ALICE, { ...profile(ALICE, 'Alice'), image: 'https://untrusted.example/tracker.png', indexed_at: 7 }],
      [BOB, profile(BOB, 'Bob')],
      [CAROL, { ...profile(BOB, 'Mismatched identity'), image: 'https://untrusted.example/another.png' }],
    ]);
    mocks.getUserDetails.mockResolvedValue(profiles);
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());

    expect(result.current.data.people.map((person) => person.id)).toEqual([ALICE, BOB]);
    expect(result.current.data.people[0].avatarUrl).toBe(`https://nexus.staging.pubky.app/static/avatar/${ALICE}?v=7`);
    expect(result.current.data.people[1].avatarUrl).toBeUndefined();
    expect(JSON.stringify(result.current.data.people)).not.toContain('untrusted.example');
  });

  it('commits readable article and collection previews for both ranked posts and tag leaves', async () => {
    mocks.getPostDetails.mockImplementation(async ({ compositeIds }: { compositeIds: string[] }) =>
      compositeIds.map((id) => ({
        id,
        kind: id === TRENDING_POST ? 'long' : 'collection',
        content: JSON.stringify(
          id === TRENDING_POST
            ? { title: 'A better show', body: '<p>Readable **words** on stage.</p>' }
            : { name: 'A reading list', description: '<p>Good things to read.</p>', items: ['pubky://metadata'] },
        ),
      })),
    );
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());

    expect(result.current.data.trendingPosts.map((post) => post.id)).toEqual([TRENDING_POST, POST_TWO]);
    expect(result.current.data.trendingPosts[0].text).toBe('A better show\n\nReadable words on stage.');
    expect(result.current.data.trendingPosts[1].text).toBe('A reading list\n\nGood things to read.');
    expect(result.current.data.tags[0].posts[0].text).toBe('A reading list\n\nGood things to read.');
  });

  it('keeps loading active until delayed content is normalized, then replaces the program once', async () => {
    const pending = deferred<Array<{ id: string; kind: string; content: string }>>();
    mocks.getPostDetails.mockImplementation(async ({ compositeIds }: { compositeIds: string[] }) =>
      compositeIds.includes(TRENDING_POST)
        ? pending.promise
        : compositeIds.map((id) => ({ id, kind: 'short', content: 'Already loaded.' })),
    );
    const { result } = renderHook(() => useWorldData());
    const original = result.current.data;
    let load!: Promise<void>;
    act(() => {
      load = result.current.loadStaging();
    });
    await waitFor(() => expect(mocks.getPostDetails).toHaveBeenCalledWith({ compositeIds: [TRENDING_POST, POST_TWO] }));
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBe(original);
    await act(async () => {
      pending.resolve([
        { id: TRENDING_POST, kind: 'long', content: '{"title":"Ready now","body":"<p>A complete post.</p>"}' },
        { id: POST_TWO, kind: 'long', content: '{"title":' },
      ]);
      await load;
    });
    expect(result.current.status).toBe('staging');
    expect(result.current.data.trendingPosts.map((post) => post.text)).toEqual([
      'Ready now\n\nA complete post.',
      'Preview unavailable. Open this post in Pubky to read it.',
    ]);
  });

  it('bounds the visible sample even when a service returns extra records', async () => {
    const labels = Array.from({ length: 10 }, (_, index) => `tag${index}`);
    const ids = Array.from({ length: 10 }, (_, index) => `${ALICE}:POST_${index}`);
    mocks.getHotTags.mockResolvedValue(labels.map(hotTag));
    mocks.getPostStream.mockResolvedValue({ nextPageIds: ids, nextCursor: undefined });
    mocks.getPostTags.mockImplementation(async ({ compositeId }: { compositeId: string }) => [
      { id: compositeId, tags: labels.map((label) => ({ label })) },
    ]);
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());
    expect(result.current.data.tags).toHaveLength(6);
    expect(result.current.data.tags.every((tag) => tag.posts.length === 4 && tag.count === 4)).toBe(true);
    expect(result.current.data.trendingPosts).toHaveLength(8);
    expect(mocks.getPostStream).toHaveBeenCalledTimes(7);
    for (const [params] of mocks.getPostStream.mock.calls) {
      expect(params.limit).toBe(params.streamId === PostStreamTypes.POPULARITY_ALL_ALL ? 8 : 4);
    }
    for (const [params] of mocks.getUserStream.mock.calls) expect(params.limit).toBeLessThanOrEqual(20);
  });

  it('loads follow edges through the real Nexus stream conversion without exceeding its 20-user API limit', async () => {
    const requests: URL[] = [];
    // Exercise the real Nexus service, stream-id conversion, and URL builder.
    // Only the HTTP boundary is simulated using staging's observed limit contract.
    mocks.queryNexus.mockImplementation(async ({ url }: { url: string }) => {
      const request = new URL(url);
      requests.push(request);
      if (Number(request.searchParams.get('limit')) > 20) {
        return Promise.reject({ code: 'BAD_REQUEST', message: 'limit exceeds maximum of 20' });
      }
      if (request.searchParams.get('source') === 'most_followed') return [ALICE, BOB, CAROL];
      return request.searchParams.get('user_id') === ALICE ? [BOB] : [];
    });
    mocks.getUserStream.mockImplementation(
      async ({ streamId, skip, limit }: { streamId: UserStreamId; skip: number; limit: number }) => ({
        nextPageIds: await NexusUserStreamService.fetch({ streamId, params: { skip, limit } }),
        skip: undefined,
        isExhausted: true,
      }),
    );

    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());

    expect(result.current.status).toBe('staging');
    expect(result.current.error).toBeNull();
    expect(result.current.data.relationships).toEqual([{ from: ALICE, to: BOB, label: 'follows' }]);
    const followRequests = requests.filter((request) => request.searchParams.get('source') === 'following');
    expect(followRequests).toHaveLength(3);
    expect(followRequests.map((request) => request.searchParams.get('user_id'))).toEqual([ALICE, BOB, CAROL]);
    for (const request of followRequests) {
      expect(request.origin).toBe('https://nexus.staging.pubky.app');
      expect(request.pathname).toBe('/v0/stream/users/ids');
      expect(Number(request.searchParams.get('limit'))).toBeLessThanOrEqual(20);
      expect(request.searchParams.get('skip')).toBe('0');
    }
  });

  it('rejects tag delimiters and leaves an empty confirmed tree when no posts match', async () => {
    mocks.getHotTags.mockResolvedValue([hotTag('good'), hotTag('bad:following'), hotTag('two,tags'), hotTag('')]);
    mocks.getPostTags.mockResolvedValue([]);
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());
    expect(
      mocks.getPostStream.mock.calls.filter(([params]) => params.streamId !== PostStreamTypes.POPULARITY_ALL_ALL),
    ).toHaveLength(1);
    expect(result.current.data.tags).toEqual([{ label: 'good', count: 0, posts: [] }]);
  });

  it('keeps demo selected after an earlier staging request completes', async () => {
    const pending = deferred<NexusHotTag[]>();
    mocks.getHotTags.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useWorldData());
    let load!: Promise<void>;
    act(() => {
      load = result.current.loadStaging();
    });
    expect(result.current.status).toBe('loading');
    act(() => result.current.useDemo());
    await act(async () => {
      pending.resolve([hotTag('pubky')]);
      await load;
    });
    expect(result.current.status).toBe('demo');
    expect(result.current.data.source).toBe('demo');
    expect(result.current.error).toBeNull();
    expect(mocks.getPostStream).not.toHaveBeenCalled();
  });

  it('cancels an unmounted load before any later phase can start', async () => {
    const pending = deferred<NexusHotTag[]>();
    mocks.getHotTags.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useWorldData());
    let load!: Promise<void>;
    act(() => {
      load = result.current.loadStaging();
    });
    unmount();
    pending.resolve([hotTag('pubky')]);
    await load;
    expect(mocks.getPostStream).not.toHaveBeenCalled();
    expect(mocks.getUserDetails).not.toHaveBeenCalled();
  });

  it('times out a stalled load, preserving the previous world', async () => {
    vi.useFakeTimers();
    mocks.getHotTags.mockReturnValue(new Promise<NexusHotTag[]>(() => {}));
    const { result } = renderHook(() => useWorldData());
    let load!: Promise<void>;
    act(() => {
      load = result.current.loadStaging();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
      await load;
    });
    expect(result.current.status).toBe('error');
    expect(result.current.data.source).toBe('demo');
    expect(result.current.error).toContain('try again');
    expect(mocks.getPostStream).not.toHaveBeenCalled();
  });

  it('does not substitute fictional content after staging succeeds with a failed tree', async () => {
    mocks.getPostStream.mockRejectedValue({ code: 'OFFLINE' });
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());
    const data: WorldData = result.current.data;
    expect(result.current.status).toBe('staging');
    expect(data.source).toBe('staging');
    expect(data.tags).toEqual([]);
    expect(data.trendingPosts).toEqual([]);
    expect(data.people.map((person) => person.id)).toEqual([ALICE, BOB, CAROL]);
    expect(result.current.error).toContain('Only confirmed samples');
  });

  it('gets theater posts from the independent public Hot stream instead of the tag trees', async () => {
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());

    expect(result.current.data.trendingPosts.map((post) => post.id)).toEqual([TRENDING_POST, POST_TWO]);
    expect(result.current.data.tags[0].posts.map((post) => post.id)).toEqual([POST_ONE, POST_TWO]);
    expect(mocks.preparePostStream).toHaveBeenCalledExactlyOnceWith({ streamId: PostStreamTypes.POPULARITY_ALL_ALL });
    expect(mocks.getPostStream).toHaveBeenCalledWith({
      streamId: PostStreamTypes.POPULARITY_ALL_ALL,
      streamTail: 0,
      limit: 8,
    });
    const hotCall = mocks.getPostStream.mock.calls.findIndex(
      ([params]) => params.streamId === PostStreamTypes.POPULARITY_ALL_ALL,
    );
    expect(mocks.preparePostStream.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getPostStream.mock.invocationCallOrder[hotCall],
    );
  });

  it('uses the real Nexus Hot stream parser and endpoint with no invented timeframe or private reach', async () => {
    const requests: URL[] = [];
    mocks.queryNexus.mockImplementation(async ({ url }: { url: string }) => {
      requests.push(new URL(url));
      return { post_keys: [TRENDING_POST, POST_TWO], last_post_score: 65 };
    });
    mocks.getPostStream.mockImplementation(
      async ({ streamId, streamTail = 0, limit }: { streamId: PostStreamId; streamTail?: number; limit: number }) => {
        if (streamId !== PostStreamTypes.POPULARITY_ALL_ALL) return { nextPageIds: [POST_ONE, POST_TWO] };
        const response = await NexusPostStreamService.fetch(
          createPostStreamParams({ streamId, streamTail, streamHead: 0, limit, viewerId: null }),
        );
        return { nextPageIds: response.post_keys };
      },
    );

    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());

    expect(requests).toHaveLength(1);
    expect(requests[0].origin).toBe('https://nexus.staging.pubky.app');
    expect(requests[0].pathname).toBe('/v0/stream/posts/keys');
    expect(Object.fromEntries(requests[0].searchParams)).toEqual({
      source: 'all',
      sorting: 'total_engagement',
      skip: '0',
      limit: '8',
    });
    expect(result.current.data.trendingPosts.map((post) => post.id)).toEqual([TRENDING_POST, POST_TWO]);
  });

  it('deduplicates and validates ranked IDs, drops mismatched details, and bounds display text', async () => {
    mocks.getPostStream.mockImplementation(async ({ streamId }: { streamId: PostStreamId }) => ({
      nextPageIds:
        streamId === PostStreamTypes.POPULARITY_ALL_ALL
          ? [TRENDING_POST, TRENDING_POST, 'invalid:../post', POST_TWO]
          : [],
    }));
    mocks.getPostDetails.mockImplementation(async ({ compositeIds }: { compositeIds: string[] }) =>
      compositeIds.map((id) => ({ id: id === POST_TWO ? POST_ONE : id, content: `hello\u0000${'x'.repeat(2000)}` })),
    );
    mocks.getPostTags.mockResolvedValue([
      {
        tags: [
          { label: 'bad:tag' },
          { label: 'two,tags' },
          ...Array.from({ length: 20 }, (_, index) => ({ label: `tag${index}` })),
        ],
      },
    ]);
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());

    expect(mocks.getPostDetails).toHaveBeenCalledExactlyOnceWith({ compositeIds: [TRENDING_POST, POST_TWO] });
    const posts = result.current.data.trendingPosts;
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe(TRENDING_POST);
    expect(posts[0].text).toHaveLength(1200);
    expect(posts[0].text).not.toContain('\u0000');
    expect(posts[0].tags).toHaveLength(12);
    expect(posts[0].tags).not.toContain('bad:tag');
    expect(posts[0].url).toBe(`/post/${CAROL}/TRENDING_POST`);
  });

  it('keeps a live theater empty when its actual ranked feed is empty', async () => {
    mocks.getPostStream.mockImplementation(async ({ streamId }: { streamId: PostStreamId }) => ({
      nextPageIds: streamId === PostStreamTypes.POPULARITY_ALL_ALL ? [] : [POST_ONE],
    }));
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());
    expect(result.current.status).toBe('staging');
    expect(result.current.data.trendingPosts).toEqual([]);
    expect(result.current.data.tags[0].posts).toHaveLength(1);
  });

  it('reports a failed ranked feed without filling it with tag leaves or fictional posts', async () => {
    mocks.getPostStream.mockImplementation(async ({ streamId }: { streamId: PostStreamId }) => {
      if (streamId === PostStreamTypes.POPULARITY_ALL_ALL) return Promise.reject({ code: 'OFFLINE' });
      return { nextPageIds: [POST_ONE] };
    });
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());
    expect(result.current.status).toBe('staging');
    expect(result.current.data.trendingPosts).toEqual([]);
    expect(result.current.data.tags[0].posts).toHaveLength(1);
    expect(result.current.error).toContain('Only confirmed samples');
  });

  it('can load a real theater even when no public tag trees or plaza profiles are available', async () => {
    mocks.getHotTags.mockResolvedValue([]);
    mocks.getUserStream.mockResolvedValue({ nextPageIds: [] });
    const { result } = renderHook(() => useWorldData());
    await act(() => result.current.loadStaging());
    expect(result.current.status).toBe('staging');
    expect(result.current.data.trendingPosts.map((post) => post.id)).toEqual([TRENDING_POST, POST_TWO]);
    expect(result.current.data.tags).toEqual([]);
    expect(result.current.data.people).toEqual([]);
  });

  it('does not restore staging when a canceled theater request completes later', async () => {
    const pending = deferred<{ nextPageIds: string[] }>();
    mocks.getPostStream.mockImplementation(async ({ streamId }: { streamId: PostStreamId }) =>
      streamId === PostStreamTypes.POPULARITY_ALL_ALL ? pending.promise : { nextPageIds: [POST_ONE] },
    );
    const { result } = renderHook(() => useWorldData());
    let load!: Promise<void>;
    act(() => {
      load = result.current.loadStaging();
    });
    await waitFor(() =>
      expect(mocks.getPostStream).toHaveBeenCalledWith({
        streamId: PostStreamTypes.POPULARITY_ALL_ALL,
        streamTail: 0,
        limit: 8,
      }),
    );
    act(() => result.current.useDemo());
    await act(async () => {
      pending.resolve({ nextPageIds: [TRENDING_POST] });
      await load;
    });
    expect(result.current.status).toBe('demo');
    expect(result.current.data.source).toBe('demo');
    expect(result.current.data.trendingPosts.some((post) => post.id === TRENDING_POST)).toBe(false);
    expect(mocks.getPostDetails).not.toHaveBeenCalledWith({ compositeIds: [TRENDING_POST] });
  });
});
