import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { ChesskyReadContext } from './chessky.types';

export const CHESSKY_OWNER = 'y'.repeat(52);
export const CHESSKY_OPPONENT = `${'b'.repeat(51)}o`;
export const CHESSKY_OTHER = `${'n'.repeat(51)}y`;
export const CHESSKY_CREATED = '2026-07-01T00:00:00.000Z';

export function chesskyFixture(
  index = 1,
  options: {
    createdAt?: string;
    updatedAt?: string;
    moves?: string[];
    playerColor?: 'w' | 'b';
    multiplayer?: boolean;
  } = {},
) {
  const moves = options.moves ?? [];
  const board = new Chess();
  for (const move of moves) board.move(move);
  const id = `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
  const createdAt = options.createdAt ?? CHESSKY_CREATED;
  const common = {
    version: 1,
    id,
    createdAt,
    updatedAt: options.updatedAt ?? createdAt,
    currentFen: board.fen(),
    moves,
    result: null,
    termination: null,
  };
  const ai = { ...common, initialFen: DEFAULT_POSITION, playerColor: options.playerColor ?? 'w', difficulty: 'easy' };
  const multiplayer = { ...common, white: CHESSKY_OWNER, black: CHESSKY_OPPONENT };
  return {
    id,
    address: options.multiplayer
      ? `pubky://${CHESSKY_OWNER}/pub/chess/${CHESSKY_OPPONENT}/${id}.json`
      : `pubky://${CHESSKY_OWNER}/pub/chess/games/${Date.parse(createdAt)}-${id}.json`,
    record: options.multiplayer ? multiplayer : ai,
  };
}

export function chesskyContext(controller = new AbortController()): ChesskyReadContext {
  return { owner: CHESSKY_OWNER, signal: controller.signal, isCurrent: () => !controller.signal.aborted };
}

export function chesskyDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
