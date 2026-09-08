'use client';

import { useEffect, useRef, useState } from 'react';
import { POST_ROUTES } from '@/app/routes';
import { TAG_MAX_LENGTH } from '@/config/posts';
import { FileController } from '@/controllers/file/file';
import { HotController } from '@/controllers/hot/hot';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { StreamUserController } from '@/controllers/stream/users/users';
import { UserController } from '@/controllers/user/user';
import { TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isPubkyIdentifier } from '@/libs/utils/utils';
import { DEMO_WORLD_DATA } from '@/libs/world/world-catalog';
import { isWorldProductionConfigured } from '@/libs/world/world-network';
import { worldPostPreview } from '@/libs/world/world-post-preview';
import type { WorldData, WorldPerson, WorldPost, WorldRelationship, WorldTag } from '@/libs/world/world-types';
import { type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserStreamTimeframe } from '@/services/nexus/nexus.types';

const TREE_LIMIT = 6;
const POSTS_PER_TREE = 4;
const TRENDING_POST_LIMIT = 8;
const PEOPLE_LIMIT = 6;
// Nexus's user-stream endpoint rejects limits above 20 (post streams have a
// separate, larger cap). Keep the world sample within the user-stream contract.
const FOLLOWING_SAMPLE_LIMIT = 20;
const RELATIONSHIP_LIMIT = 12;
const LOAD_TIMEOUT_MS = 20_000;
const CANCELLED = Symbol('world-load-cancelled');

type WorldDataStatus = 'loading' | 'production' | 'error';

interface UseWorldDataResult {
  data: WorldData;
  status: WorldDataStatus;
  error: string | null;
  loadProduction: () => Promise<void>;
}

function plainText(value: unknown, limit: number): string {
  return typeof value === 'string'
    ? value
        .replace(/\p{Cc}/gu, ' ')
        .trim()
        .slice(0, limit)
    : '';
}

function isWorldTag(value: unknown): value is string {
  // Stream IDs use ':' between segments and ',' between tags. Reject those delimiters
  // instead of allowing an external label to change the requested stream's meaning.
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= TAG_MAX_LENGTH &&
    value === value.trim() &&
    !/[:,\p{Cc}]/u.test(value)
  );
}

function parsePostId(value: unknown): { author: string; postId: string } | null {
  if (typeof value !== 'string') return null;
  const [author, postId, extra] = value.split(':');
  if (!isPubkyIdentifier(author ?? '') || !postId || extra !== undefined || !/^[a-zA-Z0-9_-]{1,128}$/.test(postId)) {
    return null;
  }
  return { author, postId };
}

function publicUserIds(values: unknown, limit: number): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(values.filter((value): value is string => typeof value === 'string' && isPubkyIdentifier(value))),
  ].slice(0, limit);
}

/**
 * Controllers own their shared requests and do not expose a transport AbortSignal.
 * Stop awaiting on cancellation, and prevent every later phase from starting. An
 * already-issued controller read may finish populating its normal shared cache.
 */
function readWhileActive<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal.aborted) return Promise.reject(signal.reason);
        return read();
      })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function readTag(label: string, signal: AbortSignal): Promise<WorldTag> {
  const stream = await readWhileActive(signal, () =>
    StreamPostsController.getOrFetchStreamSlice({
      streamId: `${PostStreamTypes.TIMELINE_ALL_ALL}:${label}` as PostStreamId,
      limit: POSTS_PER_TREE,
    }),
  );
  const compositeIds = [...new Set(stream.nextPageIds)].filter((id) => parsePostId(id)).slice(0, POSTS_PER_TREE);
  if (compositeIds.length === 0) return { label, count: 0, posts: [] };

  const [details, tagCollections] = await Promise.all([
    readWhileActive(signal, () => PostController.getDetailsByIds({ compositeIds })),
    Promise.all(
      compositeIds.map((compositeId) => readWhileActive(signal, () => PostController.getTags({ compositeId }))),
    ),
  ]);
  const posts: WorldPost[] = [];

  for (let index = 0; index < compositeIds.length; index++) {
    const id = compositeIds[index];
    const parsed = parsePostId(id);
    const post = details[index];
    const labels = [
      ...new Set(tagCollections[index].flatMap((collection) => collection.tags.map((tag) => tag.label))),
    ].filter(isWorldTag);
    // A tag query can return stale cache entries or incomplete details. A leaf is
    // displayed only when its own stored tag metadata confirms this exact tree.
    if (!parsed || !post || post.id !== id || !labels.includes(label)) continue;
    posts.push({
      id,
      author: parsed.author,
      text: worldPostPreview(post),
      tags: labels.slice(0, 12),
      url: `${POST_ROUTES.POST}/${encodeURIComponent(parsed.author)}/${encodeURIComponent(parsed.postId)}`,
    });
  }

  // This is the number of leaves actually present in the sample, not Nexus's
  // global tagged_count (which also includes entities other than these posts).
  return { label, count: posts.length, posts };
}

