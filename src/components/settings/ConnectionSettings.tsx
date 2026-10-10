"use client";
import { useState, type FormEvent } from "react";
import { Cctv, ChevronRight, Library, Lightbulb, Settings, Speaker } from "lucide-react";
import type { ConnectionInfo } from "@/lib/types";
import { useI18n, type MessageKey } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { updateConnection } from "@/lib/services/integrations";
import { Button, IconButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, Switch, inputCls } from "../ui/Segmented";
import { ErrorText } from "../ui/ErrorText";
import { HomeSetupDialog } from "./HomeSetup";
import { CameraSetupDialog } from "./CameraSetup";
import { ShelfSetupDialog } from "./ShelfSetup";
import { SpeakersVoiceDialog } from "./SpeakersVoiceSetup";
import { JellyfinQuickConnect, type QuickConnectDone } from "./JellyfinQuickConnect";

type FieldKey = "name" | "url" | "username" | "secret" | "entityId" | "trustCertificate";
type View = "main" | "home" | "speakers" | "cameras" | "shelf";

/** What can be changed per kind of connection; the secret is the password, key, token or private feed address. */
const FIELDS: Record<ConnectionInfo["kind"], FieldKey[]> = {
  caldav: ["name", "url", "username", "secret"],
  ics: ["name", "secret"],
  google: ["name"],
  immich: ["name", "url", "secret"],
  homeassistant: ["url", "secret", "entityId"],
  frigate: ["url", "username", "secret", "trustCertificate"],
  jellyfin: ["url", "username", "secret"],
  audiobookshelf: ["url", "secret"],
};
const SECRET_LABEL: Record<ConnectionInfo["kind"], MessageKey> = {
  caldav: "integrations.appPassword", ics: "integrations.feedUrl", google: "integrations.apiKey", immich: "integrations.apiKey",
  homeassistant: "integrations.haToken", frigate: "integrations.password", jellyfin: "integrations.password", audiobookshelf: "integrations.apiKey",
};
/** The setup that belongs to a connection, behind the same cog. */
const SETUPS: Partial<Record<ConnectionInfo["kind"], { view: View; key: MessageKey; Icon: typeof Settings }[]>> = {
  homeassistant: [{ view: "home", key: "homeSetup.open", Icon: Lightbulb }, { view: "speakers", key: "speakerSetup.open", Icon: Speaker }],
  frigate: [{ view: "cameras", key: "cameraSetup.open", Icon: Cctv }],
  jellyfin: [{ view: "shelf", key: "shelfSetup.open", Icon: Library }],
  audiobookshelf: [{ view: "shelf", key: "shelfSetup.open", Icon: Library }],
};

/**
 * The cog on a connection (§15): one place for everything about it. Its
 * address, account and secret can be changed in place (an empty secret
 * keeps the stored one, which never comes back to the screen, §17), and its
 * own setup (Home control, speakers and voice, cameras, the kids' shelf)
 * opens from here.
 */
export function ConnectionSettingsButton({ conn }: { conn: ConnectionInfo }) {
  const { t } = useI18n();
  const [view, setView] = useState<View | null>(null);
  // A setup closes everything: saving it is the end of what the admin came for.
  const back = () => setView(null);
  return (
    <>
      <IconButton size="sm" label={t("integrations.settingsOf", { name: conn.name })} onClick={() => setView("main")}><Settings size={18} /></IconButton>
      {view === "main" && <ConnectionDialog conn={conn} onClose={() => setView(null)} onOpen={setView} />}
      {view === "home" && <HomeSetupDialog conn={conn} onClose={back} />}
      {view === "speakers" && <SpeakersVoiceDialog conn={conn} onClose={back} />}
      {view === "cameras" && <CameraSetupDialog conn={conn} onClose={back} />}
      {view === "shelf" && <ShelfSetupDialog conn={conn} onClose={back} />}
    </>
  );
}

