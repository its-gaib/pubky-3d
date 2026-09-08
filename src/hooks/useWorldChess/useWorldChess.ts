'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChesskyController, currentChesskyActor } from '@/controllers/chessky/chessky';
import { UserController } from '@/controllers/user/user';
import { beforeChesskyAbort } from '@/libs/chessky/chessky.async';
import { chesskyName, isChesskyPubky } from '@/libs/chessky/chessky.parser';
import { CHESSKY_LIMITS, type ChesskySnapshot } from '@/libs/chessky/chessky.types';
import { isWorldProductionConfigured } from '@/libs/world/world-network';
import { useAuthStore } from '@/stores/auth/auth.store';

interface ChessState {
  scope: string;
  revision: number;
  game: ChesskySnapshot | null;
  loading: boolean;
  incomplete: boolean;
  error: string | null;
}

const PARTIAL = 'Showing the most recent saved game found. Some history could not be checked.';
const FAILED = 'Some Chessky saved games could not be checked. Refresh to try again.';

/** Owner-saved public snapshots only; never joins, mirrors, or writes a Chessky game. */
export function useWorldChess() {
  const rawActor = useAuthStore((state) => state.currentUserPubky);
  const hydrated = useAuthStore((state) => state.hasHydrated);
  const restoring = useAuthStore((state) => state.isRestoringSession);
  const loggingOut = useAuthStore((state) => state.isLoggingOut);
  const authenticated = useAuthStore((state) => state.selectIsAuthenticated());
  const network = isWorldProductionConfigured();
  const owner =
    network && hydrated && !restoring && !loggingOut && authenticated && isChesskyPubky(rawActor) ? rawActor : null;
  const scope = `${rawActor}:${network}:${hydrated}:${restoring}:${loggingOut}:${authenticated}`;
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const [state, setState] = useState<ChessState>({
    scope: '',
    revision: -1,
    game: null,
    loading: false,
    incomplete: false,
    error: null,
  });

  useLayoutEffect(() => {
    setState({ scope, revision, game: null, loading: Boolean(owner), incomplete: false, error: null });
  }, [scope, revision, owner]);

  useEffect(() => {
    const request = ++generation.current;
    if (!owner) return;
    const abort = new AbortController();
    const isCurrent = () => !abort.signal.aborted && generation.current === request && currentChesskyActor() === owner;
    void (async () => {
      try {
        if (!isCurrent()) return;
        const lookup = await ChesskyController.fetchLatestGame({ owner, signal: abort.signal, isCurrent });
        if (!isCurrent()) return;
        const next: ChessState = {
          scope,
          revision,
          ...lookup,
          loading: false,
          error: lookup.incomplete ? (lookup.game ? PARTIAL : FAILED) : null,
        };
        setState(next);
        if (!lookup.game) return;
        const game = lookup.game;
        const ids = [...new Set([game.white.id, game.black.id].filter(isChesskyPubky))].slice(0, 2);
        const profileAbort = new AbortController();
        const stopProfiles = () => profileAbort.abort();
        abort.signal.addEventListener('abort', stopProfiles, { once: true });
        const deadline = setTimeout(stopProfiles, CHESSKY_LIMITS.profileMs);
        try {
          const names = new Map<string, string>();
          for (const id of ids) {
            if (!isCurrent() || profileAbort.signal.aborted) return;
            try {
              const loaded = await beforeChesskyAbort(
                UserController.getOrFetchDetails({ userId: id }),
                profileAbort.signal,
              );
              if (!isCurrent()) return;
              if (loaded?.value?.id === id) names.set(id, chesskyName(loaded.value.name, id));
            } catch {
              /* The validated board remains useful with public-key names. */
            }
          }
          if (!isCurrent()) return;
          const named = (player: ChesskySnapshot['white']) =>
            player.id && names.has(player.id) ? { ...player, name: names.get(player.id)! } : player;
          setState({ ...next, game: { ...game, white: named(game.white), black: named(game.black) } });
        } finally {
          clearTimeout(deadline);
          abort.signal.removeEventListener('abort', stopProfiles);
          profileAbort.abort();
        }
      } catch {
        if (isCurrent()) setState({ scope, revision, game: null, loading: false, incomplete: true, error: FAILED });
      }
    })();
    return () => abort.abort();
  }, [owner, scope, revision]);

  const visible = state.scope === scope && state.revision === revision && Boolean(owner);
  return {
    game: visible ? state.game : null,
    loading: Boolean(owner) && (!visible || state.loading),
    incomplete: visible && state.incomplete,
    error: visible ? state.error : null,
    refresh: () => {
      if (owner && currentChesskyActor() === owner) setRevision((current) => current + 1);
    },
  };
}
