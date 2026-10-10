"use client";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { ConnectionInfo } from "@/lib/types";
import { MAX_SPEAKERS, type Speaker } from "@/lib/media";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { listSpeakerChoices, listVoicePipelines, saveSpeakers, saveVoice } from "@/lib/services/media";
import { Button, IconButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, Switch, inputCls } from "../ui/Segmented";
import { ErrorText } from "../ui/ErrorText";

interface Stored { speakers?: Speaker[]; voice?: { on: boolean; pipeline?: string } }

/**
 * Home Assistant's part in listening and talking (§23, §24): the speakers
 * the kids' shelf may play on and how loud a tap may make them, and whether
 * adults may talk to Home Assistant through Kindo, with which Assist pipeline.
 */
export function SpeakersVoiceDialog({ conn, onClose }: { conn: ConnectionInfo; onClose: () => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const stored = conn.config as Stored;
  const [speakers, setSpeakers] = useState<Speaker[]>(stored.speakers ?? []);
  const [voiceOn, setVoiceOn] = useState(Boolean(stored.voice?.on));
  const [pipeline, setPipeline] = useState(stored.voice?.pipeline ?? "");
  const [players, setPlayers] = useState<{ entityId: string; name: string }[] | null>(null);
  const [pipelines, setPipelines] = useState<{ id: string; name: string; language: string }[] | null>(null);
  const [noAssist, setNoAssist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listSpeakerChoices({ id: conn.id }).then((r) => live && (r.ok ? setPlayers(r.data) : setError(r.error)), () => live && setError("network"));
    listVoicePipelines({ id: conn.id }).then((r) => {
      if (!live) return;
      if (r.ok) setPipelines(r.data.pipelines);
      else setNoAssist(true);
    }, () => live && setNoAssist(true));
    return () => {
      live = false;
    };
  }, [conn.id]);

  const available = (players ?? []).filter((p) => !speakers.some((s) => s.entityId === p.entityId));
  const save = async () => {
    setBusy(true);
    const a = await run(() => saveSpeakers({ id: conn.id, speakers: speakers.map((s) => ({ ...s, name: s.name.trim() || s.entityId })) }));
    const b = a.ok ? await run(() => saveVoice({ id: conn.id, on: voiceOn, pipeline: pipeline || undefined })) : a;
    setBusy(false);
    if (b.ok) onClose();
    else setError(b.error);
  };

  return (
    <Dialog open onClose={onClose} wide title={t("speakerSetup.title")}
      footer={<><ErrorText code={error} className="mr-auto self-center" /><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy} onClick={save}>{t("common.save")}</Button></>}>
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <h3 className="font-bold">{t("speakerSetup.speakers")}</h3>
          <p className="text-sm text-soft">{t("speakerSetup.speakersHint")}</p>
          {speakers.length === 0 && <p className="text-sm text-soft">{t("speakerSetup.none")}</p>}
          <ul className="flex flex-col gap-3">
            {speakers.map((s) => (
              <li key={s.entityId} className="flex flex-col gap-2 rounded-card bg-sunken p-3">
                <div className="flex items-center gap-2">
                  <input aria-label={t("homeSetup.nameOf", { entity: s.entityId })} className={inputCls} value={s.name} maxLength={40}
                    onChange={(e) => setSpeakers((l) => l.map((x) => (x.entityId === s.entityId ? { ...x, name: e.target.value } : x)))} />
                  <IconButton size="sm" label={t("speakerSetup.remove", { name: s.name })} onClick={() => setSpeakers((l) => l.filter((x) => x.entityId !== s.entityId))}><X size={16} /></IconButton>
                </div>
                <label className="flex items-center gap-3 text-sm">
                  <span className="w-56 shrink-0 font-bold">{t("speakerSetup.maxVolume", { n: s.maxVolume })}</span>
                  <input type="range" min={5} max={100} step={5} value={s.maxVolume} className="flex-1"
                    onChange={(e) => setSpeakers((l) => l.map((x) => (x.entityId === s.entityId ? { ...x, maxVolume: Number(e.target.value) } : x)))} />
                </label>
              </li>
            ))}
          </ul>
          {!players && !error && <p className="text-sm text-soft">{t("homeSetup.loading")}</p>}
          {players && speakers.length < MAX_SPEAKERS && (
            <ul className="flex max-h-48 flex-col overflow-y-auto rounded-card bg-sunken p-1" aria-label={t("speakerSetup.add")}>
              {available.length === 0 && <li className="p-2 text-sm text-soft">{t("homeSetup.nothingFound")}</li>}
              {available.map((p) => (
                <li key={p.entityId}>
                  <button type="button" onClick={() => setSpeakers((l) => [...l, { entityId: p.entityId, name: p.name.slice(0, 40), maxVolume: 50 }])}
                    className="flex w-full items-center gap-3 rounded-tile px-3 py-2 text-left hover:bg-surface">
                    <Plus size={16} className="shrink-0" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold">{p.name}</span><span className="block truncate text-sm text-soft">{p.entityId}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span><span className="block font-bold">{t("speakerSetup.voice")}</span><span className="text-sm text-soft">{t("speakerSetup.voiceHint")}</span></span>
            <Switch label={t("speakerSetup.voice")} checked={voiceOn} onChange={setVoiceOn} />
          </div>
          {voiceOn && noAssist && <p className="text-sm font-bold">{t("speakerSetup.noAssist")}</p>}
          {voiceOn && pipelines && (
            <Field label={t("speakerSetup.pipeline")} hint={t("speakerSetup.pipelineHint")}>
              <select className={inputCls} value={pipeline} onChange={(e) => setPipeline(e.target.value)}>
                <option value="">{t("speakerSetup.preferred")}</option>
                {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.language})</option>)}
              </select>
            </Field>
          )}
        </section>
      </div>
    </Dialog>
  );
}
