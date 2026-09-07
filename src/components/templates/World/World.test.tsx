import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_WORLD_DATA } from '@/libs/world/world-catalog';
import type { WorldController, WorldData, WorldOptions } from '@/libs/world/world-types';
import { World } from './World';

const mocks = vi.hoisted(() => ({
  createWorld: vi.fn<(container: HTMLDivElement, options: WorldOptions) => WorldController>(),
  useWorldData: vi.fn(),
  loadStaging: vi.fn(),
  resetExample: vi.fn(),
  controller: {
    dispose: vi.fn(),
    travelTo: vi.fn(),
    setOverview: vi.fn(),
    setPaused: vi.fn(),
    setNight: vi.fn(),
    setReducedMotion: vi.fn(),
    setTheaterLoading: vi.fn(),
    setTheaterPaused: vi.fn(),
    stepTheater: vi.fn(),
    setPersonaColor: vi.fn(),
    setMove: vi.fn(),
    jump: vi.fn(),
    dance: vi.fn(),
    interact: vi.fn(),
    capturePhoto: vi.fn(),
    updateData: vi.fn(),
    getPersonaState: vi.fn(),
  },
}));

vi.mock('@/libs/world/world-scene', () => ({ createWorld: mocks.createWorld }));
vi.mock('@/hooks/useWorldData/useWorldData', () => ({ useWorldData: mocks.useWorldData }));
vi.mock('@/controllers/moderation/moderation', () => ({
  ModerationController: {
    getModerationStatus: vi.fn().mockResolvedValue({ is_moderated: false, is_blurred: false }),
    unBlur: vi.fn(),
  },
}));
vi.mock('@/hooks/useWorldPhotoPost/useWorldPhotoPost', () => ({
  useWorldPhotoPost: () => ({
    openComposer: vi.fn(),
    composer: null,
    isComposerOpen: false,
    isAuthenticated: false,
    network: 'staging',
    error: null,
    clearError: vi.fn(),
  }),
}));
vi.mock('@/hooks/useDialogKeyboardOrchestrator/useDialogKeyboardOrchestrator', () => ({
  useDialogKeyboardOrchestrator: () => ({ isKeyboardVisible: false, spacerHeight: 0, contentStyle: undefined }),
}));

const STAGING_PERSON_ID = 'y'.repeat(52);
const STAGING_AVATAR_URL = `https://nexus.staging.pubky.app/static/avatar/${STAGING_PERSON_ID}`;
const STAGING_WORLD_DATA: WorldData = {
  source: 'staging',
  tags: [],
  people: [
    {
      id: STAGING_PERSON_ID,
      name: 'Avery',
      bio: 'A public staging profile.',
      color: '#c8ff03',
      position: [0, 8],
      avatarUrl: STAGING_AVATAR_URL,
    },
  ],
  relationships: [],
  trendingPosts: [
    {
      id: `${STAGING_PERSON_ID}:CURRENT_POST`,
      author: 'Avery',
      text: 'A public conversation for the current show.',
      tags: ['pubky'],
      url: `/post/${STAGING_PERSON_ID}/CURRENT_POST`,
    },
  ],
};

