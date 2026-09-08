import { beforeChesskyAbort } from '@/libs/chessky/chessky.async';
import { isChesskyListedAddress, parseChesskyGame, parseChesskyGamePath } from '@/libs/chessky/chessky.parser';
import { CHESSKY_LIMITS, type ChesskyLookup, type ChesskyReadContext } from '@/libs/chessky/chessky.types';
import { ChesskyService } from '@/services/chessky/chessky';

/** Scans creation-sorted paths but chooses by verified update time, across both record formats. */
export class ChesskyApplication {
  static async fetchLatestGame(context: ChesskyReadContext): Promise<ChesskyLookup> {
    const result: ChesskyLookup = { game: null, incomplete: false };
    let cursor: string | null = null;
    let bestAddress = '';
    let candidates = 0;
    let remainingMoves: number = CHESSKY_LIMITS.replayMoves;
    const seen = new Set<string>();
    const current = () => !context.signal.aborted && context.isCurrent();
    for (let page = 0; page < CHESSKY_LIMITS.pages; page++) {
      if (!current()) return { ...result, incomplete: true };
      let entries: string[] | null;
      try {
        entries = await ChesskyService.listPage(context, cursor);
      } catch {
        return { ...result, incomplete: true };
      }
      if (!entries || !current()) return { ...result, incomplete: true };
      if (!Array.isArray(entries) || entries.length > CHESSKY_LIMITS.pageSize) return { ...result, incomplete: true };
      if (!entries.length) return result;
      let progressed = false;
      for (const address of entries) {
        if (!current()) return { ...result, incomplete: true };
        if (
          !isChesskyListedAddress(context.owner, address) ||
          (cursor !== null && address <= cursor) ||
          seen.has(address)
        )
          return { ...result, incomplete: true };
        seen.add(address);
        cursor = address;
        progressed = true;
        const path = parseChesskyGamePath(context.owner, address);
        if (!path) continue; // index.json and other same-owner metadata are not game records.
        if (candidates++ >= CHESSKY_LIMITS.candidates) return { ...result, incomplete: true };
        try {
          const text = await ChesskyService.fetchGame(context, address);
          if (!current()) return { ...result, incomplete: true };
          if (text === null) {
            result.incomplete = true;
            continue;
          }
          // Yield between legal replays; the total replay and wall-clock budgets are independent.
          await beforeChesskyAbort(new Promise<void>((resolve) => setTimeout(resolve, 0)), context.signal);
          if (!current()) return { ...result, incomplete: true };
          const parsed = parseChesskyGame(context.owner, address, text, remainingMoves);
          if (parsed.budgetExceeded) return { ...result, incomplete: true };
          remainingMoves -= parsed.moves;
          if (!parsed.game) {
            result.incomplete = true;
            continue;
          }
          if (
            !result.game ||
            parsed.game.updatedAt > result.game.updatedAt ||
            (parsed.game.updatedAt === result.game.updatedAt && address < bestAddress)
          ) {
            result.game = parsed.game;
            bestAddress = address;
          }
        } catch {
          result.incomplete = true;
        }
      }
      if (!progressed) return { ...result, incomplete: true };
      if (entries.length < CHESSKY_LIMITS.pageSize) return result;
    }
    return { ...result, incomplete: true };
  }
}
