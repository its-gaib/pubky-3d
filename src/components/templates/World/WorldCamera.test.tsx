import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldCamera } from './WorldCamera';

const mocks = vi.hoisted(() => ({ openComposer: vi.fn(), clearError: vi.fn(), useWorldPhotoPost: vi.fn() }));
vi.mock('@/hooks/useWorldPhotoPost/useWorldPhotoPost', () => ({ useWorldPhotoPost: mocks.useWorldPhotoPost }));
vi.mock('@/hooks/useDialogKeyboardOrchestrator/useDialogKeyboardOrchestrator', () => ({
  useDialogKeyboardOrchestrator: () => ({ isKeyboardVisible: false, spacerHeight: 0, contentStyle: undefined }),
}));

beforeEach(() => {
  mocks.openComposer.mockReturnValue(true);
  mocks.useWorldPhotoPost.mockReturnValue({
    openComposer: mocks.openComposer,
    composer: null,
    isComposerOpen: false,
    isAuthenticated: true,
    network: 'production',
    error: null,
    clearError: mocks.clearError,
  });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:world-photo') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

describe('WorldCamera', () => {
  it('keeps the photo private until the user explicitly opens the composer', async () => {
    const user = userEvent.setup();
    const photo = new Blob(['test image'], { type: 'image/png' });
    const onCapture = vi.fn().mockResolvedValue(photo);
    const onOpenChange = vi.fn();
    render(<WorldCamera disabled={false} onCapture={onCapture} onOpenChange={onOpenChange} onReturnFocus={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Take a photo' }));
    expect(await screen.findByRole('img', { name: 'Your photo from Pubky World' })).toHaveAttribute(
      'src',
      'blob:world-photo',
    );
    expect(screen.getByRole('link', { name: 'Download photo' })).toHaveAttribute('download', 'pubky-world.png');
    expect(screen.getByText(/Posts go to Pubky production/)).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(mocks.openComposer).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Post to Pubky' }));
    expect(mocks.openComposer).toHaveBeenCalledExactlyOnceWith(photo);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:world-photo'));
  });

  it('releases a discarded photo and returns control to the world', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onReturnFocus = vi.fn();
    render(
      <WorldCamera
        disabled={false}
        onCapture={async () => new Blob(['image'], { type: 'image/png' })}
        onOpenChange={onOpenChange}
        onReturnFocus={onReturnFocus}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Take a photo' }));
    await screen.findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Back to framing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:world-photo');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(onReturnFocus).toHaveBeenCalled();
    expect(mocks.openComposer).not.toHaveBeenCalled();
  });

  it('ignores a capture that completes after the camera has unmounted', async () => {
    let resolveCapture!: (blob: Blob) => void;
    const pending = new Promise<Blob>((resolve) => {
      resolveCapture = resolve;
    });
    const user = userEvent.setup();
    const { unmount } = render(
      <WorldCamera disabled={false} onCapture={() => pending} onOpenChange={vi.fn()} onReturnFocus={vi.fn()} />,
    );
    await user.click(screen.getByRole('button', { name: 'Take a photo' }));
    unmount();
    await act(async () => resolveCapture(new Blob(['image'], { type: 'image/png' })));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.openComposer).not.toHaveBeenCalled();
  });

  it('allows only one capture at a time and recovers from encoding failure', async () => {
    let resolveCapture!: (blob: null) => void;
    const pending = new Promise<null>((resolve) => {
      resolveCapture = resolve;
    });
    const onCapture = vi.fn(() => pending);
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<WorldCamera disabled={false} onCapture={onCapture} onOpenChange={onOpenChange} onReturnFocus={vi.fn()} />);
    await user.dblClick(screen.getByRole('button', { name: 'Take a photo' }));
    expect(onCapture).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeDisabled();
    await act(async () => resolveCapture(null));
    expect(screen.getByRole('alert')).toHaveTextContent('The camera missed that moment');
    expect(screen.getByRole('button', { name: 'Take a photo' })).toBeEnabled();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
