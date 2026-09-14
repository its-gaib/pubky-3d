import { Crown, Skull, Swords } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { WorldArenaBattleStatus } from '@/libs/world/world-arena-battle';
import type { WorldAvatarIdentity } from '@/libs/world/world-types';
import styles from './WorldArenaBattle.module.css';
import { WorldArenaGlory } from './WorldArenaGlory';

// Stable variation keeps the celebration running across status updates.
const CONFETTI_PIECES = Array.from(
  { length: 120 },
  (_, index) =>
    ({
      left: `${((index * 47) % 120) / 1.2}%`,
      width: `${5 + (index % 5)}px`,
      height: `${8 + (index % 7)}px`,
      animationDelay: `-${((index * 17) % 24) / 10}s`,
      animationDuration: `${3.2 + (index % 4) * 0.2}s`,
      '--confetti-drift': `${((index * 13) % 25) - 12}vw`,
      '--confetti-spin': `${(index % 2 ? 1 : -1) * (540 + (index % 5) * 180)}deg`,
    }) satisfies CSSProperties & Record<`--${string}`, string>,
);

const BATTLE_COPY = {
  fighting: {
    eyebrow: 'THE ARENA CALLS',
    title: 'Steel meets destiny',
    description: 'One knight. One brave steed. Two gladiators.',
    Icon: Swords,
  },
  victory: {
    eyebrow: 'CHAMPION OF THE ARENA',
    title: 'Victory!',
    description: 'Two gladiators fallen. A legend rides on.',
    Icon: Crown,
  },
  defeat: {
    eyebrow: 'FALLEN, NEVER FORGOTTEN',
    title: 'A glorious death',
    description: 'Knight and steed fought as one. Their courage echoes in eternity.',
    Icon: Skull,
  },
} as const;

/** A cinematic status banner leaves the arena and its fallen fighters in view. */
export function WorldArenaBattle({
  battle,
  reducedMotion,
  viewer = null,
}: {
  battle: WorldArenaBattleStatus;
  reducedMotion: boolean;
  /** Only the current identity approved by useWorldAvatarIdentities. */
  viewer?: WorldAvatarIdentity | null;
}) {
  const { eyebrow, title, description, Icon } = BATTLE_COPY[battle.phase];
  const remaining = Math.max(0, Math.ceil(battle.remaining));

  return (
    <>
      {battle.phase === 'victory' && !reducedMotion && (
        <div className={styles.confetti} data-testid="arena-victory-confetti" aria-hidden="true">
          {CONFETTI_PIECES.map((style, index) => (
            <span key={index} className={styles.confettiPiece} style={style} />
          ))}
        </div>
      )}
      <section
        className={styles.banner}
        data-phase={battle.phase}
        data-reduced-motion={reducedMotion}
        aria-label="Arena battle"
      >
        <div key={battle.phase} className={styles.announcement} role="status" aria-live="polite" aria-atomic="true">
          <div className={styles.eyebrow}>
            <Icon size={21} strokeWidth={1.6} aria-hidden="true" />
            {eyebrow}
          </div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.description}>{description}</p>
          {battle.phase === 'victory' && <WorldArenaGlory viewer={viewer} />}
        </div>
        {battle.phase === 'defeat' && (
          <div className={styles.countdown} role="timer" aria-label="Respawn countdown" aria-live="off">
            <span>A new legend rises in</span>
            <strong>{remaining}</strong>
            <span>{remaining === 1 ? 'second' : 'seconds'}</span>
          </div>
        )}
      </section>
    </>
  );
}
