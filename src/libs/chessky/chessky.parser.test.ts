import { DEFAULT_POSITION } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { chesskyName, isChesskyListedAddress, parseChesskyGame, parseChesskyGamePath } from './chessky.parser';
import { CHESSKY_OPPONENT, CHESSKY_OTHER, CHESSKY_OWNER, chesskyFixture } from './chessky.test-utils';
import { CHESSKY_LIMITS } from './chessky.types';

describe('Chessky saved-game validation', () => {
  it.each(['w', 'b'] as const)('replays the AI board with the human on %s', (playerColor) => {
    const file = chesskyFixture(1, { playerColor, moves: ['e2e4', 'e7e5'] });
    const parsed = parseChesskyGame(CHESSKY_OWNER, file.address, JSON.stringify(file.record));
    expect(parsed.game?.pieces).toHaveLength(32);
    expect(parsed.game?.pieces).toContainEqual({ square: 'e4', color: 'w', type: 'p' });
    expect(parsed.game?.pieces).not.toContainEqual({ square: 'e2', color: 'w', type: 'p' });
    expect(parsed.game?.[playerColor === 'w' ? 'white' : 'black'].id).toBe(CHESSKY_OWNER);
    expect(parsed.game?.[playerColor === 'w' ? 'black' : 'white']).toEqual({ id: null, name: 'Chessky AI' });
    expect(parsed.game?.result).toBe('In progress');
  });

  it('requires exact same-owner canonical game paths and safe cursors', () => {
    const file = chesskyFixture();
    expect(parseChesskyGamePath(CHESSKY_OWNER, file.address)).not.toBeNull();
    for (const bad of [
      file.address.replace(CHESSKY_OWNER, CHESSKY_OTHER),
      file.address.replace('pubky://', 'https://'),
      `${file.address}?x=1`,
      `${file.address}#x`,
      file.address.replace('/games/', '/games/../games/'),
      file.address.replace('/games/', '/%67ames/'),
      file.address.replace('/games/', '//games/'),
      file.address.replace('/games/', '/games/./'),
    ]) {
      expect(parseChesskyGamePath(CHESSKY_OWNER, bad)).toBeNull();
      expect(isChesskyListedAddress(CHESSKY_OWNER, bad)).toBe(false);
    }
    expect(
      parseChesskyGamePath(CHESSKY_OWNER, `pubky://${CHESSKY_OWNER}/pub/chess/${CHESSKY_OPPONENT}/index.json`),
    ).toBeNull();
  });

  it('binds multiplayer participants and UUID to the saved file directory', () => {
    const file = chesskyFixture(1, { multiplayer: true, moves: ['d2d4'] });
    const parse = (record: unknown) => parseChesskyGame(CHESSKY_OWNER, file.address, JSON.stringify(record)).game;
    expect(parse(file.record)?.white.id).toBe(CHESSKY_OWNER);
    expect(parse(file.record)?.black.id).toBe(CHESSKY_OPPONENT);
    for (const record of [
      { ...file.record, white: CHESSKY_OTHER },
      { ...file.record, black: CHESSKY_OWNER },
      { ...file.record, black: CHESSKY_OTHER },
      { ...file.record, id: chesskyFixture(2).id },
    ])
      expect(parse(record)).toBeNull();
  });

  it('rejects illegal histories, forged FENs, noncanonical dates, and path timestamp mismatch', () => {
    const file = chesskyFixture(1, { moves: ['e2e4'] });
    const invalid = [
      { ...file.record, currentFen: DEFAULT_POSITION },
      { ...file.record, moves: ['e2e5'] },
      { ...file.record, moves: ['e4'] },
      { ...file.record, currentFen: '8/8/8/8/8/8/8/8 w - - 0 1' },
      { ...file.record, currentFen: 'x'.repeat(129) },
      { ...file.record, createdAt: '2026-07-02T00:00:00.000Z' },
      { ...file.record, updatedAt: '2026-02-30T00:00:00.000Z' },
      { ...file.record, updatedAt: '2026-06-01T00:00:00.000Z' },
      { ...file.record, updatedAt: '2026-07-01T01:00:00.000+01:00' },
      { ...file.record, version: 2 },
    ];
    for (const record of invalid)
      expect(parseChesskyGame(CHESSKY_OWNER, file.address, JSON.stringify(record)).game).toBeNull();
  });

  it('matches published terminal outcomes and deliberately rejects unpublished resignation records', () => {
    const file = chesskyFixture(1, { moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] });
    expect(
      parseChesskyGame(
        CHESSKY_OWNER,
        file.address,
        JSON.stringify({ ...file.record, result: '0-1', termination: 'checkmate' }),
      ).game?.result,
    ).toBe('0-1');
    expect(
      parseChesskyGame(
        CHESSKY_OWNER,
        file.address,
        JSON.stringify({ ...file.record, result: '1-0', termination: 'checkmate' }),
      ).game,
    ).toBeNull();
    const active = chesskyFixture();
    expect(
      parseChesskyGame(
        CHESSKY_OWNER,
        active.address,
        JSON.stringify({ ...active.record, result: '0-1', termination: 'resignation' }),
      ).game,
    ).toBeNull();
  });

  it('enforces record, move-work, and physical board-size limits', () => {
    const file = chesskyFixture(1, { moves: ['e2e4'] });
    expect(parseChesskyGame(CHESSKY_OWNER, file.address, JSON.stringify(file.record), 0).budgetExceeded).toBe(true);
    expect(
      parseChesskyGame(
        CHESSKY_OWNER,
        file.address,
        JSON.stringify({ ...file.record, moves: Array(CHESSKY_LIMITS.moves + 1).fill('e2e4') }),
      ).game,
    ).toBeNull();
    expect(parseChesskyGame(CHESSKY_OWNER, file.address, ' '.repeat(CHESSKY_LIMITS.bytes + 1)).game).toBeNull();
    const overfull = 'rnbqkbnr/pppppppp/8/8/8/Q7/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(
      parseChesskyGame(
        CHESSKY_OWNER,
        file.address,
        JSON.stringify({ ...file.record, initialFen: overfull, currentFen: overfull, moves: [] }),
      ).game,
    ).toBeNull();
    expect(chesskyName(`Name\n\u202E${'x'.repeat(100)}`, CHESSKY_OWNER)).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(chesskyName('x'.repeat(100), CHESSKY_OWNER)).toHaveLength(48);
  });
});
