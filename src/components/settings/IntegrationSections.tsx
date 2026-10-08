"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { Cctv, Cloud, Globe, House, ImageIcon, Lock, Pencil, Plus, RefreshCw, Rss, Trash2 } from "lucide-react";
import type { ActionResult, CalendarSource, ConnectionInfo, Integration } from "@/lib/types";
import { useI18n, type MessageKey } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { addCalDav, addFrigate, addHomeAssistant, addIcs, addImmich, removeConnection, removeSource, syncConnectionNow, updateSource } from "@/lib/services/integrations";
import { useSearchParams } from "next/navigation";
import { PROVIDER_ICON } from "../calendar/CalendarScreen";
import { Button, LinkButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, Switch, inputCls } from "../ui/Segmented";
import { MemberFilter } from "../ui/MemberFilter";
import { AvatarStack } from "../ui/Avatar";
import { ErrorText } from "../ui/ErrorText";
import { cn } from "../ui/cn";
import { HomeSetupButton } from "./HomeSetup";
import { CameraSetupButton } from "./CameraSetup";
import { toggled } from "@/lib/sets";

type Done = { ok: boolean; error?: string };
const INT_ICON: Record<Integration["id"], typeof Cloud> = { nextcloud: Cloud, immich: ImageIcon, google: Globe, ics: Rss, homeassistant: House, frigate: Cctv };
const KIND_OF: Record<Integration["id"], ConnectionInfo["kind"]> = { nextcloud: "caldav", immich: "immich", google: "google", ics: "ics", homeassistant: "homeassistant", frigate: "frigate" };

/** Extra integration-specific pieces (forms, details) registered by later steps. */
export const ADD_FORMS: Partial<Record<ConnectionInfo["kind"], (p: { onClose: () => void }) => ReactNode>> = {
  caldav: ({ onClose }) => <CalDavForm onClose={onClose} />,
  immich: ({ onClose }) => <ImmichForm onClose={onClose} />,
  ics: ({ onClose }) => <IcsForm onClose={onClose} />,
  homeassistant: ({ onClose }) => <HomeAssistantForm onClose={onClose} />,
  google: ({ onClose }) => <GoogleConnect onClose={onClose} />,
  frigate: ({ onClose }) => <FrigateForm onClose={onClose} />,
};

/** Settings → Integrations (§15): connect services; passwords go to the server and stay there (§17). */
export function IntegrationsSection() {
  const { t } = useI18n();
  const { data } = useStore();
  const google = useSearchParams().get("google");
  return (
    <>
      <p className="mb-4 max-w-prose text-soft">{t("settings.integrations.hint")}</p>
      {google && <p role="status" className="mb-4 rounded-card bg-surface p-4 font-bold">{t(`integrations.google_${google === "connected" ? "connected" : google === "notConfigured" ? "notConfigured" : "failed"}`)}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.integrations.map((i) => <IntegrationCard key={i.id} integration={i} />)}
      </div>
    </>
  );
}

