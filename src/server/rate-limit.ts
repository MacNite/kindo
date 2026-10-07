/**
 * A small in-memory limiter for guessable things (passwords, the PIN). Per
 * process: enough for a family instance, and it never locks anyone out for
 * longer than the window.
 */
export class Limiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}

  /** Records a failure; true while the key is still allowed to try. */
  fail(key: string, now = Date.now()) {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.hits.clear(); // never grow without bound
  }

  blocked(key: string, now = Date.now()) {
    return (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs).length >= this.max;
  }

  clear(key: string) {
    this.hits.delete(key);
  }
}
