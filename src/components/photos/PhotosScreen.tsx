"use client";
import { ArrowRight, Check, Moon, Play, Plus, Server, Radar } from "lucide-react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { usePhotoPlaylist } from "@/lib/state/photos";
import { PageHeader, Panel } from "../ui/Panel";
import { LinkButton } from "../ui/Button";
import { Switch } from "../ui/Segmented";
import { Photo, PhotoPlaceholder } from "../ui/PhotoPlaceholder";
import { cn } from "../ui/cn";

const WEIGHT_COLORS = ["#3B78C2", "#8A5CD1", "#E39A1B", "#2E8B6E", "#C2477A", "#5B6A6D"];

export function PhotosScreen() {
  const { t, fmt } = useI18n();
  const { albums, updateAlbum, idleMinutes, setIdleMinutes, showPhotoMeta, setShowPhotoMeta, night, setNight } = useStore();
  const photos = usePhotoPlaylist();
  const servers = [...new Set(albums.map((a) => a.server))];
  const pool = albums.filter((a) => a.selected);
  const totalW = pool.reduce((s, a) => s + Math.max(1, a.weight), 0);

  return (
    <div>
      <PageHeader title={t("photos.title")} subtitle={t("photos.subtitle")}
        actions={<LinkButton href="/screensaver" variant="primary"><Play size={18} fill="currentColor" />{t("photos.start")}</LinkButton>} />

      <div className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {photos.slice(0, 6).map((p) => (
          <div key={p.id} className="relative aspect-[4/3] overflow-hidden rounded-tile">
            <Photo photo={p} size="thumbnail" className="h-full w-full" />
            {p.takenAt && <span className="absolute bottom-1 left-1.5 text-xs font-bold text-white drop-shadow">{fmt.dateMedium(p.takenAt)}</span>}
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <Panel title={t("photos.servers")} action={<LinkButton href="/settings?section=integrations" size="sm" variant="ghost"><Plus size={16} />{t("photos.addServer")}</LinkButton>}>
          <p className="mb-4 text-sm text-soft">{t("photos.poolHint")}</p>
          <div className="flex flex-col gap-5">
            {servers.length === 0 && <p className="text-soft">{t("photos.noServers")}</p>}
            {servers.map((s) => (
              <section key={s}>
                <header className="mb-2 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-sunken"><Server size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{t("photos.server", { name: s })}</p>
                  </div>
                </header>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {albums.filter((a) => a.server === s).map((a) => (
                    <li key={a.id}>
                      <button onClick={() => updateAlbum(a.id, { selected: !a.selected, weight: a.selected ? 0 : 20 })} aria-pressed={a.selected}
                        className={cn("flex w-full items-center gap-3 rounded-card border-2 p-3 text-left", a.selected ? "border-ink" : "border-line")}>
                        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-tile">
                          {a.cover
                            ? <img src={`/api/photos/${encodeURIComponent(a.cover)}?size=thumbnail`} alt="" loading="lazy" decoding="async" className="h-full w-full bg-sunken object-cover" />
                            : <PhotoPlaceholder seed={a.count % 17} className="h-full w-full" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{a.name}</span>
                          <span className="num text-sm text-soft">{t("photos.photos", { n: fmt.num(a.count) })}</span>
                        </span>
                        <span className={cn("grid h-7 w-7 place-items-center rounded-full", a.selected ? "bg-ink text-surface" : "border-2 border-line")}>{a.selected && <Check size={16} strokeWidth={3} />}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel title={t("photos.weighting")}>
            <p className="mb-3 text-sm text-soft">{t("photos.weightingHint")}</p>
            <div className="mb-4 flex h-4 overflow-hidden rounded-full">
              {pool.map((a, i) => <span key={a.id} style={{ width: `${(Math.max(1, a.weight) / totalW) * 100}%`, background: WEIGHT_COLORS[i % 6] }} />)}
            </div>
            <ul className="flex flex-col gap-3">
              {pool.map((a, i) => (
                <li key={a.id} className="grid grid-cols-[12px_1fr_auto] items-center gap-x-3 gap-y-1">
                  <span className="h-3 w-3 rounded-full" style={{ background: WEIGHT_COLORS[i % 6] }} />
                  <span className="truncate font-bold">{a.name}</span>
                  <span className="num w-12 text-right text-sm font-bold">{Math.round((Math.max(1, a.weight) / totalW) * 100)} %</span>
                  <input type="range" min={0} max={100} step={5} value={a.weight} onChange={(e) => updateAlbum(a.id, { weight: +e.target.value })}
                    aria-label={a.name} className="col-span-2 col-start-2 accent-[rgb(var(--ink))]" />
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={t("photos.behaviour")}>
            <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm font-bold">
              {[t("photos.flowActive"), t("photos.flowIdle"), t("photos.flowSaver"), t("photos.flowTouch"), t("photos.flowActive")].map((s, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <ArrowRight size={14} className="text-soft" />}
                  <span className={cn("whitespace-nowrap rounded-full px-2.5 py-1", i === 2 ? "bg-ink text-surface" : "bg-sunken")}>{s}</span>
                </span>
              )).slice(0, 5)}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold">{t("photos.idle")}</span>
              <select value={idleMinutes} onChange={(e) => setIdleMinutes(+e.target.value)} className="h-10 rounded-full bg-sunken px-4 font-bold">
                {[0.25, 1, 2, 5, 10].map((n) => <option key={n} value={n}>{n < 1 ? t("common.seconds", { n: n * 60 }) : t("common.minutes", { n })}</option>)}
              </select>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="font-bold">{t("photos.showMeta")}</span>
              <Switch label={t("photos.showMeta")} checked={showPhotoMeta} onChange={setShowPhotoMeta} />
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-soft"><Radar size={16} />{t("photos.presence")}</p>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-5">
              <span className="flex items-center gap-2 font-bold"><Moon size={18} />{t("photos.night")}</span>
              <Switch label={t("photos.night")} checked={night.on} onChange={(on) => setNight({ on })} />
            </div>
            {night.on && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {(["from", "until"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 font-bold">
                    {t(k === "from" ? "photos.nightFrom" : "photos.nightUntil")}
                    <input type="time" required value={night[k]} className="h-10 rounded-full bg-sunken px-4 font-bold"
                      onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && setNight({ [k]: e.target.value })} />
                  </label>
                ))}
              </div>
            )}
            <p className="mt-3 text-sm text-soft">{t("photos.nightHint")}</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
