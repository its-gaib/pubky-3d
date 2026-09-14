import * as THREE from 'three';
import { paintWorldArenaGlory } from '@/libs/world/world-arena-glory-artwork';
import { getWorldAvatarImageUrl, type WorldAvatarImageLoader } from '@/libs/world/world-avatar-image';
import type { WorldAvatarIdentity } from '@/libs/world/world-types';

interface GloryArtwork {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
}

function drawGlory(bitmap: ImageBitmap): GloryArtwork | null {
  const canvas = document.createElement('canvas');
  if (!paintWorldArenaGlory(canvas, bitmap)) return null;
  try {
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = 'arena-champion-glory';
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.96,
      metalness: 0,
    });
    return { canvas, texture, material };
  } catch {
    // A failed canvas draw must never leave profile pixels reachable by the scene.
    canvas.width = canvas.height = 0;
    return null;
  }
}

/** One scene-local victory, using only the current viewer's approved avatar identity. */
export function createWorldArenaGlory(banners: readonly THREE.Mesh[], avatarImages: WorldAvatarImageLoader) {
  const originals = banners.map((banner) => ({ banner, material: banner.material }));
  let identity: WorldAvatarIdentity | null = null;
  let championId: string | null = null;
  let victory = false;
  let disposed = false;
  let artwork: GloryArtwork | null = null;
  let request: AbortController | null = null;

  function clearArtwork() {
    if (!artwork) return;
    for (const original of originals) {
      if (original.banner.material === artwork.material) original.banner.material = original.material;
    }
    artwork.canvas.width = artwork.canvas.height = 0;
    artwork.texture.dispose();
    artwork.material.dispose();
    artwork = null;
  }

  function clear() {
    request?.abort();
    request = null;
    clearArtwork();
  }

  function loadChampion() {
    if (disposed || !identity || identity.id !== championId || !victory) return;
    const viewer = identity;
    const lease = new AbortController();
    request = lease;
    void avatarImages
      .load(viewer, lease.signal)
      .then((bitmap) => {
        if (!bitmap) return;
        try {
          if (
            disposed ||
            lease.signal.aborted ||
            request !== lease ||
            championId !== viewer.id ||
            identity?.id !== viewer.id ||
            identity.avatarUrl !== viewer.avatarUrl
          )
            return;
          const next = drawGlory(bitmap);
          if (!next) return;
          artwork = next;
          for (const { banner } of originals) banner.material = next.material;
        } finally {
          bitmap.close();
        }
      })
      .catch(() => {
        if (request === lease) clearArtwork();
      });
  }

  return {
    setIdentity(viewer: WorldAvatarIdentity | null) {
      if (disposed) return;
      const url = viewer && getWorldAvatarImageUrl(viewer);
      const next = viewer && url ? { id: viewer.id, avatarUrl: url } : null;
      if (identity?.id === next?.id && identity?.avatarUrl === next?.avatarUrl) return;
      clear();
      identity = next;
      // Logout, revocation and account changes remove the prior champion permanently.
      if (identity?.id !== championId) championId = null;
      loadChampion();
    },
    celebrateVictory() {
      if (disposed || victory) return;
      victory = true;
      championId = identity?.id ?? null;
      loadChampion();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      identity = null;
      championId = null;
    },
  };
}
