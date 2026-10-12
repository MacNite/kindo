"use client";
import { useState } from "react";
import { ChevronRight, Headphones, Library, Music, Plug, Speaker as SpeakerIcon } from "lucide-react";
import type { ConnectionInfo } from "@/lib/types";
import type { ShelfItem, Speaker } from "@/lib/media";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { setMediaScreen } from "@/lib/services/media";
import { Button } from "../ui/Button";
import { Switch } from "../ui/Segmented";
import { ShelfSetupDialog } from "./ShelfSetup";
import { SpeakersVoiceDialog } from "./SpeakersVoiceSetup";

/**
 * Settings → Media & kids' shelf: the shelf of every Jellyfin and
 * Audiobookshelf connection in one place, so it isn't only behind the cog
 * under Integrations. Without either connection there is nothing to fill,
 * and the section says so.
 */
export function MediaSection({ onIntegrations }: { onIntegrations: () => void }) {
  const { t } = useI18n();
  const { data } = useStore();
  const [open, setOpen] = useState<ConnectionInfo | null>(null);
  const sources = data.connections.filter((c) => c.kind === "jellyfin" || c.kind === "audiobookshelf");

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <p className="max-w-prose text-soft">{t("settings.media.hint")}</p>
      <div className="flex flex-col gap-3 rounded-panel bg-surface p-5">
        <p className="font-bold">{t("settings.media.requires")}</p>
        <p className="text-sm text-soft">{t(sources.length ? "settings.media.requiresHint" : "settings.media.none")}</p>
        <div><Button size="sm" variant="outline" onClick={onIntegrations}><Plug size={16} />{t("settings.media.openIntegrations")}</Button></div>
      </div>
      {sources.length > 0 && (
        <ul className="flex flex-col gap-2">
          {sources.map((c) => {
            const count = ((c.config as { shelf?: ShelfItem[] }).shelf ?? []).length;
            const Icon = c.kind === "jellyfin" ? Music : Headphones;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => setOpen(c)} data-testid={`media-shelf-${c.kind}`}
                  className="flex w-full items-center gap-3 rounded-card bg-surface px-4 py-3 text-left hover:bg-sunken">
                  <Icon size={20} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{t("settings.media.shelfOf", { name: c.name })}</span>
                    <span className="block text-sm text-soft">{t(c.kind === "jellyfin" ? "settings.integrations.jellyfin" : "settings.integrations.audiobookshelf")} · {t("settings.media.items", { count })}</span>
                  </span>
                  <Library size={18} aria-hidden className="text-soft" /><ChevronRight size={18} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <ShelfSetupDialog conn={open} onClose={() => setOpen(null)} />}
      <SpeakersPanel onIntegrations={onIntegrations} />
    </div>
  );
}

/**
 * The speakers the shelf plays on, which come from Home Assistant, and
 * whether walls and children may also play on the screen itself (D71). The
 * speakers are the same as behind Home Assistant's cog under Integrations.
 */
function SpeakersPanel({ onIntegrations }: { onIntegrations: () => void }) {
  const { t } = useI18n();
  const { data, run } = useStore();
  const [editing, setEditing] = useState(false);
  const ha = data.connections.find((c) => c.kind === "homeassistant");
  const speakers = ((ha?.config ?? {}) as { speakers?: Speaker[] }).speakers ?? [];
  const screen = data.household.mediaScreen;
  return (
    <section className="flex flex-col gap-3 rounded-panel bg-surface p-5" data-testid="media-speakers">
      <p className="flex items-center gap-2 font-bold"><SpeakerIcon size={18} aria-hidden />{t("settings.media.speakers")}</p>
      <p className="-mt-1 text-sm text-soft">{t(ha ? "settings.media.speakersHint" : "settings.media.speakersNoHa")}</p>
      {ha ? (
        <>
          {speakers.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {speakers.map((s) => (
                <li key={s.entityId} className="flex items-center gap-3 rounded-card bg-sunken px-3 py-2 text-sm">
                  <SpeakerIcon size={16} aria-hidden className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-bold">{s.name}</span>
                  <span className="shrink-0 text-soft">{t("speakerSetup.maxVolume", { n: s.maxVolume })}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-soft">{t("speakerSetup.none")}</p>}
          <div><Button size="sm" variant="outline" onClick={() => setEditing(true)}><SpeakerIcon size={16} />{t("settings.media.editSpeakers", { name: ha.name })}</Button></div>
        </>
      ) : (
        <div><Button size="sm" variant="outline" onClick={onIntegrations}><Plug size={16} />{t("settings.media.openIntegrations")}</Button></div>
      )}
      {(ha || !screen) && (
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <span>
            <span className="block font-bold">{t("settings.media.screen")}</span>
            <span className="text-sm text-soft">{t(screen ? "settings.media.screenOn" : "settings.media.screenOff")}</span>
          </span>
          <Switch label={t("settings.media.screen")} checked={screen} onChange={(on) => void run(() => setMediaScreen({ on }))} />
        </div>
      )}
      {!screen && speakers.length === 0 && <p className="text-sm font-bold">{t("settings.media.screenNoSpeakers")}</p>}
      {editing && ha && <SpeakersVoiceDialog conn={ha} speakersOnly onClose={() => setEditing(false)} />}
    </section>
  );
}
