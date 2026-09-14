import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldAvatarImageLoader, type WorldAvatarImageLoader } from '@/libs/world/world-avatar-image';
import type { WorldAvatarIdentity } from '@/libs/world/world-types';
import { asOpaque } from '@/test-utils/type-assertions';
import { WorldArenaGlory } from './WorldArenaGlory';

vi.mock('@/libs/world/world-avatar-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/libs/world/world-avatar-image')>()),
  createWorldAvatarImageLoader: vi.fn(),
}));

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

describe('the victory screen Glory flag', () => {
  let context: CanvasRenderingContext2D;
  const requests: {
    identity: WorldAvatarIdentity;
    signal: AbortSignal | undefined;
    result: ReturnType<typeof deferred<ImageBitmap | null>>;
  }[] = [];
  const loaders: WorldAvatarImageLoader[] = [];

  beforeEach(() => {
    requests.length = 0;
    loaders.length = 0;
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
      closePath: vi.fn(),
      fill: vi.fn(),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    vi.mocked(createWorldAvatarImageLoader).mockImplementation(() => {
      const loader: WorldAvatarImageLoader = {
        load: vi.fn((viewer, signal) => {
          const result = deferred<ImageBitmap | null>();
          requests.push({ identity: viewer, signal, result });
          return result.promise;
        }),
        dispose: vi.fn(),
      };
      loaders.push(loader);
      return loader;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function finish(index: number, image: ImageBitmap | null) {
    await act(async () => {
      requests[index].result.resolve(image);
      await requests[index].result.promise;
    });
  }

  it('draws the approved champion portrait on the shared 2D GLORY artwork and clears it on unmount', async () => {
    const { rerender, unmount } = render(<WorldArenaGlory viewer={identity()} />);
    const canvas = screen.getByRole<HTMLCanvasElement>('img', { name: 'Glory flag for the arena champion' });
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(768);
    expect(context.fillText).toHaveBeenCalledWith('GLORY', 256, 158);
    expect(context.fill).toHaveBeenCalledOnce();
    expect(requests[0].identity).toEqual(identity());
    const image = bitmap();
    await finish(0, image);
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(image, 100, 0, 200, 200, 82, 229, 348, 348);
    expect(image.close).toHaveBeenCalledOnce();

    rerender(<WorldArenaGlory viewer={{ ...identity() }} />);
    expect(requests).toHaveLength(1);
    expect(screen.getByRole('img')).toBe(canvas);
    unmount();
    expect(requests[0].signal?.aborted).toBe(true);
    expect(loaders[0].dispose).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('keeps a generic crown for a guest victory even if an account signs in later', () => {
    const { rerender } = render(<WorldArenaGlory viewer={null} />);
    expect(context.fill).toHaveBeenCalledOnce();
    rerender(<WorldArenaGlory viewer={identity()} />);
    rerender(<WorldArenaGlory viewer={null} />);
    rerender(<WorldArenaGlory viewer={identity('b')} />);
    expect(requests).toHaveLength(0);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(screen.getByRole('img', { name: 'Glory flag for the arena champion' })).toBeInTheDocument();
  });

  it.each([null, identity('b'), { ...identity(), avatarUrl: 'https://example.com/portrait.png' }])(
    'clears and permanently revokes a painted champion when approved identity changes to %s',
    async (next) => {
      const { rerender } = render(<WorldArenaGlory viewer={identity()} />);
      await finish(0, bitmap());
      const resize = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set');
      vi.mocked(context.fill).mockClear();

      rerender(<WorldArenaGlory viewer={next} />);
      expect(requests[0].signal?.aborted).toBe(true);
      expect(loaders[0].dispose).toHaveBeenCalledOnce();
      expect(resize).toHaveBeenNthCalledWith(1, 0);
      expect(resize).toHaveBeenNthCalledWith(2, 512);
      expect(context.fill).toHaveBeenCalledOnce();
      rerender(<WorldArenaGlory viewer={identity()} />);
      expect(requests).toHaveLength(1);
      expect(context.drawImage).toHaveBeenCalledOnce();
    },
  );

  it('closes outdated avatar versions and only draws the current approved version', async () => {
    const { rerender } = render(<WorldArenaGlory viewer={identity()} />);
    rerender(<WorldArenaGlory viewer={identity('y', 2)} />);
    expect(requests[0].signal?.aborted).toBe(true);
    const stale = bitmap();
    await finish(0, stale);
    expect(stale.close).toHaveBeenCalledOnce();
    expect(context.drawImage).not.toHaveBeenCalled();

    const current = bitmap();
    await finish(1, current);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(current.close).toHaveBeenCalledOnce();
    const resize = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set');
    rerender(<WorldArenaGlory viewer={identity('y', 3)} />);
    expect(resize).toHaveBeenNthCalledWith(1, 0);
    await finish(2, null);
    expect(context.drawImage).toHaveBeenCalledOnce();
  });

  it.each(['logout', 'switch', 'unmount'] as const)('discards a late decoded portrait after %s', async (action) => {
    const { rerender, unmount } = render(<WorldArenaGlory viewer={identity()} />);
    if (action === 'unmount') unmount();
    else rerender(<WorldArenaGlory viewer={action === 'logout' ? null : identity('b')} />);
    const stale = bitmap();
    await finish(0, stale);
    expect(requests[0].signal?.aborted).toBe(true);
    expect(stale.close).toHaveBeenCalledOnce();
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('keeps the crown after failed image requests without retrying each status render', async () => {
    const { rerender } = render(<WorldArenaGlory viewer={identity()} />);
    await act(async () => {
      requests[0].result.reject(new DOMException('Unavailable', 'NetworkError'));
      await Promise.resolve();
    });
    rerender(<WorldArenaGlory viewer={identity()} />);
    expect(requests).toHaveLength(1);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.fill).toHaveBeenCalledTimes(2);
  });

  it('wipes a failed canvas portrait and redraws the generic crown', async () => {
    render(<WorldArenaGlory viewer={identity()} />);
    vi.mocked(context.drawImage).mockImplementation(() => {
      throw new DOMException('Canvas unavailable', 'InvalidStateError');
    });
    const resize = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set');
    const image = bitmap();
    await finish(0, image);
    expect(image.close).toHaveBeenCalledOnce();
    expect(resize).toHaveBeenCalledWith(0);
    expect(context.fill).toHaveBeenCalledTimes(2);
  });

  it('retains champion ownership across Strict Mode effect replay and discards the canceled request', async () => {
    render(
      <StrictMode>
        <WorldArenaGlory viewer={identity()} />
      </StrictMode>,
    );
    expect(requests).toHaveLength(2);
    expect(requests[0].signal?.aborted).toBe(true);
    const stale = bitmap();
    await finish(0, stale);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(stale.close).toHaveBeenCalledOnce();
    await finish(1, bitmap());
    expect(context.drawImage).toHaveBeenCalledOnce();
  });
});
