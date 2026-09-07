import { isPubkyIdentifier } from '@/libs/utils/utils';
import type { WorldPerson, WorldRelationship } from '@/libs/world/world-types';
import type { WorldGraphSnapshot } from './useWorldSocial.types';

export const WORLD_SOCIAL_PAGE_SIZE = 20;
export const WORLD_SOCIAL_BATCH_PAGES = 100;
const COLORS = ['#c8ff03', '#ff9155', '#b59bff', '#5fe5e7', '#ff89c8'];

export interface WorldFollowingPage {
  nextPageIds: string[];
  skip: number | undefined;
  isExhausted: boolean;
}

export interface WorldGraphPageRequest {
  parentId: string;
  skip: number;
}

interface Cursor {
  skip: number;
  complete: boolean;
  inFlight: boolean;
  failed: boolean;
  noNewPages: number;
}

function newCursor(): Cursor {
  return { skip: 0, complete: false, inFlight: false, failed: false, noNewPages: 0 };
}

export function worldPersonPlaceholder(id: string): WorldPerson {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return {
    id,
    name: `${id.slice(0, 7)}…${id.slice(-4)}`,
    bio: '',
    color: COLORS[hash % COLORS.length],
    position: [0, 0],
    profileLoaded: false,
  };
}

/** ID membership is independent of profile hydration and has no total-person cap. */
export class WorldSocialGraph {
  readonly viewerId: string;
  readonly profiles = new Map<string, WorldPerson>();
  private direct = new Set<string>();
  private localIntent = new Map<string, boolean>();
  private following = new Map<string, Set<string>>();
  private cursors = new Map<string, Cursor>();
  private revision = 0;
  private snapshotRevision = -1;
  private retainedId: string | null = null;
  private reachableIds = new Set<string>();
  private snapshotValue: WorldGraphSnapshot = { people: [], relationships: [], directCount: 0, discoveryCount: 0 };
  private pendingParents: string[] = [];
  private queueIndex = 0;

  constructor(viewerId: string) {
    this.viewerId = viewerId;
    this.cursors.set(viewerId, newCursor());
  }

  get directComplete(): boolean {
    return this.cursors.get(this.viewerId)!.complete;
  }

  get complete(): boolean {
    if (!this.directComplete) return false;
    for (const id of this.directIds()) if (!this.cursors.get(id)?.complete) return false;
    return true;
  }

  isFollowing(id: string): boolean {
    return this.localIntent.get(id) ?? this.direct.has(id);
  }

  directIds(): Set<string> {
    const ids = new Set(this.direct);
    for (const [id, desired] of this.localIntent) {
      if (desired) ids.add(id);
      else ids.delete(id);
    }
    ids.delete(this.viewerId);
    return ids;
  }

  takePages(maximum: number): WorldGraphPageRequest[] {
    const root = this.cursors.get(this.viewerId)!;
    if (!root.complete) {
      if (root.inFlight || root.failed) return [];
      root.inFlight = true;
      return [{ parentId: this.viewerId, skip: root.skip }];
    }
    const tasks: WorldGraphPageRequest[] = [];
    while (tasks.length < maximum && this.queueIndex < this.pendingParents.length) {
      const id = this.pendingParents[this.queueIndex++];
      const cursor = this.cursors.get(id);
      if (!this.isFollowing(id) || !cursor || cursor.complete || cursor.inFlight || cursor.failed) continue;
      cursor.inFlight = true;
      tasks.push({ parentId: id, skip: cursor.skip });
    }
    // Compact the queue without discarding any remaining work.
    if (this.queueIndex > 1_000) {
      this.pendingParents = this.pendingParents.slice(this.queueIndex);
      this.queueIndex = 0;
    }
    return tasks;
  }

  acceptPage(request: WorldGraphPageRequest, page: WorldFollowingPage): boolean {
    const cursor = this.cursors.get(request.parentId);
    if (!cursor || request.skip !== cursor.skip || !cursor.inFlight) return false;
    const ids = page?.nextPageIds;
    if (!Array.isArray(ids)) {
      this.failPage(request);
      return false;
    }
    const nextSkip = page.skip ?? request.skip + ids.length;
    if (
      ids.length > WORLD_SOCIAL_PAGE_SIZE ||
      ids.some((id) => typeof id !== 'string' || !isPubkyIdentifier(id)) ||
      typeof page.isExhausted !== 'boolean' ||
      (!page.isExhausted && ids.length === 0) ||
      !Number.isSafeInteger(nextSkip) ||
      nextSkip < request.skip ||
      (!page.isExhausted && nextSkip <= request.skip)
    ) {
      this.failPage(request);
      return false;
    }
    const target =
      request.parentId === this.viewerId ? this.direct : (this.following.get(request.parentId) ?? new Set<string>());
    let added = 0;
    for (const id of ids) {
      if (id === request.parentId || target.has(id)) continue;
      target.add(id);
      added += 1;
      if (request.parentId === this.viewerId && id !== this.viewerId) this.ensureParent(id);
    }
    cursor.noNewPages = added === 0 && ids.length > 0 ? cursor.noNewPages + 1 : 0;
    if (cursor.noNewPages >= 2 && !page.isExhausted) {
      this.failPage(request);
      return false;
    }
    if (request.parentId !== this.viewerId) this.following.set(request.parentId, target);
    cursor.skip = nextSkip;
    cursor.complete = page.isExhausted;
    cursor.inFlight = false;
    if (!cursor.complete && request.parentId !== this.viewerId) this.pendingParents.push(request.parentId);
    if (added) this.revision += 1;
    return true;
  }