function IntegrationCard({ integration: i }: { integration: Integration }) {
  const { t, tx, fmt } = useI18n();
  const { data, run } = useStore();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const I = INT_ICON[i.id];
  const kind = KIND_OF[i.id];
  const mine = data.connections.filter((c) => c.kind === kind);
  const Form = ADD_FORMS[kind];
  const status = { connected: { cls: "bg-ok/15 text-ok", dot: "bg-ok" }, partial: { cls: "bg-star/20 text-ink", dot: "bg-star" }, off: { cls: "bg-sunken text-soft", dot: "bg-line" } }[i.status];
  const act = async (id: string, call: () => Promise<ActionResult<unknown>>) => {
    setBusy(id);
    const r = await run(call);
    setBusy(null);
    setError(r.ok ? null : r.error);
  };

  return (
    <div data-testid={`integration-${i.id}`} className={cn("flex flex-col gap-3 rounded-panel bg-surface p-5", i.id === "nextcloud" && "lg:col-span-2 ring-2 ring-ink/10")}>
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-tile bg-sunken"><I size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold">{t(`settings.integrations.${i.id}` as MessageKey)}</p>
          <p className="text-sm text-soft">{t(`settings.integrations.${i.id}Body` as MessageKey)}</p>
          <span className={cn("mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", status.cls)}>
            <span className={cn("h-2 w-2 rounded-full", status.dot)} />{t(`common.${i.status}`)}
          </span>
        </div>
      </div>
      {i.detail && <p className="text-sm">{tx(i.detail)}</p>}
      {mine.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-card bg-sunken px-3">
          {mine.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", c.status === "ok" ? "bg-ok" : c.status === "error" ? "bg-danger" : "bg-line")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{c.name}{c.username && <span className="font-normal text-soft">, {c.username}</span>}</span>
                <span className="block text-sm text-soft">
                  {c.status === "error" ? t("integrations.failed", { error: c.lastError ?? "" }) : c.lastSyncAt ? t("integrations.synced", { when: `${fmt.dateMedium(c.lastSyncAt)} ${fmt.time(c.lastSyncAt)}` }) : t("integrations.waiting")}
                </span>
              </span>
              {c.kind === "homeassistant" && <HomeSetupButton conn={c} />}
              {c.kind === "frigate" && <CameraSetupButton conn={c} />}
              <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => act(c.id, () => syncConnectionNow({ id: c.id }))}>
                <RefreshCw size={14} className={cn(busy === c.id && "animate-spin")} />{t("integrations.syncNow")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => confirm(t("integrations.removeConfirm", { name: c.name })) && act(c.id, () => removeConnection({ id: c.id }))}>
                <Trash2 size={14} />{t("integrations.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ErrorText code={error} />
      <div>
        {Form ? <Button size="sm" variant={mine.length ? "outline" : "primary"} onClick={() => setAdding(true)}><Plus size={14} />{mine.length ? t("integrations.addAnother") : t("common.configure")}</Button>
          : <Button size="sm" variant="outline" disabled title={t("common.planned")}>{t("common.configure")}</Button>}
      </div>
      {adding && Form && <Form onClose={() => setAdding(false)} />}
    </div>
  );
}

function CalDavForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => addCalDav({ url, username, password }));
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };
  return (
    <Dialog open onClose={onClose} title={t("settings.integrations.nextcloud")}
      footer={<><ErrorText code={error} className="mr-auto self-center" /><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy || !url || !username || !password} onClick={submit}>{busy ? t("integrations.connecting") : t("integrations.connect")}</Button></>}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t("integrations.serverUrl")} hint={t("integrations.caldavUrlHint")}>
          <input className={inputCls} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cloud.example.com/remote.php/dav" />
        </Field>
        <Field label={t("integrations.username")}><input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" /></Field>
        <Field label={t("integrations.appPassword")} hint={t("integrations.appPasswordHint")}>
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function ImmichForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await run(() => addImmich({ name, url, apiKey }));
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };
  return (
    <Dialog open onClose={onClose} title={t("settings.integrations.immich")}
      footer={<><ErrorText code={error} className="mr-auto self-center" /><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy || !name || !url || apiKey.length < 10} onClick={submit}>{busy ? t("integrations.connecting") : t("integrations.connect")}</Button></>}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t("routines.label")} hint={t("integrations.immichNameHint")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("integrations.immichNamePlaceholder")} /></Field>
        <Field label={t("integrations.serverUrl")}><input className={inputCls} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://photos.example.com" /></Field>
        <Field label={t("integrations.apiKey")} hint={t("integrations.immichKeyHint")}>
          <input className={inputCls} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** ICS subscriptions: read-only feeds such as the school calendar or the waste collection. */
function IcsForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { run, getMembers } = useStore();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [who, setWho] = useState(new Set<string>());
  const [background, setBackground] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    const r = await run(() => addIcs({ name, url, defaultMemberIds: [...who], background }));
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };
  return (
    <Dialog open onClose={onClose} title={t("settings.integrations.ics")}
      footer={<><ErrorText code={error} className="mr-auto self-center" /><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy || !name || !url} onClick={() => submit()}>{busy ? t("integrations.connecting") : t("integrations.subscribe")}</Button></>}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t("routines.label")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("integrations.icsNamePlaceholder")} /></Field>
        <Field label={t("integrations.feedUrl")} hint={t("integrations.feedUrlHint")}><input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… .ics" /></Field>
        <Field label={t("settings.calendar.belongsTo")}><MemberFilter size="sm" members={getMembers()} selected={who} onToggle={(id) => setWho((s) => toggled(s, id))} /></Field>
        <div className="flex items-center justify-between gap-3"><span><span className="block font-bold">{t("sources.background")}</span><span className="text-sm text-soft">{t("sources.backgroundHint")}</span></span>
          <Switch label={t("sources.background")} checked={background} onChange={setBackground} /></div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Google: the consent screen does the rest; the household's own OAuth client must be set up on the server. */
function GoogleConnect({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { data } = useStore();
  return (
    <Dialog open onClose={onClose} title={t("settings.integrations.google")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        {data.features.google && <LinkButton href="/api/integrations/google/start" native variant="primary">{t("integrations.googleContinue")}</LinkButton>}</>}>
      <p className="text-soft">{data.features.google ? t("integrations.googleHint") : t("integrations.google_notConfigured")}</p>
    </Dialog>
  );
}

/** Home Assistant: presence for the photo frame (optional), then switches and solar in Home control (§21). */
function HomeAssistantForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [entityId, setEntityId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    const r = await run(() => addHomeAssistant({ url, token, entityId }));
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };
  return (
    <Dialog open onClose={onClose} title={t("settings.integrations.homeassistant")}
      footer={<><ErrorText code={error} className="mr-auto self-center" /><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy || !url || token.length < 20} onClick={() => submit()}>{busy ? t("integrations.connecting") : t("integrations.connect")}</Button></>}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-soft">{t("integrations.haHint")}</p>
        <Field label={t("integrations.serverUrl")}><input className={inputCls} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://homeassistant.local:8123" /></Field>
        <Field label={t("integrations.haToken")} hint={t("integrations.haTokenHint")}><input className={inputCls} type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" /></Field>
        <Field label={t("integrations.haEntity")} hint={t("integrations.haEntityHint")}><input className={inputCls} value={entityId} onChange={(e) => setEntityId(e.target.value.trim())} placeholder="binary_sensor.hallway_motion" /></Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/**
 * Frigate (§22): its address with the port (8971 inside the container, often
 * mapped to another one outside), a Frigate user, and whether to trust the
 * self-signed certificate Frigate uses by default.
 */
function FrigateForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [trustCertificate, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; detail?: string } | null>(null);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    const r = await run(() => addFrigate({ url, username, password, trustCertificate }));
    setBusy(false);
    if (r.ok) onClose();
    else setError({ code: r.error, detail: r.detail });
  };
  return (
    <Dialog open onClose={onClose} title={t("settings.integrations.frigate")}
      footer={<><ErrorText code={error?.code} detail={error?.detail} className="mr-auto max-w-sm self-center" /><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy || !url || !username !== !password} onClick={() => submit()}>{busy ? t("integrations.connecting") : t("integrations.connect")}</Button></>}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-soft">{t("integrations.frigateHint")}</p>
        <Field label={t("integrations.serverUrl")} hint={t("integrations.frigateUrlHint")}><input className={inputCls} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://frigate.local:8971" /></Field>
        <Field label={t("integrations.username")} hint={t("integrations.frigateUserHint")}><input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" /></Field>
        <Field label={t("integrations.password")}><input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
        <div className="flex items-center justify-between gap-3"><span><span className="block font-bold">{t("integrations.trustCertificate")}</span><span className="text-sm text-soft">{t("integrations.trustCertificateHint")}</span></span>
          <Switch label={t("integrations.trustCertificate")} checked={trustCertificate} onChange={setTrust} /></div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Settings → Calendar (§5): every calendar, whose it is, read-only, and whether it's daily attendance. */
