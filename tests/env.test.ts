import { afterEach, describe, expect, it, vi } from "vitest";
import { env, resetEnvCache } from "@/server/env";
import { log } from "@/server/log";

const SSO = { OIDC_ISSUER: "https://auth.example.test/application/o/kindo/", OIDC_CLIENT_ID: "kindo", OIDC_CLIENT_SECRET: "secret" };

describe("password sign-in switch (§20 D42)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });
  const withEnv = (vars: Record<string, string | undefined>) => {
    for (const k of ["KINDO_PASSWORD_LOGIN", ...Object.keys(SSO)]) vi.stubEnv(k, vars[k] ?? "");
    resetEnvCache();
    return env();
  };

  it("is on unless turned off", () => {
    expect(withEnv({}).passwordLogin).toBe(true);
    expect(withEnv({ ...SSO }).passwordLogin).toBe(true);
    expect(withEnv({ ...SSO, KINDO_PASSWORD_LOGIN: "true" }).passwordLogin).toBe(true);
  });

  it("turns off when single sign-on is set up", () => {
    expect(withEnv({ ...SSO, KINDO_PASSWORD_LOGIN: "false" }).passwordLogin).toBe(false);
    expect(withEnv({ ...SSO, KINDO_PASSWORD_LOGIN: "0" }).passwordLogin).toBe(false);
  });

  it("is ignored, with a warning, while single sign-on isn't set up", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(withEnv({ ...SSO, OIDC_CLIENT_SECRET: "", KINDO_PASSWORD_LOGIN: "false" }).passwordLogin).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("KINDO_PASSWORD_LOGIN=false is ignored"));
    warn.mockRestore();
  });

  it("refuses values it doesn't know", () => {
    expect(() => withEnv({ KINDO_PASSWORD_LOGIN: "no" })).toThrow(/KINDO_PASSWORD_LOGIN/);
  });
});

describe("integration and job settings", () => {
  const KEYS = ["KINDO_SYNC_MINUTES", "KINDO_PHOTO_CACHE_MB", "KINDO_CACHE_DIR", "KINDO_JOBS", "LOG_LEVEL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_API_BASE", "KINDO_ALLOW_DEV_SECRET"];
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });
  const withEnv = (vars: Record<string, string>) => {
    for (const k of KEYS) vi.stubEnv(k, vars[k] ?? "");
    resetEnvCache();
    return env();
  };

  it("has sane defaults when nothing is set", () => {
    expect(withEnv({})).toMatchObject({
      KINDO_SYNC_MINUTES: 5, KINDO_PHOTO_CACHE_MB: 500, jobs: true, LOG_LEVEL: "info", google: null,
      GOOGLE_API_BASE: "https://www.googleapis.com", cacheDir: expect.stringMatching(/data[/\\]cache$/),
    });
  });

  it("reads numbers, the job switch and the log level", () => {
    expect(withEnv({ KINDO_SYNC_MINUTES: "15", KINDO_PHOTO_CACHE_MB: "2000", KINDO_CACHE_DIR: "/data/cache", KINDO_JOBS: "off", LOG_LEVEL: "DEBUG" })).toMatchObject({
      KINDO_SYNC_MINUTES: 15, KINDO_PHOTO_CACHE_MB: 2000, cacheDir: "/data/cache", jobs: false, LOG_LEVEL: "debug",
    });
  });

  it("refuses numbers that would break the sync or empty the photo cache, naming the variable", () => {
    expect(() => withEnv({ KINDO_SYNC_MINUTES: "often" })).toThrow(/KINDO_SYNC_MINUTES/);
    expect(() => withEnv({ KINDO_SYNC_MINUTES: "0" })).toThrow(/KINDO_SYNC_MINUTES/);
    expect(() => withEnv({ KINDO_PHOTO_CACHE_MB: "lots" })).toThrow(/KINDO_PHOTO_CACHE_MB/);
    expect(() => withEnv({ KINDO_PHOTO_CACHE_MB: "1.5" })).toThrow(/KINDO_PHOTO_CACHE_MB/);
    expect(() => withEnv({ KINDO_JOBS: "maybe" })).toThrow(/KINDO_JOBS/);
    expect(() => withEnv({ LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
    expect(() => withEnv({ GOOGLE_API_BASE: "not a url" })).toThrow(/GOOGLE_API_BASE/);
    expect(() => withEnv({ KINDO_ALLOW_DEV_SECRET: "yes" })).toThrow(/KINDO_ALLOW_DEV_SECRET/);
  });

  it("turns Google on only with both halves of the client", () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(withEnv({ GOOGLE_CLIENT_ID: "id" }).google).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("GOOGLE_CLIENT_SECRET"));
    warn.mockRestore();
    expect(withEnv({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }).google).toEqual({ id: "id", secret: "secret" });
  });

  it("keeps logging with a log level it doesn't know", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");
    const out = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => log.info("still here")).not.toThrow();
    expect(out).toHaveBeenCalledWith(expect.stringContaining("still here"));
    out.mockRestore();
  });

  it("refuses the development key in production unless allowed", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KINDO_SECRET_KEY", "");
    expect(() => withEnv({})).toThrow(/KINDO_SECRET_KEY/);
    expect(withEnv({ KINDO_ALLOW_DEV_SECRET: "true" }).secretKey).toMatch(/development/);
  });
});
