"use client";
import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { unlockWithPin } from "@/lib/services/accounts";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { cn } from "../ui/cn";

/**
 * Asks for the settings PIN on a wall display (§19.4), then retries what
 * needed it. Big keys, so it works on a touch screen without a keyboard.
 */
export function PinDialog() {
  const { t } = useI18n();
  const { pinRequest, closePin, refresh, viewer } = useStore();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!pinRequest) return null;

  const close = () => {
    setPin("");
    setError(null);
    closePin();
  };
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    const r = await unlockWithPin({ pin });
    setBusy(false);
    setPin("");
    if (!r.ok) return setError(r.error);
    const retry = pinRequest.retry;
    close();
    await refresh();
    await retry();
  };
  const press = (k: string) => setPin((p) => (k === "⌫" ? p.slice(0, -1) : p.length < 8 ? p + k : p));

  return (
    <Dialog open top onClose={close} title={t("pin.title")}>
      {!viewer.pinSet ? (
        <p className="flex items-center gap-3 text-soft"><Lock size={20} />{t("pin.notSet")}</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col items-center gap-4">
          <p className="text-soft">{t("pin.hint")}</p>
          <input aria-label={t("pin.title")} inputMode="numeric" autoComplete="off" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="h-14 w-48 rounded-tile bg-sunken text-center font-display text-3xl tracking-[0.4em] focus:outline-none" />
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0"].map((k) => (
              <button type="button" key={k} onClick={() => press(k)} aria-label={k === "⌫" ? t("pin.delete") : k}
                className={cn("grid h-16 w-16 place-items-center rounded-full bg-sunken font-display text-2xl font-semibold active:bg-line", k === "0" && "col-start-2")}>{k}</button>
            ))}
          </div>
          <ErrorText code={error} />
          <Button type="submit" variant="primary" size="lg" disabled={busy || pin.length < 4}>{t("pin.unlock")}</Button>
        </form>
      )}
    </Dialog>
  );
}
