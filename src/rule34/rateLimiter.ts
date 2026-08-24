/**
 * Serial request queue with an adaptive minimum interval.
 *
 * rule34.xxx limits its rate without publishing what the rate is, and answers a
 * burst with HTTP 429. Requests therefore run one at a time with a floor on the
 * gap between starts. When the site does push back, the interval doubles and
 * then decays as requests succeed, which recovers faster than a fixed delay and
 * behaves better than asking at a constant rate the site never agreed to.
 */

export interface RateLimiterOptions {
  minIntervalMs: number;
  maxIntervalMs?: number;
}

const DEFAULT_MAX_INTERVAL_MS = 30_000;

export class RateLimiter {
  private readonly baseIntervalMs: number;
  private readonly maxIntervalMs: number;
  private intervalMs: number;
  /** Tail of the queue: each task chains onto the previous one. */
  private tail: Promise<unknown> = Promise.resolve();
  private lastStart = 0;

  constructor(options: RateLimiterOptions) {
    this.baseIntervalMs = Math.max(0, options.minIntervalMs);
    this.maxIntervalMs = Math.max(
      this.baseIntervalMs,
      options.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS,
    );
    this.intervalMs = this.baseIntervalMs;
  }

  get currentIntervalMs(): number {
    return this.intervalMs;
  }

  /** Queue a task. Tasks run in call order, one at a time. */
  schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => task());
    // The queue must keep draining even when a task rejects.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * Wait for this request's slot, then claim it.
   *
   * Called once per upstream request rather than once per task, because a task
   * runs a whole retry chain: stamping only its start would let the next task
   * follow the chain's last request with no gap at all.
   */
  async beforeRequest(): Promise<void> {
    await this.waitForSlot();
    this.lastStart = Date.now();
  }

  /** Called after the site answers that it is being asked too often. */
  penalize(): void {
    const next = this.intervalMs === 0 ? 500 : this.intervalMs * 2;
    this.intervalMs = Math.min(this.maxIntervalMs, next);
  }

  /** Called after a success, so one push-back does not slow things down forever. */
  relax(): void {
    this.intervalMs = Math.max(this.baseIntervalMs, Math.floor(this.intervalMs * 0.75));
  }

  private async waitForSlot(): Promise<void> {
    if (this.intervalMs === 0 || this.lastStart === 0) {
      return;
    }
    const elapsed = Date.now() - this.lastStart;
    // Clamped to the interval: a clock stepped backwards would otherwise make
    // this wait for the size of the step, and the queue is serial, so every
    // pending request would wait behind it.
    const remaining = Math.min(this.intervalMs, this.intervalMs - elapsed);
    if (remaining > 0) {
      await sleep(remaining);
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
