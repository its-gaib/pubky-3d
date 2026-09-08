import { POST_ROUTES } from '@/app/routes';
import { FileController } from '@/controllers/file/file';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { StreamUserController } from '@/controllers/stream/users/users';
import { UserController } from '@/controllers/user/user';
import { isPubkyIdentifier } from '@/libs/utils/utils';
import { isWorldProductionConfigured } from '@/libs/world/world-network';
import { worldPostPreview } from '@/libs/world/world-post-preview';
import type { WorldPerson, WorldPost } from '@/libs/world/world-types';
import { buildSortedAuthorStreamId } from '@/models/stream/post/postStream.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { StreamOrder } from '@/services/nexus/stream/posts/postStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  WORLD_SOCIAL_BATCH_PAGES,
  WORLD_SOCIAL_PAGE_SIZE,
  worldPersonPlaceholder,
  WorldSocialGraph,
} from './useWorldSocial.graph';
import { WORLD_SOCIAL_CANCELLED, WorldSocialReadQueue } from './useWorldSocial.queue';
import type { WorldGraphSnapshot, WorldSocialStatus } from './useWorldSocial.types';

export const WORLD_SOCIAL_PROFILE_LIMIT = 20;
export const WORLD_SOCIAL_ERROR =
  'Some connections could not be loaded. Your current circle is still here; retry to continue.';
const POST_SCAN_PAGES = 5;
export function currentWorldSocialViewer(): string | null {
  const state = useAuthStore.getState();
  return isWorldProductionConfigured() &&
    state.hasHydrated &&
    !state.isRestoringSession &&
    !state.isLoggingOut &&
    state.selectIsAuthenticated() &&
    state.currentUserPubky &&
    isPubkyIdentifier(state.currentUserPubky)
    ? state.currentUserPubky
    : null;
}

export interface WorldSocialView extends WorldGraphSnapshot {
  scope: string;
  context: WorldSocialContext | null;
  selectedFollowing: boolean;
  selectedCanFollow: boolean;
  status: WorldSocialStatus;
  complete: boolean;
  error: string | null;
}

export const EMPTY_WORLD_SOCIAL_VIEW: WorldSocialView = {
  scope: '',
  context: null,
  selectedFollowing: false,
  selectedCanFollow: false,
  people: [],
  relationships: [],
  directCount: 0,
  discoveryCount: 0,
  status: 'inactive',
  complete: false,
  error: null,
};

export interface WorldSocialContext {
  scope: string;
  enabled: boolean;
  rawViewerId: string | null;
  viewerId: string | null;
  active: boolean;
  graph: WorldSocialGraph | null;
  profiles: Map<string, WorldPerson>;
  profileRequests: Map<string, Promise<void>>;
  running: boolean;
  status: WorldSocialStatus;
  error: string | null;
}

function plainText(value: unknown, limit: number): string {
  return typeof value === 'string'
    ? value
        .slice(0, limit)
        .replace(/\p{Cc}/gu, ' ')
        .trim()
    : '';
}

/** Controllers retain their normal caches; this object owns only this world's work queue. */
export class WorldSocialManager {
  private context: WorldSocialContext | null = null;
  private selectedId: string | null = null;
  private queue = new WorldSocialReadQueue();

  constructor(private publishView: (view: WorldSocialView) => void) {}

  configure(scope: string, enabled: boolean, rawViewerId: string | null, viewerId: string | null): void {
    this.cancel();
    const context: WorldSocialContext = {
      scope,
      enabled,
      rawViewerId,
      viewerId,
      active: true,
      graph: enabled && viewerId ? new WorldSocialGraph(viewerId) : null,
      profiles: new Map(),
      profileRequests: new Map(),
      running: false,
      status: !enabled ? 'inactive' : viewerId ? 'loading' : 'signed-out',
      error: null,
    };
    this.context = context;
    this.publish(context);
  }

  cancel(): void {
    if (this.context) this.context.active = false;
    this.queue.cancelInactive();
  }

  capture(): WorldSocialContext | null {
    return this.context;
  }

  isActive(context: WorldSocialContext | null): context is WorldSocialContext {
    return (
      !!context &&
      context === this.context &&
      context.active &&
      context.enabled &&
      isWorldProductionConfigured() &&
      useAuthStore.getState().currentUserPubky === context.rawViewerId &&
      currentWorldSocialViewer() === context.viewerId
    );
  }

