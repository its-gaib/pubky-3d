'use client';

import { useEffect, useRef, useState } from 'react';
import { FileController } from '@/controllers/file/file';
import { useAuthStatus } from '@/hooks/useAuthStatus/useAuthStatus';
import { useCurrentUserProfile } from '@/hooks/useCurrentUserProfile/useCurrentUserProfile';
import { useSignOut } from '@/hooks/useSignOut/useSignOut';
import { isPubkyIdentifier } from '@/libs/utils/utils';
import { isWorldProductionConfigured } from '@/libs/world/world-network';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';

/** The header uses the shared profile/logout flow, scoped to the currently restored session. */
export function useWorldAccount() {
  const { isFullyAuthenticated, isLoading: isRestoring } = useAuthStatus();
  const rawActor = useAuthStore((state) => state.currentUserPubky);
  const session = useAuthStore((state) => state.session);
  const loggingOut = useAuthStore((state) => state.isLoggingOut);
  const { handleSignOut, isLoading } = useSignOut();
  const inFlight = useRef(false);
  const [requesting, setRequesting] = useState(false);
  const isSigningOut = loggingOut || isLoading || requesting;
  const actorId =
    isFullyAuthenticated &&
    !isRestoring &&
    !isSigningOut &&
    session &&
    rawActor &&
    isPubkyIdentifier(rawActor) &&
    isWorldProductionConfigured()
      ? rawActor
      : null;
  const { userDetails, currentUserPubky } = useCurrentUserProfile({ enabled: Boolean(actorId) });
  const profile = actorId && currentUserPubky === actorId && userDetails?.id === actorId ? userDetails : null;
  const name =
    (typeof profile?.name === 'string'
      ? profile.name
          .slice(0, 48)
          .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '') || (actorId ? `${actorId.slice(0, 6)}…${actorId.slice(-4)}` : '');
  const avatarUrl =
    actorId && profile?.image
      ? FileController.getAvatarUrl(
          actorId,
          typeof profile.indexed_at === 'number' && Number.isFinite(profile.indexed_at)
            ? profile.indexed_at
            : undefined,
        )
      : undefined;
  const [menuOwner, setMenuOwner] = useState<{ actorId: string; session: typeof session } | null>(null);
  const open = Boolean(actorId && menuOwner?.actorId === actorId && menuOwner?.session === session);

  useEffect(() => {
    setMenuOwner(null);
  }, [actorId, session]);

  function isCurrent() {
    const live = useAuthStore.getState();
    return Boolean(
      actorId &&
      !inFlight.current &&
      live.currentUserPubky === actorId &&
      live.session === session &&
      live.hasHydrated &&
      live.hasProfile === true &&
      !live.isRestoringSession &&
      !live.isLoggingOut &&
      useOnboardingStore.getState().hasHydrated &&
      isWorldProductionConfigured(),
    );
  }

  function setOpen(next: boolean) {
    setMenuOwner(next && actorId && isCurrent() ? { actorId, session } : null);
  }

  async function signOut() {
    setMenuOwner(null);
    if (!isCurrent()) return;
    inFlight.current = true;
    setRequesting(true);
    try {
      await handleSignOut();
    } finally {
      inFlight.current = false;
      setRequesting(false);
    }
  }

  return {
    identity: actorId ? { id: actorId, name, avatarUrl } : null,
    open,
    setOpen,
    signOut,
    isSigningOut,
    isRestoring,
  };
}
