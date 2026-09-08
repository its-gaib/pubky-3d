import { ChesskyApplication } from '@/application/chessky/chessky';
import { isChesskyPubky } from '@/libs/chessky/chessky.parser';
import { CHESSKY_LIMITS, type ChesskyLookup, type ChesskyReadContext } from '@/libs/chessky/chessky.types';
import { isWorldProductionConfigured } from '@/libs/world/world-network';
import { useAuthStore } from '@/stores/auth/auth.store';

export function currentChesskyActor(): string | null {
  const state = useAuthStore.getState();
  return isWorldProductionConfigured() &&
    state.hasHydrated &&
    !state.isRestoringSession &&
    !state.isLoggingOut &&
    state.selectIsAuthenticated() &&
    isChesskyPubky(state.currentUserPubky)
    ? state.currentUserPubky
    : null;
}

export class ChesskyController {
  static async fetchLatestGame(input: ChesskyReadContext): Promise<ChesskyLookup> {
    const stillOwned = () => !input.signal.aborted && input.isCurrent() && currentChesskyActor() === input.owner;
    if (!stillOwned()) return { game: null, incomplete: false };
    const bounded = new AbortController();
    const abort = () => bounded.abort();
    input.signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, CHESSKY_LIMITS.scanMs);
    try {
      const result = await ChesskyApplication.fetchLatestGame({
        owner: input.owner,
        signal: bounded.signal,
        isCurrent: stillOwned,
      });
      return stillOwned()
        ? { ...result, incomplete: result.incomplete || bounded.signal.aborted }
        : { game: null, incomplete: false };
    } finally {
      clearTimeout(timeout);
      input.signal.removeEventListener('abort', abort);
      bounded.abort();
    }
  }
}
