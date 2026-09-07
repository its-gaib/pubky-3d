import { describe, expect, it } from 'vitest';
import { asInvalid } from '@/test-utils/type-assertions';
import { shuffleWorldFilms, WORLD_FILMS, worldCinemaUrl, type WorldFilm } from './world-cinema-program';

describe('cinema program', () => {
  it('keeps all 18 selected films exactly once and avoids the previous opening film', () => {
    const first = shuffleWorldFilms(undefined, () => 0.4);
    const next = shuffleWorldFilms(first[0], () => 0.4);
    expect(first).toHaveLength(18);
    expect(new Set(first)).toEqual(new Set(WORLD_FILMS));
    expect(new Set(next)).toEqual(new Set(WORLD_FILMS));
    expect(next[0]).not.toBe(first[0]);
  });

  it('only embeds the selected films on the fixed privacy-enhanced host', () => {
    const program = shuffleWorldFilms(undefined, () => 0.7);
    const url = new URL(worldCinemaUrl(program)!);
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe(`/embed/${program[0]}`);
    expect(url.searchParams.get('playlist')?.split(',')).toEqual(program.slice(1));
    expect(url.searchParams.get('loop')).toBe('1');
    expect(url.searchParams.has('enablejsapi')).toBe(false);
    expect(worldCinemaUrl([])).toBeNull();
    expect(worldCinemaUrl(Array(18).fill(WORLD_FILMS[0]))).toBeNull();
    expect(worldCinemaUrl(asInvalid<WorldFilm[]>(['../../unexpected', ...program.slice(1)]))).toBeNull();
  });
});
