/** Minimal surface from https://developers.google.com/youtube/iframe_api_reference. */
export interface CinemaYouTubePlayer {
  mute(): void;
  playVideo(): void;
  getPlayerState(): number;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}

export interface CinemaYouTubeEvent {
  target: CinemaYouTubePlayer;
  data?: number;
}

export interface CinemaYouTubeEvents {
  onReady(event: CinemaYouTubeEvent): void;
  onStateChange(event: CinemaYouTubeEvent): void;
  onError(event: CinemaYouTubeEvent): void;
  onAutoplayBlocked(event: CinemaYouTubeEvent): void;
}

export interface CinemaYouTubeApi {
  Player: new (iframe: HTMLIFrameElement, options: { events: CinemaYouTubeEvents }) => CinemaYouTubePlayer;
}

type YouTubeWindow = Window & {
  YT?: CinemaYouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

export const CINEMA_API_URL = 'https://www.youtube.com/iframe_api';
export const CINEMA_API_TIMEOUT_MS = 12_000;
type PendingApi = { ready: Promise<CinemaYouTubeApi | null>; users: number; cancel(): void };
let pending: PendingApi | null = null;

/** Share the official loader, preserve other consumers, and release pending work on exit. */
export function acquireCinemaYouTubeApi() {
  const host = window as YouTubeWindow;
  if (typeof host.YT?.Player === 'function') {
    return { ready: Promise.resolve(host.YT), release() {} };
  }
  if (!pending) {
    let complete: (api: CinemaYouTubeApi | null) => void;
    const ready = new Promise<CinemaYouTubeApi | null>((resolve) => {
      complete = resolve;
    });
    const previous = host.onYouTubeIframeAPIReady;
    const existing = [...document.scripts].find((script) => script.src === CINEMA_API_URL);
    const script = existing ?? document.createElement('script');
    const entry: PendingApi = { ready, users: 0, cancel: () => finish(null) };
    let settled = false;
    const finish = (api: CinemaYouTubeApi | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.removeEventListener('error', failed);
      if (host.onYouTubeIframeAPIReady === loaded) {
        if (previous) host.onYouTubeIframeAPIReady = previous;
        else delete host.onYouTubeIframeAPIReady;
      }
      if (!api && !existing) script.remove();
      if (pending === entry) pending = null;
      complete(api);
    };
    const failed = () => finish(null);
    const loaded = () => {
      if (settled) return;
      try {
        previous?.call(window);
      } finally {
        finish(typeof host.YT?.Player === 'function' ? host.YT : null);
      }
    };
    const timeout = window.setTimeout(failed, CINEMA_API_TIMEOUT_MS);
    host.onYouTubeIframeAPIReady = loaded;
    script.addEventListener('error', failed);
    pending = entry;
    if (!existing) {
      script.src = CINEMA_API_URL;
      script.async = true;
      script.referrerPolicy = 'strict-origin';
      document.head.appendChild(script);
    }
  }
  const entry = pending;
  entry.users += 1;
  let released = false;
  return {
    ready: entry.ready,
    release() {
      if (released) return;
      released = true;
      entry.users -= 1;
      if (entry.users === 0) entry.cancel();
    },
  };
}
