import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beforeChesskyAbort } from '@/libs/chessky/chessky.async';
import { parseChesskyGame } from '@/libs/chessky/chessky.parser';
import {
  CHESSKY_OPPONENT,
  CHESSKY_OTHER,
  CHESSKY_OWNER,
  chesskyDeferred,
  chesskyFixture,
} from '@/libs/chessky/chessky.test-utils';
import { CHESSKY_LIMITS, type ChesskyLookup, type ChesskyReadContext } from '@/libs/chessky/chessky.types';
import production from '@/libs/world/world-production.json';
import { useWorldChess } from './useWorldChess';

const mocks = vi.hoisted(() => ({
  actor: null as string | null,
  hydrated: true,
  restoring: false,
  loggingOut: false,
  authenticated: true,
  network: 'production',
  lookup: vi.fn<(context: ChesskyReadContext) => Promise<ChesskyLookup>>(),
  profile: vi.fn(),
}));
vi.mock('@/application/chessky/chessky', () => ({ ChesskyApplication: { fetchLatestGame: mocks.lookup } }));
vi.mock('@/controllers/user/user', () => ({ UserController: { getOrFetchDetails: mocks.profile } }));
vi.mock('@/libs/runtime-config/runtime-config', () => ({
  getRuntimeConfig: () => ({ ...production, deployEnv: mocks.network }),
}));
vi.mock('@/stores/auth/auth.store', () => {
  const state = () => ({
    currentUserPubky: mocks.actor,
    hasHydrated: mocks.hydrated,
    isRestoringSession: mocks.restoring,
    isLoggingOut: mocks.loggingOut,
    selectIsAuthenticated: () => mocks.authenticated,
  });
  return {
    useAuthStore: Object.assign((selector: (value: ReturnType<typeof state>) => unknown) => selector(state()), {
      getState: state,
    }),
  };
});

function snapshot(multiplayer = false) {
  const file = chesskyFixture(1, { multiplayer, moves: ['e2e4'] });
  return parseChesskyGame(CHESSKY_OWNER, file.address, JSON.stringify(file.record)).game!;
}

