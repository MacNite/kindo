"use client";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { WallTileId } from "@/lib/types";
import { useI18n, type MessageKey } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { IconButton } from "../ui/Button";
import { Switch } from "../ui/Segmented";

/**
 * Settings → Dashboard: which household tiles the wall display shows beside
 * the lanes, and in which order (§4). Home control joins here (§21).
 */
export function WallTilesCard() {
  const { t } = useI18n();
  const { wallTiles, moveWallTile, showWallTile, home, cameras } = useStore();
  const label = (id: WallTileId) => t(`settings.dashboard.wallTile_${id}` as MessageKey);
  return (
    <div className="rounded-panel bg-surface p-5">
      <p className="font-bold">{t("settings.dashboard.wallTiles")}</p>
      <p className="mb-3 text-sm text-soft">{t("settings.dashboard.wallTilesHint")}</p>
      <ol className="flex flex-col divide-y divide-line" aria-label={t("settings.dashboard.wallTiles")}>
        {wallTiles.map((tile, i) => (
          <li key={tile.id} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{label(tile.id)}</span>
              {tile.id === "home" && !home && <span className="block text-sm text-soft">{t("settings.dashboard.wallHomeHint")}</span>}
              {tile.id === "cameras" && !cameras.length && <span className="block text-sm text-soft">{t("settings.dashboard.wallCamerasHint")}</span>}
            </span>
            <IconButton size="sm" label={t("common.moveEarlier")} disabled={i === 0} onClick={() => moveWallTile(tile.id, -1)}><ArrowUp size={16} /></IconButton>
            <IconButton size="sm" label={t("common.moveLater")} disabled={i === wallTiles.length - 1} onClick={() => moveWallTile(tile.id, 1)}><ArrowDown size={16} /></IconButton>
            <Switch label={label(tile.id)} checked={tile.enabled} onChange={(on) => showWallTile(tile.id, on)} />
          </li>
        ))}
      </ol>
    </div>
  );
}
