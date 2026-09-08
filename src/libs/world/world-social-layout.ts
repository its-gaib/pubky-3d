import { TAG_MAX_LENGTH } from '@/config/posts';
import { isPubkyIdentifier } from '@/libs/utils/utils';
import { WORLD_ANCHORS } from '@/libs/world/world-layout';
import type { WorldPerson, WorldSocialView } from '@/libs/world/world-types';

export const SOCIAL_SECTOR_COUNT = 8;
export const SOCIAL_SECTOR_PREVIEW_SIZE = 2;
export const SOCIAL_SECTOR_DIRECTORY_PAGE_SIZE = 20;
export const SOCIAL_PAGE_SIZE = 96;
export const SOCIAL_PLAZA_RADIUS = 32;
export const SOCIAL_CENTER_CLEARANCE = 7;
export const SOCIAL_COMMONS_KEY = 'commons';
const PROFILE_TAG_LIMIT = 20;

export interface SocialPersonPlacement {
  person: WorldPerson;
  position: [number, number];
  scale: number;
  sector: number;
  sectorKey: string;
}

export interface SocialSector {
  sector: number;
  key: string;
  label: string;
  tag: string | null;
  direct: number;
  secondary: number;
  position: [number, number];
  members: WorldPerson[];
  representatives: WorldPerson[];
  following: WorldPerson[];
  tagStatus: { pending: number; unavailable: number; untagged: number; other: number };
}

interface SupportedTag {
  label: string;
  people: number;
  count: number;
}

// Social snapshots replace their people array when profile tags or follows change.
// A walking/status render can reuse the same partition without sorting the graph again.
const sectorCache = new WeakMap<readonly WorldPerson[], SocialSector[]>();
const tagCache = new WeakMap<NonNullable<WorldPerson['profileTags']>, Map<string, number>>();
const EMPTY_PROFILE_TAGS = new Map<string, number>();
const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const comparePeople = (left: WorldPerson, right: WorldPerson) =>
  Number(left.degree === 2) - Number(right.degree === 2) || compareText(left.id, right.id);

function hashId(id: string) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function uniquePeople(people: readonly WorldPerson[]) {
  const byId = new Map<string, WorldPerson>();
  for (const person of people) {
    const existing = byId.get(person.id);
    if (!existing || person.degree === 1 || (existing.degree !== 1 && person.degree !== 2)) byId.set(person.id, person);
  }
  return [...byId.values()];
}

/** Profile labels only: bounded plain text, case-insensitive membership, no endorsement inflation from duplicates. */
function profileTags(person: WorldPerson) {
  if (!Array.isArray(person.profileTags)) return EMPTY_PROFILE_TAGS;
  const cached = tagCache.get(person.profileTags);
  if (cached) return cached;
  const tags = new Map<string, number>();
  for (const entry of person.profileTags.slice(0, PROFILE_TAG_LIMIT)) {
    if (!entry || typeof entry.label !== 'string' || entry.label.length > TAG_MAX_LENGTH * 4) continue;
    const label = entry.label
      .normalize('NFKC')
      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!label || [...label].length > TAG_MAX_LENGTH) continue;
    if (!Number.isFinite(entry.count) || entry.count < 1) continue;
    const count = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(entry.count));
    tags.set(label, Math.max(tags.get(label) ?? 0, count));
  }
  tagCache.set(person.profileTags, tags);
  return tags;
}

function selectedTag(tags: ReadonlyMap<string, number>, featured: readonly SupportedTag[]) {
  let best: SupportedTag | undefined;
  for (const candidate of featured) {
    if (!tags.has(candidate.label)) continue;
    if (
      !best ||
      candidate.people < best.people ||
      (candidate.people === best.people &&
        ((tags.get(candidate.label) ?? 0) > (tags.get(best.label) ?? 0) ||
          ((tags.get(candidate.label) ?? 0) === (tags.get(best.label) ?? 0) &&
            compareText(candidate.label, best.label) < 0)))
    )
      best = candidate;
  }
  return best ? `tag:${best.label}` : SOCIAL_COMMONS_KEY;
}

