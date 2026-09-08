/** Stop awaiting non-abortable SDK work without releasing its physical concurrency slot. */
export function beforeChesskyAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<{ value: T } | null> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      resolve(null);
    };
    if (signal.aborted) {
      void promise.catch(() => undefined);
      resolve(null);
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve({ value });
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