describe('useWorldChess owner and request fencing', () => {
  beforeEach(() => {
    mocks.actor = null;
    mocks.hydrated = true;
    mocks.restoring = false;
    mocks.loggingOut = false;
    mocks.authenticated = true;
    mocks.network = 'production';
    mocks.lookup.mockReset().mockResolvedValue({ game: null, incomplete: false });
    mocks.profile.mockReset().mockResolvedValue(null);
  });
  afterEach(() => vi.useRealTimers());

  it('does not read for a guest, restoring session, or nonproduction network', async () => {
    const { result, rerender } = renderHook(() => useWorldChess());
    expect(result.current.game).toBeNull();
    expect(mocks.lookup).not.toHaveBeenCalled();
    mocks.actor = CHESSKY_OWNER;
    mocks.restoring = true;
    rerender();
    expect(mocks.lookup).not.toHaveBeenCalled();
    mocks.restoring = false;
    mocks.network = 'staging';
    rerender();
    expect(mocks.lookup).not.toHaveBeenCalled();
    mocks.network = 'production';
    mocks.hydrated = false;
    rerender();
    expect(mocks.lookup).not.toHaveBeenCalled();
    mocks.hydrated = true;
    rerender();
    await waitFor(() => expect(mocks.lookup).toHaveBeenCalledOnce());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('hydrates only the chosen game participants and keeps their names bounded plain text', async () => {
    mocks.actor = CHESSKY_OWNER;
    mocks.lookup.mockResolvedValue({ game: snapshot(true), incomplete: false });
    mocks.profile.mockImplementation(({ userId }: { userId: string }) =>
      Promise.resolve({ id: userId, name: userId === CHESSKY_OWNER ? 'Avery\n\u202E' : 'B'.repeat(100) }),
    );
    const { result } = renderHook(() => useWorldChess());
    await waitFor(() => expect(result.current.game?.white.name).toBe('Avery'));
    expect(result.current.game?.black.name).toHaveLength(48);
    expect(mocks.profile.mock.calls.map(([request]) => request.userId)).toEqual([CHESSKY_OWNER, CHESSKY_OPPONENT]);
    expect(result.current.game?.pieces).toContainEqual({ square: 'e4', type: 'p', color: 'w' });
  });

  it('clears on actor switch and ignores the previous actor even when its read finishes later', async () => {
    const old = chesskyDeferred<ChesskyLookup>();
    const other = { ...snapshot(), id: chesskyFixture(2).id, white: { id: CHESSKY_OTHER, name: 'Other' } };
    mocks.actor = CHESSKY_OWNER;
    mocks.lookup.mockImplementation((context) =>
      context.owner === CHESSKY_OWNER ? old.promise : Promise.resolve({ game: other, incomplete: false }),
    );
    const { result, rerender } = renderHook(() => useWorldChess());
    expect(result.current.loading).toBe(true);
    mocks.actor = CHESSKY_OTHER;
    rerender();
    expect(result.current.game).toBeNull();
    await waitFor(() => expect(result.current.game?.id).toBe(other.id));
    await act(async () => old.resolve({ game: snapshot(), incomplete: false }));
    expect(result.current.game?.id).toBe(other.id);
    expect(mocks.profile.mock.calls.some(([request]) => request.userId === CHESSKY_OWNER)).toBe(false);
  });

  it('checks the actual actor before publishing even without a React rerender', async () => {
    const pending = chesskyDeferred<ChesskyLookup>();
    mocks.actor = CHESSKY_OWNER;
    mocks.lookup.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useWorldChess());
    mocks.actor = CHESSKY_OTHER;
    await act(async () => pending.resolve({ game: snapshot(), incomplete: false }));
    expect(result.current.game).toBeNull();
    expect(mocks.profile).not.toHaveBeenCalled();
    act(() => result.current.refresh());
    expect(mocks.lookup).toHaveBeenCalledOnce();
  });

  it('clears the board immediately when production becomes unavailable and fences pending profile names', async () => {
    const pendingName = chesskyDeferred<{ id: string; name: string }>();
    mocks.actor = CHESSKY_OWNER;
    mocks.lookup.mockResolvedValue({ game: snapshot(), incomplete: false });
    mocks.profile.mockReturnValue(pendingName.promise);
    const { result, rerender } = renderHook(() => useWorldChess());
    await waitFor(() => expect(result.current.game).not.toBeNull());
    mocks.network = 'staging';
    rerender();
    expect(result.current.game).toBeNull();
    expect(result.current.loading).toBe(false);
    await act(async () => pendingName.resolve({ id: CHESSKY_OWNER, name: 'Stale name' }));
    expect(result.current.game).toBeNull();
  });

  it('marks partial scans as most recent found and refresh starts a new fenced lookup', async () => {
    mocks.actor = CHESSKY_OWNER;
    mocks.lookup.mockResolvedValue({ game: snapshot(), incomplete: true });
    const { result } = renderHook(() => useWorldChess());
    await waitFor(() => expect(result.current.incomplete).toBe(true));
    expect(result.current.error).toContain('most recent saved game found');
    mocks.lookup.mockResolvedValue({ game: null, incomplete: false });
    act(() => result.current.refresh());
    await waitFor(() => expect(mocks.lookup).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.game).toBeNull();
    expect(result.current.incomplete).toBe(false);
  });

  it('finishes with an honest partial result when the controller scan deadline expires', async () => {
    vi.useFakeTimers();
    mocks.actor = CHESSKY_OWNER;
    mocks.lookup.mockImplementation(async (context) => {
      await beforeChesskyAbort(chesskyDeferred<void>().promise, context.signal);
      return { game: snapshot(), incomplete: true };
    });
    const { result } = renderHook(() => useWorldChess());
    await act(async () => vi.advanceTimersByTimeAsync(CHESSKY_LIMITS.scanMs + 1));
    expect(result.current.loading).toBe(false);
    expect(result.current.incomplete).toBe(true);
    expect(result.current.game).not.toBeNull();
  });
});
