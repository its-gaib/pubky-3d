import { describe, expect, it } from 'vitest';
import { WORLD_ANCHORS } from './world-layout';
import {
  layoutSocialPeople,
  SOCIAL_CENTER_CLEARANCE,
  SOCIAL_PAGE_SIZE,
  SOCIAL_PLAZA_RADIUS,
  SOCIAL_SECTOR_COUNT,
  SOCIAL_SECTOR_DIRECTORY_PAGE_SIZE,
  socialPersonPreviewName,
  socialPersonSector,
  socialSector,
  socialSectorCountLabel,
  socialSectorFollowingPage,
  socialSectorPreview,
  socialSectorProfileIds,
  socialSectors,
  socialViewForPerson,
  socialViewPageCount,
  socialViewPeople,
} from './world-social-layout';
import type { WorldPerson } from './world-types';

function person(id: string, degree: 1 | 2 = 1, parentIds: string[] = []): WorldPerson {
  return { id, name: id, degree, parentIds, profileLoaded: false, position: [0, 0], color: '#C8FF03', bio: '' };
}

function publicPerson(index: number): WorldPerson {
  return { ...person(index.toString(36).padStart(52, '0')), name: `Friend ${index}`, profileLoaded: true };
}

describe('scalable social plaza layout', () => {
  it('packs tiny and full pages without overlaps, keeping the center and outer walks clear', () => {
    for (const count of [0, 1, 6, 24, SOCIAL_PAGE_SIZE]) {
      const people = Array.from({ length: count }, (_, index) => person(`person-${index}`));
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

  it('keeps sector and page membership deterministic under different response orders', () => {
    const people = Array.from({ length: 150 }, (_, index) => person(`person-${index}`));
    const view = { sector: socialSector(people[0].id), page: 0 };
    expect(socialViewPeople([...people].reverse(), view)).toEqual(socialViewPeople(people, view));
    expect(layoutSocialPeople([...people].reverse(), view)).toEqual(layoutSocialPeople(people, view));
  });

  it('represents a large graph by honest counts while every placeholder remains reachable on a bounded page', () => {
    const largeGraph = Array.from({ length: 12000 }, (_, index) => person(`person-${index}`));
    expect(socialSectors(largeGraph).reduce((count, sector) => count + sector.direct + sector.secondary, 0)).toBe(
      12000,
    );
    const people = largeGraph.slice(0, 2048);
    expect(socialViewPeople(people, { sector: null, page: 0 })).toEqual([]);
    expect(socialViewPageCount(people, { sector: null, page: 0 })).toBe(1);
    expect(socialSectors(people).reduce((count, sector) => count + sector.direct + sector.secondary, 0)).toBe(
      people.length,
    );
    const reached = new Set<string>();
    for (let sector = 0; sector < SOCIAL_SECTOR_COUNT; sector++) {
      const pageCount = socialViewPageCount(people, { sector, page: 0 });
      for (let page = 0; page < pageCount; page++) {
        const visible = socialViewPeople(people, { sector, page });
        expect(visible.length).toBeLessThanOrEqual(SOCIAL_PAGE_SIZE);
        visible.forEach((entry) => reached.add(entry.id));
      }
    }
    expect(reached.size).toBe(people.length);
    for (const index of [0, 91, 1729, people.length - 1]) {
      const view = socialViewForPerson(people, people[index].id);
      expect(view).not.toBeNull();
      if (view) expect(socialViewPeople(people, view).some((entry) => entry.id === people[index].id)).toBe(true);
    }
  });

  it('deduplicates shared discoveries, prioritizes direct follows, and preserves real parent provenance', () => {
    const direct = person('friend');
    const discovery = person('shared', 2, ['z-parent', 'a-parent']);
    expect(socialPersonSector(discovery)).toBe(socialSector('a-parent'));
    expect(socialPersonSector({ ...discovery, parentIds: ['a-parent', 'z-parent'] })).toBe(
      socialPersonSector(discovery),
    );
    const people = [person('friend', 2, ['another']), discovery, direct];
    const visible = socialViewPeople(people, { sector: null, page: 0 });
    expect(visible).toHaveLength(2);
    expect(visible[0]).toEqual(direct);
    expect(visible[1].parentIds).toEqual(['z-parent', 'a-parent']);
  });

  it('keeps unaffected slots stable and rescales a demoted person without deleting their identity', () => {
    const people = [person('a'), person('b'), person('c')];
    const before = layoutSocialPeople(people, { sector: null, page: 0 });
    const after = layoutSocialPeople(
      [people[0], person('b', 2, ['a']), people[2], person('d')],
      { sector: null, page: 0 },
      new Map(before.map((entry) => [entry.person.id, entry])),
    );
    expect(after.find((entry) => entry.person.id === 'a')?.position).toEqual(
      before.find((entry) => entry.person.id === 'a')?.position,
    );
    const demoted = after.find((entry) => entry.person.id === 'b');
    expect(demoted?.scale).toBeCloseTo(0.5);
    expect(before.find((entry) => entry.person.id === 'b')?.scale).toBeCloseTo(1.15);
    expect(demoted?.sector).toBe(socialSector('a'));
  });

  it('clamps stale page selections and handles empty, missing and invalid views safely', () => {
    const people = [person('only')];
    expect(socialViewPeople(people, { sector: socialSector('only'), page: 999 })).toEqual(people);
    expect(socialViewPeople(people, { sector: null, page: Number.NaN })).toEqual(people);
    expect(socialViewPeople(people, { sector: 100, page: -3 })).toEqual(people);
    expect(socialViewPageCount([], { sector: 0, page: 5 })).toBe(1);
    expect(socialViewForPerson(people, 'missing')).toBeNull();
  });

  it('previews a stable pair of real follows per sector while retaining every person in the counts', () => {
    const people = Array.from({ length: 2000 }, (_, index) => publicPerson(index));
    const sectors = socialSectors([...people, { ...people[0], degree: 2, parentIds: [people[1].id] }]);
    expect(sectors.reduce((total, sector) => total + sector.direct + sector.secondary, 0)).toBe(2000);
    const ids = socialSectorProfileIds(sectors);
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
    for (const sector of sectors) {
      const members = people.filter((person) => socialSector(person.id) === sector.sector);
      const expected = members
        .map((person) => person.id)
        .sort()
        .slice(0, 2);
      expect(sector.representatives.map((person) => person.id)).toEqual(expected);
      expect(sector.direct).toBe(members.length);
      expect(socialSectorCountLabel(sector)).toBe(`${members.length} people · ${members.length} following`);
    }
    const renamed = [...people]
      .reverse()
      .map((person) => ({ ...person, name: `Renamed ${person.id}`, profileLoaded: false }));
    expect(socialSectorProfileIds(socialSectors(renamed))).toEqual(ids);
  });

  it('labels fallback discoveries honestly and never requests their profiles for sector previews', () => {
    const follow = publicPerson(1);
    const discoveries = [publicPerson(2), publicPerson(3)].map((person) => ({
      ...person,
      degree: 2 as const,
      parentIds: [follow.id],
    }));
    const index = socialSector(follow.id);
    const fallback = socialSectors(discoveries)[index];
    expect(socialSectorPreview(fallback)).toBe('Discoveries include Friend 2 · Friend 3');
    expect(socialSectorCountLabel(fallback)).toBe('2 people · 0 following');
    expect(socialSectorProfileIds(socialSectors(discoveries))).toEqual([]);
    const followed = socialSectors([...discoveries, follow])[index];
    expect(socialSectorPreview(followed)).toBe('Includes Friend 1');
    expect(socialSectorCountLabel(followed)).toBe('3 people · 1 following');
    expect(socialSectorProfileIds(socialSectors([...discoveries, follow]))).toEqual([follow.id]);
  });

  it('bounds plain names, keeps placeholder previews truthful, and rejects invalid profile IDs', () => {
    const follow = publicPerson(4);
    const index = socialSector(follow.id);
    const sector = socialSectors([{ ...follow, name: `Avery\n\u202E${'x'.repeat(100)}` }])[index];
    const preview = socialSectorPreview(sector);
    expect(preview).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(preview.slice('Includes '.length).length).toBeLessThanOrEqual(48);
    const placeholder = socialSectors([{ ...follow, profileLoaded: false }])[index];
    expect(socialSectorPreview(placeholder)).toBe(`Includes ${follow.id.slice(0, 6)}…${follow.id.slice(-4)}`);
    expect(socialSectorProfileIds(socialSectors([person('<not-a-public-key>'), follow, follow]))).toEqual([follow.id]);
  });

  it('makes every valid direct follow reachable before entering a large sector without hydrating the whole graph', () => {
    const people = Array.from({ length: 2400 }, (_, index) => publicPerson(index));
    const discovery = { ...publicPerson(3000), degree: 2 as const, parentIds: [people[0].id] };
    const sectors = socialSectors([
      discovery,
      ...people,
      { ...people[0], degree: 2, parentIds: [people[1].id] },
      { ...people[1], degree: undefined },
      people[2],
      person('<invalid-key>'),
    ]);
    const reached: string[] = [];
    for (const sector of sectors) {
      const expected = people
        .filter((entry) => socialSector(entry.id) === sector.sector)
        .map((entry) => entry.id)
        .sort();
      expect(sector.following.map((entry) => entry.id)).toEqual(expected);
      const first = socialSectorFollowingPage(sector, 0);
      for (let page = 0; page < first.pageCount; page++) {
        const preview = socialSectorFollowingPage(sector, page);
        expect(preview.people.length).toBeLessThanOrEqual(SOCIAL_SECTOR_DIRECTORY_PAGE_SIZE);
        expect(preview.total).toBe(expected.length);
        expect(preview.end - preview.start + 1).toBe(preview.people.length);
        reached.push(...preview.people.map((entry) => entry.id));
      }
    }
    expect(reached.sort()).toEqual(people.map((entry) => entry.id).sort());
    expect(new Set(reached).size).toBe(people.length);
    expect(socialSectorProfileIds(sectors)).toHaveLength(16);
    const renamed = socialSectors(
      [...people].reverse().map((entry) => ({ ...entry, name: 'Changed', profileLoaded: false })),
    );
    sectors.forEach((sector, index) => {
      expect(renamed[index].following.map((entry) => entry.id)).toEqual(sector.following.map((entry) => entry.id));
    });
  });

  it('clamps preview pages after unfollows and keeps unknown profiles readable without invented names', () => {
    const follow = { ...publicPerson(4), profileLoaded: false };
    const sector = socialSectors([follow])[socialSector(follow.id)];
    for (const page of [-10, Number.NaN, Number.POSITIVE_INFINITY, 999]) {
      expect(socialSectorFollowingPage(sector, page)).toMatchObject({
        people: [follow],
        total: 1,
        page: 0,
        pageCount: 1,
        start: 1,
        end: 1,
      });
    }
    expect(socialSectorFollowingPage(socialSectors([])[0], 12)).toMatchObject({
      people: [],
      total: 0,
      page: 0,
      pageCount: 1,
      start: 0,
      end: 0,
    });
    expect(socialPersonPreviewName(follow)).toBe(`${follow.id.slice(0, 6)}…${follow.id.slice(-4)}`);
    const name = socialPersonPreviewName({ ...follow, profileLoaded: true, name: `Avery\n\u202E${'x'.repeat(100)}` });
    expect(name.length).toBeLessThanOrEqual(48);
    expect(name).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  });
});
