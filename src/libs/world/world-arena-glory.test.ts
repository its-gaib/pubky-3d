import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldArenaGlory } from '@/libs/world/world-arena-glory';
import type { WorldAvatarImageLoader } from '@/libs/world/world-avatar-image';
import type { WorldAvatarIdentity } from '@/libs/world/world-types';
import { asOpaque } from '@/test-utils/type-assertions';

function identity(letter = 'y', version = 1): WorldAvatarIdentity {
  const id = letter.repeat(52);
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

function bitmap() {
  return asOpaque<ImageBitmap>({ width: 400, height: 200, close: vi.fn() });
}

describe('arena champion banner ownership', () => {
  const cleanups: (() => void)[] = [];
  let context: CanvasRenderingContext2D;

  beforeEach(() => {
    context = asOpaque<CanvasRenderingContext2D>({
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  });

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.restoreAllMocks();
  });

  function setup() {
    const requests: {
      identity: WorldAvatarIdentity;
      signal: AbortSignal | undefined;
      result: ReturnType<typeof deferred<ImageBitmap | null>>;
    }[] = [];
    const loader: WorldAvatarImageLoader = {
      load: vi.fn((viewer, signal) => {
        const result = deferred<ImageBitmap | null>();
        requests.push({ identity: viewer, signal, result });
        return result.promise;
      }),
      dispose: vi.fn(),
    };
    const originals = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
    const geometry = new THREE.PlaneGeometry(1.75, 2.7);
    const banners = Array.from({ length: 4 }, (_, index) => new THREE.Mesh(geometry, originals[index % 2]));
    const glory = createWorldArenaGlory(banners, loader);
    cleanups.push(() => {
      glory.dispose();
      originals.forEach((material) => material.dispose());
      geometry.dispose();
    });
    function expectBrands() {
      banners.forEach((banner, index) => expect(banner.material).toBe(originals[index % 2]));
    }
    async function finish(index: number, image: ImageBitmap | null) {
      requests[index].result.resolve(image);
      await requests[index].result.promise;
      await Promise.resolve();
    }
    return { glory, loader, requests, banners, expectBrands, finish };
  }

  it('shows one shared portrait with literal GLORY only after the approved viewer wins', async () => {
    const { glory, loader, requests, banners, expectBrands, finish } = setup();
    const viewer = identity();
    glory.setIdentity(viewer);
    expect(loader.load).not.toHaveBeenCalled();
    glory.celebrateVictory();
    glory.celebrateVictory();
    expect(requests).toHaveLength(1);
    expect(requests[0].identity).toEqual(viewer);
    expect(requests[0].signal?.aborted).toBe(false);
    expectBrands();
    const image = bitmap();
    await finish(0, image);
    expect(context.fillText).toHaveBeenCalledExactlyOnceWith('GLORY', 256, 158);
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(image, 100, 0, 200, 200, 82, 229, 348, 348);
    expect(image.close).toHaveBeenCalledOnce();
    expect(new Set(banners.map((banner) => banner.material)).size).toBe(1);
    expect(banners[0].material.map).toBeInstanceOf(THREE.CanvasTexture);
    expect(banners[0].material.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(loader.dispose).not.toHaveBeenCalled();
  });

  it('never grants a guest victory to an account that signs in afterward', () => {
    const { glory, loader, expectBrands } = setup();
    glory.celebrateVictory();
    glory.setIdentity(identity());
    glory.celebrateVictory();
    expect(loader.load).not.toHaveBeenCalled();
    expectBrands();
  });

  it.each([null, identity('b')])(
    'immediately wipes and revokes a champion when the viewer changes to %s',
    async (next) => {
      const { glory, loader, requests, banners, expectBrands, finish } = setup();
      glory.setIdentity(identity());
      glory.celebrateVictory();
      await finish(0, bitmap());
      const material = banners[0].material;
      const texture = material.map!;
      const canvas = texture.image as HTMLCanvasElement;
      const disposeTexture = vi.spyOn(texture, 'dispose');
      const disposeMaterial = vi.spyOn(material, 'dispose');
      glory.setIdentity(next);
      expectBrands();
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
      expect(requests[0].signal?.aborted).toBe(true);
      expect(disposeTexture).toHaveBeenCalledOnce();
      expect(disposeMaterial).toHaveBeenCalledOnce();
      glory.setIdentity(identity());
      glory.celebrateVictory();
      expect(loader.load).toHaveBeenCalledOnce();
      expectBrands();
    },
  );

  it('rejects stale avatar versions and retains only the current winning identity', async () => {
    const { glory, requests, expectBrands, finish } = setup();
    glory.setIdentity(identity());
    glory.celebrateVictory();
    glory.setIdentity(identity('y', 2));
    expect(requests).toHaveLength(2);
    expect(requests[0].signal?.aborted).toBe(true);
    const stale = bitmap();
    await finish(0, stale);
    expect(stale.close).toHaveBeenCalledOnce();
    expect(context.drawImage).not.toHaveBeenCalled();
    expectBrands();
    const current = bitmap();
    await finish(1, current);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(current.close).toHaveBeenCalledOnce();
    glory.setIdentity(identity('y', 3));
    expectBrands();
    expect(requests[1].signal?.aborted).toBe(true);
    await finish(2, null);
    expectBrands();
  });

  it.each(['logout', 'switch', 'dispose'] as const)(
    'closes a late bitmap after %s without painting it',
    async (action) => {
      const { glory, requests, expectBrands, finish } = setup();
      glory.setIdentity(identity());
      glory.celebrateVictory();
      if (action === 'dispose') glory.dispose();
      else glory.setIdentity(action === 'switch' ? identity('b') : null);
      expect(requests[0].signal?.aborted).toBe(true);
      const stale = bitmap();
      await finish(0, stale);
      expect(stale.close).toHaveBeenCalledOnce();
      expect(context.drawImage).not.toHaveBeenCalled();
      expectBrands();
    },
  );

  it.each(['https://example.com/avatar.png', 'data:image/png;base64,abc', `${identity().avatarUrl}&extra=1`])(
    'does not load an unapproved avatar URL: %s',
    (avatarUrl) => {
      const { glory, loader, expectBrands } = setup();
      glory.setIdentity({ ...identity(), avatarUrl });
      glory.celebrateVictory();
      expect(loader.load).not.toHaveBeenCalled();
      expectBrands();
    },
  );

  it('restores brands after canvas failure and closes the decoded bitmap', async () => {
    const { glory, expectBrands, finish } = setup();
    vi.mocked(context.drawImage).mockImplementation(() => {
      throw new DOMException('Canvas unavailable', 'InvalidStateError');
    });
    glory.setIdentity(identity());
    glory.celebrateVictory();
    const image = bitmap();
    await finish(0, image);
    expect(image.close).toHaveBeenCalledOnce();
    expectBrands();
  });

  it('handles a loader failure without replacing the original banners', async () => {
    const { glory, requests, expectBrands } = setup();
    glory.setIdentity(identity());
    glory.celebrateVictory();
    requests[0].result.reject(new DOMException('Unavailable', 'NetworkError'));
    await Promise.resolve();
    await Promise.resolve();
    expectBrands();
  });
});
