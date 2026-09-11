import { describe, expect, it } from 'vitest';
import { WORLD_ANCHORS } from './world-layout';
import {
  layoutSocialPeople,
  resolveSocialView,
  SOCIAL_CENTER_CLEARANCE,
  SOCIAL_COMMONS_KEY,
  SOCIAL_PAGE_SIZE,
  SOCIAL_PLAZA_RADIUS,
  SOCIAL_SECTOR_COUNT,
  SOCIAL_SECTOR_DIRECTORY_PAGE_SIZE,
  socialAvatarPeople,
  socialPersonPreviewName,
  socialSectorCountLabel,
  socialSectorFollowingPage,
  socialSectorForView,
  socialSectorPreview,
  socialSectorProfileIds,
  socialSectorRepresentatives,
  socialSectors,
  socialViewForPerson,
  socialViewPageCount,
  socialViewPeople,
} from './world-social-layout';
import type { WorldPerson } from './world-types';

function person(index: number, labels: string[] = ['synonym']): WorldPerson {
  return {
    id: index.toString(36).padStart(52, '0'),
    name: `Friend ${index}`,
    degree: 1,
    profileLoaded: true,
    profileTags: labels.map((label) => ({ label, count: 10 })),
    profileTagsStatus: 'loaded',
    parentIds: [],
    position: [0, 0],
    color: '#c8ff03',
    bio: '',
  };
}
const members = (people: WorldPerson[], key: string) =>
  socialSectors(people)
    .find((sector) => sector.key === key)
    ?.members.map((entry) => entry.id) ?? [];

