"use client";
import { Headphones } from "lucide-react";
import type { MediaPin } from "@/lib/media";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { setMediaPin } from "@/lib/services/media";
import { Segmented } from "../ui/Segmented";

/**
 * Settings → Dashboard: whether starting the kids' shelf needs the settings
 * PIN on a wall (§23, D64). Free, speakers only, or everything; pausing,
 * stopping and the volume always stay free. Admins only.
 */
export function MediaPinCard() {
  const { t } = useI18n();
  const { data, viewer, run } = useStore();
  if (!viewer.isAdmin) return null;
  const mode = data.household.mediaPin;
  return (
    <div className="flex flex-col gap-3 rounded-panel bg-surface p-5">
      <p className="flex items-center gap-2 font-bold"><Headphones size={18} />{t("settings.dashboard.mediaPin")}</p>
      <p className="-mt-1 text-sm text-soft">{t("settings.dashboard.mediaPinHint")}</p>
      <Segmented<MediaPin> label={t("settings.dashboard.mediaPin")} value={mode} onChange={(m) => void run(() => setMediaPin({ mode: m }))} options={[
        { value: "off", label: t("settings.dashboard.mediaPin_off") },
        { value: "speakers", label: t("settings.dashboard.mediaPin_speakers") },
        { value: "all", label: t("settings.dashboard.mediaPin_all") },
      ]} />
      <p className="text-sm">{t(`settings.dashboard.mediaPinIs_${mode}`)}</p>
      {mode !== "off" && !viewer.pinSet && <p className="text-sm font-bold">{t("settings.dashboard.mediaPinNoPin")}</p>}
    </div>
  );
}
