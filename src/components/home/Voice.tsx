"use client";
import { useRef } from "react";
import { Mic } from "lucide-react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useVoice } from "@/lib/state/useVoice";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { ErrorText } from "../ui/ErrorText";
import { cn } from "../ui/cn";

/**
 * Talking to Home Assistant (§24): hold the button and speak; let go and
 * Home Assistant answers. Adults, or a wall unlocked with the PIN (a locked
 * wall asks for it); children don't see it. The microphone is open only
 * while the button is held.
 */
export function VoiceButton({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const { t } = useI18n();
  const { data, viewer, requestPin } = useStore();
  const { state, start, stop, reset } = useVoice();
  const held = useRef(false);
  if (!data.voice || (viewer.kind === "user" && !viewer.canManage)) return null;

  const press = () => {
    if (!viewer.canManage) return requestPin();
    held.current = true;
    void start();
  };
  const release = () => {
    if (!held.current) return;
    held.current = false;
    void stop();
  };
  const listening = state.phase === "listening";
  const label = listening ? t("voice.listening") : state.phase === "thinking" ? t("voice.thinking") : t("voice.hold");

  return (
    <>
      <Button variant={listening ? "primary" : "outline"} size={size} aria-pressed={listening} disabled={state.phase === "thinking"}
        className={cn("touch-none select-none", listening && "animate-pulse")}
        onPointerDown={(e) => {
          // Keeps the release on the button when a finger slides off; a pointer the browser doesn't know can't be captured.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          press();
        }}
        onPointerUp={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && (e.preventDefault(), press())}
        onKeyUp={(e) => (e.key === " " || e.key === "Enter") && release()}>
        <Mic size={size === "lg" ? 22 : 16} />{label}
      </Button>
      {(state.phase === "done" || state.phase === "error") && (
        <Dialog open onClose={reset} title={t("voice.title")}
          footer={<Button variant="primary" onClick={reset}>{t("common.close")}</Button>}>
          {state.phase === "done" ? (
            <div className="flex flex-col gap-4" data-testid="voice-reply">
              <div><p className="text-sm font-bold text-soft">{t("voice.heard")}</p><p className="text-lg">{state.reply.heard || t("voice.nothingHeard")}</p></div>
              {state.reply.answer && <div><p className="text-sm font-bold text-soft">{t("voice.answer")}</p><p className="text-lg font-bold">{state.reply.answer}</p></div>}
            </div>
          ) : state.code === "voiceTooShort" ? <p>{t("voice.tooShort")}</p> : <ErrorText code={state.code} />}
        </Dialog>
      )}
    </>
  );
}