/** At most seven actual community-tag groups plus an honest commons, never a public-ID hash partition. */
export function socialSectors(people: readonly WorldPerson[]): SocialSector[] {
  const cached = sectorCache.get(people);
  if (cached) return cached;
  const unique = uniquePeople(people).sort(comparePeople);
  const directIds = new Set(unique.filter((person) => person.degree === 1).map((person) => person.id));
  const tagsById = new Map(unique.map((person) => [person.id, profileTags(person)]));
  const supported = new Map<string, SupportedTag>();
  for (const person of unique) {
    if (person.degree !== 1 || !isPubkyIdentifier(person.id)) continue;
    for (const [label, count] of tagsById.get(person.id)!) {
      const current = supported.get(label) ?? { label, people: 0, count: 0 };
      current.people++;
      current.count = Math.min(Number.MAX_SAFE_INTEGER, current.count + count);
      supported.set(label, current);
    }
  }
  const featured = [...supported.values()]
    .sort(
      (left, right) => right.people - left.people || right.count - left.count || compareText(left.label, right.label),
    )
    .slice(0, SOCIAL_SECTOR_COUNT - 1);
  const assigned = new Map<string, string>();
  for (const person of unique) {
    if (person.degree !== 2) assigned.set(person.id, selectedTag(tagsById.get(person.id)!, featured));
  }
  for (const person of unique) {
    if (person.degree !== 2) continue;
    const own = selectedTag(tagsById.get(person.id)!, featured);
    if (own !== SOCIAL_COMMONS_KEY) {
      assigned.set(person.id, own);
      continue;
    }
    const parents = new Map<string, number>();
    for (const id of new Set(person.parentIds ?? [])) {
      const key = assigned.get(id);
      // Only actual direct parents participate; discovery chains never create an extra hop.
      if (!key || !directIds.has(id)) continue;
      parents.set(key, (parents.get(key) ?? 0) + 1);
    }
    const inherited = [...parents].sort((left, right) => right[1] - left[1] || compareText(left[0], right[0]))[0]?.[0];
    assigned.set(person.id, inherited ?? SOCIAL_COMMONS_KEY);
  }
  const groups = new Map<string, WorldPerson[]>();
  for (const person of unique) {
    const key = assigned.get(person.id) ?? SOCIAL_COMMONS_KEY;
    const members = groups.get(key) ?? [];
    members.push(person);
    groups.set(key, members);
  }
  if (!groups.size) groups.set(SOCIAL_COMMONS_KEY, []);
  const entries = [...groups].sort((left, right) => {
    if (left[0] === SOCIAL_COMMONS_KEY) return 1;
    if (right[0] === SOCIAL_COMMONS_KEY) return -1;
    return compareText(left[0], right[0]);
  });
  const sectors = entries.map(([key, members], sector): SocialSector => {
    const tag = key === SOCIAL_COMMONS_KEY ? null : key.slice(4);
    const following = members.filter((person) => person.degree === 1 && isPubkyIdentifier(person.id));
    const preview = following.length
      ? following
      : members.filter((person) => person.degree === 2 && isPubkyIdentifier(person.id));
    const tagStatus = { pending: 0, unavailable: 0, untagged: 0, other: 0 };
    for (const person of following) {
      if (person.profileTagsStatus === 'error') tagStatus.unavailable++;
      else if (person.profileTagsStatus !== 'loaded') tagStatus.pending++;
      else if (!tagsById.get(person.id)!.size) tagStatus.untagged++;
      else if (!tag) tagStatus.other++;
    }
    const angle = (sector / entries.length) * Math.PI * 2 + Math.PI / 8;
    return {
      sector,
      key,
      tag,
      label: tag ? tag.charAt(0).toUpperCase() + tag.slice(1) : 'Other & untagged',
      direct: members.filter((person) => person.degree !== 2).length,
      secondary: members.filter((person) => person.degree === 2).length,
      position: [WORLD_ANCHORS.plaza[0] + Math.sin(angle) * 21, WORLD_ANCHORS.plaza[1] + Math.cos(angle) * 21],
      members,
      following,
      representatives: preview.slice(0, SOCIAL_SECTOR_PREVIEW_SIZE),
      tagStatus,
    };
  });
  sectorCache.set(people, sectors);
  return sectors;
}

export function socialSectorForView(
  sectors: readonly SocialSector[],
  view: Pick<WorldSocialView, 'sector' | 'sectorKey'>,
) {
  if (view.sectorKey !== undefined) return sectors.find((sector) => sector.key === view.sectorKey);
  if (view.sector === null || !Number.isInteger(view.sector)) return undefined;
  return sectors[view.sector];
}

/** A vanished tag returns to the overview instead of silently selecting a different neighborhood. */
export function resolveSocialView(sectors: readonly SocialSector[], view: WorldSocialView): WorldSocialView {
  const selected = socialSectorForView(sectors, view);
  if (!selected) return { sector: null, page: 0 };
  const lastPage = Math.max(0, Math.ceil(selected.members.length / SOCIAL_PAGE_SIZE) - 1);
  return {
    sector: selected.sector,
    sectorKey: selected.key,
    page: Math.min(lastPage, Math.max(0, Number.isFinite(view.page) ? Math.trunc(view.page) : 0)),
  };
}

export function socialViewPageCount(people: readonly WorldPerson[], view: WorldSocialView) {
  const selected = socialSectorForView(socialSectors(people), view);
  return selected ? Math.max(1, Math.ceil(selected.members.length / SOCIAL_PAGE_SIZE)) : 1;
}

