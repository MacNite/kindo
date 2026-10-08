"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Cctv, Plus, Trash2 } from "lucide-react";
import type { ConnectionInfo } from "@/lib/types";
import { cameraId, guessStreams, type CameraChoices, type CameraSetup } from "@/lib/cameras";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { moved } from "@/lib/dashboard";
import { listCameraChoices, saveCameraSetup } from "@/lib/services/cameras";
import { Button, IconButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, inputCls } from "../ui/Segmented";
import { ErrorText } from "../ui/ErrorText";

/** Opens the camera setup for a Frigate connection (§22). */
export function CameraSetupButton({ conn }: { conn: ConnectionInfo }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Cctv size={14} />{t("cameraSetup.open")}</Button>
      {open && <CameraSetupDialog conn={conn} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Which of Frigate's cameras the family sees, under which names; which
 * go2rtc streams to watch and to talk through; and which Home Assistant
 * sensor is the doorbell button. Picked from lists, so nobody types names.
 */
function CameraSetupDialog({ conn, onClose }: { conn: ConnectionInfo; onClose: () => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const stored = conn.config as { cameras?: CameraSetup[]; fingerprint?: string };
  const [choices, setChoices] = useState<CameraChoices | null>(null);
  const [cameras, setCameras] = useState<CameraSetup[]>(stored.cameras ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listCameraChoices({ id: conn.id }).then((r) => {
      if (!live) return;
      if (r.ok) setChoices(r.data);
      else setError(r.error);
    }, () => live && setError("network"));
    return () => {
      live = false;
    };
  }, [conn.id]);

  const unused = (choices?.cameras ?? []).filter((c) => !cameras.some((x) => x.camera === c));
  const add = (camera: string) => {
    const g = guessStreams(camera, choices?.streams ?? []);
    const name = camera.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    setCameras((list) => [...list, { id: cameraId(name, list.map((c) => c.id)), name, camera, stream: g.stream ?? camera, talkStream: g.talkStream }]);
  };
  const patch = (i: number, p: Partial<CameraSetup>) => setCameras((list) => list.map((c, j) => (j === i ? { ...c, ...p } : c)));

  const save = async () => {
    setBusy(true);
    const r = await run(() => saveCameraSetup({
      id: conn.id,
      cameras: cameras.map((c) => ({ ...c, name: c.name.trim() || c.camera || c.stream, camera: c.camera || undefined, talkStream: c.talkStream || undefined, visitorEntity: c.visitorEntity || undefined })),
    }));
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };

  /** A stored value the lists no longer offer stays selectable, so saving doesn't drop it silently. */
  const options = (list: string[], value?: string) => [...list, ...(value && !list.includes(value) ? [value] : [])];

  return (
    <Dialog open wide onClose={onClose} title={t("cameraSetup.title")}
      footer={<><ErrorText code={error} className="mr-auto self-center" /><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy} onClick={save}>{t("common.save")}</Button></>}>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-soft">{t("cameraSetup.hint")}</p>
        {stored.fingerprint && <p className="break-all text-xs text-soft">{t("cameraSetup.fingerprint", { fingerprint: stored.fingerprint })}</p>}
        {!choices && !error && <p role="status" className="text-soft">{t("cameraSetup.loading")}</p>}

        {cameras.length === 0 && choices && <p className="text-soft">{t("cameraSetup.none")}</p>}
        <ol className="flex flex-col gap-4">
          {cameras.map((c, i) => (
            <li key={c.id} data-testid={`camera-setup-${c.id}`} className="flex flex-col gap-3 rounded-card bg-sunken p-4">
              <div className="flex items-end gap-2">
                <Field label={t("cameraSetup.name")}><input className={inputCls} value={c.name} maxLength={40} onChange={(e) => patch(i, { name: e.target.value })} /></Field>
                <IconButton size="sm" label={t("common.moveEarlier")} disabled={i === 0} onClick={() => setCameras((l) => moved(l, i, -1))}><ArrowUp size={16} /></IconButton>
                <IconButton size="sm" label={t("common.moveLater")} disabled={i === cameras.length - 1} onClick={() => setCameras((l) => moved(l, i, 1))}><ArrowDown size={16} /></IconButton>
                <IconButton size="sm" label={t("cameraSetup.remove")} onClick={() => setCameras((l) => l.filter((_, j) => j !== i))}><Trash2 size={16} /></IconButton>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("cameraSetup.picture")} hint={t("cameraSetup.pictureHint")}>
                  <select className={inputCls} value={c.camera ?? ""} onChange={(e) => patch(i, { camera: e.target.value || undefined })}>
                    <option value="">{t("cameraSetup.noPicture")}</option>
                    {options(choices?.cameras ?? [], c.camera).map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label={t("cameraSetup.stream")} hint={t("cameraSetup.streamHint")}>
                  <select className={inputCls} value={c.stream} onChange={(e) => patch(i, { stream: e.target.value })}>
                    {options(choices?.streams ?? [], c.stream).map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label={t("cameraSetup.talkStream")} hint={t("cameraSetup.talkStreamHint")}>
                  <select className={inputCls} value={c.talkStream ?? ""} onChange={(e) => patch(i, { talkStream: e.target.value || undefined })}>
                    <option value="">{t("cameraSetup.noTalk")}</option>
                    {options(choices?.streams ?? [], c.talkStream).map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label={t("cameraSetup.visitor")} hint={choices && !choices.visitors.length ? t("cameraSetup.visitorNeedsHa") : t("cameraSetup.visitorHint")}>
                  <select className={inputCls} value={c.visitorEntity ?? ""} onChange={(e) => patch(i, { visitorEntity: e.target.value || undefined })}>
                    <option value="">{t("cameraSetup.noRing")}</option>
                    {(choices?.visitors ?? []).map((v) => <option key={v.entityId} value={v.entityId}>{v.name} ({v.entityId})</option>)}
                    {c.visitorEntity && !choices?.visitors.some((v) => v.entityId === c.visitorEntity) && <option value={c.visitorEntity}>{c.visitorEntity}</option>}
                  </select>
                </Field>
              </div>
            </li>
          ))}
        </ol>

        {unused.length > 0 && cameras.length < 12 && (
          <div>
            <p className="mb-2 font-bold">{t("cameraSetup.add")}</p>
            <ul className="flex flex-wrap gap-2">
              {unused.map((c) => <li key={c}><Button size="sm" variant="outline" onClick={() => add(c)}><Plus size={14} />{c}</Button></li>)}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
