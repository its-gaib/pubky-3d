'use client';

import { useLayoutEffect, useRef } from 'react';
import { paintWorldArenaGlory, WORLD_ARENA_GLORY_SIZE } from '@/libs/world/world-arena-glory-artwork';
import { createWorldAvatarImageLoader, getWorldAvatarImageUrl } from '@/libs/world/world-avatar-image';
import type { WorldAvatarIdentity } from '@/libs/world/world-types';
import styles from './WorldArenaBattle.module.css';

/** Mount once per victory so a guest's win can never be claimed by a later login. */
export function WorldArenaGlory({ viewer }: { viewer: WorldAvatarIdentity | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const avatarUrl = viewer ? getWorldAvatarImageUrl(viewer) : null;
  const viewerId = avatarUrl ? (viewer?.id ?? null) : null;
  const championId = useRef(viewerId);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (viewerId !== championId.current) championId.current = null;
    paintWorldArenaGlory(canvas);

    const clearPixels = () => {
      canvas.width = canvas.height = 0;
    };
    if (!viewerId || !avatarUrl || viewerId !== championId.current) return clearPixels;

    const images = createWorldAvatarImageLoader();
    const request = new AbortController();
    void images
      .load({ id: viewerId, avatarUrl }, request.signal)
      .then((bitmap) => {
        if (!bitmap) return;
        try {
          if (request.signal.aborted) return;
          if (!paintWorldArenaGlory(canvas, bitmap)) paintWorldArenaGlory(canvas);
        } finally {
          bitmap.close();
        }
      })
      .catch(() => {
        if (!request.signal.aborted) paintWorldArenaGlory(canvas);
      });

    return () => {
      request.abort();
      images.dispose();
      clearPixels();
    };
  }, [viewerId, avatarUrl]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.glory}
      width={WORLD_ARENA_GLORY_SIZE.width}
      height={WORLD_ARENA_GLORY_SIZE.height}
      role="img"
      aria-label="Glory flag for the arena champion"
    />
  );
}
