import { ArrowUpRight, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import type { useWorldChess } from '@/hooks/useWorldChess/useWorldChess';
import { WORLD_EXPERIMENTS } from '@/libs/world/world-catalog';
import styles from './World.module.css';

export function WorldChess({
  state,
  signedIn,
  onSignIn,
}: {
  state: ReturnType<typeof useWorldChess>;
  signedIn: boolean;
  onSignIn: () => void;
}) {
  const { game, loading, incomplete, error, refresh } = state;
  return (
    <div className={styles.funPanel}>
      <span className={styles.chessEmblem} aria-hidden="true">
        ♞
      </span>
      <blockquote>The knights are taller than you. Your opening can still be stronger.</blockquote>
      {loading ? (
        <p role="status">
          <LoaderCircle className="inline animate-spin" size={16} aria-hidden="true" /> Finding your saved Chessky
          games…
        </p>
      ) : game ? (
        <>
          <strong>{incomplete ? 'Most recently updated game found' : 'Your latest saved Chessky game'}</strong>
          <p>
            <strong>{game.white.name}</strong> (silver) versus <strong>{game.black.name}</strong> (obsidian)
          </p>
          <p className={styles.smallPrint}>
            Saved {new Date(game.updatedAt).toLocaleString()} · {game.result === '*' ? 'Game in progress' : game.result}
            . This is the position saved on your homeserver.
          </p>
        </>
      ) : (
        <p>
          Wander between the obsidian and silver armies.{' '}
          {signedIn
            ? 'Play a game on Chessky and your saved position can take over this board.'
            : 'Sign in to bring your most recently updated Chessky game into the world.'}
        </p>
      )}
      {!loading && (error || incomplete) && (
        <p className={styles.smallPrint} role="status">
          {error || 'Some saved games could not be checked. A newer position may still be out there.'}
        </p>
      )}
      {signedIn ? (
        <Button overrideDefaults className={styles.textLink} onClick={refresh} disabled={loading}>
          <RefreshCw size={15} aria-hidden="true" /> Refresh saved board
        </Button>
      ) : (
        <Button overrideDefaults className={styles.textLink} onClick={onSignIn}>
          Sign in to find your game
        </Button>
      )}
      <a href={WORLD_EXPERIMENTS.chess.url} target="_blank" rel="noopener noreferrer" className={styles.primaryButton}>
        {WORLD_EXPERIMENTS.chess.action}
        <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </div>
  );
}
