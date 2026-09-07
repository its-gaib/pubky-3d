/** The cinema's program comes exclusively from the videos selected for this world. */
export const WORLD_FILMS = [
  'yIL9wLxG01M',
  'y1GKMmAcd2I',
  'pIKTXzRod_Q',
  'qxXamY9M4L8',
  'RLcYgW8rg-Y',
  'Ft3bcsUI7DU',
  '-9CgWsLoC10',
  'bVwpJqXWKU8',
  'qrYJCxmD8e8',
  'PUXGgTyrY20',
  'wW6M-p03iZg',
  'AnVrkLeMHR0',
  '0aAPBm9wp0A',
  'mEadsnf6jF4',
  'KK8_a0rQZpw',
  'QrJikuMT3r4',
  'i4OlPDXqoz0',
  'D5iH1AElHIY',
] as const;

export type WorldFilm = (typeof WORLD_FILMS)[number];

/** Every film plays once per shuffled program. Avoid repeating the opening film on reshuffle. */
export function shuffleWorldFilms(previousFirst?: WorldFilm, random = Math.random): WorldFilm[] {
  const films: WorldFilm[] = [...WORLD_FILMS];
  for (let index = films.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [films[index], films[other]] = [films[other], films[index]];
  }
  if (films[0] === previousFirst) [films[0], films[1]] = [films[1], films[0]];
  return films;
}

/** YouTube's native playlist advances on completion; no script or message bridge is needed. */
export function worldCinemaUrl(program: readonly WorldFilm[]): string | null {
  if (program.length !== WORLD_FILMS.length || new Set(program).size !== WORLD_FILMS.length) return null;
  if (program.some((id) => !WORLD_FILMS.includes(id))) return null;
  const params = new URLSearchParams({
    playlist: program.slice(1).join(','),
    autoplay: '1',
    loop: '1',
    playsinline: '1',
    rel: '0',
  });
  return `https://www.youtube-nocookie.com/embed/${program[0]}?${params}`;
}
