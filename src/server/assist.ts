import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { VOICE_SAMPLE_RATE, type AssistReply } from "@/lib/media";
import type { Tx } from "./db";
import { UserError, notFound } from "./errors";
import { fetchChecked } from "./http";
import { id } from "./validation";
import { haConfig, wsUrl, type HaStoredConfig, type VoiceSetup } from "./homeassistant";

/**
 * Talking to Home Assistant (§24, §20 D62): a held button on a screen records
 * a short command; Kindo hands it to Home Assistant's Assist pipeline over
 * the WebSocket API (speech to text, the intent, text to speech) and brings
 * back what was heard, the answer and the spoken answer. The screen never
 * learns Home Assistant's address or token, and the microphone is never open
 * without a hand on the button. What a command may switch is Home
 * Assistant's choice: the entities exposed to Assist.
 */
export const V = {
  setup: z.object({ id, on: z.boolean(), pipeline: z.string().trim().max(100).optional() }),
  byId: z.object({ id }),
};
type In<K extends keyof typeof V> = z.output<(typeof V)[K]>;

export const voiceOf = (c: { config: Prisma.JsonValue } | null | undefined): VoiceSetup | null => {
  const v = ((c?.config ?? {}) as HaStoredConfig).voice;
  return v?.on ? v : null;
};

interface Ws {
  send: (m: string | Uint8Array) => void;
  close: () => void;
}

/**
 * One WebSocket conversation with Home Assistant: signs in, then hands every
 * further message to `onMessage` until it resolves or `timeoutMs` passes.
 */
function haSocket<T>(url: string, token: string, onReady: (ws: Ws, next: () => number) => void, onMessage: (msg: Record<string, unknown>, ws: Ws) => T | undefined, timeoutMs = 30_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let ws: WebSocket;
    let done = false;
    let n = 1;
    const finish = (err: Error | null, value?: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {}
      if (err) reject(err);
      else resolve(value as T);
    };
    const timer = setTimeout(() => finish(new UserError("remote", "Home Assistant didn't answer in time")), timeoutMs);
    try {
      ws = new WebSocket(wsUrl(url));
    } catch (e) {
      return finish(new UserError("remote", `Home Assistant: ${e instanceof Error ? e.message : String(e)}`));
    }
    ws.binaryType = "arraybuffer";
    const sock: Ws = { send: (m) => ws.send(m), close: () => ws.close() };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      try {
        const msg = JSON.parse(ev.data) as Record<string, unknown>;
        if (msg.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
        else if (msg.type === "auth_invalid") finish(new UserError("remote", "Home Assistant refused the token"));
        else if (msg.type === "auth_ok") onReady(sock, () => n++);
        else {
          const r = onMessage(msg, sock);
          if (r !== undefined) finish(null, r);
        }
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)));
      }
    };
    ws.onerror = () => finish(new UserError("remote", "Home Assistant: connection failed"));
    ws.onclose = () => finish(new UserError("remote", "Home Assistant closed the connection"));
  });
}

/** Home Assistant's Assist pipelines, for the admin to pick one. */
export async function listPipelines(url: string, token: string): Promise<{ pipelines: { id: string; name: string; language: string }[]; preferred?: string }> {
  return haSocket(url, token, (ws, next) => ws.send(JSON.stringify({ id: next(), type: "assist_pipeline/pipeline/list" })), (msg) => {
    if (msg.type !== "result") return undefined;
    if (!msg.success) throw new UserError("remote", "Home Assistant has no Assist (voice) set up");
    const r = msg.result as { pipelines?: { id: string; name: string; language: string }[]; preferred_pipeline?: string };
    return { pipelines: (r.pipelines ?? []).map((p) => ({ id: p.id, name: p.name, language: p.language })), preferred: r.preferred_pipeline ?? undefined };
  }, 10_000);
}

const CHUNK = 4096;

/**
 * Runs one spoken command through Assist: 16 kHz 16-bit mono PCM in; what
 * was heard, the answer and (when the pipeline speaks) the answer as audio
 * out.
 */
