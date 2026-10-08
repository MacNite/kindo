import { afterEach, describe, expect, it, vi } from "vitest";
import { Limiter, clientAddress } from "./rate-limit";
import { resetEnvCache } from "./env";

describe("rate limits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("blocks a key after its failures, until the window has passed", () => {
    const l = new Limiter(3, 1_000);
    for (let i = 0; i < 3; i++) l.fail("a", 0);
    expect(l.blocked("a", 500)).toBe(true);
    expect(l.blocked("b", 500)).toBe(false);
    expect(l.blocked("a", 1_000)).toBe(false);
  });

  it("a flood of new keys doesn't wipe the count of the one being guessed", () => {
    const l = new Limiter(3, 60_000, 100);
    for (let i = 0; i < 1_000; i++) l.fail(`old-${i}`, 0);
    for (let i = 0; i < 3; i++) l.fail("victim", 1_000);
    // Keys with fewer failures go first; expired ones before anything else.
    for (let i = 0; i < 1_000; i++) l.fail(`flood-${i}`, 2_000);
    for (let i = 0; i < 100; i++) l.fail(`late-${i}`, 60_500);
    expect(l.blocked("victim", 60_500)).toBe(true);
    expect(l.blocked("victim", 61_000)).toBe(false);
  });

  it("believes X-Forwarded-For only behind a trusted proxy, and only the proxy's own entry", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 192.168.1.5" });
    vi.stubEnv("KINDO_TRUST_PROXY", "");
    resetEnvCache();
    expect(clientAddress(h)).toBeNull();
    vi.stubEnv("KINDO_TRUST_PROXY", "true");
    resetEnvCache();
    expect(clientAddress(h)).toBe("192.168.1.5");
    expect(clientAddress(new Headers())).toBeNull();
  });
});
