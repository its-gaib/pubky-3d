'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ModerationController } from '@/controllers/moderation/moderation';
import { useWorldAccount } from '@/hooks/useWorldAccount/useWorldAccount';
import { WORLD_SOCIAL_PROFILE_LIMIT } from '@/hooks/useWorldSocial/useWorldSocial.manager';
import { isPubkyIdentifier } from '@/libs/utils/utils';
import { getWorldAvatarImageUrl } from '@/libs/world/world-avatar-image';
import { isWorldProductionConfigured } from '@/libs/world/world-network';
import { SOCIAL_PAGE_SIZE, socialAvatarPeople } from '@/libs/world/world-social-layout';
import type { WorldAvatarIdentity, WorldPerson } from '@/libs/world/world-types';
import { ModerationType } from '@/models/moderation/moderation.schema';
import { useSettingsStore } from '@/stores/settings/settings.store';
import type { UseWorldAvatarIdentitiesOptions, WorldAvatarIdentities } from './useWorldAvatarIdentities.types';

const SOCIAL_IDENTITY_LIMIT = SOCIAL_PAGE_SIZE * 2;
const EMPTY_IDENTITIES: WorldAvatarIdentity[] = [];

function canonicalIdentity(identity: { id: string; avatarUrl?: string } | null): WorldAvatarIdentity | null {
  if (!identity?.avatarUrl) return null;
  const avatarUrl = getWorldAvatarImageUrl({ id: identity.id, avatarUrl: identity.avatarUrl });
  return avatarUrl ? { id: identity.id, avatarUrl } : null;
}

async function approvedIdentity(identity: WorldAvatarIdentity | null): Promise<WorldAvatarIdentity | null> {
  if (!identity) return null;
  try {
    const status = await ModerationController.getModerationStatus(identity.id, ModerationType.PROFILE);
    return status.is_blurred === false ? identity : null;
  } catch {
    // Unresolved or failed moderation never reveals a profile image in the world.
    return null;
  }
}

