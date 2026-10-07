"use client";
import { useMemo, useState } from "react";
import { Minus, Plus, Upload } from "lucide-react";
import type { Recurrence, Weekday } from "@/lib/types";
import { useI18n, type I18n } from "@/i18n";
import { occursOn, toRRule } from "@/lib/recurrence";
import { addDays, dateKey } from "@/lib/dates";
import { useToday } from "@/lib/useToday";
import { EMOJI_CHOICES, PICTOGRAMS, PICTO_CATEGORIES, type PictoCategory } from "@/lib/pictograms";
import { Pictogram } from "../ui/Pictogram";
import { Segmented, inputCls } from "../ui/Segmented";
import { cn } from "../ui/cn";

// ── Recurrence ──────────────────────────────────────────────────────────────
type Kind = "daily" | "weekdays" | "weekly" | "everyN" | "monthly" | "once" | "schoolDays";
const KINDS: Kind[] = ["daily", "schoolDays", "weekdays", "weekly", "everyN", "monthly", "once"];

const kindOf = (r: Recurrence): Kind => (r.kind === "weekly" && r.interval > 1 ? "everyN" : r.kind);

function fromKind(k: Kind, prev: Recurrence, today: Date): Recurrence {
  const day = (prev.kind === "weekly" ? prev.day : prev.kind === "weekdays" ? prev.days[0] ?? 1 : today.getDay()) as Weekday;
  switch (k) {
    case "daily": return { kind: "daily" };
    case "schoolDays": return { kind: "schoolDays" };
    case "weekdays": return { kind: "weekdays", days: prev.kind === "weekdays" ? prev.days : [1, 2, 3, 4, 5] };
    case "weekly": return { kind: "weekly", day, interval: 1 };
    case "everyN": return { kind: "weekly", day, interval: prev.kind === "weekly" && prev.interval > 1 ? prev.interval : 2 };
    case "monthly": return { kind: "monthly", dayOfMonth: 1 };
    case "once": return { kind: "once", date: dateKey(addDays(today, 1)) };
  }
}

export function describeRecurrence(r: Recurrence, { t, weekdayName, weekOrder, fmt, language }: I18n): string {
  switch (r.kind) {
    case "daily": return t("recurrence.s_daily");
    case "schoolDays": return t("recurrence.s_schoolDays");
    case "weekdays": {
      const names = weekOrder.filter((d) => r.days.includes(d)).map((d) => weekdayName(d, "short"));
      const joined = new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(names);
      return t("recurrence.s_weekdays", { days: joined });
    }
    case "weekly": return r.interval > 1 ? t("recurrence.s_everyN", { n: r.interval, day: weekdayName(r.day) }) : t("recurrence.s_weekly", { day: weekdayName(r.day) });
    case "monthly": return t("recurrence.s_monthly", { n: r.dayOfMonth });
    case "once": return t("recurrence.s_once", { date: fmt.dateMedium(new Date(r.date + "T00:00")) });
  }
}

export function RecurrenceEditor({ value, onChange }: { value: Recurrence; onChange: (r: Recurrence) => void }) {
  const today = useToday();
  const i18n = useI18n();
  const { t, weekOrder, weekdayName, fmt } = i18n;
  const kind = kindOf(value);
  const next = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 400 && out.length < 4; i++) { const d = addDays(today, i); if (occursOn(value, d)) out.push(d); }
    return out;
  }, [value, today]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k} onClick={() => onChange(fromKind(k, value, today))} aria-pressed={kind === k}
            className={cn("h-10 rounded-full border-2 px-4 text-sm font-bold", kind === k ? "border-ink bg-ink text-surface" : "border-line text-soft hover:text-ink")}>
            {t(`recurrence.${k}`)}
          </button>
        ))}
      </div>

      {value.kind === "weekdays" && (
        <DayPicker multi selected={value.days} onChange={(days) => onChange({ kind: "weekdays", days })} />
      )}
      {value.kind === "weekly" && (
        <div className="flex flex-wrap items-center gap-4">
          {value.interval > 1 && (
            <span className="flex items-center gap-2 font-bold">
              {t("recurrence.every")}
              <Stepper value={value.interval} min={2} max={8} onChange={(interval) => onChange({ ...value, interval })} />
              {t("recurrence.weeks")}
            </span>
          )}
          <DayPicker selected={[value.day]} onChange={(d) => onChange({ ...value, day: d[0] })} />
        </div>
      )}
      {value.kind === "monthly" && (
        <label className="flex items-center gap-3 font-bold">{t("recurrence.day")}
          <select className={cn(inputCls, "w-24")} value={value.dayOfMonth} onChange={(e) => onChange({ kind: "monthly", dayOfMonth: +e.target.value })}>
            {Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}.</option>)}
          </select>
        </label>
      )}
      {value.kind === "once" && (
        <label className="flex items-center gap-3 font-bold">{t("recurrence.date")}
          <input type="date" className={cn(inputCls, "w-48")} value={value.date} onChange={(e) => onChange({ kind: "once", date: e.target.value })} />
        </label>
      )}

      <div className="rounded-card bg-sunken p-4">
        <p className="font-bold">{describeRecurrence(value, i18n)}</p>
        <p className="mt-1 text-sm text-soft">{t("recurrence.next")}: {next.map((d) => `${weekdayName(d.getDay() as Weekday, "short")} ${fmt.dateMedium(d)}`).join(", ")}</p>
        <p className="mt-2 text-xs text-soft">{t("recurrence.rrule")}: <code className="rounded bg-surface px-1.5 py-0.5">{toRRule(value)}</code></p>
      </div>
      <span className="sr-only">{weekOrder.map((d) => weekdayName(d)).join(" ")}</span>
    </div>
  );
}

