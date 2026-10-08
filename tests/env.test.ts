import { afterEach, describe, expect, it, vi } from "vitest";
import { env, resetEnvCache } from "@/server/env";

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
