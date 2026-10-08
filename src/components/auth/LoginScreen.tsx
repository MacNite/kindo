"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { KeyRound, Monitor } from "lucide-react";
import { useI18n } from "@/i18n";
import { signIn } from "@/lib/services/accounts";
import { LANGUAGES } from "@/i18n/config";
import { usePrefs } from "@/lib/state/prefs";
import { Button } from "../ui/Button";
import { Field, inputCls } from "../ui/Segmented";
import { ErrorText } from "../ui/ErrorText";
import { cn } from "../ui/cn";

/**
 * Sign in with email and password, or with the household's single sign-on
 * (§19.4). Without password sign-in only the single sign-on button is left (§20 D42).
 */
export function LoginScreen({ next, oidc, password: withPassword = true, error: initialError }: { next: string; oidc: string | null; password?: boolean; error: string | null }) {
  const { t, language } = useI18n();
  const { setPrefs } = usePrefs();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await signIn({ email, password });
    if (r.ok) window.location.assign(next);
    else {
      setBusy(false);
      setError(r.error);
    }
  };

  const sso = async () => {
    setBusy(true);
    // Better Auth answers with the provider's authorisation URL.
    const res = await fetch("/api/auth/sign-in/social", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "oidc", callbackURL: next, errorCallbackURL: "/login?error=sso" }),
    }).catch(() => null);
    const body = res?.ok ? ((await res.json()) as { url?: string }) : null;
    if (body?.url) window.location.assign(body.url);
    else {
      setBusy(false);
      setError("sso");
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl font-bold tracking-tight">{t("app.name")}</h1>
        <div className="flex gap-1 rounded-full bg-sunken p-1">
          {LANGUAGES.map((l) => (
            <button key={l.id} type="button" onClick={() => setPrefs({ language: l.id })} aria-pressed={language === l.id}
              className={cn("h-8 rounded-full px-3 text-sm font-bold uppercase", language === l.id ? "bg-surface" : "text-soft")}>{l.id}</button>
          ))}
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-panel bg-surface p-6">
        {withPassword && <>
          <Field label={t("login.email")}><input required type="email" autoComplete="username" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label={t("login.password")}><input required type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        </>}
        <ErrorText code={error} />
        {withPassword && <Button type="submit" variant="primary" size="lg" disabled={busy}>{t("login.signIn")}</Button>}
        {oidc && (
          <>
            {withPassword && <p className="text-center text-sm text-soft">{t("login.or")}</p>}
            <Button type="button" variant={withPassword ? "outline" : "primary"} size="lg" disabled={busy} onClick={sso}><KeyRound size={18} />{t("login.sso", { name: oidc })}</Button>
          </>
        )}
      </form>
      <Link href="/pair" className="flex items-center justify-center gap-2 text-sm font-bold text-soft hover:text-ink"><Monitor size={16} />{t("login.pairHint")}</Link>
    </main>
  );
}
