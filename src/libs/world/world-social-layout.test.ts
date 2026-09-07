import { describe, expect, it } from 'vitest';
import { WORLD_ANCHORS } from './world-layout';
import {
  layoutSocialPeople,
  SOCIAL_CENTER_CLEARANCE,
  SOCIAL_PAGE_SIZE,
  SOCIAL_PLAZA_RADIUS,
  SOCIAL_SECTOR_COUNT,
  socialPersonSector,
  socialSector,
  socialSectors,
  socialViewForPerson,
  socialViewPageCount,
  socialViewPeople,
} from './world-social-layout';
import type { WorldPerson } from './world-types';

function person(id: string, degree: 1 | 2 = 1, parentIds: string[] = []): WorldPerson {
  return { id, name: id, degree, parentIds, profileLoaded: false, position: [0, 0], color: '#C8FF03', bio: '' };
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
});