/** Both 3D pages and complete previews resolve the same tag identity. */
export function socialViewPeople(
  people: readonly WorldPerson[],
  view: WorldSocialView,
  sectors = socialSectors(people),
) {
  const selected = socialSectorForView(sectors, view);
  if (!selected) {
    if (sectors.reduce((count, sector) => count + sector.members.length, 0) > SOCIAL_PAGE_SIZE) return [];
    const all = sectors.flatMap((sector) => sector.members).sort(comparePeople);
    return all;
  }
  const resolved = resolveSocialView(sectors, view);
  return selected.members.slice(resolved.page * SOCIAL_PAGE_SIZE, (resolved.page + 1) * SOCIAL_PAGE_SIZE);
}

/** Every loaded ID, including a profile placeholder, has a reachable neighborhood and page. */
export function socialViewForPerson(people: readonly WorldPerson[], id: string): WorldSocialView | null {
  const sectors = socialSectors(people);
  const selected = sectors.find((sector) => sector.members.some((person) => person.id === id));
  if (!selected) return null;
  if (sectors.reduce((count, sector) => count + sector.members.length, 0) <= SOCIAL_PAGE_SIZE)
    return { sector: null, page: 0 };
  return {
    sector: selected.sector,
    sectorKey: selected.key,
    page: Math.floor(selected.members.findIndex((person) => person.id === id) / SOCIAL_PAGE_SIZE),
  };
}

/** Every direct follow is reachable, while only one small page needs names and avatars. */
export function socialSectorFollowingPage(sector: SocialSector, page: number) {
  const total = sector.following.length;
  const pageCount = Math.max(1, Math.ceil(total / SOCIAL_SECTOR_DIRECTORY_PAGE_SIZE));
  const current = Math.min(pageCount - 1, Math.max(0, Number.isFinite(page) ? Math.trunc(page) : 0));
  return {
    people: sector.following.slice(
      current * SOCIAL_SECTOR_DIRECTORY_PAGE_SIZE,
      (current + 1) * SOCIAL_SECTOR_DIRECTORY_PAGE_SIZE,
    ),
    total,
    page: current,
    pageCount,
    start: total ? current * SOCIAL_SECTOR_DIRECTORY_PAGE_SIZE + 1 : 0,
    end: Math.min(total, (current + 1) * SOCIAL_SECTOR_DIRECTORY_PAGE_SIZE),
  };
}

/** Representative names share the existing 20-ID budget; full member arrays never become request keys. */
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

export function socialPersonPreviewName(person: WorldPerson, nameLength = 48) {
  const limit = Math.max(1, Math.min(48, nameLength));
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
}

export function socialSectorPreview(sector: SocialSector, nameLength = 48) {
  const names = sector.representatives.map((person) => socialPersonPreviewName(person, nameLength));
  if (!names.length) return 'People in this neighborhood';
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
  const sectors = socialSectors(people);
  const resolved = resolveSocialView(sectors, view);
  const visible = socialViewPeople(people, resolved, sectors);
  if (!visible.length) return [];
  const byPerson = new Map(sectors.flatMap((sector) => sector.members.map((person) => [person.id, sector] as const)));
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
      sector: byPerson.get(person.id)!.sector,
      sectorKey: byPerson.get(person.id)!.key,
      scale: person.degree === 2 ? 0.5 : 1.15,
    });
  }
  // Keep exact slots when count changes still leave that slot inside the new footprint.
  for (const person of visible) {
    const old = previous.get(person.id);
    if (!old || old.person.degree !== person.degree || old.sectorKey !== byPerson.get(person.id)!.key) continue;
    const slot = slots.findIndex((value) => Math.hypot(value[0] - old.position[0], value[1] - old.position[1]) < 0.01);
    if (slot !== -1 && !occupied.has(slot)) place(person, old.position);
  }
  for (const person of visible) {
    if (placements.has(person.id)) continue;
    const sector = byPerson.get(person.id)!;
    const parentId = (person.parentIds ?? [])
      .filter((id) => byPerson.get(id)?.key === sector.key && positions.has(id))
      .sort(compareText)[0];
    const parent = parentId ? positions.get(parentId) : undefined;
    const sectorAngle = (sector.sector / sectors.length) * Math.PI * 2 + Math.PI / 8;
    const jitter = (hashId(person.id + ':angle') / 0xffffffff - 0.5) * (Math.PI / SOCIAL_SECTOR_COUNT) * 0.75;
    // A selected sector has the full plaza available, so even its largest page remains legible.
    const angle = resolved.sector === null ? sectorAngle + jitter : (hashId(person.id) / 0xffffffff) * Math.PI * 2;
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
