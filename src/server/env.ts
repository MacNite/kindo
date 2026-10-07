import { z } from "zod";

/**
 * Server configuration from the environment. Parsed once per process.
 * Everything here stays on the server (§17).
 */
const bool = z.enum(["true", "false", "1", "0", ""]).optional().transform((v) => v === "true" || v === "1");

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Loads the demo family into an empty database on first start (§20 D11). */
  KINDO_DEMO: bool,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return (cached = parsed.data);
}

/** For tests: forget the parsed configuration. */
export function resetEnvCache() {
  cached = undefined;
}
