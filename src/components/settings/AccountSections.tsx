"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Check, KeyRound, LogOut, Monitor, Pencil, Trash2, X } from "lucide-react";
import type { Member } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import {
  approvePairing, changePassword, createLogin, getAccountAdmin, getLoginOptions, removeLogin, renameDevice, revokeDevice, setLoginPassword, setPin, signOut,
} from "@/lib/services/accounts";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, inputCls } from "../ui/Segmented";
import { ErrorText } from "../ui/ErrorText";

type Done = { ok: boolean; error?: string };
const Card = ({ children }: { children: React.ReactNode }) => <div className="flex flex-col gap-4 rounded-panel bg-surface p-5">{children}</div>;

/** The signed-in person's own login: password and signing out. No password without password sign-in (§20 D42). */
export function AccountSection() {
  const { t } = useI18n();
  const { viewer, getMember, run } = useStore();
  const [passwordLogin, setPasswordLogin] = useState(false);
  useEffect(() => {
    let live = true;
    // Without an answer the password form stays hidden, as it does without password sign-in.
    getLoginOptions().then((r) => live && setPasswordLogin(r.ok && r.data.passwordLogin), () => {});
    return () => {
      live = false;
    };
  }, []);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
  const email = getMember(viewer.memberId)?.account?.email;
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => changePassword({ currentPassword: current, newPassword: next }));
    setState(r.ok ? { saved: true } : { error: r.error });
    if (r.ok) {
      setCurrent("");
      setNext("");
    }
  };
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card>
        <p><span className="font-bold">{viewer.name}</span>{email && <span className="text-soft">, {email}</span>}</p>
        <Button variant="outline" className="self-start" onClick={async () => { await signOut(); window.location.assign("/login"); }}><LogOut size={16} />{t("account.signOut")}</Button>
      </Card>
      {passwordLogin && <form onSubmit={save}>
        <Card>
          <p className="font-bold">{t("account.changePassword")}</p>
          <Field label={t("account.currentPassword")}><input type="password" autoComplete="current-password" className={inputCls} value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
          <Field label={t("account.newPassword")} hint={t("setup.passwordHint")}><input type="password" autoComplete="new-password" minLength={8} className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={!current || next.length < 8}>{t("common.save")}</Button>
            {state.saved && <span role="status" className="text-sm font-bold text-ok">{t("common.saved")}</span>}
            <ErrorText code={state.error} />
          </div>
        </Card>
      </form>}
    </div>
  );
}

interface AdminData { oidc: string | null; passwordLogin: boolean; devices: { id: string; name: string; createdAt: Date; lastSeenAt?: Date }[] }

function useAdminData() {
  const [data, setData] = useState<AdminData | null>(null);
  const load = useCallback(async () => {
    const r = await getAccountAdmin();
    if (r.ok) setData(r.data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, reload: load };
}

/** Wall displays: confirm a pairing code, see which screens are paired, rename or revoke one (§19.4). */
export function DevicesSection({ initialCode }: { initialCode?: string }) {
  const { t, fmt } = useI18n();
  const { run } = useStore();
  const { data, reload } = useAdminData();
  const [code, setCode] = useState(initialCode ?? "");
  const [name, setName] = useState(t("devices.defaultName"));
  const [state, setState] = useState<{ error?: string; approved?: boolean }>({});
  const later = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(later.current), []);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [renameError, setRenameError] = useState<string>();
  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const r = await run(() => renameDevice({ id: editing.id, name: editing.name }));
    setRenameError(r.ok ? undefined : r.error);
    if (r.ok) {
      setEditing(null);
      void reload();
    }
  };
  const approve = async (e: FormEvent) => {
    e.preventDefault();
    const r = await run(() => approvePairing({ code: code.replace(/\D/g, ""), name }));
    setState(r.ok ? { approved: true } : { error: r.error });
    if (r.ok) {
      setCode("");
      clearTimeout(later.current);
      later.current = setTimeout(reload, 2500); // the display picks up its token on its next poll
    }
  };
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <p className="text-soft">{t("devices.hint")}</p>
      <form onSubmit={approve}>
        <Card>
          <p className="font-bold">{t("devices.pair")}</p>
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <Field label={t("pair.code")}><input inputMode="numeric" className={`${inputCls} num text-center text-lg tracking-widest`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456" /></Field>
            <Field label={t("devices.name")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={code.replace(/\D/g, "").length !== 6 || !name.trim()}>{t("devices.approve")}</Button>
            {state.approved && <span role="status" className="text-sm font-bold text-ok">{t("devices.approved")}</span>}
            <ErrorText code={state.error} />
          </div>
        </Card>
      </form>
      <Card>
        <p className="font-bold">{t("devices.paired")}</p>
        {!data?.devices.length && <p className="text-soft">{t("devices.none")}</p>}
        <ul className="flex flex-col divide-y divide-line">
          {data?.devices.map((d) => editing?.id === d.id ? (
            <li key={d.id} className="py-2">
              <form onSubmit={rename} className="flex items-center gap-2">
                <Monitor size={18} className="shrink-0 text-soft" />
                <input autoFocus aria-label={t("devices.renameLabel", { name: d.name })} className={`${inputCls} min-w-0 flex-1`} maxLength={60}
                  value={editing.name} onChange={(e) => setEditing({ id: d.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }} />
                <Button type="submit" size="sm" variant="primary" disabled={!editing.name.trim()} aria-label={t("common.save")}><Check size={14} /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)} aria-label={t("common.cancel")}><X size={14} /></Button>
              </form>
              <ErrorText code={renameError} />
            </li>
          ) : (
            <li key={d.id} className="flex items-center gap-3 py-2">
              <Monitor size={18} className="text-soft" />
              <span className="flex-1"><span className="block font-bold">{d.name}</span><span className="text-sm text-soft">{d.lastSeenAt ? t("devices.lastSeen", { when: `${fmt.dateMedium(d.lastSeenAt)} ${fmt.time(d.lastSeenAt)}` }) : ""}</span></span>
              <Button size="sm" variant="ghost" onClick={() => { setRenameError(undefined); setEditing({ id: d.id, name: d.name }); }}><Pencil size={14} />{t("devices.rename")}</Button>
              <Button size="sm" variant="ghost" onClick={async () => { await run(() => revokeDevice({ id: d.id })); void reload(); }}><Trash2 size={14} />{t("devices.revoke")}</Button>
            </li>
          ))}
        </ul>
      </Card>
      <PinCard />
    </div>
  );
}

