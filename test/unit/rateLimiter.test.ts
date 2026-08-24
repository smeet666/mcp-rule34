import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../../src/rule34/rateLimiter.js";

/** A fixed epoch, so no assertion here depends on when the suite runs. */
const EPOCH = new Date("2026-01-01T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ now: EPOCH });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RateLimiter", () => {
  it("runs tasks one at a time, in the order they were queued", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const order: string[] = [];

    const first = limiter.schedule(async () => {
      order.push("first in");
      await new Promise((resolve) => setTimeout(resolve, 50));
      order.push("first out");
    });
    const second = limiter.schedule(async () => {
      order.push("second in");
    });

    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first, second]);

    expect(order).toEqual(["first in", "first out", "second in"]);
  });

  it("spaces two requests by the interval", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 1000 });
    const starts: number[] = [];

    const run = async () => {
      await limiter.beforeRequest();
      starts.push(Date.now());
    };

    const all = Promise.all([limiter.schedule(run), limiter.schedule(run)]);
    await vi.advanceTimersByTimeAsync(5000);
    await all;

    expect(starts).toEqual([EPOCH.getTime(), EPOCH.getTime() + 1000]);
  });

  it("keeps draining after a task fails", async () => {
    // A rejected task that stalled the queue would turn one failed request into
    // a server that never answers again.
    const limiter = new RateLimiter({ minIntervalMs: 0 });
    const failed = limiter.schedule(async () => {
      throw new Error("upstream said no");
    });
    await expect(failed).rejects.toThrow("upstream said no");
    await expect(limiter.schedule(async () => "after")).resolves.toBe("after");
  });

  it("widens the interval when the site pushes back, and narrows it on success", () => {
    const limiter = new RateLimiter({ minIntervalMs: 1000 });
    limiter.penalize();
    expect(limiter.currentIntervalMs).toBe(2000);
    limiter.penalize();
    expect(limiter.currentIntervalMs).toBe(4000);
    limiter.relax();
    expect(limiter.currentIntervalMs).toBe(3000);
  });

  it("never narrows below the interval it was built with", () => {
    const limiter = new RateLimiter({ minIntervalMs: 1000 });
    for (let index = 0; index < 10; index += 1) {
      limiter.relax();
    }
    expect(limiter.currentIntervalMs).toBe(1000);
  });

  it("waits no longer than the interval when the clock steps backwards", async () => {
    // A clock moved back by NTP or by a resumed machine would otherwise make
    // this wait for the size of the step, and the queue is serial, so every
    // pending request would wait behind it.
    const limiter = new RateLimiter({ minIntervalMs: 1000 });
    await limiter.schedule(() => limiter.beforeRequest());

    vi.setSystemTime(new Date(EPOCH.getTime() - 60 * 60 * 1000));
    const started = Date.now();
    const second = limiter.schedule(() => limiter.beforeRequest());
    await vi.advanceTimersByTimeAsync(1000);
    await second;

    expect(Date.now() - started).toBeLessThanOrEqual(1000);
  });
});