/** The existing public Hot feed ranks by total engagement, without a timeframe filter. */
async function readTrendingPosts(signal: AbortSignal): Promise<WorldPost[]> {
  // Reset any Hot-page pagination overflow so this is a fresh ranked first page.
  await readWhileActive(signal, () =>
    StreamPostsController.prepareStreamForInitialLoad({ streamId: PostStreamTypes.POPULARITY_ALL_ALL }),
  );
  const stream = await readWhileActive(signal, () =>
    StreamPostsController.getOrFetchStreamSlice({
      streamId: PostStreamTypes.POPULARITY_ALL_ALL,
      streamTail: 0,
      limit: TRENDING_POST_LIMIT,
    }),
  );
  const compositeIds = [...new Set(stream.nextPageIds)].filter((id) => parsePostId(id)).slice(0, TRENDING_POST_LIMIT);
  if (compositeIds.length === 0) return [];

  const [details, tagCollections] = await Promise.all([
    readWhileActive(signal, () => PostController.getDetailsByIds({ compositeIds })),
    Promise.all(
      compositeIds.map((compositeId) => readWhileActive(signal, () => PostController.getTags({ compositeId }))),
    ),
  ]);

  // Preserve Nexus's ranking after invalid or missing records are excluded.
  return compositeIds.flatMap((id, index) => {
    const parsed = parsePostId(id);
    const post = details[index];
    if (!parsed || !post || post.id !== id) return [];
    const labels = [
      ...new Set(tagCollections[index].flatMap((collection) => collection.tags.map((tag) => tag.label))),
    ].filter(isWorldTag);
    return [
      {
        id,
        author: parsed.author,
        text: worldPostPreview(post),
        tags: labels.slice(0, 12),
        url: `${POST_ROUTES.POST}/${encodeURIComponent(parsed.author)}/${encodeURIComponent(parsed.postId)}`,
      },
    ];
  });
}