describe('profile-tag social neighborhoods', () => {
  it('selects at most 32 stable actual overview members in central then satellite order', () => {
    const people = Array.from({ length: 8 }, (_, sector) =>
      Array.from({ length: 17 }, (_, index) => ({
        ...person(sector * 20 + index, sector < 7 ? [`group-${sector}`] : []),
        degree: index < 14 ? (1 as const) : (2 as const),
      })),
    ).flat();
    const representatives = socialAvatarPeople(people, { sector: null, page: 0 });
    expect(representatives).toHaveLength(32);
    expect(new Set(representatives.map((entry) => entry.id)).size).toBe(32);
    expect(representatives.map((entry) => entry.id)).toEqual(
      Array.from({ length: 8 }, (_, sector) => [0, 14, 15, 16].map((index) => person(sector * 20 + index).id)).flat(),
    );
    const enriched = people
      .map((entry, index) => ({
        ...entry,
        name: `Renamed ${index}`,
        profileLoaded: !entry.profileLoaded,
        avatarUrl: index % 2 ? `https://nexus.pubky.app/static/avatar/${entry.id}` : undefined,
      }))
      .reverse();
    expect(socialAvatarPeople(enriched, { sector: null, page: 0 }).map((entry) => entry.id)).toEqual(
      representatives.map((entry) => entry.id),
    );
  });

  it('uses a distinct secondary as central when no direct member exists and preserves individual pages', () => {
    const secondary = Array.from({ length: 5 }, (_, index) => ({ ...person(index), degree: 2 as const }));
    const representatives = socialSectorRepresentatives(socialSectors(secondary.reverse())[0]);
    expect(representatives.central?.id).toBe(person(0).id);
    expect(representatives.satellites.map((entry) => entry.id)).toEqual([1, 2, 3].map((index) => person(index).id));
    expect(socialSectorRepresentatives(socialSectors([])[0])).toEqual({ central: null, satellites: [] });
    expect(socialAvatarPeople(secondary, { sector: null, page: 0 })).toEqual(
      socialViewPeople(secondary, { sector: null, page: 0 }),
    );
    const people = Array.from({ length: 220 }, (_, index) => person(index));
    const view = { sector: 0, sectorKey: 'tag:synonym', page: 1 };
    expect(socialAvatarPeople(people, view)).toEqual(socialViewPeople(people, view));
    expect(socialAvatarPeople(people, view)).toHaveLength(SOCIAL_PAGE_SIZE);
  });

  it('forms a real Synonym neighborhood without letting a broad Bitcoin tag swallow the more specific groups', () => {
    const team = Array.from({ length: 12 }, (_, index) => person(index, ['bitcoin', 'synonym']));
    const artists = Array.from({ length: 3 }, (_, index) => person(index + 20, ['bitcoin', 'art']));
    const bitcoin = Array.from({ length: 4 }, (_, index) => person(index + 30, ['bitcoin']));
    const people = [...team, ...artists, ...bitcoin];
    const sectors = socialSectors(people);
    expect(sectors.map((sector) => sector.label)).toEqual(['Art', 'Bitcoin', 'Synonym']);
    expect(members(people, 'tag:synonym')).toEqual(team.map((entry) => entry.id));
    expect(members(people, 'tag:art')).toEqual(artists.map((entry) => entry.id));
    expect(members(people, 'tag:bitcoin')).toEqual(bitcoin.map((entry) => entry.id));
    expect(sectors.reduce((count, sector) => count + sector.direct, 0)).toBe(people.length);
    expect(sectors.every((sector) => sector.members.length > 0)).toBe(true);
  });

  it('resolves overlapping tags by support and positive endorsement counts, with deterministic case-insensitive ties', () => {
    const people = [person(0), person(1)].map((entry) => ({
      ...entry,
      profileTags: [
        { label: 'bitcoin', count: 15 },
        { label: 'Synonym', count: 32 },
        { label: 'SYNONYM', count: 8 },
        { label: 'Ｓｙｎｏｎｙｍ', count: 2 },
      ],
    }));
    const sectors = socialSectors(people);
    expect(sectors).toHaveLength(1);
    expect(sectors[0].key).toBe('tag:synonym');
    expect(sectors[0].direct).toBe(2);
    const reversed = [...people]
      .reverse()
      .map((entry) => ({ ...entry, profileTags: [...entry.profileTags].reverse() }));
    expect(socialSectors(reversed).map((sector) => [sector.key, sector.members.map((entry) => entry.id)])).toEqual(
      sectors.map((sector) => [sector.key, sector.members.map((entry) => entry.id)]),
    );
    const equal = [person(2, ['beta', 'alpha'])];
    expect(socialSectors(equal)[0].key).toBe('tag:alpha');
  });

  it('treats arbitrary labels as bounded plain data and never creates groups from zero or malformed counts', () => {
    const prototype = person(0, ['__proto__']);
    const constructor = person(1, ['constructor']);
    const invalid = {
      ...person(2),
      profileTags: [
        { label: 'fake', count: 0 },
        { label: 'bad', count: Number.NaN },
        { label: 'negative', count: -1 },
        { label: 'huge', count: Number.POSITIVE_INFINITY },
        { label: 'x'.repeat(100000), count: 1 },
      ],
    };
    const plain = { ...person(3), profileTags: [{ label: 'art\n\u202Eclub', count: 3 }] };
    const sectors = socialSectors([prototype, constructor, invalid, plain]);
    expect(sectors.some((sector) => sector.key === 'tag:__proto__')).toBe(true);
    expect(sectors.some((sector) => sector.key === 'tag:constructor')).toBe(true);
    expect(sectors.flatMap((sector) => sector.members)).toHaveLength(4);
    expect(sectors.find((sector) => sector.key === SOCIAL_COMMONS_KEY)?.members).toEqual([invalid]);
    for (const sector of sectors) {
      expect(sector.label.length).toBeLessThanOrEqual(48);
      expect(sector.label).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    }
  });

  it('uses a discovery’s own tags or real direct parents without inventing an extra hop', () => {
    const synonym = person(0);
    const art = person(1, ['art']);
    const inherited = { ...person(2, []), degree: 2 as const, parentIds: [synonym.id] };
    const own = { ...person(3, ['art']), degree: 2 as const, parentIds: [synonym.id] };
    const shared = { ...person(4, []), degree: 2 as const, parentIds: [synonym.id, art.id, synonym.id] };
    const unrelated = { ...person(5, []), degree: 2 as const, parentIds: [inherited.id] };
    const people = [synonym, art, inherited, own, shared, unrelated];
    expect(members(people, 'tag:synonym')).toContain(inherited.id);
    expect(members(people, 'tag:art')).toEqual([art.id, own.id, shared.id]);
    expect(members(people, SOCIAL_COMMONS_KEY)).toEqual([unrelated.id]);
    expect(
      socialSectors([...people, { ...synonym, degree: 2, parentIds: [art.id] }]).flatMap((sector) => sector.members),
    ).toHaveLength(6);
    expect(
      members(
        people.map((entry) => ({ ...entry, parentIds: [...(entry.parentIds ?? [])].reverse() })),
        'tag:art',
      ),
    ).toEqual(members(people, 'tag:art'));
  });

  it('keeps every direct follow reachable in complete previews and bounded 3D pages for a large graph', () => {
    const labels = ['art', 'bitcoin', 'chess', 'dev', 'music', 'privacy', 'synonym', 'travel', 'writing', 'zines'];
    const people = Array.from({ length: 2600 }, (_, index) => person(index, [labels[index % labels.length]]));
    const sectors = socialSectors([...people, people[0], { ...people[1], degree: 2 }]);
    expect(sectors.length).toBeLessThanOrEqual(SOCIAL_SECTOR_COUNT);
    expect(sectors.some((sector) => sector.key === SOCIAL_COMMONS_KEY)).toBe(true);
    expect(sectors.every((sector) => sector.members.length > 0)).toBe(true);
    const reached = new Set<string>();
    const rendered = new Set<string>();
    for (const sector of sectors) {
      const preview = socialSectorFollowingPage(sector, 0);
      for (let page = 0; page < preview.pageCount; page++) {
        const current = socialSectorFollowingPage(sector, page);
        expect(current.people.length).toBeLessThanOrEqual(SOCIAL_SECTOR_DIRECTORY_PAGE_SIZE);
        expect(current.end - current.start + 1).toBe(current.people.length);
        current.people.forEach((entry) => reached.add(entry.id));
      }
      const view = { sector: sector.sector, sectorKey: sector.key, page: 0 };
      for (let page = 0; page < socialViewPageCount(people, view); page++) {
        const current = socialViewPeople(people, { ...view, page });
        expect(current.length).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
        current.forEach((entry) => rendered.add(entry.id));
      }
    }
    expect(reached.size).toBe(people.length);
    expect(rendered).toEqual(reached);
    expect(socialViewPeople(people, { sector: null, page: 0 })).toEqual([]);
    expect(layoutSocialPeople(people, { sector: null, page: 0 })).toEqual([]);
    expect(socialSectorProfileIds(sectors)).toHaveLength(16);
    const finalView = socialViewForPerson(people, people.at(-1)!.id)!;
    expect(socialViewPeople(people, finalView).some((entry) => entry.id === people.at(-1)!.id)).toBe(true);
  });

  it('keeps an open tag selected when new tags change its numeric slot and returns safely if that tag disappears', () => {
    const team = Array.from({ length: 110 }, (_, index) => person(index));
    const selected = { sector: 0, sectorKey: 'tag:synonym', page: 1 };
    const expanded = [...team, person(200, ['art'])];
    const resolved = resolveSocialView(socialSectors(expanded), selected);
    expect(resolved).toEqual({ sector: 1, sectorKey: 'tag:synonym', page: 1 });
    expect(socialViewPeople(expanded, selected).map((entry) => entry.id)).toEqual(
      team.slice(96).map((entry) => entry.id),
    );
    expect(socialSectorForView(socialSectors(expanded), selected)?.label).toBe('Synonym');
    const changed = team.map((entry) => ({ ...entry, profileTags: [{ label: 'bitcoin', count: 1 }] }));
    expect(resolveSocialView(socialSectors(changed), selected)).toEqual({ sector: null, page: 0 });
    expect(socialSectorForView(socialSectors(changed), selected)).toBeUndefined();
    expect(socialSectors(changed)[0].members).toHaveLength(team.length);
  });

  it('distinguishes pending and unavailable tags from profiles known to be untagged', () => {
    const people = [
      { ...person(0), profileTags: undefined, profileTagsStatus: undefined },
      { ...person(1), profileTags: undefined, profileTagsStatus: 'error' as const },
      person(2, []),
      { ...person(3), profileTags: [{ label: 'synonym', count: 0 }] },
    ];
    const sector = socialSectors(people)[0];
    expect(sector.key).toBe(SOCIAL_COMMONS_KEY);
    expect(sector.tagStatus).toEqual({ pending: 1, unavailable: 1, untagged: 2, other: 0 });
    expect(sector.following).toHaveLength(4);
  });

  it('packs tiny and full pages without overlaps, keeping the center and outer paths clear', () => {
    for (const count of [0, 1, 6, 24, SOCIAL_PAGE_SIZE]) {
      const people = Array.from({ length: count }, (_, index) => person(index));
      const layout = layoutSocialPeople(people, { sector: null, page: 0 });
      expect(layout).toHaveLength(count);
      layout.forEach((entry, index) => {
        const distance = Math.hypot(
          entry.position[0] - WORLD_ANCHORS.plaza[0],
          entry.position[1] - WORLD_ANCHORS.plaza[1],
        );
        expect(distance).toBeGreaterThan(SOCIAL_CENTER_CLEARANCE);
        expect(distance + 1.5).toBeLessThan(SOCIAL_PLAZA_RADIUS);
        for (const other of layout.slice(index + 1))
          expect(
            Math.hypot(entry.position[0] - other.position[0], entry.position[1] - other.position[1]),
          ).toBeGreaterThan(3.8);
      });
    }
  });

  it('keeps layout deterministic across response order and rescales an unfollowed person without losing identity', () => {
    const people = [person(0), person(1), person(2, ['art'])];
    const before = layoutSocialPeople(people, { sector: null, page: 0 });
    expect(layoutSocialPeople([...people].reverse(), { sector: null, page: 0 })).toEqual(before);
    const updated = [people[0], { ...people[1], degree: 2 as const, parentIds: [people[0].id] }, people[2]];
    const after = layoutSocialPeople(
      updated,
      { sector: null, page: 0 },
      new Map(before.map((entry) => [entry.person.id, entry])),
    );
    expect(after.find((entry) => entry.person.id === people[0].id)?.position).toEqual(before[0].position);
    expect(after.find((entry) => entry.person.id === people[1].id)?.scale).toBeCloseTo(0.5);
    expect(before.find((entry) => entry.person.id === people[1].id)?.scale).toBeCloseTo(1.15);
  });

  it('clamps stale pages and preserves truthful bounded profile names in previews', () => {
    const only = { ...person(0), profileLoaded: false };
    const sector = socialSectors([only])[0];
    for (const page of [-3, Number.NaN, Number.POSITIVE_INFINITY, 999])
      expect(socialSectorFollowingPage(sector, page)).toMatchObject({
        people: [only],
        page: 0,
        pageCount: 1,
        total: 1,
        start: 1,
        end: 1,
      });
    expect(socialSectorFollowingPage(socialSectors([])[0], 999)).toMatchObject({
      people: [],
      page: 0,
      total: 0,
      start: 0,
      end: 0,
    });
    expect(socialSectorCountLabel(sector)).toBe('1 person · 1 following');
    expect(socialSectorPreview(sector)).toBe(`Includes ${only.id.slice(0, 6)}…${only.id.slice(-4)}`);
    const label = socialPersonPreviewName({ ...only, profileLoaded: true, name: `Avery\u202E\n${'x'.repeat(100)}` });
    expect(label.length).toBeLessThanOrEqual(48);
    expect(label).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(socialSectorProfileIds(socialSectors([{ ...only, id: '<invalid>' }, only, only]))).toEqual([only.id]);
    expect(socialViewForPerson([only], 'missing')).toBeNull();
  });
});