  setSelected(id: string | null): void {
    this.selectedId = id && isPubkyIdentifier(id) ? id : null;
    if (this.context) this.publish(this.context);
  }

  isSelected(id: string): boolean {
    return this.selectedId === id;
  }

  person(id: string): WorldPerson | null {
    if (!isPubkyIdentifier(id) || !this.isActive(this.context)) return null;
    return this.context.profiles.get(id) ?? worldPersonPlaceholder(id);
  }

  isFollowing(id: string): boolean {
    return this.isActive(this.context) ? (this.context.graph?.isFollowing(id) ?? false) : false;
  }

  canFollow(id: string): boolean {
    return (
      this.isActive(this.context) &&
      !!this.context.viewerId &&
      this.context.viewerId !== id &&
      isPubkyIdentifier(id) &&
      this.context.graph?.directComplete === true
    );
  }

  applyLocalFollow(id: string, desired: boolean): void {
    const context = this.context;
    if (!this.isActive(context) || !context.graph) return;
    context.graph.applyLocalFollow(id, desired);
    this.publish(context);
    if (desired && !context.running && !context.graph.complete) void this.loadMore();
  }

  loadMore = async (): Promise<void> => {
    const context = this.context;
    if (!this.isActive(context) || !context.graph || context.running) return;
    const graph = context.graph;
    const active = () => this.isActive(context) && context.graph === graph;
    context.running = true;
    context.status = 'loading';
    context.error = null;
    this.publish(context);
    let requested = 0;
    try {
      while (active() && requested < WORLD_SOCIAL_BATCH_PAGES && !graph.complete) {
        const tasks = graph.takePages(Math.min(2, WORLD_SOCIAL_BATCH_PAGES - requested));
        if (!tasks.length) break;
        requested += tasks.length;
        const results = await Promise.allSettled(
          tasks.map(async (task) => {
            const page = await this.queue.run(
              () =>
                StreamUserController.refreshStreamIds({
                  streamId: `${task.parentId}:following`,
                  skip: task.skip,
                  limit: WORLD_SOCIAL_PAGE_SIZE,
                }),
              active,
            );
            if (!active()) throw WORLD_SOCIAL_CANCELLED;
            if (!graph.acceptPage(task, page)) return false;
            this.publish(context);
            return true;
          }),
        );
        if (!active()) return;
        let failed = false;
        results.forEach((result, index) => {
          if (result.status === 'rejected' || !result.value) {
            graph.failPage(tasks[index]);
            failed = true;
          }
        });
        if (failed) {
          context.status = 'error';
          context.error = WORLD_SOCIAL_ERROR;
          return;
        }
      }
      if (active()) context.status = graph.complete ? 'ready' : 'paused';
    } finally {
      if (active()) {
        context.running = false;
        this.publish(context);
      }
    }
  };

  retry = async (): Promise<void> => {
    if (!this.isActive(this.context)) return;
    this.context.graph?.retryFailed();
    await this.loadMore();
  };

  refresh = async (): Promise<void> => {
    const context = this.context;
    if (!this.isActive(context) || !context.viewerId) return;
    const graph = new WorldSocialGraph(context.viewerId);
    if (context.graph) graph.copyLocalIntentsFrom(context.graph);
    graph.updateProfiles(Array.from(context.profiles.values()));
    context.graph = graph;
    context.running = false;
    this.queue.cancelInactive();
    await this.loadMore();
  };

