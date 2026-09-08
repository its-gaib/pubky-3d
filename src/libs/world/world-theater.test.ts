import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';
import { disposeObject } from './world-geometry';
import { createTheater } from './world-theater';
import type { WorldData, WorldPost } from './world-types';

const posts: WorldPost[] = [
  { id: 'first', author: 'First author', text: 'First ranked post', tags: [] },
  { id: 'second', author: 'Second author', text: 'Second ranked post', tags: [] },
  { id: 'third', author: 'Third author', text: 'Third ranked post', tags: [] },
];
const data: WorldData = { source: 'demo', tags: [], people: [], relationships: [], trendingPosts: posts };

describe('Trending Theater program', () => {
  let scene: THREE.Scene;
  const fillText = vi.fn();

  beforeEach(() => {
    scene = new THREE.Scene();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      asOpaque<CanvasRenderingContext2D>({
        fillText,
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        roundRect: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        measureText: (text: string) => ({ width: text.length * 20 }),
      }),
    );
  });

  afterEach(() => {
    disposeObject(scene);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    fillText.mockClear();
  });

  function mount(value = data) {
    return createTheater(scene, vi.fn(), vi.fn(), value);
  }

  it('shows the supplied rank order and rotates only when a full reading interval passes', () => {
    const theater = mount();
    expect(fillText).toHaveBeenCalledWith('First ranked post', 76, 285, 1360);
    expect(theater.tick(19)).toBe(false);
    expect(theater.getStatus().theaterIndex).toBe(0);
    expect(theater.tick(1)).toBe(true);
    expect(theater.getStatus().theaterIndex).toBe(1);
    expect(fillText).toHaveBeenCalledWith('Second ranked post', 76, 285, 1360);
  });

  it('keeps a paused reader steady, permits manual wraparound, and resumes with a fresh interval', () => {
    const theater = mount();
    theater.tick(17);
    theater.setPaused(true);
    expect(theater.tick(60)).toBe(false);
    expect(theater.getStatus()).toEqual({ theaterIndex: 0, theaterPaused: true });
    theater.step(-1);
    expect(theater.getStatus().theaterIndex).toBe(2);
    theater.step(1);
    expect(theater.getStatus().theaterIndex).toBe(0);
    theater.setPaused(false);
    expect(theater.tick(19)).toBe(false);
    expect(theater.tick(1)).toBe(true);
    expect(theater.getStatus()).toEqual({ theaterIndex: 1, theaterPaused: false });
  });

  it('starts with a stable screen for reduced motion while preserving manual control', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const theater = mount();
    expect(theater.tick(100)).toBe(false);
    expect(theater.getStatus().theaterPaused).toBe(true);
    theater.step(1);
    expect(theater.getStatus().theaterIndex).toBe(1);
  });

  it('replaces stale program content when the data source changes and handles an empty feed', () => {
    const theater = mount();
    theater.step(2);
    theater.updateData({ ...data, source: 'production', trendingPosts: [posts[1]] });
    expect(theater.getStatus().theaterIndex).toBe(0);
    expect(fillText).toHaveBeenCalledWith('PUBLIC PRODUCTION · RANKED BY TOTAL ENGAGEMENT', 70, 160, 1350);
    expect(theater.tick(80)).toBe(false);
    theater.updateData({ ...data, trendingPosts: [] });
    theater.step(-1);
    expect(theater.getStatus().theaterIndex).toBe(0);
    expect(fillText).toHaveBeenCalledWith('NO POSTS', 76, 808);
  });

  it('hides pending program content and holds playback until the new ranked program is ready', () => {
    const theater = mount();
    theater.tick(18);
    fillText.mockClear();
    theater.setLoading(true);
    expect(fillText).toHaveBeenCalledWith('Loading the next show…', 238, 424, 1200);
    expect(fillText.mock.calls.map(([text]) => text).join(' ')).not.toMatch(/ranked post|author|ON AIR|PAUSED|1 \/ 3/);

    fillText.mockClear();
    expect(theater.tick(120)).toBe(false);
    theater.step(1);
    theater.setLoading(true);
    expect(theater.getStatus()).toEqual({ theaterIndex: 0, theaterPaused: false });
    expect(fillText).not.toHaveBeenCalled();

    theater.updateData({ ...data, source: 'production', trendingPosts: [posts[2], posts[0]] });
    expect(fillText.mock.calls.map(([text]) => text).join(' ')).not.toMatch(/ranked post|author|ON AIR|PAUSED|1 \/ 2/);
    fillText.mockClear();
    theater.setLoading(false);
    expect(fillText).toHaveBeenCalledWith('Third ranked post', 76, 285, 1360);
    expect(theater.tick(19)).toBe(false);
    expect(theater.tick(1)).toBe(true);
    expect(fillText).toHaveBeenCalledWith('First ranked post', 76, 285, 1360);
  });

  it('restores the existing program after a failed load without changing pause intent', () => {
    const theater = mount();
    theater.step(1);
    theater.setPaused(true);
    theater.setLoading(true);
    fillText.mockClear();
    theater.setLoading(false);
    expect(fillText).toHaveBeenCalledWith('Second ranked post', 76, 285, 1360);
    expect(theater.getStatus()).toEqual({ theaterIndex: 1, theaterPaused: true });
    expect(theater.tick(120)).toBe(false);
    theater.setPaused(false);
    expect(theater.tick(20)).toBe(true);
    expect(theater.getStatus()).toEqual({ theaterIndex: 2, theaterPaused: false });
  });

  it('renders hostile-looking post content as canvas text without creating markup', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    mount({ ...data, trendingPosts: [{ ...posts[0], text: hostile }] });
    expect(fillText).toHaveBeenCalledWith(hostile, 76, 285, 1360);
    expect(document.querySelector('img[onerror]')).toBeNull();
  });
});
