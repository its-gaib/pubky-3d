import { type Address, Client, Pubky, resolvePubky } from '@synonymdev/pubky';
import { getPkarrRelays } from '@/config/network';
import { beforeChesskyAbort } from '@/libs/chessky/chessky.async';
import {
  chesskyRoot,
  isChesskyListedAddress,
  isChesskyPubky,
  parseChesskyGamePath,
} from '@/libs/chessky/chessky.parser';
import { CHESSKY_LIMITS, type ChesskyReadContext } from '@/libs/chessky/chessky.types';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { httpResponseToError } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { toAppError } from '@/libs/error/error.utils';
import { extractStatusCode } from '@/services/homeserver/error.utils';

const current = (context: ChesskyReadContext) => !context.signal.aborted && context.isCurrent();

/** Public GET/list only; this service never acquires a session or signer. */
export class ChesskyService {
  private static sdk: Pubky | null = null;
  private static listing: Promise<void> | null = null;

  private static client() {
    this.sdk ??= Pubky.withClient(new Client({ pkarr: { relays: getPkarrRelays() } }));
    return this.sdk;
  }

  static async listPage(context: ChesskyReadContext, cursor: string | null): Promise<string[] | null> {
    if (
      !current(context) ||
      !isChesskyPubky(context.owner) ||
      (cursor !== null && !isChesskyListedAddress(context.owner, cursor))
    )
      return null;
    // SDK 0.8 listing has no AbortSignal. Keep one physical request across refreshes/accounts.
    while (this.listing) {
      if (!(await beforeChesskyAbort(this.listing, context.signal)) || !current(context)) return null;
    }
    if (!current(context)) return null;
    try {
      const request = this.client().publicStorage.list(
        chesskyRoot(context.owner) as Address,
        cursor,
        false,
        CHESSKY_LIMITS.pageSize,
        false,
      );
      const settled = request.then(
        () => undefined,
        () => undefined,
      );
      this.listing = settled;
      void settled.then(() => {
        if (this.listing === settled) this.listing = null;
      });
      const result = await beforeChesskyAbort(request, context.signal);
      return result && current(context) ? result.value : null;
    } catch (error) {
      if (!current(context)) return null;
      if (extractStatusCode(error) === 404) return [];
      throw toAppError(error, ErrorService.Homeserver, 'listChesskyGames');
    }
  }

  static async fetchGame(context: ChesskyReadContext, address: string): Promise<string | null> {
    if (!current(context) || !parseChesskyGamePath(context.owner, address)) return null;
    try {
      const request = this.client().client.fetch(resolvePubky(address), {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: context.signal,
      });
      void request.then(
        (response) => {
          if (!current(context)) void response.body?.cancel().catch(() => undefined);
        },
        () => undefined,
      );
      const received = await beforeChesskyAbort(request, context.signal);
      if (!received) return null;
      const response = received.value;
      if (!current(context)) {
        void response.body?.cancel().catch(() => undefined);
        return null;
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        if (response.status === 404) return null;
        throw httpResponseToError(response, ErrorService.Homeserver, 'fetchChesskyGame', address);
      }
      return await readChesskyText(response, context.signal);
    } catch (error) {
      if (!current(context)) return null;
      throw toAppError(error, ErrorService.Homeserver, 'fetchChesskyGame');
    }
  }
}

export async function readChesskyText(response: Response, signal: AbortSignal): Promise<string | null> {
  const invalid = () =>
    Err.validation(
      ValidationErrorCode.INVALID_INPUT,
      'The Chessky game response exceeds its size limit or has no body.',
      { service: ErrorService.Homeserver, operation: 'readChesskyGame' },
    );
  if (signal.aborted) {
    void response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (Number(response.headers.get('content-length')) > CHESSKY_LIMITS.bytes || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw invalid();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  let finished = false;
  try {
    while (!signal.aborted) {
      const result = await beforeChesskyAbort(reader.read(), signal);
      if (!result || signal.aborted) return null;
      if (result.value.done) {
        finished = true;
        return text + decoder.decode();
      }
      bytes += result.value.value.byteLength;
      if (bytes > CHESSKY_LIMITS.bytes) throw invalid();
      text += decoder.decode(result.value.value, { stream: true });
    }
    return null;
  } catch (error) {
    if (signal.aborted) return null;
    throw toAppError(error, ErrorService.Homeserver, 'readChesskyGame');
  } finally {
    if (!finished) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
