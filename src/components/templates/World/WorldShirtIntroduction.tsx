import { Shirt } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { WorldShirtSpeaker } from '@/libs/world/world-shirt-speech';
import styles from './WorldShirtIntroduction.module.css';

/** A passive world-space speech bubble has no focus or hover trigger. */
export function WorldShirtIntroduction({
  speaker,
  reducedMotion = false,
}: {
  speaker: WorldShirtSpeaker;
  reducedMotion?: boolean;
}) {
  return (
    <div
      className={styles.anchor}
      data-reduced-motion={reducedMotion}
      data-speaker={speaker.id}
      style={
        {
          '--speaker-x': `${speaker.x * 100}%`,
          '--speaker-y': `${speaker.y * 100}%`,
        } as CSSProperties
      }
    >
      <aside className={styles.speech} role="status" aria-label="A nearby explorer says" aria-atomic="true">
        <Shirt size={22} aria-hidden="true" />
        <p>I bought my shirt on style.ninja!</p>
      </aside>
    </div>
  );
}
