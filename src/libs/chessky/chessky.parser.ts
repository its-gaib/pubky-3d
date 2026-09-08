import { Chess, DEFAULT_POSITION, validateFen } from 'chess.js';
import { CHESSKY_LIMITS, type ChesskySnapshot } from './chessky.types';

const PUBKY = /^[ybndrfg8ejkmcpqxot1uwisza345h769]{51}[yo]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AI_FILE = /^(\d{13})-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/i;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const COMMON_KEYS = ['version', 'id', 'createdAt', 'updatedAt', 'currentFen', 'moves', 'result', 'termination'];

export function isChesskyPubky(value: unknown): value is string {
  return typeof value === 'string' && PUBKY.test(value);
}

export function chesskyRoot(owner: string) {
  return `pubky://${owner}/pub/chess/`;
}

/** A safe, exact-owner listing cursor; never normalize an untrusted URL. */
export function isChesskyListedAddress(owner: string, value: unknown): value is string {
  if (!isChesskyPubky(owner) || typeof value !== 'string' || value.length > 256) return false;
  const root = chesskyRoot(owner);
  return value.startsWith(root) && /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+(?:\.json)?\/?$/.test(value.slice(root.length));
}

export type ChesskyGamePath =
  | { address: string; kind: 'ai'; id: string; timestamp: string }
  | { address: string; kind: 'multiplayer'; id: string; opponent: string };

export function parseChesskyGamePath(owner: string, address: unknown): ChesskyGamePath | null {
  if (!isChesskyListedAddress(owner, address)) return null;
  const parts = address.slice(chesskyRoot(owner).length).split('/');
  if (parts.length !== 2) return null;
  if (parts[0] === 'games') {
    const match = AI_FILE.exec(parts[1]);
    return match ? { address, kind: 'ai', timestamp: match[1], id: match[2] } : null;
  }
  if (!isChesskyPubky(parts[0]) || parts[0] === owner || !parts[1].endsWith('.json')) return null;
  const id = parts[1].slice(0, -5);
  return UUID.test(id) ? { address, kind: 'multiplayer', id, opponent: parts[0] } : null;
}

export function chesskyName(name: unknown, id: string) {
  const plain =
    typeof name === 'string'
      ? name
          .slice(0, 48)
          .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  return plain || `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function status(game: Chess): { result: string | null; termination: string | null } {
  if (game.isCheckmate()) return { result: game.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
  const draws = [
    [game.isStalemate(), 'stalemate'],
    [game.isThreefoldRepetition(), 'threefold-repetition'],
    [game.isInsufficientMaterial(), 'insufficient-material'],
    [game.isDrawByFiftyMoves(), 'fifty-move-rule'],
    [game.isDraw(), 'draw'],
  ] as const;
  const draw = draws.find(([matches]) => matches);
  return draw ? { result: '1/2-1/2', termination: draw[1] } : { result: null, termination: null };
}

/** Published Chessky v1 only: no mirrored-game reconciliation or unpublished resignations. */
export function parseChesskyGame(
  owner: string,
  address: string,
  text: string,
  remainingMoves = CHESSKY_LIMITS.replayMoves as number,
): { game: ChesskySnapshot | null; moves: number; budgetExceeded: boolean } {
  const invalid = { game: null, moves: 0, budgetExceeded: false };
  const path = parseChesskyGamePath(owner, address);
  if (!path || text.length > CHESSKY_LIMITS.bytes || new TextEncoder().encode(text).byteLength > CHESSKY_LIMITS.bytes)
    return invalid;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return invalid;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid;
  const record = value as Record<string, unknown>;
  const keys = [
    ...COMMON_KEYS,
    ...(path.kind === 'ai' ? ['initialFen', 'playerColor', 'difficulty'] : ['white', 'black']),
  ];
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) return invalid;
  if (
    record.version !== 1 ||
    record.id !== path.id ||
    !timestamp(record.createdAt) ||
    !timestamp(record.updatedAt) ||
    record.updatedAt < record.createdAt
  )
    return invalid;
  if (
    !Array.isArray(record.moves) ||
    record.moves.length > CHESSKY_LIMITS.moves ||
    record.moves.some((move) => typeof move !== 'string' || !UCI.test(move))
  )
    return invalid;
  if (record.moves.length > remainingMoves) return { ...invalid, budgetExceeded: true };
  const spent = record.moves.length;
  const rejected = { ...invalid, moves: spent };
  let white = owner;
  let black = owner;
  let initialFen = DEFAULT_POSITION;
  if (path.kind === 'ai') {
    if (
      String(Date.parse(record.createdAt)).padStart(13, '0') !== path.timestamp ||
      !['w', 'b'].includes(String(record.playerColor)) ||
      !['easy', 'medium'].includes(String(record.difficulty))
    )
      return rejected;
    if (typeof record.initialFen !== 'string') return rejected;
    initialFen = record.initialFen;
  } else {
    if (!isChesskyPubky(record.white) || !isChesskyPubky(record.black) || record.white === record.black)
      return rejected;
    white = record.white;
    black = record.black;
    if (!((white === owner && black === path.opponent) || (black === owner && white === path.opponent)))
      return rejected;
  }
  if (
    initialFen.length > 128 ||
    typeof record.currentFen !== 'string' ||
    record.currentFen.length > 128 ||
    !validateFen(initialFen).ok ||
    !validateFen(record.currentFen).ok
  )
    return rejected;
  try {
    const game = new Chess(initialFen);
    if (game.board().flat().filter(Boolean).length > 32) return rejected;
    for (const move of record.moves as string[]) {
      if (game.isGameOver()) return rejected;
      const played = game.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        ...(move.length === 5 ? { promotion: move[4] } : {}),
      });
      if (played.lan !== move) return rejected;
    }
    if (game.fen() !== record.currentFen) return rejected;
    const terminal = status(game);
    if (record.result !== terminal.result || record.termination !== terminal.termination) return rejected;
    const pieces = game
      .board()
      .flat()
      .flatMap((piece) => (piece ? [{ square: piece.square, type: piece.type, color: piece.color }] : []));
    if (pieces.length > 32) return rejected;
    const participant = (id: string) => ({ id, name: chesskyName(null, id) });
    const ai = { id: null, name: 'Chessky AI' };
    return {
      moves: spent,
      budgetExceeded: false,
      game: {
        id: path.id,
        updatedAt: record.updatedAt,
        white: path.kind === 'ai' ? (record.playerColor === 'w' ? participant(owner) : ai) : participant(white),
        black: path.kind === 'ai' ? (record.playerColor === 'b' ? participant(owner) : ai) : participant(black),
        pieces,
        result: terminal.result ?? 'In progress',
      },
    };
  } catch {
    return rejected;
  }
}
