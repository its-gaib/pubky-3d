import { Crown, Skull, Swords } from 'lucide-react';
import type { WorldArenaBattleStatus } from '@/libs/world/world-arena-battle';
import styles from './WorldArenaBattle.module.css';

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
}: {
  battle: WorldArenaBattleStatus;
  reducedMotion: boolean;
}) {
  const { eyebrow, title, description, Icon } = BATTLE_COPY[battle.phase];
  const remaining = Math.max(0, Math.ceil(battle.remaining));

  return (
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
      </div>
      {battle.phase === 'defeat' && (
        <div className={styles.countdown} role="timer" aria-label="Respawn countdown" aria-live="off">
          <span>A new legend rises in</span>
          <strong>{remaining}</strong>
          <span>{remaining === 1 ? 'second' : 'seconds'}</span>
        </div>
      )}
    </section>
  );
}
