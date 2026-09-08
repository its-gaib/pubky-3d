'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { IMAGE_MAX_RAW_SIZE } from '@/config/images';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { isWorldProductionConfigured } from '@/libs/world/world-network';
import { DialogNewPost } from '@/organisms/DialogNewPost/DialogNewPost';
import { useAuthStore } from '@/stores/auth/auth.store';

type WorldPhotoNetwork = 'production' | 'unavailable';

interface WorldPhotoDraft {
  file: File;
  authorId: string;
}

interface UseWorldPhotoPostResult {
  openComposer: (blob: Blob) => boolean;
  composer: ReactNode;
  isComposerOpen: boolean;
  isAuthenticated: boolean;
  network: WorldPhotoNetwork;
  error: string | null;
  clearError: () => void;
}

/**
 * Hands a bounded canvas PNG to Pubky's existing composer. A draft is held only
 * in memory and belongs to the current public identity; nothing is uploaded or
 * queued by opening it. The existing composer owns validation and publishing.
 */
export function useWorldPhotoPost(): UseWorldPhotoPostResult {
  const { isAuthenticated, requireAuth } = useRequireAuth();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [draft, setDraft] = useState<WorldPhotoDraft | null>(null);
  const draftRef = useRef<WorldPhotoDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const network: WorldPhotoNetwork = isWorldProductionConfigured() ? 'production' : 'unavailable';
  const isComposerOpen = draft !== null && draft.authorId === currentUserPubky && network !== 'unavailable';

  // Do not carry a photo draft into another account or reopen it after sign-in.
  useEffect(() => {
    if (draft && (draft.authorId !== currentUserPubky || network === 'unavailable')) {
      draftRef.current = null;
      setDraft(null);
    }
  }, [currentUserPubky, draft, network]);

  useEffect(
    () => () => {
      draftRef.current = null;
    },
    [],
  );

  const openComposer = (blob: Blob): boolean => {
    setError(null);

    if (!(blob instanceof Blob) || blob.type !== 'image/png' || blob.size === 0) {
      setError('Take a new world photo before opening a post. The photo must be a PNG image.');
      return false;
    }

    if (blob.size > IMAGE_MAX_RAW_SIZE) {
      setError('This photo is too large to attach. Take a smaller photo or download it instead.');
      return false;
    }

    if (network === 'unavailable') {
      setError(
        'Posting is unavailable because the Pubky production network configuration is unavailable. Download your photo to keep it.',
      );
      return false;
    }

    if (draftRef.current) {
      setError('Finish or discard your current photo draft before opening another.');
      return false;
    }

    const opened = requireAuth(() => {
      // Read only the public ID, at action time, to avoid a stale account closure.
      const authorId = useAuthStore.getState().currentUserPubky;
      if (!authorId) return false;

      const nextDraft = {
        authorId,
        file: new File([blob], 'pubky-world.png', { type: 'image/png' }),
      };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      return true;
    });

    if (!opened) {
      setError(
        'Download your photo before signing in: leaving the world clears it. After signing in, return to take and post a new photo.',
      );
      return false;
    }

    return true;
  };

  const closeComposer = (open: boolean) => {
    if (!open) {
      draftRef.current = null;
      setDraft(null);
    }
  };

  return {
    openComposer,
    composer:
      isComposerOpen && draft ? (
        <DialogNewPost
          open
          onOpenChangeAction={closeComposer}
          initialContent="A postcard from Pubky World."
          initialAttachments={[draft.file]}
          description={`Posting to Pubky ${network}. Review your photo and choose Post to publish.`}
        />
      ) : null,
    isComposerOpen,
    isAuthenticated,
    network,
    error,
    clearError: () => setError(null),
  };
}
