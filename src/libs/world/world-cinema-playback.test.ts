import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CINEMA_NEXT_REEL_DELAY_MS,
  CINEMA_PLAYER_TIMEOUT_MS,
  createCinemaPlayback,
} from '@/libs/world/world-cinema-playback';
import { WORLD_FILMS } from '@/libs/world/world-cinema-program';
import type { CinemaYouTubeApi, CinemaYouTubeEvents, CinemaYouTubePlayer } from '@/libs/world/world-cinema-youtube';

const loader = vi.hoisted(() => ({ acquire: vi.fn(), release: vi.fn() }));
vi.mock('@/libs/world/world-cinema-youtube', () => ({ acquireCinemaYouTubeApi: loader.acquire }));

const players: TestPlayer[] = [];
class TestPlayer implements CinemaYouTubePlayer {
  state = -1;
  readonly events: CinemaYouTubeEvents;
  constructor(
    readonly iframe: HTMLIFrameElement,
    options: { events: CinemaYouTubeEvents },
  ) {
    this.events = options.events;
    players.push(this);
  }
  mute = vi.fn();
  playVideo = vi.fn();
  destroy = vi.fn(() => this.iframe.remove());
  getPlayerState = () => this.state;
  getIframe = () => this.iframe;
  emit(name: keyof CinemaYouTubeEvents, data?: number) {
    if (name === 'onStateChange' && data !== undefined) this.state = data;
    this.events[name]({ target: this, data });
  }
}

