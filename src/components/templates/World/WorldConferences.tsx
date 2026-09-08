import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { WORLD_CONFERENCES } from '@/libs/world/world-conference-catalog';
import styles from './World.module.css';

/** Discovered event tickets: fixed official links, with no account or booking handoff. */
export function WorldConferences({ index }: { index?: number }) {
  const events = index === undefined ? WORLD_CONFERENCES : WORLD_CONFERENCES.filter((_, item) => item === index);
  return (
    <>
      <div className={styles.sectionLabel}>
        <CalendarDays size={16} />
        Next stop: Pubky
      </div>
      <p>Good conversations deserve a change of scenery. Find the Pubky crew beyond the island.</p>
      <div className={styles.articleList}>
        {events.map((event) => (
          <article key={event.id} className={styles.lessonCard}>
            <span className={styles.lessonNumber} style={{ color: event.color }} aria-hidden="true">
              ✦
            </span>
            <div>
              <p className={styles.eyebrow}>
                {event.city} · {event.country}
              </p>
              <h3>{event.name}</h3>
              <p>
                <strong>{event.dateLabel}</strong>
              </p>
              <p>{event.description}</p>
              <a href={event.url} target="_blank" rel="noopener noreferrer" className={styles.textLink}>
                Explore the event
                <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </div>
          </article>
        ))}
      </div>
      <p className={styles.smallPrint}>Follow the event links for the latest schedules and tickets.</p>
    </>
  );
}
