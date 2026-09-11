import type { WorldAvatarIdentity, WorldData, WorldSocialView } from '@/libs/world/world-types';

export interface UseWorldAvatarIdentitiesOptions {
  data: WorldData;
  socialView: WorldSocialView;
  socialViewerId: string | null;
  /** The open profile/directory keeps its existing priority over background head images. */
  priorityProfileIds: string[];
  ensureProfiles: (ids: string[]) => Promise<void>;
}

export interface WorldAvatarIdentities {
  viewer: WorldAvatarIdentity | null;
  people: WorldAvatarIdentity[];
}
