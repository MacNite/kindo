"use client";
import { useState } from "react";
import { ChevronRight, Headphones, Library, Music, Plug } from "lucide-react";
import type { ConnectionInfo } from "@/lib/types";
import type { ShelfItem } from "@/lib/media";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { Button } from "../ui/Button";
import { ShelfSetupDialog } from "./ShelfSetup";

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
    </div>
  );
}