function mockWorldData(data: WorldData, status: 'demo' | 'loading' | 'staging' | 'error', error: string | null = null) {
  mocks.useWorldData.mockReturnValue({
    data,
    status,
    error,
    loadStaging: mocks.loadStaging,
    useDemo: mocks.resetExample,
  });
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  mocks.useWorldData.mockReturnValue({
    data: DEMO_WORLD_DATA,
    status: 'demo',
    error: null,
    loadStaging: mocks.loadStaging,
    useDemo: mocks.resetExample,
  });
  mocks.createWorld.mockImplementation((_container, options) => {
    options.onReady();
    return mocks.controller;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('World', () => {
  it('starts with labeled examples and loads the scene without requesting staging data', async () => {
    const { unmount } = render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    expect(screen.getByRole('heading', { name: /Your social world/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Example' })).toHaveAttribute('aria-pressed', 'true');
    expect(mocks.loadStaging).not.toHaveBeenCalled();
    expect(mocks.controller.setOverview).toHaveBeenCalledWith(true);
    expect(screen.queryByText('Growing your little world…')).not.toBeInTheDocument();
    unmount();
    expect(mocks.controller.dispose).toHaveBeenCalledOnce();
  });

  it('pauses walking while reading a tree and restores movement after closing its accessible dialog', async () => {
    const user = userEvent.setup();
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Read about Tag Forest' }));
    const dialog = screen.getByRole('dialog', { name: 'Tag Forest' });
    expect(mocks.controller.setPaused).toHaveBeenLastCalledWith(true);
    await user.click(within(dialog).getByRole('button', { name: /#pubky/ }));
    expect(screen.getByRole('dialog', { name: '#pubky' })).toBeInTheDocument();
    expect(screen.getAllByText('Fictional example post').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Close and return to world' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.controller.setPaused).toHaveBeenLastCalledWith(false);
  });

  it('travels to a destination and focuses the world so keyboard walking works immediately', async () => {
    const user = userEvent.setup();
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Travel to Pubky University' }));
    expect(mocks.controller.travelTo).toHaveBeenCalledWith('university');
    expect(mocks.controller.setOverview).toHaveBeenLastCalledWith(false);
    expect(screen.getByLabelText(/Interactive Pubky island/)).toHaveFocus();
    expect(screen.queryByRole('heading', { name: /Your social world/ })).not.toBeInTheDocument();
  });

  it('keeps destination reading available when WebGL cannot initialize', async () => {
    mocks.createWorld.mockImplementation(() => {
      throw new TypeError('WebGL unavailable');
    });
    const user = userEvent.setup();
    render(<World />);
    await screen.findByText('The island needs a different view.');
    await user.click(screen.getByRole('button', { name: 'Travel to Pubky University' }));
    expect(screen.getByRole('dialog', { name: 'Pubky University' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Keys 101' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Read the full lesson' })).toHaveLength(5);
  });

  it('marks staging leaves and profiles as samples rather than live players', async () => {
    mocks.useWorldData.mockReturnValue({
      data: { ...DEMO_WORLD_DATA, source: 'staging' },
      status: 'staging',
      error: null,
      loadStaging: mocks.loadStaging,
      useDemo: mocks.resetExample,
    });
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    await act(async () => mocks.createWorld.mock.calls[0][1].onInteract({ kind: 'person', id: 'moss' }));
    expect(screen.getByText(/This is a profile marker, not a player online/)).toBeInTheDocument();
    expect(screen.getByText(/Profile markers do not indicate live presence/)).toBeInTheDocument();
  });

  it('shows the sampled person’s profile picture through the real avatar and dialog components', async () => {
    // jsdom does not fetch images. Simulate the browser's loaded-image metadata
    // while keeping Radix and AvatarWithFallback's rendering behavior intact.
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(80);
    mockWorldData(STAGING_WORLD_DATA, 'staging');
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    await act(async () => mocks.createWorld.mock.calls[0][1].onInteract({ kind: 'person', id: STAGING_PERSON_ID }));

    const dialog = screen.getByRole('dialog', { name: 'Avery' });
    const picture = await within(dialog).findByRole('img', { name: 'Avery’s profile picture' });
    expect(picture).toHaveAttribute('src', STAGING_AVATAR_URL);
    expect(within(dialog).getByText('A public staging profile.')).toBeInTheDocument();
    expect(mocks.controller.setPaused).toHaveBeenLastCalledWith(true);
  });

  it.each(['missing', 'failed'] as const)('keeps a profile fallback when the picture is %s', async (state) => {
    if (state === 'failed') {
      vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
      vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
    }
    mockWorldData(
      {
        ...STAGING_WORLD_DATA,
        people: [{ ...STAGING_WORLD_DATA.people[0], avatarUrl: state === 'missing' ? undefined : STAGING_AVATAR_URL }],
      },
      'staging',
    );
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    await act(async () => mocks.createWorld.mock.calls[0][1].onInteract({ kind: 'person', id: STAGING_PERSON_ID }));

    const dialog = screen.getByRole('dialog', { name: 'Avery' });
    expect(within(dialog).getByTestId('world-person-avatar')).toBeInTheDocument();
    expect(await within(dialog).findByTestId('avatar-fallback-initial')).toHaveTextContent('A');
    expect(within(dialog).queryByRole('img', { name: 'Avery’s profile picture' })).not.toBeInTheDocument();
  });

  it('preserves cartoon portraits for fictional example personas', async () => {
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    const person = DEMO_WORLD_DATA.people[0];
    await act(async () => mocks.createWorld.mock.calls[0][1].onInteract({ kind: 'person', id: person.id }));
    const dialog = screen.getByRole('dialog', { name: person.name });
    expect(within(dialog).queryByTestId('world-person-avatar')).not.toBeInTheDocument();
    expect(within(dialog).getByText('⌣')).toBeInTheDocument();
    expect(within(dialog).getByText(/These fictional people/)).toBeInTheDocument();
  });

  it.each(['demo', 'staging'] as const)(
    'replaces the previous %s program with a loader until staging resolves, including before scene readiness',
    async (source) => {
      const previousData = source === 'demo' ? DEMO_WORLD_DATA : STAGING_WORLD_DATA;
      mockWorldData(previousData, 'loading');
      // Scene creation is asynchronous, and onReady can happen later. Its initial
      // loading state must be applied even though no controller existed at mount.
      mocks.createWorld.mockImplementation(() => mocks.controller);
      const user = userEvent.setup();
      const { rerender } = render(<World />);
      await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
      expect(mocks.controller.setTheaterLoading).toHaveBeenLastCalledWith(true);
      await user.click(screen.getByRole('button', { name: 'Read about Trending Theater' }));

      const dialog = screen.getByRole('dialog', { name: 'Trending Theater' });
      expect(within(dialog).getByRole('status', { name: 'Loading trending posts' })).toBeInTheDocument();
      expect(within(dialog).queryByText(previousData.trendingPosts[0].text)).not.toBeInTheDocument();
      expect(within(dialog).queryByText('The stage is taking a breather.')).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('group', { name: 'Trending show controls' })).not.toBeInTheDocument();

      const freshData: WorldData = {
        ...STAGING_WORLD_DATA,
        trendingPosts: [{ ...STAGING_WORLD_DATA.trendingPosts[0], text: 'A newly loaded staging post.' }],
      };
      mockWorldData(freshData, 'staging');
      rerender(<World />);
      expect(within(dialog).queryByRole('status', { name: 'Loading trending posts' })).not.toBeInTheDocument();
      expect(within(dialog).getByText('A newly loaded staging post.')).toBeInTheDocument();
      expect(mocks.controller.updateData).toHaveBeenLastCalledWith(freshData);
      expect(mocks.controller.setTheaterLoading).toHaveBeenLastCalledWith(false);
      await act(async () => mocks.createWorld.mock.calls[0][1].onReady());
      expect(mocks.controller.setTheaterLoading).toHaveBeenLastCalledWith(false);
    },
  );

  it('stops loading on failure, starts it again for retry, and clears it when returning to examples', async () => {
    const emptyStaging: WorldData = { ...STAGING_WORLD_DATA, trendingPosts: [] };
    mockWorldData(emptyStaging, 'loading');
    const user = userEvent.setup();
    const { rerender } = render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Read about Trending Theater' }));
    expect(screen.getByRole('status', { name: 'Loading trending posts' })).toBeInTheDocument();

    mockWorldData(emptyStaging, 'error', 'The public staging sample could not be loaded.');
    rerender(<World />);
    expect(screen.queryByRole('status', { name: 'Loading trending posts' })).not.toBeInTheDocument();
    expect(screen.getByText('The public staging sample could not be loaded.')).toBeInTheDocument();
    expect(screen.getByText('The stage is taking a breather.')).toBeInTheDocument();
    expect(mocks.controller.setTheaterLoading).toHaveBeenLastCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Close and return to world' }));
    await user.click(screen.getByRole('button', { name: 'Staging' }));
    expect(mocks.loadStaging).toHaveBeenCalledOnce();
    mockWorldData(emptyStaging, 'loading');
    rerender(<World />);
    await user.click(screen.getByRole('button', { name: 'Read about Trending Theater' }));
    expect(screen.getByRole('status', { name: 'Loading trending posts' })).toBeInTheDocument();
    expect(mocks.controller.setTheaterLoading).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'Close and return to world' }));
    await user.click(screen.getByRole('button', { name: 'Example' }));
    expect(mocks.resetExample).toHaveBeenCalledOnce();
    mockWorldData(DEMO_WORLD_DATA, 'demo');
    rerender(<World />);
    await user.click(screen.getByRole('button', { name: 'Read about Trending Theater' }));
    expect(screen.queryByRole('status', { name: 'Loading trending posts' })).not.toBeInTheDocument();
    expect(screen.getByText(DEMO_WORLD_DATA.trendingPosts[0].text)).toBeInTheDocument();
    expect(mocks.controller.setTheaterLoading).toHaveBeenLastCalledWith(false);
  });

  it('pauses the theater for reading and lets the reader resume or skip the program', async () => {
    const user = userEvent.setup();
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Read about Trending Theater' }));
    const dialog = screen.getByRole('dialog', { name: 'Trending Theater' });
    expect(mocks.controller.setTheaterPaused).toHaveBeenLastCalledWith(true);
    expect(within(dialog).getByText(DEMO_WORLD_DATA.trendingPosts[0].text)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Resume show' }));
    expect(mocks.controller.setTheaterPaused).toHaveBeenLastCalledWith(false);
    await user.click(within(dialog).getByRole('button', { name: 'Next trending post' }));
    expect(mocks.controller.setTheaterPaused).toHaveBeenLastCalledWith(true);
    expect(mocks.controller.stepTheater).toHaveBeenLastCalledWith(1);
    await act(async () =>
      mocks.createWorld.mock.calls[0][1].onStatus({
        zone: 'theater',
        position: [-35, -4],
        nearby: null,
        collected: 0,
        theaterIndex: 1,
        theaterPaused: true,
      }),
    );
    expect(within(dialog).getByText(DEMO_WORLD_DATA.trendingPosts[1].text)).toBeInTheDocument();
    expect(within(dialog).queryByText(DEMO_WORLD_DATA.trendingPosts[0].text)).not.toBeInTheDocument();
  });

  it('supports manual theater browsing and wraparound without WebGL', async () => {
    mocks.createWorld.mockImplementation(() => {
      throw new TypeError('WebGL unavailable');
    });
    const user = userEvent.setup();
    render(<World />);
    await screen.findByText('The island needs a different view.');
    await user.click(screen.getByRole('button', { name: 'Travel to Trending Theater' }));
    const dialog = screen.getByRole('dialog', { name: 'Trending Theater' });
    expect(within(dialog).getByRole('button', { name: 'Resume show' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Previous trending post' }));
    expect(within(dialog).getByText(DEMO_WORLD_DATA.trendingPosts.at(-1)!.text)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Next trending post' }));
    expect(within(dialog).getByText(DEMO_WORLD_DATA.trendingPosts[0].text)).toBeInTheDocument();
  });

  it('shows an honest empty staging program instead of filling it with fictional posts', async () => {
    mocks.useWorldData.mockReturnValue({
      data: { ...DEMO_WORLD_DATA, source: 'staging', trendingPosts: [] },
      status: 'staging',
      error: null,
      loadStaging: mocks.loadStaging,
      useDemo: mocks.resetExample,
    });
    const user = userEvent.setup();
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Read about Trending Theater' }));
    const dialog = screen.getByRole('dialog', { name: 'Trending Theater' });
    expect(within(dialog).getByText('Public staging · ranked by total engagement')).toBeInTheDocument();
    expect(within(dialog).getByText('The stage is taking a breather.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Next trending post' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Fictional example post')).not.toBeInTheDocument();
  });

  it('makes the Satoshi monument readable through the plaza navigation', async () => {
    const user = userEvent.setup();
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Read about Social Plaza' }));
    await user.click(screen.getByRole('button', { name: /The Satoshi monument/ }));
    const dialog = screen.getByRole('dialog', { name: 'Present. Absent. Satoshi.' });
    expect(within(dialog).getByRole('link', { name: 'The story of Lugano’s monument' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });
});
