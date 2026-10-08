"use client";
import { useState, type CSSProperties, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import type { Member } from "@/lib/types";
import { useI18n } from "@/i18n";
import { setup } from "@/lib/services/actions";
import { LANGUAGES } from "@/i18n/config";
import { usePrefs } from "@/lib/state/prefs";
import { Button } from "../ui/Button";
import { Field, inputCls } from "../ui/Segmented";
import { ErrorText } from "../ui/ErrorText";
import { cn } from "../ui/cn";

const COLORS = ["#3B78C2", "#2E8B6E", "#8A5CD1", "#E39A1B", "#C2477A", "#2A8C9E"];

/**
 * First run: name the household and its first admin, or start with the demo
 * family (§20 D11). With `sso` (password sign-in turned off, §20 D42) the admin
 * gives only their email and signs in through single sign-on afterwards.
 */
export function SetupScreen({ claim = false, sso = null }: { claim?: boolean; sso?: string | null }) {
  const { t, language } = useI18n();
  const { setPrefs } = usePrefs();
  const [household, setHousehold] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin");
  const [demo, setDemo] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const avatar: Member["avatar"] = { kind: "initial" };
    const r = await setup({ demo, household: demo || claim ? "Household" : household, timezone, member: { name: demo ? "Demo" : name || "Admin", color, avatar }, email, password: sso ? undefined : password });
    if (r.ok) window.location.assign(r.data.signedIn ? "/" : "/login");
    else {
      setBusy(false);
      setError(r.error);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl font-bold tracking-tight">{t("setup.title")}</h1>
        <div className="flex gap-1 rounded-full bg-sunken p-1">
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" onClick={() => setPrefs({ language: l.id })} aria-pressed={language === l.id}
              className={cn("h-8 rounded-full px-3 text-sm font-bold uppercase", language === l.id ? "bg-surface" : "text-soft")}>{l.id}</button>
          ))}
        </div>
      </div>
      <p className="text-soft">{claim ? t("setup.claimIntro") : t("setup.intro")}</p>
      <form onSubmit={submit} className="flex flex-col gap-5 rounded-panel bg-surface p-6">
        {!demo && !claim && <>
          <Field label={t("setup.household")} hint={t("settings.family.hint")}>
            <input required className={inputCls} value={household} onChange={(e) => setHousehold(e.target.value)} placeholder={t("setup.householdPlaceholder")} />
          </Field>
          <Field label={t("setup.you")} hint={t("setup.youHint")}>
            <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
          </Field>
          <Field label={t("settings.members.color")}>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button type="button" key={c} aria-label={c} aria-pressed={c === color} onClick={() => setColor(c)} style={{ "--m": c, background: c } as CSSProperties}
                  className={cn("h-10 w-10 rounded-full", c === color && "ring-4 ring-ink/30 ring-offset-2 ring-offset-surface")} />
              ))}
            </div>
          </Field>
        </>}
        <Field label={t("login.email")} hint={sso ? t("setup.ssoHint", { name: sso }) : undefined}>
          <input required type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        {!sso && (
          <Field label={t("login.password")} hint={t("setup.passwordHint")}>
            <input required type="password" minLength={8} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
        )}
        {!claim && (
          <label className="flex items-start gap-3 rounded-card bg-sunken p-4">
            <input type="checkbox" className="mt-1 h-5 w-5" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            <span><span className="flex items-center gap-2 font-bold"><Sparkles size={16} />{t("setup.demo")}</span><span className="text-sm text-soft">{t("setup.demoHint")}</span></span>
          </label>
        )}
        {!claim && <p className="text-sm text-soft">{t("setup.timezone", { zone: timezone })}</p>}
        <ErrorText code={error} />
        <Button type="submit" variant="primary" size="lg" disabled={busy || (!sso && password.length < 8) || !email.includes("@") || (!demo && !claim && (!household.trim() || !name.trim()))}>{t("setup.start")}</Button>
      </form>
    </main>
  );
}