function ConnectionDialog({ conn, onClose, onOpen }: { conn: ConnectionInfo; onClose: () => void; onOpen: (v: View) => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const fields = FIELDS[conn.kind];
  const [name, setName] = useState(conn.name);
  const [url, setUrl] = useState(conn.url ?? "");
  const [username, setUsername] = useState(conn.username ?? "");
  const [secret, setSecret] = useState("");
  const [entityId, setEntityId] = useState(String((conn.config as { entityId?: string }).entityId ?? ""));
  const [trust, setTrust] = useState(Boolean((conn.config as { fingerprint?: string }).fingerprint));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; detail?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [signedIn, setSignedIn] = useState<QuickConnectDone | null>(null);
  const has = (f: FieldKey) => fields.includes(f);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setSaved(false);
    setSignedIn(null);
    const r = await run(() => updateConnection({
      id: conn.id,
      ...(has("name") ? { name } : {}), ...(has("url") ? { url } : {}), ...(has("username") ? { username } : {}),
      ...(secret ? { secret } : {}), ...(has("entityId") ? { entityId } : {}), ...(has("trustCertificate") ? { trustCertificate: trust } : {}),
    }));
    setBusy(false);
    if (r.ok) {
      setSecret("");
      setError(null);
      setSaved(true);
    } else setError({ code: r.error, detail: r.detail });
  };

  return (
    <Dialog open onClose={onClose} title={t("integrations.settingsOf", { name: conn.name })}
      footer={<><ErrorText code={error?.code} detail={error?.detail} className="mr-auto max-w-sm self-center" />
        {saved && <span role="status" className="mr-auto self-center text-sm font-bold text-ok">{t("integrations.saved")}</span>}
        <Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>
        <Button variant="primary" disabled={busy || (has("url") && !url)} onClick={() => save()}>{busy ? t("integrations.connecting") : t("common.save")}</Button></>}>
      <div className="flex flex-col gap-6">
        {SETUPS[conn.kind] && (
          <section className="flex flex-col gap-2" aria-label={t("integrations.setup")}>
            {SETUPS[conn.kind]!.map(({ view, key, Icon }) => (
              <button key={view} type="button" onClick={() => onOpen(view)} className="flex items-center gap-3 rounded-card bg-sunken px-4 py-3 text-left font-bold hover:bg-line/50">
                <Icon size={20} aria-hidden /><span className="flex-1">{t(key)}</span><ChevronRight size={18} aria-hidden />
              </button>
            ))}
          </section>
        )}
        <form onSubmit={save} className="flex flex-col gap-4">
          <h3 className="font-bold">{t("integrations.connection")}</h3>
          {has("name") && <Field label={t("routines.label")}><input className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>}
          {has("url") && <Field label={t("integrations.serverUrl")}><input className={inputCls} type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>}
          {has("username") && <Field label={t("integrations.username")}><input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" /></Field>}
          {has("secret") && (
            <Field label={t(SECRET_LABEL[conn.kind])} hint={t("integrations.keepSecret")}>
              <input className={inputCls} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" />
            </Field>
          )}
          {has("entityId") && (
            <Field label={t("integrations.haEntity")} hint={t("integrations.haEntityHint")}>
              <input className={inputCls} value={entityId} onChange={(e) => setEntityId(e.target.value.trim())} placeholder="binary_sensor.hallway_motion" />
            </Field>
          )}
          {has("trustCertificate") && (
            <div className="flex items-center justify-between gap-3"><span><span className="block font-bold">{t("integrations.trustCertificate")}</span><span className="text-sm text-soft">{t("integrations.trustCertificateHint")}</span></span>
              <Switch label={t("integrations.trustCertificate")} checked={trust} onChange={setTrust} /></div>
          )}
          <button type="submit" hidden />
        </form>
        {conn.kind === "jellyfin" && (
          <section className="flex flex-col gap-3" aria-label={t("integrations.qcAgain")}>
            <h3 className="font-bold">{t("integrations.qcAgain")}</h3>
            <p className="text-sm text-soft">{t("integrations.qcAgainHint")}</p>
            <JellyfinQuickConnect url={url} connId={conn.id} onDone={(r) => {
              setSaved(false);
              setError(null);
              setSecret("");
              setUsername(r.name);
              setSignedIn(r);
            }} />
            {signedIn && (
              <p role="status" className={signedIn.switched ? "rounded-card bg-sunken p-3 text-sm font-bold" : "text-sm font-bold text-ok"}>
                {t(signedIn.switched ? "integrations.qcSwitched" : "integrations.qcSignedIn", { name: signedIn.name })}
              </p>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
