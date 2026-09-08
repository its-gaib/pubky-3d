import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHESSKY_OWNER, chesskyContext, chesskyFixture } from '@/libs/chessky/chessky.test-utils';
import { CHESSKY_LIMITS } from '@/libs/chessky/chessky.types';
import { ChesskyApplication } from './chessky';

const mocks = vi.hoisted(() => ({ list: vi.fn(), fetch: vi.fn() }));
vi.mock('@/services/chessky/chessky', () => ({ ChesskyService: { listPage: mocks.list, fetchGame: mocks.fetch } }));

function install(files: ReturnType<typeof chesskyFixture>[]) {
  const addresses = files.map((file) => file.address).sort();
  const bodies = new Map(files.map((file) => [file.address, JSON.stringify(file.record)]));
  mocks.list.mockImplementation((_context, cursor: string | null) =>
    Promise.resolve(addresses.filter((address) => !cursor || address > cursor).slice(0, CHESSKY_LIMITS.pageSize)),
  );
  mocks.fetch.mockImplementation((_context, address: string) => Promise.resolve(bodies.get(address) ?? null));
}

describe('Chessky latest saved snapshot scan', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.fetch.mockReset();
  });

  it('chooses a later-page game by updatedAt, including a recent move in an older-created game', async () => {
    const files = Array.from({ length: 35 }, (_, index) => {
      const createdAt = new Date(Date.UTC(2026, 6, index + 1)).toISOString();
      return chesskyFixture(index + 1, {
        createdAt,
        updatedAt: index === 0 ? '2026-09-07T00:00:00.000Z' : index === 33 ? '2026-09-08T00:00:00.000Z' : createdAt,
        moves: ['e2e4'],
      });
    });
    install(files);
    const result = await ChesskyApplication.fetchLatestGame(chesskyContext());
    expect(result.game?.id).toBe(files[33].id);
    expect(result.incomplete).toBe(false);
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledTimes(35);
  });

  it('compares AI and multiplayer records with deterministic ties', async () => {
    const ai = chesskyFixture(2);
    const opponent = chesskyFixture(1, { multiplayer: true });
    install([ai, opponent]);
    const result = await ChesskyApplication.fetchLatestGame(chesskyContext());
    const first = [ai, opponent].sort((a, b) => (a.address < b.address ? -1 : 1))[0];
    expect(result.game?.id).toBe(first.id);
    expect(result.incomplete).toBe(false);
  });

  it('keeps the best found board and marks an invalid or failed scan incomplete', async () => {
    const first = chesskyFixture(1);
    const bad = chesskyFixture(2);
    install([first, bad]);
    mocks.fetch.mockImplementation((_context, address: string) =>
      Promise.resolve(address === first.address ? JSON.stringify(first.record) : '<html>not a game</html>'),
    );
    const result = await ChesskyApplication.fetchLatestGame(chesskyContext());
    expect(result.game?.id).toBe(first.id);
    expect(result.incomplete).toBe(true);
  });

  it('stops repeated pages and foreign cursor injection without fetching their bodies', async () => {
    const entries = Array.from(
      { length: 32 },
      (_, index) => `pubky://${CHESSKY_OWNER}/pub/chess/metadata-${String(index).padStart(2, '0')}.json`,
    );
    mocks.list.mockResolvedValue(entries);
    expect((await ChesskyApplication.fetchLatestGame(chesskyContext())).incomplete).toBe(true);
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.list.mockResolvedValue(['https://foreign.example/pub/chess/game.json']);
    expect((await ChesskyApplication.fetchLatestGame(chesskyContext())).incomplete).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('honestly stops at its candidate budget rather than claiming a complete newest-game result', async () => {
    const files = Array.from({ length: CHESSKY_LIMITS.candidates + 1 }, (_, index) => chesskyFixture(index + 1));
    install(files);
    const result = await ChesskyApplication.fetchLatestGame(chesskyContext());
    expect(result.game).not.toBeNull();
    expect(result.incomplete).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(CHESSKY_LIMITS.candidates);
  });
});
