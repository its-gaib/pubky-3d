'use client';

import { useEffect, useRef, useState } from 'react';
import { useFollowUser } from '@/hooks/useFollowUser/useFollowUser';
import { isPubkyIdentifier } from '@/libs/utils/utils';
import type { WorldSocialContext, WorldSocialManager, WorldSocialView } from './useWorldSocial.manager';
import type { WorldSocialFollow, WorldSocialProfile } from './useWorldSocial.types';

const EMPTY_PROFILE: WorldSocialProfile = { person: null, latestPost: null, status: 'idle', error: null };
const FAILED_SYNC =
  'The follow change is not confirmed on production. Its local preview is still shown; retry the same change to sync it.';

interface FollowIntent {
  context: WorldSocialContext;
  id: string;
  desired: boolean;
}

export function useWorldPerson(
  manager: WorldSocialManager,
  scope: string,
  selectedId: string | null,
  view: Pick<WorldSocialView, 'context' | 'selectedFollowing' | 'selectedCanFollow'>,
) {
  const renderedContext = view.context;
  const { toggleFollow } = useFollowUser();
  const [profileState, setProfileState] = useState<{ scope: string; id: string | null; profile: WorldSocialProfile }>({
    scope: '',
    id: null,
    profile: EMPTY_PROFILE,
  });
  const operation = useRef<FollowIntent | null>(null);
  const failedIntents = useRef(new Map<string, FollowIntent>());
  const [followRevision, setFollowRevision] = useState(0);
  const selection = useRef(0);

  useEffect(() => {
    const context = manager.capture();
    const revision = ++selection.current;
    let cancelled = false;
    if (!selectedId || !isPubkyIdentifier(selectedId) || !manager.isActive(context)) return;
    setProfileState({
      scope,
      id: selectedId,
      profile: {
        person: manager.person(selectedId),
        latestPost: null,
        status: 'loading',
        error: null,
      },
    });
    const current = () => !cancelled && revision === selection.current && manager.isActive(context);
    void (async () => {
      try {
        await manager.ensureProfiles([selectedId], context);
        if (!current()) return;
        setProfileState({
          scope,
          id: selectedId,
          profile: {
            person: manager.person(selectedId),
            latestPost: null,
            status: 'loading',
            error: null,
          },
        });
        const latestPost = await manager.latestPost(selectedId, context, current);
        if (!current()) return;
        setProfileState({
          scope,
          id: selectedId,
          profile: {
            person: manager.person(selectedId),
            latestPost,
            status: latestPost ? 'ready' : 'empty',
            error: null,
          },
        });
      } catch {
        if (current())
          setProfileState({
            scope,
            id: selectedId,
            profile: {
              person: manager.person(selectedId),
              latestPost: null,
              status: 'error',
              error: 'The latest post could not be loaded. Open this profile again to retry.',
            },
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manager, scope, selectedId]);

  async function mutate(retry: boolean): Promise<void> {
    const context = manager.capture();
    if (
      !selectedId ||
      !manager.isActive(context) ||
      context !== renderedContext ||
      context.scope !== scope ||
      !context.viewerId ||
      !manager.isSelected(selectedId) ||
      !manager.canFollow(selectedId) ||
      operation.current
    )
      return;
    const previousFailure = failedIntents.current.get(selectedId);
    if (retry && (!previousFailure || previousFailure.context !== context)) return;
    if (!retry && previousFailure?.context === context) return;
    const desired = retry ? previousFailure!.desired : !manager.isFollowing(selectedId);
    const intent = { context, id: selectedId, desired };
    operation.current = intent;
    failedIntents.current.delete(selectedId);
    manager.applyLocalFollow(selectedId, desired);
    setFollowRevision((value) => value + 1);
    try {
      // The existing hook supplies normalization, local persistence, homeserver
      // publication and static toasts. Retry repeats the intent, never toggles it.
      if (!manager.isActive(context)) return;
      const succeeded = await toggleFollow(selectedId, !desired);
      if (!manager.isActive(context)) return;
      if (!succeeded) failedIntents.current.set(selectedId, intent);
    } catch {
      if (manager.isActive(context)) failedIntents.current.set(selectedId, intent);
    } finally {
      if (operation.current === intent) operation.current = null;
      // Releasing a physical operation may unblock the newly selected account;
      // its result and error are still fenced to the original context above.
      if (manager.capture()?.active) setFollowRevision((value) => value + 1);
    }
  }

  // These refs are read inside effects/handlers; the state revision publishes the
  // resulting flags without depending on the follow hook's render-captured actor.
  const [followState, setFollowState] = useState({
    scope: '',
    id: null as string | null,
    pending: false,
    busy: false,
    error: null as string | null,
  });
  useEffect(() => {
    const context = manager.capture();
    const active = manager.isActive(context);
    for (const [id, intent] of failedIntents.current) {
      if (intent.context !== context) failedIntents.current.delete(id);
    }
    const failure = selectedId ? failedIntents.current.get(selectedId) : undefined;
    setFollowState({
      scope,
      id: selectedId,
      pending: active && operation.current?.context === context && operation.current?.id === selectedId,
      busy: operation.current !== null,
      error: active && failure?.context === context ? FAILED_SYNC : null,
    });
  }, [manager, scope, selectedId, followRevision]);

  const follow: WorldSocialFollow = {
    pending: followState.scope === scope && followState.id === selectedId && followState.pending,
    error: followState.scope === scope && followState.id === selectedId ? followState.error : null,
    isFollowing: view.selectedFollowing,
    canFollow: view.selectedCanFollow && !followState.busy,
    toggle: () => mutate(false),
    retry: () => mutate(true),
  };
  return {
    profile: profileState.scope === scope && profileState.id === selectedId ? profileState.profile : EMPTY_PROFILE,
    follow,
  };
}