describe('ambient cinema playback', () => {
  const active: ReturnType<typeof createCinemaPlayback>[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    players.length = 0;
    loader.acquire.mockReturnValue({ ready: Promise.resolve({ Player: TestPlayer }), release: loader.release });
  });
  afterEach(() => {
    active.splice(0).forEach((playback) => playback.dispose());
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.useRealTimers();
  });
  async function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onState = vi.fn();
    const playback = createCinemaPlayback(container, onState, WORLD_FILMS);
    active.push(playback);
    await Promise.resolve();
    return { container, onState, playback };
  }

  it('only uncovers a confirmed playing reel, including after buffering', async () => {
    const { onState, playback } = await mount();
    const first = players[0];
    playback.iframe.dispatchEvent(new Event('load'));
    first.emit('onReady');
    expect(first.mute).toHaveBeenCalledOnce();
    expect(first.playVideo).toHaveBeenCalledOnce();
    expect(playback.iframe.style.opacity).toBe('0');
    expect(onState).toHaveBeenLastCalledWith('loading');
    first.emit('onStateChange', 1);
    expect(playback.iframe.style.opacity).toBe('1');
    expect(onState).toHaveBeenLastCalledWith('playing');
    first.emit('onStateChange', 3);
    expect(playback.iframe.style.opacity).toBe('0');
    first.emit('onStateChange', 1);
    await vi.advanceTimersByTimeAsync(CINEMA_PLAYER_TIMEOUT_MS * 2);
    expect(onState).toHaveBeenLastCalledWith('playing');
    expect(players).toHaveLength(1);
  });

  it.each([100, 101, 150])(
    'skips unavailable error %i once and rejects delayed events from the old player',
    async (error) => {
      const { container, onState, playback } = await mount();
      const first = players[0];
      first.emit('onError', error);
      expect(onState).toHaveBeenLastCalledWith('skipping');
      expect(first.iframe.hasAttribute('src')).toBe(false);
      expect(first.destroy).toHaveBeenCalledOnce();
      first.emit('onError', error);
      await vi.advanceTimersByTimeAsync(CINEMA_NEXT_REEL_DELAY_MS - 1);
      expect(players).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      const next = players[1];
      expect(new URL(next.iframe.src).pathname).toBe(`/embed/${WORLD_FILMS[1]}`);
      expect(container.querySelectorAll('iframe')).toHaveLength(1);
      expect(playback.iframe).toBe(next.iframe);
      next.emit('onStateChange', 1);
      first.emit('onError', 153);
      first.emit('onStateChange', 0);
      first.emit('onAutoplayBlocked');
      await vi.advanceTimersByTimeAsync(CINEMA_NEXT_REEL_DELAY_MS * 2);
      expect(players).toHaveLength(2);
      expect(onState).toHaveBeenLastCalledWith('playing');
      expect(next.iframe.style.opacity).toBe('1');
    },
  );

  it('stops after the fixed 18 unavailable reels instead of retrying forever', async () => {
    const { container, onState } = await mount();
    for (let index = 0; index < WORLD_FILMS.length; index++) {
      expect(new URL(players[index].iframe.src).pathname).toBe(`/embed/${WORLD_FILMS[index]}`);
      players[index].emit('onError', 100);
      await vi.advanceTimersByTimeAsync(CINEMA_NEXT_REEL_DELAY_MS);
    }
    expect(onState).toHaveBeenLastCalledWith('unavailable');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(players).toHaveLength(WORLD_FILMS.length);
    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    players.forEach((player) => expect(player.destroy).toHaveBeenCalledOnce());
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([2, 5, 153, 999])('stops on global player error %i without consuming the playlist', async (error) => {
    const { onState } = await mount();
    players[0].emit('onError', error);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(players).toHaveLength(1);
    expect(onState).toHaveBeenLastCalledWith('player-unavailable');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the local autoplay help if playVideo immediately reports a browser block', async () => {
    const { onState } = await mount();
    players[0].state = 1;
    players[0].playVideo.mockImplementation(() => players[0].emit('onAutoplayBlocked'));
    players[0].emit('onReady');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onState).toHaveBeenLastCalledWith('autoplay-blocked');
    expect(players).toHaveLength(1);
    expect(players[0].destroy).toHaveBeenCalledOnce();
  });

  it('advances ended films and omits failed reels on the next lap', async () => {
    await mount();
    players[0].emit('onError', 101);
    await vi.advanceTimersByTimeAsync(CINEMA_NEXT_REEL_DELAY_MS);
    for (let index = 1; index < WORLD_FILMS.length; index++) {
      players[index].emit('onStateChange', 1);
      players[index].emit('onStateChange', 0);
      await vi.advanceTimersByTimeAsync(CINEMA_NEXT_REEL_DELAY_MS);
    }
    expect(new URL(players.at(-1)!.iframe.src).pathname).toBe(`/embed/${WORLD_FILMS[1]}`);
  });

  it('bounds a player that never becomes ready and does not interpret it as a missing film', async () => {
    const { onState } = await mount();
    await vi.advanceTimersByTimeAsync(CINEMA_PLAYER_TIMEOUT_MS);
    expect(onState).toHaveBeenLastCalledWith('player-unavailable');
    expect(players).toHaveLength(1);
    expect(players[0].destroy).toHaveBeenCalledOnce();
  });

  it('cancels a scheduled replacement and ignores all old callbacks after disposal', async () => {
    const { playback, container, onState } = await mount();
    players[0].emit('onError', 150);
    playback.dispose();
    playback.dispose();
    const states = onState.mock.calls.length;
    players[0].emit('onStateChange', 1);
    players[0].emit('onReady');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onState).toHaveBeenCalledTimes(states);
    expect(players).toHaveLength(1);
    expect(container.children).toHaveLength(0);
    expect(loader.release).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not create a player when the shared API arrives after world exit', async () => {
    let resolve!: (api: CinemaYouTubeApi) => void;
    loader.acquire.mockReturnValue({
      ready: new Promise<CinemaYouTubeApi>((complete) => {
        resolve = complete;
      }),
      release: loader.release,
    });
    const { playback, container } = await mount();
    playback.dispose();
    resolve({ Player: TestPlayer });
    await Promise.resolve();
    expect(players).toHaveLength(0);
    expect(container.children).toHaveLength(0);
    expect(loader.release).toHaveBeenCalledOnce();
  });

  it('shows a local fallback when the official API cannot load', async () => {
    loader.acquire.mockReturnValue({ ready: Promise.resolve(null), release: loader.release });
    const { onState, container } = await mount();
    expect(onState).toHaveBeenLastCalledWith('player-unavailable');
    expect(players).toHaveLength(0);
    expect(container.children).toHaveLength(0);
  });
});
