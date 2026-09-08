import { isPubkyIdentifier } from '@/libs/utils/utils';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import type { WorldPerson, WorldSocialView } from '@/libs/world/world-types';

export const SOCIAL_SECTOR_COUNT = 8;
export const SOCIAL_SECTOR_PREVIEW_SIZE = 2;
export const SOCIAL_PAGE_SIZE = 96;
export const SOCIAL_PLAZA_RADIUS = 32;
export const SOCIAL_CENTER_CLEARANCE = 7;

export interface SocialPersonPlacement {
  person: WorldPerson;
  position: [number, number];
  scale: number;
  sector: number;
}

export interface SocialSector {
  sector: number;
  direct: number;
  secondary: number;
  position: [number, number];
  representatives: WorldPerson[];
}

function hashId(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** Public IDs determine sectors, never a profile's editable name or network order. */
export function socialSector(id: string) {
  return hashId(id) % SOCIAL_SECTOR_COUNT;
}

function parentId(person: WorldPerson) {
  return person.degree === 2 && person.parentIds?.length
    ? person.parentIds.reduce((first, id) => (id < first ? id : first))
    : person.id;
}

/** Shared discoveries belong to one stable sector while retaining every real parent link. */
export function socialPersonSector(person: WorldPerson) {
  return socialSector(parentId(person));
}

function validSector(sector: number | null) {
  return sector !== null && Number.isInteger(sector) && sector >= 0 && sector < SOCIAL_SECTOR_COUNT ? sector : null;
}

function uniquePeople(people: readonly WorldPerson[]) {
  const byId = new Map<string, WorldPerson>();
  for (const person of people) {
    // A direct follow always wins over a duplicate discovery during a live update.
    if (!byId.has(person.id) || person.degree !== 2) byId.set(person.id, person);
  }
  return [...byId.values()];
}

function orderedPeople(people: readonly WorldPerson[], sector: number | null) {
  return uniquePeople(people)
    .filter((person) => sector === null || socialPersonSector(person) === sector)
    .sort((left, right) => {
      const tier = Number(left.degree === 2) - Number(right.degree === 2);
      return tier || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    });
}

export function socialViewPageCount(people: readonly WorldPerson[], view: WorldSocialView) {
  const sector = validSector(view.sector);
  if (sector === null) return 1;
  const count = uniquePeople(people).filter((person) => socialPersonSector(person) === sector).length;
  return Math.max(1, Math.ceil(count / SOCIAL_PAGE_SIZE));
}

/** Large whole-network views show honest count clusters, rather than an arbitrary sample. */
export function socialViewPeople(people: readonly WorldPerson[], view: WorldSocialView) {
  const sector = validSector(view.sector);
  const ordered = orderedPeople(people, sector);
  if (sector === null && ordered.length > SOCIAL_PAGE_SIZE) return [];
  const lastPage = Math.max(0, Math.ceil(ordered.length / SOCIAL_PAGE_SIZE) - 1);
  const page = Math.min(lastPage, Math.max(0, Number.isFinite(view.page) ? Math.trunc(view.page) : 0));
  return ordered.slice(page * SOCIAL_PAGE_SIZE, (page + 1) * SOCIAL_PAGE_SIZE);
}

/** Every loaded ID, including a profile placeholder, has a reachable sector and page. */
export function socialViewForPerson(people: readonly WorldPerson[], id: string): WorldSocialView | null {
  const unique = uniquePeople(people);
  const person = unique.find((value) => value.id === id);
  if (!person) return null;
  if (unique.length <= SOCIAL_PAGE_SIZE) return { sector: null, page: 0 };
  const sector = socialPersonSector(person);
  const index = orderedPeople(unique, sector).findIndex((value) => value.id === id);
  return { sector, page: Math.floor(index / SOCIAL_PAGE_SIZE) };
}

export function socialSectors(people: readonly WorldPerson[]): SocialSector[] {
  const sectors = Array.from({ length: SOCIAL_SECTOR_COUNT }, (_, sector) => {
    const angle = (sector / SOCIAL_SECTOR_COUNT) * Math.PI * 2 + Math.PI / 8;
    return {
      sector,
      direct: 0,
      secondary: 0,
      representatives: [] as WorldPerson[],
      position: [WORLD_ANCHORS.plaza[0] + Math.sin(angle) * 21, WORLD_ANCHORS.plaza[1] + Math.cos(angle) * 21] as [
        number,
        number,
      ],
    };
  });
  for (const person of uniquePeople(people)) {
    const sector = sectors[socialPersonSector(person)];
    if (person.degree === 2) sector.secondary++;
    else sector.direct++;
    if (!isPubkyIdentifier(person.id) || (person.degree !== 1 && person.degree !== 2)) continue;
    const hasDirect = sector.representatives[0]?.degree === 1;
    if (person.degree === 2 && hasDirect) continue;
    if (person.degree === 1 && !hasDirect) sector.representatives = [];
    sector.representatives.push(person);
    // Keep a fixed-size ID sample: profile names and response order cannot move the preview.
    sector.representatives.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    sector.representatives.length = Math.min(sector.representatives.length, SOCIAL_SECTOR_PREVIEW_SIZE);
  }
  return sectors;
}

/** At most 16 direct-follow profiles share the existing 20-ID hydration budget. */
export function socialSectorProfileIds(sectors: readonly SocialSector[]) {
  return [
    ...new Set(
      sectors.flatMap((sector) =>
        sector.representatives
          .filter((person) => person.degree === 1 && isPubkyIdentifier(person.id))
          .slice(0, SOCIAL_SECTOR_PREVIEW_SIZE)
          .map((person) => person.id),
      ),
    ),
  ].slice(0, SOCIAL_SECTOR_COUNT * SOCIAL_SECTOR_PREVIEW_SIZE);
}

export function socialSectorPreview(sector: SocialSector, nameLength = 48) {
  const limit = Math.max(1, Math.min(48, nameLength));
  const names = sector.representatives.map((person) => {
    const name =
      person.profileLoaded === false
        ? ''
        : person.name
            .slice(0, 48)
            .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    const label = name || `${person.id.slice(0, 6)}…${person.id.slice(-4)}`;
    return label.length > limit ? `${label.slice(0, Math.max(0, limit - 1))}…` : label;
  });
  if (!names.length) return 'People in this sector';
  return `${sector.representatives[0]?.degree === 1 ? 'Includes' : 'Discoveries include'} ${names.join(' · ')}`;
}

export function socialSectorCountLabel(sector: SocialSector) {
  const count = sector.direct + sector.secondary;
  return `${count.toLocaleString('en')} ${count === 1 ? 'person' : 'people'} · ${sector.direct.toLocaleString('en')} following`;
}

/** Bounded packing with a clear center. Existing slots survive ordinary additions/removals. */
export function layoutSocialPeople(
  people: readonly WorldPerson[],
  view: WorldSocialView,
  previous: ReadonlyMap<string, SocialPersonPlacement> = new Map(),
): SocialPersonPlacement[] {
  const visible = socialViewPeople(people, view);
  const radius = Math.min(29, Math.max(15, 7 + Math.sqrt(visible.length) * 2.4));
  const slots: [number, number][] = [];
  for (let ring = 0; ring < 6; ring++) {
    const distance = 8 + ring * 4;
    if (distance > radius) break;
    const count = Math.floor((Math.PI * 2 * distance) / 4);
    for (let index = 0; index < count; index++) {
      const angle = ((index + (ring % 2) * 0.5) / count) * Math.PI * 2;
      slots.push([
        WORLD_ANCHORS.plaza[0] + Math.sin(angle) * distance,
        WORLD_ANCHORS.plaza[1] + Math.cos(angle) * distance,
      ]);
    }
  }
  const occupied = new Set<number>();
  const positions = new Map<string, [number, number]>();
  const placements = new Map<string, SocialPersonPlacement>();
  function place(person: WorldPerson, preferred: readonly [number, number]) {
    let best = -1;
    let distance = Infinity;
    slots.forEach((slot, index) => {
      const candidate = (slot[0] - preferred[0]) ** 2 + (slot[1] - preferred[1]) ** 2;
      if (!occupied.has(index) && candidate < distance) {
        distance = candidate;
        best = index;
      }
    });
    if (best === -1) return;
    occupied.add(best);
    const position = slots[best];
    positions.set(person.id, position);
    placements.set(person.id, {
      person,
      position,
      sector: socialPersonSector(person),
      scale: person.degree === 2 ? 0.5 : 1.15,
    });
  }
  // Keep exact slots when count changes still leave that slot inside the new footprint.
  for (const person of visible) {
    const old = previous.get(person.id);
    if (!old || old.person.degree !== person.degree || old.sector !== socialPersonSector(person)) continue;
    const slot = slots.findIndex((value) => Math.hypot(value[0] - old.position[0], value[1] - old.position[1]) < 0.01);
    if (slot !== -1 && !occupied.has(slot)) place(person, old.position);
  }
  for (const person of visible) {
    if (placements.has(person.id)) continue;
    const parent = positions.get(parentId(person));
    const sectorAngle = ((socialPersonSector(person) + 0.5) / SOCIAL_SECTOR_COUNT) * Math.PI * 2;
    const jitter = (hashId(person.id + ':angle') / 0xffffffff - 0.5) * (Math.PI / SOCIAL_SECTOR_COUNT) * 0.75;
    // A selected sector has the full plaza available, so even its largest page remains legible.
    const angle = view.sector === null ? sectorAngle + jitter : (hashId(person.id) / 0xffffffff) * Math.PI * 2;
    const distance =
      person.degree === 2 ? radius - 1 : 8 + (radius - 10) * (hashId(person.id + ':radius') / 0xffffffff);
    const preferred: [number, number] =
      parent && person.degree === 2
        ? [parent[0] + Math.sin(angle) * 4, parent[1] + Math.cos(angle) * 4]
        : [WORLD_ANCHORS.plaza[0] + Math.sin(angle) * distance, WORLD_ANCHORS.plaza[1] + Math.cos(angle) * distance];
    place(person, preferred);
  }
  return visible.flatMap((person) => {
    const placement = placements.get(person.id);
    return placement ? [placement] : [];
  });
}
