import { TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export const WORLD_SOCIAL_CANCELLED = Symbol('world-social-cancelled');
export const WORLD_SOCIAL_READ_TIMEOUT_MS = 20_000;
export const WORLD_SOCIAL_CONCURRENCY = 2;

interface ReadJob {
  active: () => boolean;
  start: () => void;
  cancel: () => void;
}

/** Keep the physical read budget even after a caller times out or changes accounts. */
export class WorldSocialReadQueue {
  private running = 0;
  private jobs: ReadJob[] = [];

  run<T>(read: () => Promise<T>, active: () => boolean, priority = false): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let expired = false;
      const current = () => !expired && active();
      const job: ReadJob = {
        active: current,
        cancel: () => {
          clearTimeout(timer);
          reject(WORLD_SOCIAL_CANCELLED);
        },
        start: () => {
          this.running += 1;
          void Promise.resolve()
            .then(() => {
              if (!current()) throw WORLD_SOCIAL_CANCELLED;
              return read();
            })
            .then((result) => (current() ? resolve(result) : reject(WORLD_SOCIAL_CANCELLED)), reject)
            .finally(() => {
              clearTimeout(timer);
              this.running -= 1;
              this.drain();
            });
        },
      };
      // Include queue time so a selected profile also stops loading when older
      // physical requests have stalled. Their slots remain occupied until settled.
      const timer = setTimeout(() => {
        expired = true;
        this.jobs = this.jobs.filter((queued) => queued !== job);
        reject(
          active()
            ? Err.timeout(TimeoutErrorCode.REQUEST_TIMEOUT, 'The social world read timed out.', {
                service: ErrorService.Nexus,
                operation: 'readWorldSocial',
              })
            : WORLD_SOCIAL_CANCELLED,
        );
      }, WORLD_SOCIAL_READ_TIMEOUT_MS);
      if (priority) this.jobs.unshift(job);
      else this.jobs.push(job);
      this.drain();
    });
  }

  cancelInactive(): void {
    this.jobs = this.jobs.filter((job) => {
      if (job.active()) return true;
      job.cancel();
      return false;
    });
    this.drain();
  }

  private drain(): void {
    while (this.running < WORLD_SOCIAL_CONCURRENCY && this.jobs.length) {
      const job = this.jobs.shift()!;
      if (job.active()) job.start();
      else job.cancel();
    }
  }
}
