import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseWorldSocialOptions } from '@/hooks/useWorldSocial/useWorldSocial.types';
import type { ChesskySnapshot } from '@/libs/chessky/chessky.types';
import { DEMO_WORLD_DATA } from '@/libs/world/world-catalog';
import { consumeWorldEntry, requestWorldEntry } from '@/libs/world/world-entry';
import { socialSector } from '@/libs/world/world-social-layout';
import type { WorldController, WorldData, WorldInteraction, WorldOptions } from '@/libs/world/world-types';
import { World } from './World';
import type { WorldSocialState } from './WorldSocialPanel';

const mocks = vi.hoisted(() => ({
  createWorld: vi.fn<(container: HTMLDivElement, options: WorldOptions) => WorldController>(),
  useWorldData: vi.fn(),
  useWorldChess: vi.fn(),
  useWorldSocial: vi.fn<(options: UseWorldSocialOptions) => WorldSocialState>(),
  auth: { isFullyAuthenticated: false, isLoading: false },
  requireAuth: vi.fn(),
  loadProduction: vi.fn(),
  toggleFollow: vi.fn(),
  controller: {
    dispose: vi.fn(),
    travelTo: vi.fn(),
    setSocialView: vi.fn(),
    setSocialFocus: vi.fn(),
    setChessGame: vi.fn(),
    travelToPerson: vi.fn(),
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
vi.mock('@/hooks/useWorldChess/useWorldChess', () => ({ useWorldChess: mocks.useWorldChess }));
vi.mock('@/hooks/useWorldSocial/useWorldSocial', () => ({ useWorldSocial: mocks.useWorldSocial }));
vi.mock('@/hooks/useAuthStatus/useAuthStatus', () => ({ useAuthStatus: () => mocks.auth }));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: mocks.requireAuth }),
}));
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
    network: 'production',
    error: null,
    clearError: vi.fn(),
  }),
}));
vi.mock('@/hooks/useDialogKeyboardOrchestrator/useDialogKeyboardOrchestrator', () => ({
  useDialogKeyboardOrchestrator: () => ({ isKeyboardVisible: false, spacerHeight: 0, contentStyle: undefined }),
}));

const PERSON_ID = 'y'.repeat(52);
const VIEWER_ID = 'b'.repeat(52);
const AVATAR_URL = `https://nexus.pubky.app/static/avatar/${PERSON_ID}`;
const DATA: WorldData = {
  source: 'production',
  tags: DEMO_WORLD_DATA.tags,
  people: [
    {
      id: PERSON_ID,
      name: 'Avery',
      bio: 'A public production profile.',
      color: '#c8ff03',
      position: [0, 8],
      avatarUrl: AVATAR_URL,
    },
  ],
  relationships: [],
  trendingPosts: [
    {
      id: `${PERSON_ID}:CURRENT_POST`,
      author: 'Avery',
      text: 'A public conversation for the current show.',
      tags: ['pubky'],
      url: `/post/${PERSON_ID}/CURRENT_POST`,
    },
    { id: `${PERSON_ID}:NEXT_POST`, author: 'Avery', text: 'Another conversation.', tags: [] },
  ],
};
function dataState(
  data = DATA,
  status: 'loading' | 'production' | 'error' = 'production',
  error: string | null = null,
) {
  mocks.useWorldData.mockReturnValue({ data, status, error, loadProduction: mocks.loadProduction });
}
function socialState(overrides: Partial<WorldSocialState> = {}): WorldSocialState {
  return {
    people: DATA.people,
    relationships: [],
    viewerId: null,
    status: 'signed-out',
    directCount: 0,
    discoveryCount: 0,
    complete: false,
    error: null,
    loadMore: vi.fn(),
    retry: vi.fn(),
    refresh: vi.fn(),
    profile: { person: null, latestPost: null, status: 'empty', error: null },
    follow: {
      pending: false,
      error: null,
      isFollowing: false,
      canFollow: false,
      toggle: mocks.toggleFollow,
      retry: vi.fn(),
    },
    ...overrides,
  };
}
function followedPeople(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...DATA.people[0],
    id: index.toString(36).padStart(52, '0'),
    name: `Friend ${index}`,
    avatarUrl: undefined,
    degree: 1 as const,
    profileLoaded: true,
  }));
}
async function interact(interaction: WorldInteraction) {
  await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
  await act(async () => mocks.createWorld.mock.calls[0][1].onInteract(interaction));
}

