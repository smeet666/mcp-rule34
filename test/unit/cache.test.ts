import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlLruCache } from "../../src/rule34/cache.js";

const EPOCH = new Date("2026-01-01T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ now: EPOCH });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TtlLruCache", () => {
  it("gives back what it was given", () => {
    const cache = new TtlLruCache<string>(10, 1000);
    cache.set("a", "first");
    expect(cache.get("a")).toBe("first");
    expect(cache.get("b")).toBeUndefined();
  });

  it("forgets an entry once its time is up", () => {
    const cache = new TtlLruCache<string>(10, 1000);
    cache.set("a", "first");
    vi.advanceTimersByTime(999);
    expect(cache.get("a")).toBe("first");
    vi.advanceTimersByTime(1);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("drops the least recently read entry when it is full", () => {
    const cache = new TtlLruCache<string>(2, 1000);
    cache.set("a", "first");
    cache.set("b", "second");
    // Reading 'a' makes 'b' the oldest, so 'b' is the one that goes.
    cache.get("a");
    cache.set("c", "third");
    expect(cache.get("a")).toBe("first");
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe("third");
  });

  it("holds nothing when it is configured to hold nothing", () => {
    // Someone who set the size or the lifetime to zero asked for no cache, and
    // a cache that kept one entry anyway would answer with a stale post.
    expect(new TtlLruCache<string>(0, 1000).size).toBe(0);
    const noEntries = new TtlLruCache<string>(0, 1000);
    noEntries.set("a", "first");
    expect(noEntries.get("a")).toBeUndefined();

    const noTime = new TtlLruCache<string>(10, 0);
    noTime.set("a", "first");
    expect(noTime.get("a")).toBeUndefined();
  });
});
