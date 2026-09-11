import type { WorldPerson, WorldPost, WorldRelationship } from '@/libs/world/world-types';

export type WorldSocialStatus = 'inactive' | 'signed-out' | 'loading' | 'paused' | 'ready' | 'error';
export type WorldProfileStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface WorldSocialProfile {
  person: WorldPerson | null;
  latestPost: WorldPost | null;
  status: WorldProfileStatus;
  error: string | null;
}

export interface WorldSocialFollow {
  pending: boolean;
  error: string | null;
  isFollowing: boolean;
  canFollow: boolean;
  toggle: () => Promise<void>;
  retry: () => Promise<void>;
}

export interface UseWorldSocialOptions {
  enabled: boolean;
  selectedId: string | null;
  directoryIds?: string[];
}

export interface UseWorldSocialResult {
  people: WorldPerson[];
  relationships: WorldRelationship[];
  viewerId: string | null;
  status: WorldSocialStatus;
  directCount: number;
  discoveryCount: number;
  complete: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Shares the selected-profile queue and its existing per-request limit. */
  ensureProfiles: (ids: string[]) => Promise<void>;
  profile: WorldSocialProfile;
  follow: WorldSocialFollow;
}

export interface WorldGraphSnapshot {
  people: WorldPerson[];
  relationships: WorldRelationship[];
  directCount: number;
  discoveryCount: number;
}
