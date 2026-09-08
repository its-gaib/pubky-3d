export interface ChesskySnapshot {
  id: string;
  updatedAt: string;
  white: { id: string | null; name: string };
  black: { id: string | null; name: string };
  pieces: Array<{ square: string; type: 'p' | 'r' | 'n' | 'b' | 'q' | 'k'; color: 'w' | 'b' }>;
  result: string;
}

export interface ChesskyLookup {
  game: ChesskySnapshot | null;
  incomplete: boolean;
}

export interface ChesskyReadContext {
  owner: string;
  signal: AbortSignal;
  /** Captured actor, network, and request generation must still be current. */
  isCurrent: () => boolean;
}

export const CHESSKY_LIMITS = {
  bytes: 128 * 1024,
  moves: 1024,
  replayMoves: 8192,
  pageSize: 32,
  pages: 24,
  candidates: 128,
  scanMs: 20_000,
  profileMs: 3_000,
} as const;
