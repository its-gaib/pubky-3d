import { TAG_MAX_LENGTH } from '@/config/posts';
import type { WorldPerson } from '@/libs/world/world-types';
import type { TUserTagsParams } from '@/services/nexus/user/user.types';

export const WORLD_SOCIAL_TAG_LIMIT = 20;
type ProfileTags = NonNullable<WorldPerson['profileTags']>;

/** Anonymous profile labels only. Nexus requires at least one tagger ID; discard it. */
export function worldProfileTagParams(userId: string): TUserTagsParams {
  return { user_id: userId, skip_tags: 0, limit_tags: WORLD_SOCIAL_TAG_LIMIT, limit_taggers: 1 };
}

/** A malformed prefix is unavailable, not evidence that the profile is untagged. */
export function normalizeWorldProfileTags(value: unknown): ProfileTags | null {
  if (!Array.isArray(value) || value.length > WORLD_SOCIAL_TAG_LIMIT) return null;
  const tags = new Map<string, ProfileTags[number]>();
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.label !== 'string' ||
      entry.label.length > TAG_MAX_LENGTH * 4 ||
      !Number.isSafeInteger(entry.taggers_count) ||
      entry.taggers_count < 0
    )
      return null;
    // Bound the raw input before Unicode work; never render control characters.
    const label = entry.label
      .normalize('NFKC')
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .trim();
    if (!label || Array.from(label).length > TAG_MAX_LENGTH) return null;
    if (entry.taggers_count === 0) continue;
    const key = label.toLowerCase();
    const previous = tags.get(key);
    tags.set(key, { label: previous?.label ?? label, count: Math.max(previous?.count ?? 0, entry.taggers_count) });
  }
  return Array.from(tags.values()).sort(
    (left, right) => right.count - left.count || left.label.toLowerCase().localeCompare(right.label.toLowerCase()),
  );
}

export function equalWorldProfileTags(left: WorldPerson['profileTags'], right: WorldPerson['profileTags']): boolean {
  return (
    left === right ||
    (!!left &&
      !!right &&
      left.length === right.length &&
      left.every((tag, index) => tag.label === right[index].label && tag.count === right[index].count))
  );
}
