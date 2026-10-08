"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Lightbulb, Plus, X } from "lucide-react";
import type { ConnectionInfo } from "@/lib/types";
import type { EnergySensors, HaEntityChoices, HomeControl } from "@/lib/home";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { moved } from "@/lib/dashboard";
import { listHaChoices, saveHomeSetup } from "@/lib/services/home";
import { Button, IconButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, Switch, inputCls } from "../ui/Segmented";
import { ErrorText } from "../ui/ErrorText";

/** Opens the Home control setup for a Home Assistant connection (§21). */
export function HomeSetupButton({ conn }: { conn: ConnectionInfo }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Lightbulb size={14} />{t("homeSetup.open")}</Button>
      {open && <HomeSetupDialog conn={conn} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Which switches the family sees, under which names, and which power sensors
 * feed the solar view. Picked from what Home Assistant has, so nobody has to
 * type entity ids.
 */
function HomeSetupDialog({ conn, onClose }: { conn: ConnectionInfo; onClose: () => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const stored = conn.config as { controls?: HomeControl[]; energy?: EnergySensors };
  const [choices, setChoices] = useState<HaEntityChoices | null>(null);
  const [controls, setControls] = useState<HomeControl[]>(stored.controls ?? []);
  const [energy, setEnergy] = useState<Partial<EnergySensors>>(stored.energy ?? {});
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listHaChoices({ id: conn.id }).then((r) => {
      if (!live) return;
      if (r.ok) setChoices(r.data);
      else setError(r.error);
    }, () => live && setError("network"));
    return () => {
      live = false;
    };
  }, [conn.id]);

  const picked = useMemo(() => new Set(controls.map((c) => c.entityId)), [controls]);
  const available = (choices?.switches ?? []).filter((c) => !picked.has(c.entityId)
    && (!filter || `${c.name} ${c.entityId}`.toLowerCase().includes(filter.toLowerCase())));

  const save = async () => {
    setBusy(true);
    const e = energy.solar ? {
      solar: energy.solar, feedIn: energy.feedIn || undefined, draw: energy.draw || undefined, house: energy.house || undefined,
      grid: energy.grid || undefined, gridInvert: energy.grid ? Boolean(energy.gridInvert) : undefined,
    } : null;
    const r = await run(() => saveHomeSetup({ id: conn.id, controls: controls.map((c) => ({ ...c, name: c.name.trim() || c.entityId })), energy: e }));
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };

  const sensorSelect = (key: "solar" | "feedIn" | "draw" | "house" | "grid", label: string, hint: string, empty = t("homeSetup.none")) => (
    <Field label={label} hint={hint}>
      <select className={inputCls} value={energy[key] ?? ""} onChange={(e) => setEnergy((x) => ({ ...x, [key]: e.target.value || undefined }))}>
        <option value="">{empty}</option>
        {(choices?.sensors ?? []).map((s) => <option key={s.entityId} value={s.entityId}>{s.name} ({s.unit ?? "W"})</option>)}
        {/* A stored sensor Home Assistant no longer lists stays selectable, so saving doesn't drop it silently. */}
        {energy[key] && !choices?.sensors.some((s) => s.entityId === energy[key]) && <option value={energy[key]}>{energy[key]}</option>}
      </select>
    </Field>
  );

  return (
    <Dialog open onClose={onClose} wide title={t("homeSetup.title")}
      footer={<><ErrorText code={error} className="mr-auto self-center" /><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={busy || (!energy.solar && Boolean(energy.feedIn || energy.draw || energy.house || energy.grid))} onClick={save}>{t("common.save")}</Button></>}>
      <div className="flex flex-col gap-6">
        <p className="text-sm text-soft">{t("homeSetup.hint")}</p>

        <section className="flex flex-col gap-3">
          <h3 className="font-bold">{t("homeSetup.switches")}</h3>
          {controls.length === 0 && <p className="text-sm text-soft">{t("homeSetup.noSwitches")}</p>}
          <ol className="flex flex-col gap-2">
            {controls.map((c, i) => (
              <li key={c.entityId} className="flex items-center gap-2">
                <input aria-label={t("homeSetup.nameOf", { entity: c.entityId })} className={inputCls} value={c.name} maxLength={40}
                  onChange={(e) => setControls((l) => l.map((x) => (x.entityId === c.entityId ? { ...x, name: e.target.value } : x)))} />
                <span className="hidden w-48 shrink-0 truncate text-sm text-soft md:block" title={c.entityId}>{c.entityId}</span>
                <IconButton size="sm" label={t("common.moveEarlier")} disabled={i === 0} onClick={() => setControls((l) => moved(l, i, -1))}><ArrowUp size={16} /></IconButton>
                <IconButton size="sm" label={t("common.moveLater")} disabled={i === controls.length - 1} onClick={() => setControls((l) => moved(l, i, 1))}><ArrowDown size={16} /></IconButton>
                <IconButton size="sm" label={t("homeSetup.removeSwitch", { name: c.name })} onClick={() => setControls((l) => l.filter((x) => x.entityId !== c.entityId))}><X size={16} /></IconButton>
              </li>
            ))}
          </ol>
          <Field label={t("homeSetup.addSwitch")}>
            <input className={inputCls} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("homeSetup.search")} />
          </Field>
          {!choices && !error && <p className="text-sm text-soft">{t("homeSetup.loading")}</p>}
          {choices && (
            <ul className="flex max-h-56 flex-col overflow-y-auto rounded-card bg-sunken p-1">
              {available.length === 0 && <li className="p-2 text-sm text-soft">{t("homeSetup.nothingFound")}</li>}
              {available.slice(0, 100).map((c) => (
                <li key={c.entityId}>
                  <button type="button" disabled={controls.length >= 24} onClick={() => setControls((l) => [...l, { entityId: c.entityId, name: c.name.slice(0, 40) }])}
                    className="flex w-full items-center gap-3 rounded-tile px-3 py-2 text-left enabled:hover:bg-surface disabled:opacity-40">
                    <Plus size={16} className="shrink-0" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold">{c.name}</span><span className="block truncate text-sm text-soft">{c.entityId}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="font-bold">{t("homeSetup.energy")}</h3>
          {sensorSelect("solar", t("homeSetup.solar"), t("homeSetup.solarHint"))}
          {sensorSelect("feedIn", t("homeSetup.feedIn"), t("homeSetup.feedInHint"))}
          {sensorSelect("draw", t("homeSetup.draw"), t("homeSetup.drawHint"))}
          {sensorSelect("house", t("homeSetup.house"), t("homeSetup.houseHint"), t("homeSetup.calculate"))}
          {/* Older setups with one signed grid sensor keep it until it is cleared. */}
          {stored.energy?.grid && sensorSelect("grid", t("homeSetup.grid"), t("homeSetup.gridHint"))}
          {energy.grid && (
            <div className="flex items-center justify-between gap-3">
              <span><span className="block font-bold">{t("homeSetup.gridInvert")}</span><span className="text-sm text-soft">{t("homeSetup.gridInvertHint")}</span></span>
              <Switch label={t("homeSetup.gridInvert")} checked={Boolean(energy.gridInvert)} onChange={(gridInvert) => setEnergy((x) => ({ ...x, gridInvert }))} />
            </div>
          )}
        </section>
      </div>
    </Dialog>
  );
}
