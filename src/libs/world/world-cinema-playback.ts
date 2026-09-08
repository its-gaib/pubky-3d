import {
  shuffleWorldFilms,
  worldCinemaAmbientUrl,
  worldCinemaUrl,
  type WorldFilm,
} from '@/libs/world/world-cinema-program';
import {
  acquireCinemaYouTubeApi,
  type CinemaYouTubeApi,
  type CinemaYouTubeEvent,
  type CinemaYouTubePlayer,
} from '@/libs/world/world-cinema-youtube';

export const CINEMA_NEXT_REEL_DELAY_MS = 1_200;
export const CINEMA_PLAYER_TIMEOUT_MS = 18_000;
export type CinemaPlaybackState =
  | 'loading'
  | 'playing'
  | 'skipping'
  | 'unavailable'
  | 'autoplay-blocked'
  | 'player-unavailable';

export const CINEMA_PLAYBACK_COPY: Record<CinemaPlaybackState, string> = {
  loading: 'MIDNIGHT CINEMA · Warming up the projector…',
  playing: '',
  skipping: 'That reel is missing. Loading the next film…',
  unavailable: 'The projector is taking an intermission. Open Midnight Cinema to pick a film.',
  'autoplay-blocked': 'This browser needs a ticket tap. Open Midnight Cinema and press play.',
  'player-unavailable': 'The screening cannot start here. Open Midnight Cinema to watch a film.',
};

/** Local playlist control: only unavailable reels are skipped; browser failures stop. */
export function createCinemaPlayback(
  container: HTMLElement,
  onState: (state: CinemaPlaybackState) => void,
  program: readonly WorldFilm[] = shuffleWorldFilms(),
) {
  const films = [...program];
  const failed = new Set<WorldFilm>();
  let index = 0;
  let generation = 0;
  let disposed = false;
  let stopped = false;
  let player: CinemaYouTubePlayer | null = null;
  let api: CinemaYouTubeApi | null = null;
  let loading: ReturnType<typeof acquireCinemaYouTubeApi> | null = null;
  let nextTimer: number | undefined;
  let startupTimer: number | undefined;

  const makeFrame = () => {
    const frame = document.createElement('iframe');
    frame.title = 'Midnight Cinema — automatic muted YouTube program';
    frame.width = '1600';
    frame.height = '900';
    frame.tabIndex = -1;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    frame.referrerPolicy = 'strict-origin';
    frame.loading = 'eager';
    Object.assign(frame.style, {
      position: 'absolute',
      inset: '0',
      border: '0',
      width: '100%',
      height: '100%',
      opacity: '0',
      pointerEvents: 'none',
    });
    container.appendChild(frame);
    return frame;
  };
  let iframe = makeFrame();
  const state = (value: CinemaPlaybackState) => {
    iframe.style.opacity = value === 'playing' ? '1' : '0';
    onState(value);
  };
  const clearStartup = () => {
    window.clearTimeout(startupTimer);
    startupTimer = undefined;
  };
  const destroyPlayer = () => {
    generation += 1;
    clearStartup();
    const old = player;
    player = null;
    iframe.removeAttribute('src');
    try {
      old?.destroy();
    } catch {
      // A partially loaded external player must not prevent local cleanup.
    }
    iframe.remove();
  };
  const stop = (value: CinemaPlaybackState) => {
    if (disposed || stopped) return;
    stopped = true;
    window.clearTimeout(nextTimer);
    state(value);
    destroyPlayer();
    loading?.release();
  };
  const watchStartup = () => {
    if (startupTimer !== undefined) return;
    startupTimer = window.setTimeout(() => stop('player-unavailable'), CINEMA_PLAYER_TIMEOUT_MS);
  };
  const advance = (unavailable: boolean) => {
    if (disposed || stopped) return;
    if (unavailable) failed.add(films[index]);
    state(unavailable ? 'skipping' : 'loading');
    destroyPlayer();
    if (failed.size === films.length) {
      stop('unavailable');
      return;
    }
    for (let step = 0; step < films.length; step++) {
      index = (index + 1) % films.length;
      if (!failed.has(films[index])) break;
    }
    nextTimer = window.setTimeout(() => {
      nextTimer = undefined;
      if (disposed || stopped) return;
      iframe = makeFrame();
      startPlayer();
    }, CINEMA_NEXT_REEL_DELAY_MS);
  };
  const startPlayer = () => {
    if (disposed || stopped || !api) return;
    const url = worldCinemaAmbientUrl(films[index], window.location.origin);
    if (!url) {
      stop('player-unavailable');
      return;
    }
    const activeFrame = iframe;
    const current = ++generation;
    const active = (event: CinemaYouTubeEvent) =>
      !disposed &&
      !stopped &&
      current === generation &&
      event.target === player &&
      event.target.getIframe() === activeFrame;
    iframe.src = url;
    state('loading');
    watchStartup();
    try {
      player = new api.Player(iframe, {
        events: {
          onReady(event) {
            if (!active(event)) return;
            try {
              event.target.mute();
              event.target.playVideo();
              if (active(event) && event.target.getPlayerState() === 1) {
                clearStartup();
                state('playing');
              }
            } catch {
              stop('player-unavailable');
            }
          },
          onStateChange(event) {
            if (!active(event)) return;
            if (event.data === 1) {
              clearStartup();
              state('playing');
            } else if (event.data === 0) {
              advance(false);
            } else if (event.data === -1 || event.data === 3 || event.data === 5) {
              state('loading');
              watchStartup();
            } else if (event.data === 2) {
              state('loading');
              watchStartup();
            }
          },
          onError(event) {
            if (!active(event)) return;
            // 5 is an HTML5/browser failure; 2 and 153 are configuration/identity
            // failures. None should burn through an otherwise healthy program.
            if (event.data === 100 || event.data === 101 || event.data === 150) advance(true);
            else stop('player-unavailable');
          },
          onAutoplayBlocked(event) {
            if (active(event)) stop('autoplay-blocked');
          },
        },
      });
    } catch {
      stop('player-unavailable');
    }
  };

  state('loading');
  if (!worldCinemaUrl(films) || !worldCinemaAmbientUrl(films[0], window.location.origin)) {
    stop('player-unavailable');
  } else {
    loading = acquireCinemaYouTubeApi();
    void loading.ready.then((loaded) => {
      if (disposed || stopped) return;
      if (!loaded) {
        stop('player-unavailable');
        return;
      }
      api = loaded;
      startPlayer();
    });
  }

  return {
    get iframe() {
      return iframe;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(nextTimer);
      destroyPlayer();
      loading?.release();
    },
  };
}
