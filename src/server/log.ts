/** Minimal structured logger: one JSON line per entry, so `docker logs` stays greppable. */
type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function write(level: Level, msg: string, data?: Record<string, unknown>) {
  const min = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
  if (ORDER[level] < (ORDER[min] ?? 20)) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...data });
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => write("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => write("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => write("error", msg, data),
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
