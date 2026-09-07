'use client';

import { useEffect, useState } from 'react';
import { Clapperboard, LoaderCircle, Play, Shuffle } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Iframe } from '@/atoms/Iframe/Iframe';
import { shuffleWorldFilms, WORLD_FILMS, worldCinemaUrl, type WorldFilm } from '@/libs/world/world-cinema-program';
import styles from './World.module.css';

export function WorldCinema() {
  const [program, setProgram] = useState<WorldFilm[] | null>(null);
  const [playerLoaded, setPlayerLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const url = program ? worldCinemaUrl(program) : null;

  useEffect(() => {
    if (!url || playerLoaded) return;
    const timer = window.setTimeout(() => setSlow(true), 15_000);
    return () => window.clearTimeout(timer);
  }, [url, playerLoaded]);

  function start() {
    setPlayerLoaded(false);
    setSlow(false);
    setProgram(shuffleWorldFilms(program?.[0]));
  }

  return (
    <div className={styles.cinemaPanel}>
      <div className={styles.cinemaTicket}>
        <Clapperboard size={20} aria-hidden="true" />
        <span>{WORLD_FILMS.length} films. Shuffled screenings. No assigned seats.</span>
      </div>
      {url ? (
        <>
          <div className={styles.cinemaScreen}>
            <Iframe
              key={url}
              src={url}
              title="Midnight Cinema — shuffled YouTube program"
              sandbox="allow-scripts allow-same-origin allow-presentation"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin"
              loading="eager"
              height="100%"
              onLoad={() => setPlayerLoaded(true)}
            />
          </div>
          {!playerLoaded && (
            <p role="status" className={styles.latestPostLoading}>
              <LoaderCircle size={17} className={styles.spin} aria-hidden="true" />
              {slow
                ? 'The projector is taking a while. You can try a fresh program below.'
                : 'Warming up the projector…'}
            </p>
          )}
          <p className={styles.smallPrint}>
            Each film gives way to the next in a shuffled program. Use the player’s controls to skip, pause, or go
            fullscreen. If a film cannot play here, skip ahead or shuffle a fresh program.
          </p>
          <Button overrideDefaults className={styles.secondaryButton} onClick={start}>
            <Shuffle size={17} />
            Shuffle a fresh program
          </Button>
        </>
      ) : (
        <div className={styles.cinemaCurtain}>
          <Clapperboard size={56} aria-hidden="true" />
          <h3>Midnight Cinema</h3>
          <p>The algorithm has been replaced by a very small projectionist with a shuffle button.</p>
          <Button overrideDefaults className={styles.primaryButton} onClick={start}>
            <Play size={17} />
            Start screening
          </Button>
          <span className={styles.smallPrint}>Starts a YouTube player. Press play there if your browser asks.</span>
        </div>
      )}
    </div>
  );
}
