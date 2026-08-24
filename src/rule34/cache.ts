/**
 * In-memory TTL and LRU cache.
 *
 * Nothing is written to disk. This exists so that the same question asked twice
 * inside one conversation does not reach rule34.xxx twice, which matters more
 * here than elsewhere: the site limits its rate without publishing one, and
 * every request spent on a repeat is a request unavailable to a new question.
 *
 * A Map iterates in insertion order, so re-inserting on every hit is enough to
 * make the first key the least recently used one.
 */

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlLruCache<V> {
  private readonly store = new Map<string, Entry<V>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.maxEntries <= 0 || this.ttlMs <= 0) {
      return;
    }
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) {
        break;
      }
      this.store.delete(oldest.value);
    }
  }

  /** The keys currently held, in least recently used order. */
  keys(): string[] {
    return [...this.store.keys()];
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