  async ensureProfiles(ids: string[], context = this.context): Promise<void> {
    if (!this.isActive(context)) throw WORLD_SOCIAL_CANCELLED;
    const wanted = [...new Set(ids.slice(0, WORLD_SOCIAL_PROFILE_LIMIT).filter((id) => isPubkyIdentifier(id)))];
    const missing = wanted.filter((id) => !context.profiles.has(id) && !context.profileRequests.has(id));
    if (missing.length) {
      const request = (async () => {
        await this.queue.run(
          () => StreamUserController.getOrFetchUsers({ userIds: missing }),
          () => this.isActive(context),
          true,
        );
        if (!this.isActive(context)) throw WORLD_SOCIAL_CANCELLED;
        const profiles = await this.queue.run(
          () => UserController.getManyDetails({ userIds: missing }),
          () => this.isActive(context),
          true,
        );
        if (!this.isActive(context)) throw WORLD_SOCIAL_CANCELLED;
        const loaded: WorldPerson[] = [];
        for (const id of missing) {
          const details = profiles.get(id);
          if (!details || details.id !== id) continue;
          const person: WorldPerson = {
            ...worldPersonPlaceholder(id),
            name: plainText(details.name, 48) || worldPersonPlaceholder(id).name,
            bio: plainText(details.bio, 320),
            profileLoaded: true,
            avatarUrl: details.image
              ? FileController.getAvatarUrl(
                  id,
                  Number.isFinite(details.indexed_at) && details.indexed_at > 0 ? details.indexed_at : undefined,
                )
              : undefined,
          };
          context.profiles.set(id, person);
          loaded.push(person);
        }
        context.graph?.updateProfiles(loaded);
        this.publish(context);
      })();
      for (const id of missing) context.profileRequests.set(id, request);
      void request
        .finally(() => {
          for (const id of missing) if (context.profileRequests.get(id) === request) context.profileRequests.delete(id);
        })
        .catch(() => undefined);
    }
    await Promise.all([
      ...new Set(
        wanted.flatMap((id) => {
          const request = context.profileRequests.get(id);
          return request ? [request] : [];
        }),
      ),
    ]);
  }

  async latestPost(id: string, context: WorldSocialContext, selected: () => boolean): Promise<WorldPost | null> {
    const active = () => this.isActive(context) && selected();
    if (!isPubkyIdentifier(id) || !active()) throw WORLD_SOCIAL_CANCELLED;
    const streamId = buildSortedAuthorStreamId(StreamSorting.TIMELINE, id, 'all');
    await this.queue.run(() => StreamPostsController.prepareStreamForInitialLoad({ streamId }), active, true);
    let cursor = 0;
    let anchor: string | undefined;
    for (let page = 0; page < POST_SCAN_PAGES && active(); page++) {
      const result = await this.queue.run(
        () =>
          StreamPostsController.getOrFetchStreamSlice({
            streamId,
            limit: 1,
            streamHead: 0,
            streamTail: cursor,
            lastPostId: anchor,
            order: StreamOrder.DESCENDING,
          }),
        active,
        true,
      );
      if (!active()) throw WORLD_SOCIAL_CANCELLED;
      const ids = result.nextPageIds.slice(0, 1).filter((postId) => {
        if (typeof postId !== 'string') return false;
        const [author, key, extra] = postId.split(':');
        return author === id && !extra && /^[a-zA-Z0-9_-]{1,128}$/.test(key ?? '');
      });
      if (ids.length) {
        const posts = await this.queue.run(() => PostController.getDetailsByIds({ compositeIds: ids }), active, true);
        if (!active()) throw WORLD_SOCIAL_CANCELLED;
        const post = posts.find((item) => item?.id === ids[0]);
        if (post) {
          const postKey = ids[0].slice(id.length + 1);
          return {
            id: ids[0],
            author: context.profiles.get(id)?.name ?? worldPersonPlaceholder(id).name,
            text: worldPostPreview(post),
            tags: [],
            url: `${POST_ROUTES.POST}/${encodeURIComponent(id)}/${encodeURIComponent(postKey)}`,
          };
        }
      }
      if (result.reachedEnd) return null;
      if (result.nextCursor === undefined || !Number.isSafeInteger(result.nextCursor) || result.nextCursor <= cursor)
        break;
      cursor = result.nextCursor;
      const nextAnchor = result.lastRawPostId ?? result.nextPageIds.at(-1);
      anchor =
        typeof nextAnchor === 'string' && /^[a-z0-9]{52}:[a-zA-Z0-9_-]{1,128}$/.test(nextAnchor)
          ? nextAnchor
          : undefined;
    }
    // A filtered/unavailable page is not evidence that the user has never posted.
    throw WORLD_SOCIAL_CANCELLED;
  }

  private publish(context: WorldSocialContext): void {
    if (context !== this.context || !context.active) return;
    const snapshot = context.graph?.snapshot(this.selectedId) ?? EMPTY_WORLD_SOCIAL_VIEW;
    this.publishView({
      ...snapshot,
      scope: context.scope,
      context,
      selectedFollowing: this.selectedId ? this.isFollowing(this.selectedId) : false,
      selectedCanFollow: this.selectedId ? this.canFollow(this.selectedId) : false,
      status: context.status,
      error: context.error,
      complete: context.graph?.complete ?? false,
    });
  }
}
