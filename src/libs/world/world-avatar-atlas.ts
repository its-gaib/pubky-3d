import * as THREE from 'three';
import { type createWorldAvatarImageLoader, getWorldAvatarImageUrl } from '@/libs/world/world-avatar-image';
import type { WorldAvatarIdentity } from '@/libs/world/world-types';

type ImageLoader = ReturnType<typeof createWorldAvatarImageLoader>;
interface Tile {
  url: string;
  slot: number;
  abort: AbortController;
  ready: boolean;
  uv: readonly [number, number, number, number];
}

/** A fixed GPU allocation over the current render window, never the whole social graph. */
export function createWorldAvatarAtlas(
  loader: ImageLoader | undefined,
  options: { capacity: number; onChange: () => void; zoom?: number },
) {
  const capacity = Math.max(1, Math.min(192, Math.floor(options.capacity)));
  const columns = capacity === 1 ? 1 : 16;
  const tileSize = capacity === 1 ? 512 : 128;
  const size = columns * tileSize;
  const gutter = 2;
  const requestedZoom = options.zoom ?? 1;
  // World portrait heads can trim profile margins without changing other image surfaces.
  const zoom = Number.isFinite(requestedZoom) ? Math.max(1, Math.min(1.2, requestedZoom)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const probe = document.createElement('canvas');
  probe.width = probe.height = 32;
  const probeContext = probe.getContext('2d', { willReadFrequently: true });
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = capacity === 1 ? 'viewer-profile-head' : 'social-profile-head-atlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  const tiles = new Map<string, Tile>();
  let disposed = false;
  let changed = false;

  function clear(tile: Tile) {
    tile.abort.abort();
    context?.clearRect(
      (tile.slot % columns) * tileSize,
      Math.floor(tile.slot / columns) * tileSize,
      tileSize,
      tileSize,
    );
    changed = true;
  }

  function draw(bitmap: ImageBitmap, tile: Tile) {
    if (!context || !probeContext || bitmap.width < 1 || bitmap.height < 1) return false;
    const contentSize = tileSize - gutter * 2;
    const scale = (contentSize / Math.max(bitmap.width, bitmap.height)) * zoom;
    const width = Math.min(contentSize, bitmap.width * scale);
    const height = Math.min(contentSize, bitmap.height * scale);
    const sourceWidth = zoom > 1 ? Math.min(bitmap.width, width / scale) : bitmap.width;
    const sourceHeight = zoom > 1 ? Math.min(bitmap.height, height / scale) : bitmap.height;
    const sourceX = (bitmap.width - sourceWidth) / 2;
    const sourceY = (bitmap.height - sourceHeight) / 2;
    // Probe the same visible source rectangle: cropped-away opaque margins do not reveal an empty head.
    probeContext.clearRect(0, 0, 32, 32);
    probeContext.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, 32, 32);
    const pixels = probeContext.getImageData(0, 0, 32, 32).data;
    let visible = false;
    for (let index = 3; index < pixels.length; index += 4)
      if (pixels[index] > 8) {
        visible = true;
        break;
      }
    if (!visible) return false;
    const x = (tile.slot % columns) * tileSize;
    const y = Math.floor(tile.slot / columns) * tileSize;
    // Keep the centered crop and any non-square image inside its own gutter.
    context.fillStyle = '#101619';
    context.fillRect(x, y, tileSize, tileSize);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      x + (tileSize - width) / 2,
      y + (tileSize - height) / 2,
      width,
      height,
    );
    changed = true;
    return true;
  }

  return {
    texture,
    sync(identities: readonly WorldAvatarIdentity[]) {
      if (disposed) return;
      const wanted = new Map<string, string>();
      // Bound input work as well as storage. The UI supplies only approved visible/outgoing identities.
      for (const identity of identities.slice(0, capacity)) {
        const url = getWorldAvatarImageUrl(identity);
        if (url) wanted.set(identity.id, url);
      }
      let removed = false;
      for (const [id, tile] of tiles) {
        if (wanted.get(id) === tile.url) continue;
        clear(tile);
        tiles.delete(id);
        removed = true;
      }
      if (removed) options.onChange();
      if (!loader || !context || !probeContext) return;
      const occupied = new Set([...tiles.values()].map((tile) => tile.slot));
      for (const [id, url] of wanted) {
        if (tiles.has(id)) continue;
        let slot = 0;
        while (occupied.has(slot)) slot++;
        if (slot >= capacity) break;
        occupied.add(slot);
        const x = (slot % columns) * tileSize;
        const y = Math.floor(slot / columns) * tileSize;
        const tile: Tile = {
          url,
          slot,
          abort: new AbortController(),
          ready: false,
          uv: [
            (x + gutter) / size,
            1 - (y + tileSize - gutter) / size,
            (tileSize - gutter * 2) / size,
            (tileSize - gutter * 2) / size,
          ],
        };
        tiles.set(id, tile);
        void loader
          .load({ id, avatarUrl: url }, tile.abort.signal)
          .then((bitmap) => {
            if (!bitmap) return;
            try {
              // The identity, version and exact lease must all still own this slot on completion.
              if (disposed || tile.abort.signal.aborted || tiles.get(id) !== tile) return;
              tile.ready = draw(bitmap, tile);
              if (tile.ready) options.onChange();
            } catch {
              // CORS/decode/canvas failures cannot compromise world capture or reveal stale pixels.
              clear(tile);
              tile.ready = false;
            } finally {
              bitmap.close();
            }
          })
          .catch(() => {
            /* Failed identities stay masked until their URL or render window changes. */
          });
      }
    },
    get(id: string) {
      const tile = tiles.get(id);
      return tile?.ready ? tile.uv : null;
    },
    flush() {
      if (disposed || !changed) return;
      texture.needsUpdate = true;
      changed = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const tile of tiles.values()) clear(tile);
      tiles.clear();
      canvas.width = canvas.height = probe.width = probe.height = 0;
      // The map's material is detached by the owner before normal scene resource cleanup.
      texture.dispose();
    },
  };
}
