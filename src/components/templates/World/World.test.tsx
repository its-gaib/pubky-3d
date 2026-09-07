import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_WORLD_DATA } from '@/libs/world/world-catalog';
import type { WorldController, WorldOptions } from '@/libs/world/world-types';
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