export function CalendarSourcesSection() {
  const { t, tx, fmt } = useI18n();
  const { getSources, getMember, viewer } = useStore();
  const [editing, setEditing] = useState<CalendarSource | null>(null);
  return (
    <>
      <p className="mb-4 max-w-prose text-soft">{t("settings.calendar.hint")}</p>
      <div className="rounded-panel bg-surface p-2">
        <ul className="divide-y divide-line">
          {getSources().map((s) => {
            const I = PROVIDER_ICON[s.provider];
            return (
              <li key={s.id}>
                <button disabled={!viewer.isAdmin} onClick={() => setEditing(s)} className="flex w-full items-center gap-4 rounded-card p-3 text-left enabled:hover:bg-sunken">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-sunken"><I size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-bold">{tx(s.name)}{s.readOnly && <Lock size={13} className="text-soft" aria-label={t("calendar.readOnly")} />}</span>
                    <span className="block truncate text-sm text-soft">
                      {t(`providers.${s.provider}`)}{s.account && `, ${s.account}`}{s.background && `, ${t("sources.background")}`}
                      {s.lastSyncAt && `, ${t("integrations.synced", { when: `${fmt.dateMedium(s.lastSyncAt)} ${fmt.time(s.lastSyncAt)}` })}`}
                    </span>
                  </span>
                  <span className="text-sm text-soft max-sm:hidden">{t("settings.calendar.belongsTo")}</span>
                  {s.defaultMemberIds.length ? <AvatarStack size="sm" members={s.defaultMemberIds.flatMap((x) => getMember(x) ?? [])} /> : <span className="text-sm font-bold">{t("common.everyone")}</span>}
                  {viewer.isAdmin && <Pencil size={15} className="text-soft" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {editing && <SourceEditor source={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function SourceEditor({ source, onClose }: { source: CalendarSource; onClose: () => void }) {
  const { t, tx } = useI18n();
  const { getMembers, run } = useStore();
  const [name, setName] = useState(tx(source.name));
  const [who, setWho] = useState(new Set(source.defaultMemberIds));
  const [readOnly, setReadOnly] = useState(source.readOnly);
  const [background, setBackground] = useState(source.background ?? false);
  const [error, setError] = useState<string | null>(null);
  const done = (r: Done) => (r.ok ? onClose() : setError(r.error ?? "server"));
  return (
    <Dialog open onClose={onClose} title={tx(source.name)}
      footer={<>
        {source.provider !== "local" && <Button variant="ghost" className="mr-auto" onClick={async () => done(await run(() => removeSource({ id: source.id })))}><Trash2 size={16} />{t("sources.remove")}</Button>}
        <ErrorText code={error} className="self-center" />
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={!name.trim()}
          onClick={async () => done(await run(() => updateSource({ id: source.id, name, defaultMemberIds: [...who], readOnly, background })))}>{t("common.save")}</Button>
      </>}>
      <div className="flex flex-col gap-5">
        <Field label={t("routines.label")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("settings.calendar.belongsTo")} hint={t("sources.whoHint")}>
          <MemberFilter size="sm" members={getMembers()} selected={who} onToggle={(id) => setWho((s) => toggled(s, id))} />
        </Field>
        <div className="flex items-center justify-between gap-3"><span><span className="block font-bold">{t("calendar.readOnly")}</span><span className="text-sm text-soft">{t("sources.readOnlyHint")}</span></span>
          <Switch label={t("calendar.readOnly")} checked={readOnly} onChange={setReadOnly} /></div>
        <div className="flex items-center justify-between gap-3"><span><span className="block font-bold">{t("sources.background")}</span><span className="text-sm text-soft">{t("sources.backgroundHint")}</span></span>
          <Switch label={t("sources.background")} checked={background} onChange={setBackground} /></div>
        {source.provider === "local" && <p className="text-sm text-soft">{t("sources.localHint")}</p>}
      </div>
    </Dialog>
  );
}