export async function runAssist(url: string, token: string, pcm: Uint8Array, pipeline?: string): Promise<AssistReply> {
  let heard = "";
  let answer = "";
  let ttsUrl: string | undefined;
  let runId = 0;
  await haSocket(url, token, (ws, next) => {
    runId = next();
    ws.send(JSON.stringify({
      id: runId, type: "assist_pipeline/run", start_stage: "stt", end_stage: "tts",
      input: { sample_rate: VOICE_SAMPLE_RATE }, ...(pipeline ? { pipeline } : {}),
    }));
  }, (msg, ws) => {
    if (msg.id !== runId) return undefined;
    if (msg.type === "result") {
      if (!msg.success) throw new UserError("remote", `Assist: ${((msg.error as { message?: string } | undefined)?.message) ?? "refused"}`);
      return undefined;
    }
    if (msg.type !== "event") return undefined;
    const ev = msg.event as { type: string; data?: Record<string, unknown> };
    const data = ev.data ?? {};
    if (ev.type === "run-start") {
      const handler = (data.runner_data as { stt_binary_handler_id?: number } | undefined)?.stt_binary_handler_id;
      if (handler === undefined || handler === null) throw new UserError("remote", "Assist didn't take audio");
      for (let i = 0; i < pcm.length; i += CHUNK) {
        const part = pcm.subarray(i, i + CHUNK);
        const frame = new Uint8Array(part.length + 1);
        frame[0] = handler;
        frame.set(part, 1);
        ws.send(frame);
      }
      // A frame with only the handler's id: the speech has ended.
      ws.send(new Uint8Array([handler]));
    } else if (ev.type === "stt-end") {
      heard = (data.stt_output as { text?: string } | undefined)?.text ?? "";
    } else if (ev.type === "intent-end") {
      const speech = (data.intent_output as { response?: { speech?: { plain?: { speech?: string } } } } | undefined)?.response?.speech?.plain?.speech;
      answer = speech ?? "";
    } else if (ev.type === "tts-end") {
      ttsUrl = (data.tts_output as { url?: string } | undefined)?.url;
    } else if (ev.type === "error") {
      const code = String(data.code ?? "");
      // Nothing heard is an answer, not a failure.
      if (code === "stt-no-text-recognized") return true;
      throw new UserError("remote", `Assist: ${String(data.message ?? code)}`);
    } else if (ev.type === "run-end") {
      return true;
    }
    return undefined;
  });
  const reply: AssistReply = { heard, answer };
  if (ttsUrl) {
    try {
      const res = await fetchChecked(new URL(ttsUrl, url.replace(/\/+$/, "/")).toString(), { headers: { Authorization: `Bearer ${token}` }, timeoutMs: 15_000, maxBytes: 3 * 1024 * 1024 });
      if (res.ok) reply.audio = { type: res.headers.get("content-type") ?? "audio/mpeg", data: Buffer.from(await res.arrayBuffer()).toString("base64") };
    } catch {
      // The answer in words is still there.
    }
  }
  return reply;
}

async function haById(db: Tx, connId: string) {
  const ha = await db.connection.findUnique({ where: { id: connId } });
  if (!ha || ha.kind !== "homeassistant") throw notFound("connection");
  return ha;
}

/** The pipelines to pick from in Settings. */
export async function voiceChoices(db: Tx, input: In<"byId">) {
  const cfg = haConfig(await haById(db, input.id));
  return listPipelines(cfg.url, cfg.token);
}

/** Turns talking on or off and picks the pipeline. */
export async function saveVoice(db: Tx, input: In<"setup">) {
  const ha = await haById(db, input.id);
  const voice: VoiceSetup = { on: input.on, pipeline: input.pipeline || undefined };
  await db.connection.update({ where: { id: ha.id }, data: { config: { ...(ha.config as HaStoredConfig), voice } as unknown as Prisma.InputJsonValue } });
}

/** One command from a screen, through the household's Home Assistant. */
export async function assist(db: Tx, pcm: Uint8Array): Promise<AssistReply> {
  const ha = await db.connection.findFirst({ where: { kind: "homeassistant" }, orderBy: { createdAt: "desc" } });
  const voice = voiceOf(ha);
  if (!ha || !voice) throw notFound("voice");
  const cfg = haConfig(ha);
  return runAssist(cfg.url, cfg.token, pcm, voice.pipeline);
}