beforeEach(() => {
  mocks.auth.isFullyAuthenticated = false;
  mocks.auth.isLoading = false;
  consumeWorldEntry();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  });
  dataState();
  mocks.useWorldChess.mockReturnValue({ game: null, loading: false, incomplete: false, error: null, refresh: vi.fn() });
  mocks.useWorldSocial.mockReturnValue(socialState());
  mocks.createWorld.mockImplementation((_container, options) => {
    options.onReady();
    return mocks.controller;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('World', () => {
  it('shows the saved Chessky opponents and clears the rendered game when the account clears', async () => {
    const game: ChesskySnapshot = {
      id: 'saved-game',
      updatedAt: '2026-09-08T12:00:00.000Z',
      white: { id: VIEWER_ID, name: 'Avery' },
      black: { id: PERSON_ID, name: 'Bo' },
      pieces: [{ square: 'e4', type: 'p', color: 'w' }],
      result: '*',
    };
    const refresh = vi.fn();
    const state = { game, loading: false, incomplete: true, error: null, refresh };
    mocks.auth.isFullyAuthenticated = true;
    mocks.useWorldChess.mockReturnValue(state);
    const { rerender } = render(<World />);
    await interact({ kind: 'zone', id: 'chess' });
    expect(mocks.controller.setChessGame).toHaveBeenLastCalledWith(game);
    expect(screen.getByText('Most recently updated game found')).toBeInTheDocument();
    expect(screen.getByText('Bo')).toBeInTheDocument();
    expect(screen.getByText(/position saved on your homeserver/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Refresh saved board' }));
    expect(refresh).toHaveBeenCalledOnce();
    mocks.auth.isFullyAuthenticated = false;
    mocks.useWorldChess.mockReturnValue({ ...state, game: null, incomplete: false });
    rerender(<World />);
    await waitFor(() => expect(mocks.controller.setChessGame).toHaveBeenLastCalledWith(null));
    expect(screen.queryByText('Bo')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to find your game' })).toBeInTheDocument();
  });

  it('loads production automatically, keeps walking discovery, and disposes the scene', async () => {
    const { unmount } = render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    expect(mocks.loadProduction).toHaveBeenCalledOnce();
    expect(screen.queryByText('Production')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Example' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Production' })).not.toBeInTheDocument();
    expect(screen.queryByText('Your next detour')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Travel to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Classic Pubky' })).not.toBeInTheDocument();
    unmount();
    expect(mocks.controller.dispose).toHaveBeenCalledOnce();
  });

  it('focuses keyboard walking when the visitor starts wandering', async () => {
    const user = userEvent.setup();
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    expect(screen.getByRole('link', { name: 'Sign in and explore' })).toHaveAttribute('href', '/sign-in');
    await user.click(screen.getByRole('button', { name: 'Explore as a guest' }));
    expect(screen.getByLabelText(/Interactive Pubky island/)).toHaveFocus();
    expect(mocks.controller.setOverview).toHaveBeenLastCalledWith(false);
    expect(mocks.controller.travelTo).not.toHaveBeenCalled();
  });

  it('lets a fully restored account enter directly without asking for sign-in again', async () => {
    mocks.auth.isFullyAuthenticated = true;
    const user = userEvent.setup();
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    expect(screen.queryByRole('link', { name: 'Sign in and explore' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter your world' }));
    expect(mocks.controller.setOverview).toHaveBeenLastCalledWith(false);
    expect(mocks.requireAuth).not.toHaveBeenCalled();
  });

  it('waits for completed session restoration, then starts walking with the signed-in viewer graph', async () => {
    mocks.auth.isFullyAuthenticated = true;
    mocks.auth.isLoading = true;
    requestWorldEntry();
    const { rerender } = render(<World />);
    expect(screen.getByRole('button', { name: 'Restoring your session…' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enter your world' })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());

    mocks.auth.isLoading = false;
    const relationships = [{ from: VIEWER_ID, to: PERSON_ID, label: 'follows' }];
    mocks.useWorldSocial.mockReturnValue(
      socialState({ viewerId: VIEWER_ID, status: 'ready', directCount: 1, relationships }),
    );
    rerender(<World />);
    await waitFor(() => expect(mocks.controller.setOverview).toHaveBeenLastCalledWith(false));
    expect(screen.queryByRole('button', { name: 'Enter your world' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Interactive Pubky island/)).toHaveFocus();
    expect(mocks.controller.updateData).toHaveBeenLastCalledWith(
      expect.objectContaining({ people: DATA.people, relationships }),
    );
    expect(consumeWorldEntry()).toBe(false);
  });

  it('does not treat a navigation hint as a signed-in session', async () => {
    requestWorldEntry();
    render(<World />);
    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledOnce());
    expect(screen.getByRole('link', { name: 'Sign in and explore' })).toBeInTheDocument();
    expect(mocks.controller.setOverview).toHaveBeenLastCalledWith(true);
    expect(consumeWorldEntry()).toBe(false);
  });

  it('pauses walking for a discovered tag tree and resumes after closing its real dialog', async () => {
    const user = userEvent.setup();
    render(<World />);
    await interact({ kind: 'zone', id: 'forest' });
    const dialog = screen.getByRole('dialog', { name: 'Tag Forest' });
    expect(mocks.controller.setPaused).toHaveBeenLastCalledWith(true);
    await user.click(within(dialog).getByRole('button', { name: /#pubky/ }));
    expect(screen.getByRole('dialog', { name: '#pubky' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close and return to world' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.controller.setPaused).toHaveBeenLastCalledWith(false);
  });

  it('retains readable forest access when WebGL fails', async () => {
    mocks.createWorld.mockImplementation(() => {
      throw new TypeError('WebGL unavailable');
    });
    const user = userEvent.setup();
    render(<World />);
    await screen.findByText('The island needs a different view.');
    await user.click(screen.getByRole('button', { name: /Browse the forest/ }));
    expect(screen.getByRole('dialog', { name: 'Tag Forest' })).toBeInTheDocument();
  });

  it('shows the real profile avatar and latest post without a connections list', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(80);
    mocks.useWorldSocial.mockReturnValue(
      socialState({
        profile: { person: DATA.people[0], latestPost: DATA.trendingPosts[0], status: 'ready', error: null },
      }),
    );
    render(<World />);
    await interact({ kind: 'person', id: PERSON_ID });
    const dialog = screen.getByRole('dialog', { name: 'Avery' });
    expect(await within(dialog).findByRole('img', { name: 'Avery’s profile picture' })).toHaveAttribute(
      'src',
      AVATAR_URL,
    );
    expect(within(dialog).getByText(DATA.trendingPosts[0].text)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Connections in this/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Sign in to follow' })).toBeInTheDocument();
  });

  it.each(['missing', 'failed'] as const)('keeps a profile fallback when the picture is %s', async (state) => {
    if (state === 'failed') {
      vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
      vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
    }
    dataState({ ...DATA, people: [{ ...DATA.people[0], avatarUrl: state === 'missing' ? undefined : AVATAR_URL }] });
    render(<World />);
    await interact({ kind: 'person', id: PERSON_ID });
    expect(await screen.findByTestId('avatar-fallback-initial')).toHaveTextContent('A');
  });

  it('passes follow actions to the production hook and updates the scene when a person grows', async () => {
    const user = userEvent.setup();
    const state = socialState({ viewerId: VIEWER_ID, status: 'ready', people: [{ ...DATA.people[0], degree: 2 }] });
    state.follow.canFollow = true;
    mocks.useWorldSocial.mockReturnValue(state);
    const { rerender } = render(<World />);
    await interact({ kind: 'person', id: PERSON_ID });
    await user.click(screen.getByRole('button', { name: 'Follow', exact: true }));
    expect(mocks.toggleFollow).toHaveBeenCalledOnce();
    const followed = {
      ...state,
      people: [{ ...DATA.people[0], degree: 1 as const }],
      follow: { ...state.follow, isFollowing: true },
    };
    mocks.useWorldSocial.mockReturnValue(followed);
    rerender(<World />);
    expect(screen.getByRole('button', { name: 'Unfollow', exact: true })).toBeInTheDocument();
    expect(mocks.controller.updateData).toHaveBeenLastCalledWith(expect.objectContaining({ people: followed.people }));
  });

  it('loads the selected person’s latest post without exposing the previous one', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(80);
    mocks.useWorldSocial.mockReturnValue(
      socialState({
        profile: {
          person: { ...DATA.people[0], avatarUrl: undefined, profileLoaded: false },
          latestPost: null,
          status: 'loading',
          error: null,
        },
      }),
    );
    render(<World />);
    await interact({ kind: 'person', id: PERSON_ID });
    expect(await screen.findByRole('img', { name: 'Avery’s profile picture' })).toHaveAttribute('src', AVATAR_URL);
    expect(screen.getByText('Loading their latest post…')).toBeInTheDocument();
    expect(screen.queryByText(DATA.trendingPosts[0].text)).not.toBeInTheDocument();
  });

  it('makes people beyond the renderer window discoverable by directory paging and search', async () => {
    const people = Array.from({ length: 240 }, (_, index) => ({
      ...DATA.people[0],
      id: `person-${index}`,
      name: `Explorer ${index}`,
      degree: index % 2 ? (2 as const) : (1 as const),
    }));
    mocks.useWorldSocial.mockReturnValue(
      socialState({
        viewerId: VIEWER_ID,
        people,
        complete: true,
        status: 'ready',
        directCount: 120,
        discoveryCount: 120,
      }),
    );
    const user = userEvent.setup();
    render(<World />);
    await interact({ kind: 'zone', id: 'plaza' });
    expect(screen.getByText('240 people · 1 / 12')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next people page' }));
    expect(screen.getByText('Explorer 20')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Find a person in the plaza' }), 'person-239');
    expect(screen.getByText('Explorer 239')).toBeInTheDocument();
    expect(screen.getByText('1 people · 1 / 1')).toBeInTheDocument();
  });

  it('opens a social neighborhood from the world without opening a destination menu', async () => {
    render(<World />);
    await interact({ kind: 'social-cluster', sector: 3 });
    expect(mocks.controller.setSocialView).toHaveBeenLastCalledWith({ sector: 3, page: 0 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hydrates at most sixteen stable followed-person previews without selecting a latest post', async () => {
    const people = followedPeople(512);
    mocks.useWorldSocial.mockReturnValue(
      socialState({ viewerId: VIEWER_ID, people, directCount: people.length, status: 'ready' }),
    );
    const { rerender } = render(<World />);
    await waitFor(() => expect(mocks.useWorldSocial.mock.calls.at(-1)?.[0].directoryIds).toHaveLength(16));
    const request = mocks.useWorldSocial.mock.calls.at(-1)![0];
    expect(request.selectedId).toBeNull();
    expect(new Set(request.directoryIds).size).toBe(16);
    for (const id of request.directoryIds ?? []) {
      expect(id).toMatch(/^[a-z0-9]{52}$/);
      expect(people.some((person) => person.id === id && person.degree === 1)).toBe(true);
    }
    mocks.useWorldSocial.mockReturnValue(
      socialState({
        viewerId: VIEWER_ID,
        people: [...people].reverse().map((person) => ({ ...person, name: 'A changed name' })),
        directCount: people.length,
        status: 'ready',
      }),
    );
    rerender(<World />);
    await waitFor(() => expect(mocks.useWorldSocial.mock.calls.at(-1)?.[0].directoryIds).toEqual(request.directoryIds));
    expect(mocks.useWorldSocial.mock.calls.at(-1)?.[0].selectedId).toBeNull();
  });

  it('keeps a labeled way back after paging, walking away, reading a profile, and a smaller graph', async () => {
    const people = followedPeople(1000)
      .filter((person) => socialSector(person.id) === 0)
      .slice(0, 110);
    const state = socialState({
      viewerId: VIEWER_ID,
      people,
      directCount: people.length,
      complete: true,
      status: 'ready',
    });
    mocks.useWorldSocial.mockReturnValue(state);
    const user = userEvent.setup();
    const { rerender } = render(<World />);
    await interact({ kind: 'social-cluster', sector: 0 });
    expect(screen.getByRole('button', { name: 'Back to all sectors' })).toBeInTheDocument();
    expect(screen.getByText('110 people · 110 following')).toBeInTheDocument();
    expect(screen.getByText(/^Includes Friend/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next sector page' }));
    expect(mocks.controller.setSocialView).toHaveBeenLastCalledWith({ sector: 0, page: 1 });
    await act(async () =>
      mocks.createWorld.mock.calls[0][1].onStatus({
        zone: 'forest',
        position: [30, 30],
        nearby: null,
        collected: 0,
        theaterIndex: 0,
        theaterPaused: false,
      }),
    );
    expect(screen.getByRole('button', { name: 'Back to all sectors' })).toBeInTheDocument();
    await interact({ kind: 'person', id: people[0].id });
    expect(screen.queryByRole('button', { name: 'Back to all sectors' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close and return to world' }));
    expect(screen.getByRole('button', { name: 'Back to all sectors' })).toBeInTheDocument();
    mocks.useWorldSocial.mockReturnValue({ ...state, people: [people[0]], directCount: 1 });
    rerender(<World />);
    expect(screen.getByRole('button', { name: 'Back to all sectors' })).toBeInTheDocument();
    expect(screen.getByText('1 person · 1 following')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next sector page' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to all sectors' }));
    expect(mocks.controller.setSocialView).toHaveBeenLastCalledWith({ sector: null, page: 0 });
    expect(mocks.controller.setSocialFocus).toHaveBeenLastCalledWith(null);
    expect(mocks.controller.travelTo).toHaveBeenLastCalledWith('plaza');
    expect(screen.queryByRole('button', { name: 'Back to all sectors' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Interactive Pubky island/)).toHaveFocus();
  });

  it('beams from the bank to face the Bitkit landmark', async () => {
    const user = userEvent.setup();
    render(<World />);
    await interact({ kind: 'fun', id: 'bank' });
    await user.click(screen.getByRole('button', { name: 'Where can I use Hard Money instead?' }));
    expect(mocks.controller.travelTo).toHaveBeenCalledWith('bitkit', { faceLandmark: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Interactive Pubky island/)).toHaveFocus();
  });

  it('keeps both Satoshi links', async () => {
    render(<World />);
    await interact({ kind: 'fun', id: 'satoshi' });
    expect(screen.getByRole('link', { name: 'Explore the Satoshi symbol' })).toHaveAttribute(
      'href',
      'https://satsymbol.org/',
    );
    expect(screen.getByRole('link', { name: 'The story of Lugano’s monument' })).toHaveAttribute(
      'href',
      'https://tether.io/news/plan-b-initiative-unveils-satoshi-nakamoto-statue-at-3rd-annual-plan-forum-in-lugano/',
    );
  });

  it.each([
    [{ kind: 'zone', id: 'arena' }, 'Try out the Pubky Arena', 'https://pubky-arena.vercel.app/arena'],
    [{ kind: 'zone', id: 'chess' }, 'Play chess on Pubky', 'https://chessky-ten.vercel.app/'],
    [{ kind: 'fun', id: 'graph' }, 'Open the Pubky Graph Explorer', 'https://graph.scriptlesslabs.com/graph'],
    [{ kind: 'fun', id: 'runner' }, 'Try mention pills', 'https://pubky-app-mention-pills.vercel.app/'],
  ] as const)('opens the discovered %s experiment with a plain external link', async (interaction, name, href) => {
    render(<World />);
    await interact(interaction);
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(mocks.requireAuth).not.toHaveBeenCalled();
  });

  it('explains the runner pills and discovers a portal without a destination menu', async () => {
    render(<World />);
    await interact({ kind: 'fun', id: 'runner' });
    expect(screen.getByText('@halfin')).toBeInTheDocument();
    expect(screen.getByText(/One press of Backspace/)).toBeInTheDocument();
    await interact({ kind: 'portal', index: 1 });
    expect(screen.getByRole('dialog', { name: 'Violet Shortcut' })).toBeInTheDocument();
    expect(screen.getByText(/Walk through the glowing ring/)).toBeInTheDocument();
    expect(mocks.controller.travelTo).not.toHaveBeenCalled();
  });

  it('opens the distinct cinema only after discovering it, and removes its player on exit', async () => {
    const user = userEvent.setup();
    render(<World />);
    expect(screen.queryByTitle(/shuffled YouTube program/)).not.toBeInTheDocument();
    await interact({ kind: 'zone', id: 'cinema' });
    expect(screen.getByRole('dialog', { name: 'Midnight Cinema' })).toBeInTheDocument();
    expect(screen.queryByTitle(/shuffled YouTube program/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start screening' }));
    expect(screen.getByTitle(/shuffled YouTube program/)).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-presentation',
    );
    await user.click(screen.getByRole('button', { name: 'Close and return to world' }));
    expect(screen.queryByTitle(/shuffled YouTube program/)).not.toBeInTheDocument();
  });

  it('links the Tether statue to Ventures', async () => {
    render(<World />);
    await interact({ kind: 'fun', id: 'tether' });
    expect(screen.getByRole('link', { name: 'Explore Tether Ventures' })).toHaveAttribute(
      'href',
      'https://tether.io/ventures/',
    );
  });

  it('hides the previous trending program while loading and restores only ready posts', async () => {
    dataState(DATA, 'loading');
    mocks.createWorld.mockImplementation(() => mocks.controller);
    const { rerender } = render(<World />);
    await interact({ kind: 'zone', id: 'theater' });
    const dialog = screen.getByRole('dialog', { name: 'Trending Theater' });
    expect(within(dialog).getByRole('status', { name: 'Loading trending posts' })).toBeInTheDocument();
    expect(within(dialog).queryByText(DATA.trendingPosts[0].text)).not.toBeInTheDocument();
    expect(mocks.controller.setTheaterLoading).toHaveBeenLastCalledWith(true);
    dataState();
    rerender(<World />);
    expect(within(dialog).getByText(DATA.trendingPosts[0].text)).toBeInTheDocument();
    await act(async () => mocks.createWorld.mock.calls[0][1].onReady());
    expect(mocks.controller.setTheaterLoading).toHaveBeenLastCalledWith(false);
  });

  it('pauses trending for reading and supports resuming and advancing the program', async () => {
    const user = userEvent.setup();
    render(<World />);
    await interact({ kind: 'zone', id: 'theater' });
    expect(mocks.controller.setTheaterPaused).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Resume show' }));
    expect(mocks.controller.setTheaterPaused).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole('button', { name: 'Next trending post' }));
    expect(mocks.controller.stepTheater).toHaveBeenCalledWith(1);
    await act(async () =>
      mocks.createWorld.mock.calls[0][1].onStatus({
        zone: 'theater',
        position: [0, 0],
        nearby: null,
        collected: 0,
        theaterIndex: 1,
        theaterPaused: true,
      }),
    );
    expect(screen.getByText(DATA.trendingPosts[1].text)).toBeInTheDocument();
  });

  it('shows an empty production program honestly and provides a production retry on failure', async () => {
    dataState({ ...DATA, trendingPosts: [] }, 'error', 'Could not load production.');
    const user = userEvent.setup();
    render(<World />);
    await user.click(screen.getByRole('button', { name: 'Retry production data' }));
    expect(mocks.loadProduction).toHaveBeenCalledTimes(2);
    await interact({ kind: 'zone', id: 'theater' });
    expect(screen.getByText('The stage is taking a breather.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next trending post' })).not.toBeInTheDocument();
  });
});
