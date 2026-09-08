import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chesskyContext, chesskyDeferred, chesskyFixture } from '@/libs/chessky/chessky.test-utils';
import { CHESSKY_LIMITS } from '@/libs/chessky/chessky.types';
import { ChesskyService, readChesskyText } from './chessky';

const mocks = vi.hoisted(() => ({ list: vi.fn(), fetch: vi.fn() }));
vi.mock('@synonymdev/pubky', () => ({
  Client: class {
    fetch = mocks.fetch;
  },
  Pubky: { withClient: (client: unknown) => ({ client, publicStorage: { list: mocks.list } }) },
  resolvePubky: (address: string) => address.replace('pubky://', 'https://_pubky.'),
}));
vi.mock('@/config/network', () => ({ getPkarrRelays: () => ['https://pkarr.pubky.app'] }));
vi.mock('@/libs/logger/logger', () => ({ Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

describe('Chessky public read boundary', () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.fetch.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('performs only same-owner public GETs with credentials omitted and bounded recursive listing', async () => {
    const context = chesskyContext();
    const file = chesskyFixture();
    mocks.list.mockResolvedValue([file.address]);
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify(file.record)));
    expect(await ChesskyService.listPage(context, null)).toEqual([file.address]);
    expect(mocks.list).toHaveBeenCalledWith(`pubky://${context.owner}/pub/chess/`, null, false, 32, false);
    expect(await ChesskyService.fetchGame(context, file.address)).toBe(JSON.stringify(file.record));
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining('https://_pubky.'), {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: context.signal,
    });
    await ChesskyService.fetchGame(context, 'https://foreign.example/game.json');
    await ChesskyService.listPage(context, `${file.address}?cursor=evil`);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('keeps a cancelled SDK list physically occupied until it settles', async () => {
    const pending = chesskyDeferred<string[]>();
    mocks.list.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([]);
    const firstAbort = new AbortController();
    const first = ChesskyService.listPage(chesskyContext(firstAbort), null);
    firstAbort.abort();
    expect(await first).toBeNull();
    const second = ChesskyService.listPage(chesskyContext(), null);
    await Promise.resolve();
    expect(mocks.list).toHaveBeenCalledTimes(1);
    pending.resolve([]);
    expect(await second).toEqual([]);
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it('rejects declared and streamed oversize bodies and releases the reader', async () => {
    const declared = new Response('too large', { headers: { 'content-length': String(CHESSKY_LIMITS.bytes + 1) } });
    const declaredCancel = vi.spyOn(declared.body!, 'cancel');
    await expect(readChesskyText(declared, new AbortController().signal)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(declaredCancel).toHaveBeenCalledOnce();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(CHESSKY_LIMITS.bytes + 1));
      },
      cancel,
    });
    await expect(readChesskyText(new Response(stream), new AbortController().signal)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('cancels a stalled body when aborted and releases its lock', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const abort = new AbortController();
    const reading = readChesskyText(new Response(stream), abort.signal);
    abort.abort();
    expect(await reading).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('stops awaiting an aborted fetch and cancels a late response body', async () => {
    const pending = chesskyDeferred<Response>();
    mocks.fetch.mockReturnValue(pending.promise);
    const abort = new AbortController();
    const reading = ChesskyService.fetchGame(chesskyContext(abort), chesskyFixture().address);
    abort.abort();
    expect(await reading).toBeNull();
    const response = new Response('late');
    const cancel = vi.spyOn(response.body!, 'cancel');
    pending.resolve(response);
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
