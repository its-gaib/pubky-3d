import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorldAccount } from '@/hooks/useWorldAccount/useWorldAccount';
import production from '@/libs/world/world-production.json';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
import { WorldAccountMenu } from './WorldAccountMenu';

const FIRST = 'y'.repeat(52);
const SECOND = `${'b'.repeat(51)}o`;
const mocks = vi.hoisted(() => ({
  actor: null as string | null,
  session: null as { testAccount: number } | null,
  hydrated: true,
  onboardingHydrated: true,
  restoring: false,
  loggingOut: false,
  hasProfile: true,
  network: 'production',
  details: null as NexusUserDetails | null,
  profile: vi.fn(),
  avatar: vi.fn(),
  logout: vi.fn<() => Promise<void>>(),
  push: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/controllers/auth/auth', () => ({ AuthController: { logout: mocks.logout } }));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: mocks.toast }));
vi.mock('@/controllers/file/file', () => ({ FileController: { getAvatarUrl: mocks.avatar } }));
vi.mock('@/libs/runtime-config/runtime-config', () => ({
  getRuntimeConfig: () => ({ ...production, deployEnv: mocks.network }),
}));
vi.mock('@/controllers/moderation/moderation', () => ({
  ModerationController: {
    getModerationStatus: vi.fn().mockResolvedValue({ is_moderated: false, is_blurred: false }),
    unBlur: vi.fn(),
  },
}));
vi.mock('@/hooks/useCurrentUserProfile/useCurrentUserProfile', () => ({
  useCurrentUserProfile: (options: { enabled: boolean }) => {
    mocks.profile(options);
    return { currentUserPubky: mocks.actor, userDetails: mocks.details };
  },
}));
vi.mock('@/stores/auth/auth.store', () => {
  const state = () => ({
    currentUserPubky: mocks.actor,
    session: mocks.session,
    sessionExport: null,
    hasHydrated: mocks.hydrated,
    hasProfile: mocks.hasProfile,
    isRestoringSession: mocks.restoring,
    isLoggingOut: mocks.loggingOut,
  });
  return {
    useAuthStore: Object.assign(
      (selector?: (value: ReturnType<typeof state>) => unknown) => (selector ? selector(state()) : state()),
      { getState: state },
    ),
  };
});
vi.mock('@/stores/onboarding/onboarding.store', () => {
  const state = () => ({ hasHydrated: mocks.onboardingHydrated });
  return {
    useOnboardingStore: Object.assign(
      (selector?: (value: ReturnType<typeof state>) => unknown) => (selector ? selector(state()) : state()),
      { getState: state },
    ),
  };
});

function profile(id = FIRST, name = 'Avery'): NexusUserDetails {
  return { id, name, bio: '', links: [], status: null, image: 'https://untrusted.example/image', indexed_at: 123 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor = FIRST;
  mocks.session = { testAccount: 1 };
  mocks.hydrated = true;
  mocks.onboardingHydrated = true;
  mocks.restoring = false;
  mocks.loggingOut = false;
  mocks.hasProfile = true;
  mocks.network = 'production';
  mocks.details = profile();
  mocks.logout.mockResolvedValue(undefined);
  mocks.avatar.mockImplementation(
    (id: string, version?: number) =>
      `https://nexus.pubky.app/static/avatar/${encodeURIComponent(id)}${version === undefined ? '' : `?v=${version}`}`,
  );
});
afterEach(() => vi.restoreAllMocks());

describe('WorldAccountMenu', () => {
  it('shows the current display name and canonical avatar, then offers an explicit logout', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(80);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<WorldAccountMenu personaColor="#c8ff03" onOpenChange={onOpenChange} />);
    expect(await screen.findByRole('img', { name: 'Avery’s profile picture' })).toHaveAttribute(
      'src',
      `https://nexus.pubky.app/static/avatar/${FIRST}?v=123`,
    );
    expect(mocks.avatar).toHaveBeenCalledWith(FIRST, 123);
    expect(screen.queryByText('Your Pubky persona')).not.toBeInTheDocument();
    expect(screen.queryByText('Your social circle')).not.toBeInTheDocument();
    expect(mocks.logout).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Account menu for Avery' }));
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(false));
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it.each(['missing', 'failed'] as const)('keeps a usable profile menu when the avatar is %s', async (image) => {
    if (image === 'missing') mocks.details = { ...profile(), image: null };
    else {
      vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
      vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
    }
    const user = userEvent.setup();
    render(<WorldAccountMenu personaColor="#c8ff03" onOpenChange={vi.fn()} />);
    expect(await screen.findByTestId('avatar-fallback-initial')).toHaveTextContent('A');
    await user.click(screen.getByRole('button', { name: 'Account menu for Avery' }));
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
  });

  it('closes an old account menu and hides its cached profile immediately when the actor changes', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<WorldAccountMenu personaColor="#c8ff03" onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: 'Account menu for Avery' }));
    mocks.actor = SECOND;
    mocks.session = { testAccount: 2 };
    rerender(<WorldAccountMenu personaColor="#c8ff03" onOpenChange={onOpenChange} />);
    expect(screen.queryByText('Avery')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Account menu for ${SECOND.slice(0, 6)}…${SECOND.slice(-4)}` }),
    ).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    mocks.details = profile(SECOND, 'Bo');
    rerender(<WorldAccountMenu personaColor="#c8ff03" onOpenChange={onOpenChange} />);
    expect(screen.getByRole('button', { name: 'Account menu for Bo' })).toBeInTheDocument();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('suppresses profile reads and identity while restoring, logging out, or outside the approved network', () => {
    const { rerender } = render(<WorldAccountMenu personaColor="#c8ff03" onOpenChange={vi.fn()} />);
    const scenarios = [
      () => {
        mocks.restoring = true;
      },
      () => {
        mocks.restoring = false;
        mocks.loggingOut = true;
      },
      () => {
        mocks.loggingOut = false;
        mocks.network = 'staging';
      },
      () => {
        mocks.network = 'production';
        mocks.hydrated = false;
      },
      () => {
        mocks.hydrated = true;
        mocks.actor = null;
        mocks.session = null;
      },
    ];
    for (const change of scenarios) {
      change();
      rerender(<WorldAccountMenu personaColor="#c8ff03" onOpenChange={vi.fn()} />);
      expect(mocks.profile).toHaveBeenLastCalledWith({ enabled: false });
      expect(screen.queryByText('Avery')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
    expect(screen.getByText('Curious explorer')).toBeInTheDocument();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('bounds names as plain text and omits invalid avatar versions', () => {
    mocks.details = { ...profile(FIRST, `<b>Avery</b>\n\u202e${'x'.repeat(100)}`), indexed_at: NaN };
    render(<WorldAccountMenu personaColor="#c8ff03" onOpenChange={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button.textContent?.length).toBeLessThanOrEqual(48);
    expect(button.textContent).toContain('<b>Avery</b>');
    expect(button.textContent).not.toContain('\u202e');
    expect(button.querySelector('b')).toBeNull();
    expect(mocks.avatar).toHaveBeenCalledWith(FIRST, undefined);
  });

  it('uses the full logout hook once, hides identity while pending, and waits before leaving', async () => {
    let finish!: () => void;
    mocks.logout.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<WorldAccountMenu personaColor="#c8ff03" onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Account menu for Avery' }));
    const item = screen.getByRole('menuitem', { name: 'Log out' });
    fireEvent.click(item);
    fireEvent.click(item);
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Logging out…');
    expect(screen.queryByText('Avery')).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/logout'));
  });

  it('keeps the existing static logout failure and allows an explicit retry', async () => {
    mocks.logout.mockRejectedValueOnce(new TypeError('Local cleanup failed'));
    const user = userEvent.setup();
    render(<WorldAccountMenu personaColor="#c8ff03" onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Account menu for Avery' }));
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: 'Could not sign out. Try again.' });
    expect(mocks.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Account menu for Avery' }));
    await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
    expect(mocks.logout).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledWith('/logout');
  });

  it.each(['actor', 'session', 'network', 'restoring'] as const)(
    'rejects a stale logout callback after a live %s change, before React rerenders',
    async (change) => {
      const { result } = renderHook(() => useWorldAccount());
      const signOut = result.current.signOut;
      if (change === 'actor') mocks.actor = SECOND;
      if (change === 'session') mocks.session = { testAccount: 2 };
      if (change === 'network') mocks.network = 'staging';
      if (change === 'restoring') mocks.restoring = true;
      await act(async () => signOut());
      expect(mocks.logout).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    },
  );
});