/** The PIN that unlocks settings on a wall display for a few minutes. */
export function PinCard() {
  const { t } = useI18n();
  const { viewer, run } = useStore();
  const [pin, setPinValue] = useState("");
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
  if (viewer.kind !== "user") return null;
  const save = async (value: string | null) => {
    const r = await run(() => setPin({ pin: value }));
    setState(r.ok ? { saved: true } : { error: r.error });
    if (r.ok) setPinValue("");
  };
  return (
    <Card>
      <p className="flex items-center gap-2 font-bold"><KeyRound size={18} />{t("settings.dashboard.pin")}</p>
      <p className="-mt-2 text-sm text-soft">{viewer.pinSet ? t("pin.isSet") : t("pin.notSet")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("pin.new")}><input inputMode="numeric" type="password" autoComplete="off" className={`${inputCls} w-40`} value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 8))} /></Field>
        <Button variant="primary" disabled={pin.length < 4} onClick={() => save(pin)}>{t("common.save")}</Button>
        {viewer.pinSet && <Button variant="ghost" onClick={() => save(null)}>{t("pin.remove")}</Button>}
      </div>
      {state.saved && <span role="status" className="text-sm font-bold text-ok">{t("common.saved")}</span>}
      <ErrorText code={state.error} />
    </Card>
  );
}

/** An admin gives an adult a login, resets its password, or removes it (§3). */
export function LoginEditor({ member, onClose }: { member: Member; onClose: () => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const { data } = useAdminData();
  const [email, setEmail] = useState(member.account?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const done = (r: Done) => (r.ok ? onClose() : setError(r.error ?? "server"));
  const has = Boolean(member.account);
  // Without password sign-in a login is just an email for single sign-on (§20 D42).
  const passwords = data?.passwordLogin ?? true;
  return (
    <Dialog open onClose={onClose} title={has ? t("logins.edit", { name: member.name }) : t("logins.create", { name: member.name })}
      footer={<>
        {has && <Button variant="ghost" className="mr-auto" onClick={async () => done(await run(() => removeLogin({ memberId: member.id })))}><Trash2 size={16} />{t("logins.remove")}</Button>}
        <ErrorText code={error} className="self-center" />
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        {(passwords || !has) && (
          <Button variant="primary" disabled={!data || (has ? password.length < 8 : !email.includes("@") || (password.length > 0 && password.length < 8) || (!password && !data.oidc))}
            onClick={async () => done(await run(() => (has ? setLoginPassword({ memberId: member.id, password }) : createLogin({ memberId: member.id, email, password: password || undefined }))))}>
            {t("common.save")}
          </Button>
        )}
      </>}>
      <div className="flex flex-col gap-4">
        <Field label={t("login.email")} hint={!passwords && data?.oidc ? t("logins.ssoOnlyHint", { name: data.oidc }) : undefined}>
          <input type="email" className={inputCls} value={email} disabled={has} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {passwords && (
          <Field label={has ? t("account.newPassword") : t("login.password")} hint={has ? t("logins.resetHint") : data?.oidc ? t("logins.ssoHint", { name: data.oidc }) : t("setup.passwordHint")}>
            <input type="password" autoComplete="new-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