function DayPicker({ selected, onChange, multi }: { selected: Weekday[]; onChange: (d: Weekday[]) => void; multi?: boolean }) {
  const { weekOrder, weekdayName } = useI18n();
  return (
    <div className="flex gap-1.5">
      {weekOrder.map((d) => {
        const on = selected.includes(d);
        return (
          <button key={d} aria-pressed={on} aria-label={weekdayName(d)} title={weekdayName(d)}
            onClick={() => onChange(multi ? (on ? selected.filter((x) => x !== d) : [...selected, d]) : [d])}
            className={cn("grid h-11 w-11 place-items-center rounded-full text-sm font-bold", on ? "bg-ink text-surface" : "bg-sunken text-soft")}>
            {weekdayName(d, "short").slice(0, 2)}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, max = 999, step = 1 }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-sunken p-1">
      <button aria-label="−" className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface disabled:opacity-30" disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}><Minus size={16} /></button>
      <span className="num w-10 text-center font-bold">{value}</span>
      <button aria-label="+" className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface disabled:opacity-30" disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}><Plus size={16} /></button>
    </span>
  );
}

// ── Pictogram picker ────────────────────────────────────────────────────────
export function PictogramPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t, tx } = useI18n();
  const [tab, setTab] = useState<"builtin" | "emoji" | "photo">(value.startsWith("emoji:") ? "emoji" : value.startsWith("img:") ? "photo" : "builtin");
  const [cat, setCat] = useState<PictoCategory>(PICTOGRAMS.find((p) => p.id === value)?.category ?? "morning");
  return (
    <div>
      <Segmented size="sm" value={tab} onChange={setTab} options={[
        { value: "builtin", label: t("picker.builtin") }, { value: "emoji", label: t("picker.emoji") }, { value: "photo", label: t("picker.photo") },
      ]} />
      {tab === "builtin" && (
        <>
          <div className="mt-3 flex gap-1.5 overflow-x-auto no-scrollbar">
            {PICTO_CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn("h-8 shrink-0 rounded-full px-3 text-sm font-bold", cat === c ? "bg-ink text-surface" : "text-soft hover:bg-sunken")}>{t(`picker.cat_${c}`)}</button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-6">
            {PICTOGRAMS.filter((p) => p.category === cat).map((p) => (
              <button key={p.id} onClick={() => onChange(p.id)} aria-pressed={value === p.id} title={tx(p.label)} aria-label={tx(p.label)}
                className={cn("grid aspect-square place-items-center rounded-tile transition-colors", value === p.id ? "m-bg text-white" : "bg-sunken m-text hover:bg-line")}>
                <p.Icon className="h-7 w-7" strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </>
      )}
      {tab === "emoji" && (
        <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-8">
          {EMOJI_CHOICES.map((e) => (
            <button key={e} onClick={() => onChange(`emoji:${e}`)} aria-pressed={value === `emoji:${e}`}
              className={cn("grid aspect-square place-items-center rounded-tile text-2xl", value === `emoji:${e}` ? "tint-strong ring-2 ring-[var(--m)]" : "bg-sunken")}>{e}</button>
          ))}
        </div>
      )}
      {tab === "photo" && (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-line p-6 text-center">
          <Upload className="h-8 w-8 text-soft" />
          <p className="font-bold">{t("picker.upload")}</p>
          <p className="max-w-xs text-sm text-soft">{t("picker.uploadHint")}</p>
          <span className="mt-1 rounded-full bg-sunken px-3 py-1 text-xs font-bold text-soft">{t("common.planned")}</span>
        </div>
      )}
      <span className="sr-only"><Pictogram id={value} /></span>
    </div>
  );
}
