import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAGE_MAX_RAW_SIZE } from '@/config/images';
import { DialogNewPost } from '@/organisms/DialogNewPost/DialogNewPost';
import { useWorldPhotoPost } from './useWorldPhotoPost';

const mocks = vi.hoisted(() => ({
  author: 'first-public-id' as string | null,
  signIn: vi.fn(),
  network: 'staging' as 'staging' | 'production',
  configUnavailable: false,
}));

// Keep the real useRequireAuth implementation: it must check the current public
// identity at click time and open the normal sign-in dialog when signed out.
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { currentUserPubky: string | null }) => unknown) => selector({ currentUserPubky: mocks.author }),
    {
      getState: () => ({ currentUserPubky: mocks.author, setShowSignInDialog: mocks.signIn }),
    },
  ),
}));

vi.mock('@/libs/runtime-config/runtime-config', () => ({
  getDeployEnv: () => {
    if (mocks.configUnavailable) throw new TypeError('Missing test runtime config');
    return mocks.network;
  },
}));

vi.mock('@/organisms/DialogNewPost/DialogNewPost', () => ({
  DialogNewPost: vi.fn(({ onOpenChangeAction }: { onOpenChangeAction: (open: boolean) => void }) => (
    <button onClick={() => onOpenChangeAction(false)}>Discard photo draft</button>
  )),
}));

function photoBlob() {
  return new Blob(['canvas png'], { type: 'image/png' });
}

describe('useWorldPhotoPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.author = 'first-public-id';
    mocks.network = 'staging';
    mocks.configUnavailable = false;
  });

  it('starts with no composer or queued photo', () => {
    const { result } = renderHook(useWorldPhotoPost);
    expect(result.current.composer).toBeNull();
    expect(result.current.isComposerOpen).toBe(false);
    expect(result.current.network).toBe('staging');
    expect(result.current.error).toBeNull();
  });

  it('hands one PNG File to the existing composer without publishing it', () => {
    const { result } = renderHook(useWorldPhotoPost);
    const photo = photoBlob();
    act(() => {
      expect(result.current.openComposer(photo)).toBe(true);
    });
    render(result.current.composer);

    const props = vi.mocked(DialogNewPost).mock.calls.at(-1)?.[0];
    expect(props?.initialAttachments).toHaveLength(1);
    const file = props?.initialAttachments?.[0];
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe('pubky-world.png');
    expect(file?.type).toBe('image/png');
    expect(file?.size).toBe(photo.size);
    expect(props?.description).toContain('Pubky staging');
    expect(props?.onPostCreated).toBeUndefined();
    expect(result.current.isComposerOpen).toBe(true);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('uses the configured production label only when runtime config declares it', () => {
    mocks.network = 'production';
    const { result } = renderHook(useWorldPhotoPost);
    act(() => {
      result.current.openComposer(photoBlob());
    });
    render(result.current.composer);
    expect(result.current.network).toBe('production');
    expect(vi.mocked(DialogNewPost).mock.calls.at(-1)?.[0].description).toContain('Pubky production');
  });

  it('fails closed when the network configuration is unavailable', () => {
    mocks.configUnavailable = true;
    const { result } = renderHook(useWorldPhotoPost);
    act(() => {
      expect(result.current.openComposer(photoBlob())).toBe(false);
    });
    expect(result.current.network).toBe('unavailable');
    expect(result.current.composer).toBeNull();
    expect(result.current.error).toContain('network configuration');
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it.each([
    ['empty PNG', () => new Blob([], { type: 'image/png' })],
    ['JPEG', () => new Blob(['jpeg'], { type: 'image/jpeg' })],
    ['SVG', () => new Blob(['<svg/>'], { type: 'image/svg+xml' })],
    ['HTML', () => new Blob(['<script/>'], { type: 'text/html' })],
  ])('rejects an %s without opening a composer', (_name, makeBlob) => {
    const { result } = renderHook(useWorldPhotoPost);
    act(() => {
      expect(result.current.openComposer(makeBlob())).toBe(false);
    });
    expect(result.current.composer).toBeNull();
    expect(result.current.error).toContain('PNG');
  });

  it('rejects a photo beyond the existing raw image size limit', () => {
    const photo = photoBlob();
    Object.defineProperty(photo, 'size', { value: IMAGE_MAX_RAW_SIZE + 1 });
    const { result } = renderHook(useWorldPhotoPost);
    act(() => {
      expect(result.current.openComposer(photo)).toBe(false);
    });
    expect(result.current.error).toContain('too large');
    expect(result.current.composer).toBeNull();
  });

  it('opens normal sign-in for a guest and never queues the photo across login', () => {
    mocks.author = null;
    const { result, rerender } = renderHook(useWorldPhotoPost);
    act(() => {
      expect(result.current.openComposer(photoBlob())).toBe(false);
    });
    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith(true);
    expect(result.current.error).toContain('leaving the world clears it');
    expect(result.current.composer).toBeNull();

    mocks.author = 'newly-signed-in-id';
    rerender();
    expect(result.current.composer).toBeNull();
    expect(result.current.isComposerOpen).toBe(false);
  });

  it('checks auth again at click time if the user signed out after render', () => {
    const { result } = renderHook(useWorldPhotoPost);
    mocks.author = null;
    act(() => {
      expect(result.current.openComposer(photoBlob())).toBe(false);
    });
    expect(mocks.signIn).toHaveBeenCalledExactlyOnceWith(true);
    expect(result.current.composer).toBeNull();
  });

  it.each([null, 'another-public-id'])('discards the in-memory draft when the account becomes %s', (author) => {
    const { result, rerender } = renderHook(useWorldPhotoPost);
    act(() => {
      result.current.openComposer(photoBlob());
    });
    expect(result.current.isComposerOpen).toBe(true);

    mocks.author = author;
    rerender();
    expect(result.current.composer).toBeNull();
    expect(result.current.isComposerOpen).toBe(false);

    mocks.author = 'first-public-id';
    rerender();
    expect(result.current.composer).toBeNull();
  });

  it('does not replace an open draft with another capture, including a same-tick click', () => {
    const { result } = renderHook(useWorldPhotoPost);
    act(() => {
      expect(result.current.openComposer(photoBlob())).toBe(true);
      expect(result.current.openComposer(photoBlob())).toBe(false);
    });
    expect(result.current.error).toContain('current photo draft');
    expect(result.current.isComposerOpen).toBe(true);
  });

  it('releases a discarded draft and allows a new photo afterward', () => {
    const { result } = renderHook(useWorldPhotoPost);
    act(() => {
      result.current.openComposer(photoBlob());
    });
    const view = render(result.current.composer);
    fireEvent.click(screen.getByRole('button', { name: 'Discard photo draft' }));
    view.rerender(result.current.composer);
    expect(result.current.isComposerOpen).toBe(false);
    expect(result.current.composer).toBeNull();

    act(() => {
      expect(result.current.openComposer(photoBlob())).toBe(true);
    });
    expect(result.current.isComposerOpen).toBe(true);
  });

  it('allows the photo UI to dismiss a validation notice', () => {
    const { result } = renderHook(useWorldPhotoPost);
    act(() => {
      result.current.openComposer(new Blob());
    });
    expect(result.current.error).not.toBeNull();
    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });
});