/** Load the visible heads in existing 20-profile batches without repeatedly retrying unavailable neighbors. */
export function useWorldVisibleProfileHydration({
  scope,
  enabled,
  people,
  priorityIds,
  ensureProfiles,
}: {
  scope: string;
  enabled: boolean;
  people: WorldPerson[];
  priorityIds: string[];
  ensureProfiles: (ids: string[]) => Promise<void>;
}) {
  const visibleKey = people.map((person) => person.id).join(',');
  const priorityKey = [...new Set(priorityIds)]
    .filter(isPubkyIdentifier)
    .slice(0, WORLD_SOCIAL_PROFILE_LIMIT)
    .join(',');
  const attempted = useRef({ scope: '', ids: new Set<string>() });
  // Keep live metadata out of the work effect dependencies: successful batches publish a
  // new graph, but that must not restart the queue or retry a failed previous batch.
  const peopleRef = useRef(people);
  useEffect(() => {
    peopleRef.current = people;
  }, [people]);

  useEffect(() => {
    if (!enabled || attempted.current.scope !== scope) attempted.current = { scope, ids: new Set() };
    if (!enabled || !visibleKey) return;
    const work = attempted.current;
    let cancelled = false;
    const markAttempted = (ids: string[]) => {
      ids.forEach((id) => work.ids.add(id));
      // Keep only two pages of attempts; small live graph changes preserve failed
      // neighbors instead of starting their requests over on every tag update.
      while (work.ids.size > SOCIAL_IDENTITY_LIMIT) work.ids.delete(work.ids.values().next().value!);
    };
    void (async () => {
      // Await the existing panel request first, so background heads do not displace it.
      const priority = priorityKey ? priorityKey.split(',').filter((id) => !work.ids.has(id)) : [];
      if (priority.length) {
        markAttempted(priority);
        try {
          await ensureProfiles(priority);
        } catch {
          // A failed panel request remains retryable through the panel's normal action.
        }
      }
      if (cancelled) return;
      const missing = peopleRef.current
        .filter((person) => !person.profileLoaded && isPubkyIdentifier(person.id) && !work.ids.has(person.id))
        .slice(0, SOCIAL_PAGE_SIZE)
        .map((person) => person.id);
      for (let offset = 0; offset < missing.length && !cancelled; offset += WORLD_SOCIAL_PROFILE_LIMIT) {
        const ids = missing.slice(offset, offset + WORLD_SOCIAL_PROFILE_LIMIT);
        markAttempted(ids);
        try {
          await ensureProfiles(ids);
        } catch {
          // Continue to later people; missing images keep their mask without a retry loop.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, scope, visibleKey, priorityKey, ensureProfiles]);
}

/** Keeps image permission, current account ownership, and database reactivity outside Three.js. */
export function useWorldAvatarIdentities({
  data,
  socialView,
  socialViewerId,
  priorityProfileIds,
  ensureProfiles,
}: UseWorldAvatarIdentitiesOptions): WorldAvatarIdentities {
  const account = useWorldAccount();
  const blurCensored = useSettingsStore((state) => state.privacy.blurCensored);
  const networkAllowed = isWorldProductionConfigured();
  const actorId = account.identity?.id ?? null;
  const current = networkAllowed && !account.isRestoring && !account.isSigningOut;
  const consistent = !socialViewerId || socialViewerId === actorId;
  const scope = `${current}:${data.source}:${actorId ?? 'guest'}:${socialViewerId ?? 'guest'}:${consistent}`;
  // Overview sculptures and individual pages share the renderer's exact member selection.
  const visible = socialAvatarPeople(data.people, socialView).slice(0, SOCIAL_PAGE_SIZE);
  const visibleKey = visible.map((person) => person.id).join(',');
  const [retained, setRetained] = useState({ scope, page: visibleKey, previous: '' });
  const outgoingKey =
    retained.scope === scope ? (retained.page === visibleKey ? retained.previous : retained.page) : '';

  useEffect(() => {
    setRetained((previous) => {
      if (previous.scope === scope && previous.page === visibleKey) return previous;
      return { scope, page: visibleKey, previous: previous.scope === scope ? previous.page : '' };
    });
  }, [scope, visibleKey]);

  useWorldVisibleProfileHydration({
    scope,
    enabled: current && consistent && data.source === 'production' && Boolean(socialViewerId),
    people: visible,
    priorityIds: priorityProfileIds,
    ensureProfiles,
  });

  const candidateIds = new Set([...visible.map((person) => person.id), ...outgoingKey.split(',').filter(Boolean)]);
  const peopleById = new Map(
    data.people.filter((person) => candidateIds.has(person.id)).map((person) => [person.id, person]),
  );
  const candidates =
    current && consistent && data.source === 'production'
      ? [...candidateIds].slice(0, SOCIAL_IDENTITY_LIMIT).flatMap((id) => {
          const identity = canonicalIdentity(peopleById.get(id) ?? null);
          return identity ? [identity] : [];
        })
      : [];
  const viewer = current && consistent ? canonicalIdentity(account.identity) : null;
  const viewerKey = JSON.stringify([scope, blurCensored, viewer]);
  const peopleScope = JSON.stringify([scope, blurCensored]);
  const peopleKey = JSON.stringify([peopleScope, candidates]);
  const approvedViewer = useLiveQuery(
    async () => ({ key: viewerKey, identity: await approvedIdentity(viewer) }),
    [viewerKey],
  );
  const approvedPeople = useLiveQuery(async () => {
    const identities = await Promise.all(candidates.map(approvedIdentity));
    return {
      scope: peopleScope,
      key: peopleKey,
      identities: identities.filter((identity): identity is WorldAvatarIdentity => identity !== null),
    };
  }, [peopleKey]);

  let people = EMPTY_IDENTITIES;
  if (approvedPeople?.scope === peopleScope) {
    const currentUrls = new Map(candidates.map((identity) => [identity.id, identity.avatarUrl]));
    people =
      approvedPeople.key === peopleKey
        ? approvedPeople.identities
        : approvedPeople.identities.filter((identity) => currentUrls.get(identity.id) === identity.avatarUrl);
  }

  // useLiveQuery can retain its previous value while new dependencies resolve.
  // Matching scope + each URL fences logout, actor switches, and changed images.
  // New neighbors do not evict already-approved unchanged images while their own query resolves.
  return {
    viewer: approvedViewer?.key === viewerKey ? approvedViewer.identity : null,
    people,
  };
}
