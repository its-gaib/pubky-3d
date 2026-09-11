import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldAvatarAtlas } from '@/libs/world/world-avatar-atlas';
import type { WorldAvatarImageIdentity, WorldAvatarImageLoader } from '@/libs/world/world-avatar-image';
import { asOpaque } from '@/test-utils/type-assertions';

const ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';

function identity(index: number, version = 1): WorldAvatarImageIdentity {
  const suffix = Array.from({ length: 4 }, (_, digit) => ALPHABET[(index >>> ((3 - digit) * 5)) & 31]).join('');
  const id = `${'y'.repeat(48)}${suffix}`;
  return { id, avatarUrl: `https://nexus.pubky.app/static/avatar/${id}?v=${version}` };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function bitmap(width = 128, height = 128) {
  return asOpaque<ImageBitmap>({ width, height, close: vi.fn() });
}

type Request = {
  identity: WorldAvatarImageIdentity;
  signal: AbortSignal | undefined;
  result: ReturnType<typeof deferred<ImageBitmap | null>>;
};

describe('world avatar atlas ownership', () => {
  const atlases: ReturnType<typeof createWorldAvatarAtlas>[] = [];
  let surface: CanvasRenderingContext2D;
  let probe: CanvasRenderingContext2D;
  let pixels: Uint8ClampedArray;

  beforeEach(() => {
    pixels = new Uint8ClampedArray(32 * 32 * 4);
    pixels[3] = 255;
    surface = asOpaque<CanvasRenderingContext2D>({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    });
    probe = asOpaque<CanvasRenderingContext2D>({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => asOpaque<ImageData>({ data: pixels })),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      return this.width === 32 ? probe : surface;
    });
  });

  afterEach(() => {
    atlases.splice(0).forEach((atlas) => atlas.dispose());
    vi.restoreAllMocks();
  });

  function setup(capacity = 1, enabled = true, zoom = 1) {
    const requests: Request[] = [];
    const loader: WorldAvatarImageLoader = {
      load: vi.fn((who, signal) => {
        const result = deferred<ImageBitmap | null>();
        requests.push({ identity: who, signal, result });
        return result.promise;
      }),
      dispose: vi.fn(),
    };
    const onChange = vi.fn();
    const atlas = createWorldAvatarAtlas(enabled ? loader : undefined, { capacity, onChange, zoom });
    atlases.push(atlas);
    return { atlas, loader, requests, onChange };
  }

  async function finish(request: Request, value: ImageBitmap | null) {
    request.result.resolve(value);
    await request.result.promise;
    await Promise.resolve();
  }

  it('does not let an old request paint a slot reused for the same identity', async () => {
    const { atlas, requests, onChange } = setup();
    const alice = identity(1);
    const bob = identity(2);
    atlas.sync([alice]);
    atlas.sync([bob]);
    atlas.sync([alice]);
    expect(requests).toHaveLength(3);
    expect(requests[0].signal!.aborted).toBe(true);
    expect(requests[1].signal!.aborted).toBe(true);
    expect(requests[2].signal!.aborted).toBe(false);
    const oldAlice = bitmap();
    const oldBob = bitmap();
    await finish(requests[0], oldAlice);
    await finish(requests[1], oldBob);
    expect(oldAlice.close).toHaveBeenCalledOnce();
    expect(oldBob.close).toHaveBeenCalledOnce();
    expect(surface.drawImage).not.toHaveBeenCalled();
    expect(atlas.get(alice.id)).toBeNull();
    const currentAlice = bitmap();
    await finish(requests[2], currentAlice);
    expect(atlas.get(alice.id)).not.toBeNull();
    expect(atlas.get(bob.id)).toBeNull();
    expect(surface.drawImage).toHaveBeenCalledExactlyOnceWith(currentAlice, 0, 0, 128, 128, 2, 2, 508, 508);
    expect(currentAlice.close).toHaveBeenCalledOnce();
    // Two removals immediately invalidate prior heads; a successful replacement rebuilds once.
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('clears an old version immediately and fetches only changed canonical identities', async () => {
    const { atlas, requests, loader, onChange } = setup();
    const original = identity(1, 1);
    atlas.sync([original]);
    await finish(requests[0], bitmap());
    const originalUv = atlas.get(original.id);
    atlas.sync([original]);
    expect(loader.load).toHaveBeenCalledOnce();
    atlas.sync([identity(1, 2)]);
    expect(atlas.get(original.id)).toBeNull();
    expect(surface.clearRect).toHaveBeenCalledWith(0, 0, 512, 512);
    expect(requests[0].signal!.aborted).toBe(true);
    expect(loader.load).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(2);
    await finish(requests[1], bitmap());
    expect(atlas.get(original.id)).toEqual(originalUv);
    atlas.sync([{ id: original.id, avatarUrl: 'https://example.com/profile.png' }]);
    expect(atlas.get(original.id)).toBeNull();
    expect(loader.load).toHaveBeenCalledTimes(2);
    expect(requests[1].signal!.aborted).toBe(true);
  });

  it('keeps completely transparent artwork masked and closes its bitmap', async () => {
    const { atlas, requests, onChange } = setup();
    const person = identity(1);
    pixels.fill(0);
    atlas.sync([person]);
    const transparent = bitmap();
    await finish(requests[0], transparent);
    expect(probe.getImageData).toHaveBeenCalledExactlyOnceWith(0, 0, 32, 32);
    expect(surface.drawImage).not.toHaveBeenCalled();
    expect(atlas.get(person.id)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(transparent.close).toHaveBeenCalledOnce();
    pixels[3] = 255;
    atlas.sync([identity(1, 2)]);
    await finish(requests[1], bitmap());
    expect(atlas.get(person.id)).not.toBeNull();
  });

  it.each([
    [400, 200, 2, 129, 508, 254],
    [200, 400, 129, 2, 254, 508],
  ])('contains the complete %i×%i artwork with a safe texture gutter', async (width, height, x, y, w, h) => {
    const { atlas, requests } = setup();
    const person = identity(1);
    atlas.sync([person]);
    const artwork = bitmap(width, height);
    await finish(requests[0], artwork);
    expect(surface.drawImage).toHaveBeenCalledExactlyOnceWith(artwork, 0, 0, width, height, x, y, w, h);
    expect(atlas.get(person.id)).toEqual([2 / 512, 2 / 512, 508 / 512, 508 / 512]);
    expect(surface.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 512, 512);
    expect(artwork.close).toHaveBeenCalledOnce();
  });

  it.each([1, 4])(
    'zooms %i-slot portrait heads and probes the same centered crop before revealing them',
    async (capacity) => {
      const { atlas, requests } = setup(capacity, true, 1.2);
      const person = identity(1);
      atlas.sync([person]);
      const portrait = bitmap(400, 400);
      await finish(requests[0], portrait);
      const [image, x, y, width, height, ...destination] = vi.mocked(surface.drawImage).mock.calls[0];
      expect(image).toBe(portrait);
      expect(width).toBeCloseTo(400 / 1.2);
      expect(height).toBeCloseTo(400 / 1.2);
      expect(x).toBeCloseTo((400 - 400 / 1.2) / 2);
      expect(y).toBeCloseTo((400 - 400 / 1.2) / 2);
      const contentSize = capacity === 1 ? 508 : 124;
      expect(destination).toEqual([2, 2, contentSize, contentSize]);
      expect(probe.drawImage).toHaveBeenCalledExactlyOnceWith(portrait, x, y, width, height, 0, 0, 32, 32);
      expect(atlas.get(person.id)).not.toBeNull();
      pixels.fill(0);
      atlas.sync([identity(1, 2)]);
      await finish(requests[1], bitmap(400, 400));
      expect(atlas.get(person.id)).toBeNull();
      expect(surface.drawImage).toHaveBeenCalledOnce();
    },
  );

  it('caps zoom and keeps a non-square social portrait crop inside its texture gutter', async () => {
    const player = setup(1, true, 100);
    player.atlas.sync([identity(1)]);
    await finish(player.requests[0], bitmap(400, 400));
    expect(vi.mocked(surface.drawImage).mock.calls[0][3]).toBeCloseTo(400 / 1.2);
    const social = setup(4, true, 1.2);
    social.atlas.sync([identity(2)]);
    const artwork = bitmap(400, 200);
    await finish(social.requests[0], artwork);
    const [image, x, y, width, height, destinationX, destinationY, destinationWidth, destinationHeight] = vi.mocked(
      surface.drawImage,
    ).mock.calls[1];
    expect(image).toBe(artwork);
    expect(x).toBeCloseTo((400 - 400 / 1.2) / 2);
    expect(y).toBe(0);
    expect(width).toBeCloseTo(400 / 1.2);
    expect(height).toBe(200);
    expect(destinationX).toBe(2);
    expect(destinationY).toBeCloseTo(26.8);
    expect(destinationWidth).toBe(124);
    expect(destinationHeight).toBeCloseTo(74.4);
    expect(probe.drawImage).toHaveBeenLastCalledWith(artwork, x, y, width, height, 0, 0, 32, 32);
  });

  it('uses a finite contained image when zoom is nonfinite or below one', async () => {
    for (const zoom of [NaN, Infinity, -Infinity, -2]) {
      const social = setup(4, true, zoom);
      social.atlas.sync([identity(1)]);
      const portrait = bitmap(400, 400);
      await finish(social.requests[0], portrait);
      expect(surface.drawImage).toHaveBeenLastCalledWith(portrait, 0, 0, 400, 400, 2, 2, 124, 124);
      expect(social.atlas.get(identity(1).id)).not.toBeNull();
    }
  });

  it('bounds GPU storage and live leases to the 192-person render window', async () => {
    const { atlas, requests } = setup(1000);
    const firstPage = Array.from({ length: 1000 }, (_, index) => identity(index));
    atlas.sync(firstPage);
    expect(requests).toHaveLength(192);
    expect(atlas.texture.image.width).toBe(2048);
    expect(atlas.texture.image.height).toBe(2048);
    expect(atlas.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(atlas.texture.generateMipmaps).toBe(false);
    expect(atlas.texture.minFilter).toBe(THREE.LinearFilter);
    atlas.sync(Array.from({ length: 1000 }, (_, index) => identity(index + 128)));
    expect(requests.filter((request) => !request.signal!.aborted)).toHaveLength(192);
    expect(requests).toHaveLength(320);
    expect(requests.slice(0, 128).every((request) => request.signal!.aborted)).toBe(true);
    // Late results from the departing page are closed and never copied into reused tiles.
    const stale = bitmap();
    await finish(requests[0], stale);
    expect(stale.close).toHaveBeenCalledOnce();
    expect(surface.drawImage).not.toHaveBeenCalled();
    expect(atlas.get(firstPage[0].id)).toBeNull();
  });

  it('batches completed tiles into one texture upload and stops uploads when unchanged', async () => {
    const { atlas, requests } = setup(4);
    const people = [identity(1), identity(2), identity(3)];
    atlas.sync(people);
    const initialVersion = atlas.texture.version;
    for (const request of requests) await finish(request, bitmap());
    expect(people.every((person) => atlas.get(person.id) !== null)).toBe(true);
    expect(atlas.texture.version).toBe(initialVersion);
    atlas.flush();
    expect(atlas.texture.version).toBe(initialVersion + 1);
    atlas.flush();
    expect(atlas.texture.version).toBe(initialVersion + 1);
  });

  it('releases pending leases, canvas storage, and the texture on disposal', async () => {
    const { atlas, requests, loader, onChange } = setup(2);
    atlas.sync([identity(1), identity(2)]);
    const disposeTexture = vi.spyOn(atlas.texture, 'dispose');
    const initialVersion = atlas.texture.version;
    atlas.dispose();
    atlas.dispose();
    expect(disposeTexture).toHaveBeenCalledOnce();
    expect(requests.every((request) => request.signal!.aborted)).toBe(true);
    expect(atlas.texture.image.width).toBe(0);
    expect(atlas.texture.image.height).toBe(0);
    const late = bitmap();
    await finish(requests[0], late);
    expect(late.close).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(surface.drawImage).not.toHaveBeenCalled();
    atlas.sync([identity(3)]);
    atlas.flush();
    expect(requests).toHaveLength(2);
    expect(atlas.get(identity(1).id)).toBeNull();
    expect(atlas.texture.version).toBe(initialVersion);
    // The shared image loader belongs to the scene, not either individual atlas.
    expect(loader.dispose).not.toHaveBeenCalled();
  });

  it('stays masked on unavailable canvas, missing loader, decode rejection, or canvas failure', async () => {
    const person = identity(1);
    const withoutLoader = setup(1, false);
    withoutLoader.atlas.sync([person]);
    expect(withoutLoader.atlas.get(person.id)).toBeNull();
    expect(withoutLoader.requests).toHaveLength(0);
    const { atlas, requests } = setup();
    atlas.sync([person]);
    requests[0].result.reject('Decode rejected');
    await Promise.resolve();
    await Promise.resolve();
    expect(atlas.get(person.id)).toBeNull();
    atlas.sync([identity(1, 2)]);
    vi.mocked(probe.getImageData).mockImplementationOnce(() => {
      throw 'Canvas denied';
    });
    const inaccessible = bitmap();
    await finish(requests[1], inaccessible);
    expect(inaccessible.close).toHaveBeenCalledOnce();
    expect(atlas.get(person.id)).toBeNull();
    expect(requests[1].signal!.aborted).toBe(true);
    expect(surface.drawImage).not.toHaveBeenCalled();
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const withoutCanvas = setup();
    withoutCanvas.atlas.sync([person]);
    expect(withoutCanvas.requests).toHaveLength(0);
    expect(withoutCanvas.atlas.get(person.id)).toBeNull();
  });
});
