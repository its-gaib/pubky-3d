import { describe, expect, it } from 'vitest';
import { userApi } from '@/services/nexus/user/user.api';
import { normalizeWorldProfileTags, worldProfileTagParams } from './useWorldSocial.tags';

describe('world profile-tag prefixes', () => {
  it('uses the real anonymous user-tag URL with the verified production API limits', () => {
    const id = 'y'.repeat(52);
    const url = new URL(userApi.tags(worldProfileTagParams(id)));
    expect(url.pathname).toBe(`/v0/user/${id}/tags`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ skip_tags: '0', limit_tags: '20', limit_taggers: '1' });
    // depth without viewer_id and limit_taggers=0 both fail the real public API.
    expect(url.searchParams.has('viewer_id')).toBe(false);
    expect(url.searchParams.has('depth')).toBe(false);
  });

  it('keeps real positive counts, sanitizes labels, and deduplicates without inflating popularity', () => {
    expect(
      normalizeWorldProfileTags([
        { label: ' Syn\u0000onym ', taggers_count: 4, taggers: ['discard-this-id'] },
        { label: 'ＳＹＮＯＮＹＭ', taggers_count: 7 },
        { label: '__proto__', taggers_count: 3 },
        { label: 'no-current-taggers', taggers_count: 0 },
        { label: '🐯', taggers_count: 1 },
      ]),
    ).toEqual([
      { label: 'Synonym', count: 7 },
      { label: '__proto__', count: 3 },
      { label: '🐯', count: 1 },
    ]);
  });

  it('distinguishes a known empty prefix from malformed data and rejects oversized work', () => {
    expect(normalizeWorldProfileTags([])).toEqual([]);
    expect(normalizeWorldProfileTags({ tags: [] })).toBeNull();
    expect(normalizeWorldProfileTags([{ label: 'x'.repeat(100_000), taggers_count: 1 }])).toBeNull();
    expect(normalizeWorldProfileTags([{ label: 'x'.repeat(21), taggers_count: 1 }])).toBeNull();
    expect(normalizeWorldProfileTags([{ label: '\u0000\u202e', taggers_count: 1 }])).toBeNull();
    const rows = Array.from({ length: 20 }, (_, index) => ({ label: `tag${index}`, taggers_count: index + 1 }));
    expect(normalizeWorldProfileTags(rows)).toHaveLength(20);
    expect(normalizeWorldProfileTags([...rows, { label: 'overflow', taggers_count: 1 }])).toBeNull();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, '4', undefined])(
    'does not classify a profile using an invalid popularity count: %s',
    (taggers_count) => {
      expect(normalizeWorldProfileTags([{ label: 'synonym', taggers_count }])).toBeNull();
    },
  );
});
