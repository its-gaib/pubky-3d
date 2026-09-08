import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CinemaYouTubeApi } from '@/libs/world/world-cinema-youtube';

type ApiHost = Window & { YT?: CinemaYouTubeApi; onYouTubeIframeAPIReady?: () => void };
const host = window as ApiHost;
const readyApi: CinemaYouTubeApi = {
  Player: class {
    mute() {}
    playVideo() {}
    getPlayerState() {
      return -1;
    }
    getIframe() {
      return document.createElement('iframe');
    }
    destroy() {}
  },
};

describe('shared official YouTube API loader', () => {
  const releases: (() => void)[] = [];
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    delete host.YT;
    delete host.onYouTubeIframeAPIReady;
  });
  afterEach(() => {
    releases.splice(0).forEach((release) => release());
    document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]').forEach((script) => script.remove());
    delete host.YT;
    delete host.onYouTubeIframeAPIReady;
    vi.useRealTimers();
  });

  it('shares one fixed script and preserves the previous ready handler across consumers', async () => {
    const { acquireCinemaYouTubeApi, CINEMA_API_URL } = await import('./world-cinema-youtube');
    const previous = vi.fn();
    host.onYouTubeIframeAPIReady = previous;
    const first = acquireCinemaYouTubeApi();
    const second = acquireCinemaYouTubeApi();
    releases.push(first.release, second.release);
    expect(document.querySelectorAll(`script[src="${CINEMA_API_URL}"]`)).toHaveLength(1);
    first.release();
    host.YT = readyApi;
    host.onYouTubeIframeAPIReady?.();
    expect(await second.ready).toBe(host.YT);
    expect(previous).toHaveBeenCalledOnce();
    expect(host.onYouTubeIframeAPIReady).toBe(previous);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    const third = acquireCinemaYouTubeApi();
    releases.push(third.release);
    expect(await third.ready).toBe(host.YT);
    expect(document.querySelectorAll(`script[src="${CINEMA_API_URL}"]`)).toHaveLength(1);
  });

  it('cancels the last pending consumer without leaving callbacks, timers, or an owned script', async () => {
    const { acquireCinemaYouTubeApi, CINEMA_API_URL } = await import('./world-cinema-youtube');
    const previous = vi.fn();
    host.onYouTubeIframeAPIReady = previous;
    const pending = acquireCinemaYouTubeApi();
    releases.push(pending.release);
    const lateReady = host.onYouTubeIframeAPIReady!;
    pending.release();
    expect(await pending.ready).toBeNull();
    expect(host.onYouTubeIframeAPIReady).toBe(previous);
    expect(document.querySelector(`script[src="${CINEMA_API_URL}"]`)).toBeNull();
    lateReady();
    expect(previous).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out without removing a script or ready handler owned by another consumer', async () => {
    const { acquireCinemaYouTubeApi, CINEMA_API_TIMEOUT_MS, CINEMA_API_URL } = await import('./world-cinema-youtube');
    const foreign = document.createElement('script');
    foreign.src = CINEMA_API_URL;
    document.head.appendChild(foreign);
    const previous = vi.fn();
    host.onYouTubeIframeAPIReady = previous;
    const pending = acquireCinemaYouTubeApi();
    releases.push(pending.release);
    await vi.advanceTimersByTimeAsync(CINEMA_API_TIMEOUT_MS);
    expect(await pending.ready).toBeNull();
    expect(foreign.isConnected).toBe(true);
    expect(host.onYouTubeIframeAPIReady).toBe(previous);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles script errors once and does not overwrite a newer ready callback', async () => {
    const { acquireCinemaYouTubeApi, CINEMA_API_URL } = await import('./world-cinema-youtube');
    const pending = acquireCinemaYouTubeApi();
    releases.push(pending.release);
    const newer = vi.fn();
    host.onYouTubeIframeAPIReady = newer;
    document.querySelector(`script[src="${CINEMA_API_URL}"]`)!.dispatchEvent(new Event('error'));
    expect(await pending.ready).toBeNull();
    expect(host.onYouTubeIframeAPIReady).toBe(newer);
    expect(vi.getTimerCount()).toBe(0);
  });
});
