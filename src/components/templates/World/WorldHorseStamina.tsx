import { Progress } from 'radix-ui';
import type { CSSProperties } from 'react';
import { WORLD_HORSE } from '@/libs/world/world-horse';
import type { WorldScreenAnchor } from '@/libs/world/world-screen-projection';
import styles from './WorldHorseStamina.module.css';

/** A passive meter follows the mounted knight without intercepting world controls. */
export function WorldHorseStamina({
  anchor,
  remaining,
  reducedMotion = false,
}: {
  anchor: WorldScreenAnchor;
  remaining: number;
  reducedMotion?: boolean;
}) {
  const seconds = Number.isFinite(remaining) ? Math.min(WORLD_HORSE.rideSeconds, Math.max(0, remaining)) : 0;
  return (
    <div
      className={styles.anchor}
      data-reduced-motion={reducedMotion}
      style={
        {
          '--horse-x': `${anchor.x * 100}%`,
          '--horse-y': `${anchor.y * 100}%`,
        } as CSSProperties
      }
    >
      <Progress.Root
        className={styles.meter}
        aria-label="Horse stamina"
        value={seconds}
        max={WORLD_HORSE.rideSeconds}
        getValueLabel={(value, max) => `${Math.ceil(value)} of ${max} seconds of ride time remaining`}
      >
        <Progress.Indicator
          className={styles.remaining}
          style={{ width: `${(seconds / WORLD_HORSE.rideSeconds) * 100}%` }}
        />
      </Progress.Root>
    </div>
  );
}
