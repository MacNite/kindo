import { env } from "./env";

/**
 * The client's address, if a trusted reverse proxy told us (KINDO_TRUST_PROXY).
 * Otherwise null: X-Forwarded-For is just a header anyone can send, and a
 * Server Action can't see the socket. The proxy appends the address it saw,
 * so the last entry is the one to believe; earlier ones came from the client.
 */
export function clientAddress(headers: Headers): string | null {
  if (!env().KINDO_TRUST_PROXY) return null;
  return headers.get("x-forwarded-for")?.split(",").pop()?.trim() || headers.get("x-real-ip")?.trim() || null;
}

/**
 * A small in-memory limiter for guessable things (passwords, the PIN). Per
 * process: enough for a family instance, and it never locks anyone out for
 * longer than the window.
 */
export class Limiter {
  /** Failures per key, in the order of each key's latest failure (oldest first). */
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number, private maxKeys = 10_000) {}

  /** Records a failure; true while the key is still allowed to try. */
  fail(key: string, now = Date.now()) {
    const recent = this.recent(key, now);
    recent.push(now);
    this.hits.delete(key); // re-inserted last, so the map stays in order
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.evict(now);
  }

  blocked(key: string, now = Date.now()) {
    return this.recent(key, now).length >= this.max;
  }

  clear(key: string) {
    this.hits.delete(key);
  }

  private recent(key: string, now: number) {
    return (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
  }

  /**
   * Never grow without bound, but never forget everyone either: a flood of
   * new keys must not wipe the count of the one being guessed. Expired keys
   * go first, then those with the fewest failures (the oldest of them first),
   * down to 90 %.
   */
  private evict(now: number) {
    for (const [key, times] of this.hits) if (now - times[times.length - 1] >= this.windowMs) this.hits.delete(key);
    const excess = this.hits.size - Math.floor(this.maxKeys * 0.9);
    if (excess <= 0) return;
    // A stable sort keeps the map's order (oldest first) among equal counts.
    const fewest = [...this.hits].sort((a, b) => a[1].length - b[1].length).slice(0, excess);
    for (const [key] of fewest) this.hits.delete(key);
  }
}
