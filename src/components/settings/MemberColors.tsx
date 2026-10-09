"use client";
import { useState, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { saveMember } from "@/lib/services/actions";
import { MEMBER_COLORS, colorName } from "../ui/memberColors";
import { ErrorText } from "../ui/ErrorText";
import { Field } from "../ui/Segmented";
import { cn } from "../ui/cn";

/**
 * Everyone's colour in Settings → Appearance, with their name on it. Admins
 * pick a person and change the colour right here; the rest only look.
 */
export function MemberColors() {
  const { t } = useI18n();
  const { getMembers, viewer, run } = useStore();
  const members = getMembers();
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editable = viewer.isAdmin;
  const current = members.find((m) => m.id === picking);
  if (!members.length) return null;

  const choose = async (color: string) => {
    if (!current || color === current.color) return;
    const { id, name, role, avatar, birthday } = current;
    const r = await run(() => saveMember({ id, name, role, color, avatar, birthday }));
    setError(r.ok ? null : r.error ?? "server");
  };

  return (
    <Field label={t("settings.appearance.memberColors")} hint={editable ? t("settings.appearance.memberColorsHint") : undefined}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const tag = <span className="truncate rounded-full bg-surface/90 px-2.5 py-0.5 text-sm font-bold text-ink">{m.name}</span>;
            const cls = "m-bg flex h-10 min-w-[7rem] flex-1 items-center justify-center rounded-tile px-2";
            const style = { "--m": m.color } as CSSProperties;
            return editable ? (
              <button key={m.id} type="button" aria-pressed={picking === m.id} aria-label={`${t("settings.members.color")}: ${m.name}`}
                onClick={() => setPicking(picking === m.id ? null : m.id)} style={style}
                className={cn(cls, picking === m.id && "ring-4 ring-ink/30 ring-offset-2 ring-offset-surface")}>{tag}</button>
            ) : (
              <span key={m.id} style={style} className={cls}>{tag}</span>
            );
          })}
        </div>
        {current && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`${t("settings.members.color")}: ${current.name}`}>
            {MEMBER_COLORS.map((c) => (
              <button type="button" key={c} role="radio" aria-checked={current.color === c} aria-label={t(colorName(c) ?? "settings.members.color")} onClick={() => choose(c)}
                className={cn("h-10 w-10 rounded-full", current.color === c && "ring-4 ring-ink/30 ring-offset-2 ring-offset-surface")} style={{ background: c }} />
            ))}
          </div>
        )}
        <ErrorText code={error} />
      </div>
    </Field>
  );
}