  failPage(request: WorldGraphPageRequest): void {
    const cursor = this.cursors.get(request.parentId);
    if (!cursor) return;
    cursor.inFlight = false;
    cursor.failed = true;
  }

  retryFailed(): void {
    for (const [id, cursor] of this.cursors) {
      if (!cursor.failed) continue;
      cursor.failed = false;
      cursor.noNewPages = 0;
      if (id !== this.viewerId && this.isFollowing(id)) this.pendingParents.push(id);
    }
  }

  applyLocalFollow(id: string, desired: boolean): void {
    if (!isPubkyIdentifier(id) || id === this.viewerId || this.isFollowing(id) === desired) return;
    this.localIntent.set(id, desired);
    if (desired) {
      // A person reintroduced to the direct circle gets a fresh two-hop read.
      // Do not present an older, previously removed subtree as current membership.
      const cursor = this.cursors.get(id);
      if (cursor?.complete) {
        this.cursors.set(id, newCursor());
        this.following.delete(id);
      }
      this.ensureParent(id);
    }
    this.revision += 1;
  }

  copyLocalIntentsFrom(previous: WorldSocialGraph): void {
    for (const [id, desired] of previous.localIntent) {
      this.localIntent.set(id, desired);
      if (desired) this.ensureParent(id);
    }
    for (const [id, profile] of previous.profiles) this.profiles.set(id, profile);
    this.revision += 1;
  }

  updateProfiles(people: WorldPerson[]): void {
    let changed = false;
    for (const person of people) {
      const previous = this.profiles.get(person.id);
      if (
        previous?.name === person.name &&
        previous?.bio === person.bio &&
        previous?.avatarUrl === person.avatarUrl &&
        previous?.profileLoaded === person.profileLoaded
      )
        continue;
      this.profiles.set(person.id, person);
      changed = true;
    }
    if (changed) this.revision += 1;
  }

  snapshot(selectedId: string | null): WorldGraphSnapshot {
    const selection = selectedId && isPubkyIdentifier(selectedId) && selectedId !== this.viewerId ? selectedId : null;
    if (
      this.snapshotRevision === this.revision &&
      this.retainedId === (selection && !this.reachableIds.has(selection) ? selection : null)
    )
      return this.snapshotValue;
    const direct = this.directIds();
    const parents = new Map<string, string[]>();
    const relationships: WorldRelationship[] = [];
    for (const id of direct) {
      relationships.push({ from: this.viewerId, to: id, label: 'follows' });
      for (const child of this.following.get(id) ?? []) {
        if (child === id) continue;
        relationships.push({ from: id, to: child, label: 'follows' });
        if (child === this.viewerId) continue;
        const provenance = parents.get(child) ?? [];
        provenance.push(id);
        parents.set(child, provenance);
      }
    }
    const all = new Set([...direct, ...parents.keys()]);
    const discoveryCount = all.size - direct.size;
    this.reachableIds = new Set(all);
    const retain = selection && !all.has(selection) ? selection : null;
    if (retain) all.add(retain);
    const people = Array.from(
      all,
      (id): WorldPerson => ({
        ...(this.profiles.get(id) ?? worldPersonPlaceholder(id)),
        degree: direct.has(id) ? 1 : 2,
        parentIds: parents.get(id) ?? [],
      }),
    );
    this.snapshotValue = { people, relationships, directCount: direct.size, discoveryCount };
    this.snapshotRevision = this.revision;
    this.retainedId = retain;
    return this.snapshotValue;
  }

  private ensureParent(id: string): void {
    if (id === this.viewerId) return;
    const cursor = this.cursors.get(id);
    if (!cursor) this.cursors.set(id, newCursor());
    if (!cursor || (!cursor.complete && !cursor.inFlight)) this.pendingParents.push(id);
  }
}