async function readProductionWorld(signal: AbortSignal): Promise<{ data: WorldData; partial: boolean }> {
  const initial = await Promise.allSettled([
    readWhileActive(signal, () =>
      HotController.getOrFetch({
        timeframe: UserStreamTimeframe.THIS_MONTH,
        limit: TREE_LIMIT,
        taggers_limit: PEOPLE_LIMIT,
      }),
    ),
    readWhileActive(signal, () =>
      StreamUserController.getOrFetchStreamSlice({
        streamId: UserStreamTypes.MOST_FOLLOWED,
        limit: PEOPLE_LIMIT,
        skip: 0,
      }),
    ),
  ]);

  const [hotResult, peopleResult] = initial;
  const labels =
    hotResult.status === 'fulfilled'
      ? [...new Set(hotResult.value.map((tag) => tag.label).filter(isWorldTag))].slice(0, TREE_LIMIT)
      : [];
  const userIds =
    peopleResult.status === 'fulfilled' ? publicUserIds(peopleResult.value.nextPageIds, PEOPLE_LIMIT) : [];

  const [trees, profiles, following, trendingResults] = await Promise.all([
    Promise.allSettled(labels.map((label) => readTag(label, signal))),
    readWhileActive(signal, () => UserController.getManyDetails({ userIds })),
    Promise.allSettled(
      userIds.map((userId) =>
        readWhileActive(signal, () =>
          StreamUserController.getOrFetchStreamSlice({
            streamId: `${userId}:following`,
            skip: 0,
            limit: FOLLOWING_SAMPLE_LIMIT,
          }),
        ),
      ),
    ),
    Promise.allSettled([readTrendingPosts(signal)]),
  ]);

  const tags = trees.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
  const trendingPosts = trendingResults.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  const allPosts = [...tags.flatMap((tag) => tag.posts), ...trendingPosts];
  const authorIds = [...new Set(allPosts.map((post) => post.author))];
  const authors = await readWhileActive(signal, () => UserController.getManyDetails({ userIds: authorIds }));
  for (const post of allPosts) {
    post.author = plainText(authors.get(post.author)?.name, 48) || `${post.author.slice(0, 8)}…`;
  }

  const people: WorldPerson[] = userIds.flatMap((id, index) => {
    const profile = profiles.get(id);
    if (!profile || profile.id !== id) return [];
    const slot = DEMO_WORLD_DATA.people[index];
    return [
      {
        id,
        name: plainText(profile.name, 48) || `${id.slice(0, 8)}…`,
        avatarUrl: profile.image
          ? FileController.getAvatarUrl(
              id,
              Number.isFinite(profile.indexed_at) && profile.indexed_at > 0 ? profile.indexed_at : undefined,
            )
          : undefined,
        bio: plainText(profile.bio, 320),
        color: slot?.color ?? '#a9dcd6',
        position: slot ? [...slot.position] : [Math.cos(index) * 8, 8 + Math.sin(index) * 8],
      },
    ];
  });

  const displayed = new Set(people.map((person) => person.id));
  const relationships: WorldRelationship[] = [];
  for (let index = 0; index < following.length; index++) {
    const from = userIds[index];
    const result = following[index];
    if (!displayed.has(from) || result.status !== 'fulfilled') continue;
    for (const to of publicUserIds(result.value.nextPageIds, FOLLOWING_SAMPLE_LIMIT)) {
      if (from !== to && displayed.has(to) && relationships.length < RELATIONSHIP_LIMIT) {
        relationships.push({ from, to, label: 'follows' });
      }
    }
  }

  return {
    data: { source: 'production', tags, trendingPosts, people, relationships },
    partial: [...initial, ...trees, ...following, ...trendingResults].some((result) => result.status === 'rejected'),
  };
}

/** Public production data; the World mounts this loader automatically and can retry it. */
export function useWorldData(): UseWorldDataResult {
  const [data, setData] = useState<WorldData>({
    source: 'production',
    tags: [],
    trendingPosts: [],
    people: [],
    relationships: [],
  });
  const [status, setStatus] = useState<WorldDataStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const activeLoad = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      activeLoad.current?.abort(CANCELLED);
      activeLoad.current = null;
    },
    [],
  );

  async function loadProduction(): Promise<void> {
    if (activeLoad.current) return;
    if (!isWorldProductionConfigured()) {
      setStatus('error');
      setError('Production samples are available only when this app is connected to the public production network.');
      return;
    }

    const controller = new AbortController();
    activeLoad.current = controller;
    setStatus('loading');
    setError(null);
    const timeout = setTimeout(() => {
      controller.abort(
        Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'The world production sample timed out', {
          service: ErrorService.Nexus,
          operation: 'useWorldData.loadProduction',
        }),
      );
    }, LOAD_TIMEOUT_MS);

    try {
      const sample = await readProductionWorld(controller.signal);
      if (controller.signal.aborted || activeLoad.current !== controller) return;
      if (sample.data.tags.length === 0 && sample.data.people.length === 0 && sample.data.trendingPosts.length === 0) {
        setStatus('error');
        setError('No public production samples were available. Your previous world is still here.');
        return;
      }
      setData(sample.data);
      setStatus('production');
      setError(
        sample.partial ? 'Some public production samples could not be loaded. Only confirmed samples are shown.' : null,
      );
    } catch {
      if (activeLoad.current !== controller || controller.signal.reason === CANCELLED) return;
      setStatus('error');
      setError('Could not load the public production sample. Your previous world is still here; you can try again.');
    } finally {
      clearTimeout(timeout);
      if (activeLoad.current === controller) activeLoad.current = null;
    }
  }

  return { data, status, error, loadProduction };
}
