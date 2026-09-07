import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORLD_SOCIAL_CANCELLED, WORLD_SOCIAL_READ_TIMEOUT_MS, WorldSocialReadQueue } from './useWorldSocial.queue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('WorldSocialReadQueue', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps at most two physical reads and prioritizes a selected profile over queued graph work', async () => {
    const queue = new WorldSocialReadQueue();
    const first = deferred();
    const second = deferred();
    const order: string[] = [];
    const one = queue.run(
      () => first.promise,
      () => true,
    );
    const two = queue.run(
      () => second.promise,
      () => true,
    );
    const graph = queue.run(
      async () => {
        order.push('graph');
      },
      () => true,
    );
    const selected = queue.run(
      async () => {
        order.push('selected');
      },
      () => true,
      true,
    );
    await Promise.resolve();
    expect(order).toEqual([]);
    first.resolve();
    await one;
    await selected;
    expect(order[0]).toBe('selected');
    second.resolve();
    await Promise.all([two, graph]);
    expect(order).toEqual(['selected', 'graph']);
  });

  it('times out queued callers without exceeding the physical budget when old reads are still unsettled', async () => {
    vi.useFakeTimers();
    const queue = new WorldSocialReadQueue();
    const one = deferred();
    const two = deferred();
    const third = vi.fn(async () => undefined);
    const reads = [
      queue.run(
        () => one.promise,
        () => true,
      ),
      queue.run(
        () => two.promise,
        () => true,
      ),
      queue.run(third, () => true),
    ];
    const settled = Promise.allSettled(reads);
    await vi.advanceTimersByTimeAsync(WORLD_SOCIAL_READ_TIMEOUT_MS + 1);
    expect((await settled).every((result) => result.status === 'rejected')).toBe(true);
    expect(third).not.toHaveBeenCalled();
    one.resolve();
    two.resolve();
    await Promise.resolve();
    expect(third).not.toHaveBeenCalled();
  });

  it('drops queued work from an old account before it can call a controller', async () => {
    const queue = new WorldSocialReadQueue();
    const one = deferred();
    const two = deferred();
    let active = true;
    const pending = Promise.allSettled([
      queue.run(
        () => one.promise,
        () => active,
      ),
      queue.run(
        () => two.promise,
        () => active,
      ),
    ]);
    const stale = vi.fn(async () => undefined);
    const queued = queue.run(stale, () => active).catch((error) => error);
    active = false;
    queue.cancelInactive();
    expect(await queued).toBe(WORLD_SOCIAL_CANCELLED);
    one.resolve();
    two.resolve();
    await pending;
    expect(stale).not.toHaveBeenCalled();
  });
});
