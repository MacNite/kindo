import { ZodError, type z } from "zod";
import type { ActionResult } from "@/lib/types";
import { prisma, type Tx } from "../db";
import { UserError } from "../errors";
import { errorMessage, log } from "../log";
import { notify, type Topic } from "../realtime";
import { requireActor, type Actor, type Level } from "../actor";

interface Options {
  /** Who may call it (§19.4). Planning and changing things is "manage". */
  level?: Level;
  /** What to tell the other screens afterwards; null for nothing. */
  topic?: Topic | null;
}

/**
 * Wraps a service function as a Server Action body: checks who is asking,
 * parses the input, runs it, announces the change to every other screen, and
 * turns failures into error codes the UI can translate.
 */
export function act<Schema extends z.ZodType, R>(schema: Schema, fn: (db: Tx, input: z.output<Schema>, actor: Actor) => Promise<R>, opts: Options = {}) {
  return async (input: z.input<Schema>): Promise<ActionResult<R>> => {
    try {
      const actor = await requireActor(opts.level ?? "manage");
      const data = schema.parse(input);
      const result = await fn(prisma, data, actor);
      const topic = opts.topic === undefined ? "household" : opts.topic;
      if (topic) await notify(topic);
      return { ok: true, data: result };
    } catch (e) {
      return failure(e);
    }
  };
}

export function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof UserError) return { ok: false, error: e.code };
  if (e instanceof ZodError) return { ok: false, error: "invalid" };
  log.error("action failed", { error: errorMessage(e), stack: e instanceof Error ? e.stack : undefined });
  return { ok: false, error: "server" };
}
