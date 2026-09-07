'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { isPubkyIdentifier } from '@/libs/utils/utils';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useWorldPerson } from './useWorldPerson';
import {
  EMPTY_WORLD_SOCIAL_VIEW,
  WORLD_SOCIAL_PROFILE_LIMIT,
  WorldSocialManager,
  worldSocialStagingConfigured,
} from './useWorldSocial.manager';
import type { UseWorldSocialOptions, UseWorldSocialResult } from './useWorldSocial.types';

/** Personal graph loading is separate from the public forest/theater sample. */
export function useWorldSocial({
  enabled,
  selectedId,
  directoryIds = [],
}: UseWorldSocialOptions): UseWorldSocialResult {
  const rawViewerId = useAuthStore((state) => state.currentUserPubky);
  const hydrated = useAuthStore((state) => state.hasHydrated);
  const restoring = useAuthStore((state) => state.isRestoringSession);
  const loggingOut = useAuthStore((state) => state.isLoggingOut);
  const authenticated = useAuthStore((state) => state.selectIsAuthenticated());
  const networkAllowed = worldSocialStagingConfigured();
  const viewerId =
    networkAllowed &&
    hydrated &&
    authenticated &&
    !restoring &&
    !loggingOut &&
    rawViewerId &&
    isPubkyIdentifier(rawViewerId)
      ? rawViewerId
      : null;
  const active = enabled && networkAllowed;
  const scope = `${active}:${rawViewerId ?? 'guest'}:${viewerId ?? 'guest'}:${hydrated}:${restoring}:${loggingOut}`;
  const [view, setView] = useState(EMPTY_WORLD_SOCIAL_VIEW);
  const [manager] = useState(() => new WorldSocialManager(setView));

  useLayoutEffect(() => {
    manager.configure(scope, active, rawViewerId, viewerId);
    return () => manager.cancel();
  }, [manager, scope, active, rawViewerId, viewerId]);

  useLayoutEffect(() => {
    manager.setSelected(selectedId);
  }, [manager, scope, selectedId]);

  useEffect(() => {
    if (active && viewerId) void manager.loadMore();
  }, [manager, scope, active, viewerId]);

  const directoryKey = [
    ...new Set([...(selectedId ? [selectedId] : []), ...directoryIds.slice(0, WORLD_SOCIAL_PROFILE_LIMIT)]),
  ]
    .filter((id) => isPubkyIdentifier(id))
    .slice(0, WORLD_SOCIAL_PROFILE_LIMIT)
    .join(',');
  useEffect(() => {
    if (!active || !directoryKey) return;
    void manager.ensureProfiles(directoryKey.split(',')).catch(() => undefined);
  }, [manager, scope, active, directoryKey]);

  const current = view.scope === scope ? view : EMPTY_WORLD_SOCIAL_VIEW;
  const person = useWorldPerson(manager, scope, selectedId, current);
  return {
    people: current.people,
    relationships: current.relationships,
    viewerId,
    status: !active ? 'inactive' : !viewerId ? 'signed-out' : current.status,
    directCount: current.directCount,
    discoveryCount: current.discoveryCount,
    complete: current.complete,
    error: current.error,
    loadMore: manager.loadMore,
    retry: manager.retry,
    refresh: manager.refresh,
    profile: person.profile,
    follow: person.follow,
  };
}
