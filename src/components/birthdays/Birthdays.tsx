"use client";
import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import type { Member } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useToday } from "@/lib/useToday";
import { collectBirthdays, initials, upcomingBirthdays, wheelRings, type UpcomingBirthday } from "@/lib/birthdays";
import { Avatar } from "../ui/Avatar";
import { cn } from "../ui/cn";
import { useOverlay } from "../ui/useOverlay";

/** Within this many days a birthday counts as "soon". */
const SOON_DAYS = 30;
/** From this many days on, children see the sleeps until their birthday as dots. */
const SLEEPS_FROM = 14;
const NEUTRAL = "rgb(var(--soft))";
/** A contact without a colour of its own: quiet beside the family (D61). */
export const CONTACT_MUTED = "rgb(var(--contact))";

/** Everyone on the birthday wheel, soonest first (§12, D46). `filter` keeps people and whatever belongs to them. */
function useBirthdays(filter?: Set<string>) {
  const today = useToday();
  const { tx } = useI18n();
  const { data } = useStore();
  return useMemo(() => {
    const all = upcomingBirthdays(collectBirthdays(data.members, data.dates, data.birthdays, tx), today);
    return filter ? all.filter((b) => !b.memberId || filter.has(b.memberId)) : all;
  }, [data.members, data.dates, data.birthdays, tx, today, filter]);
}

/** The selected birthday: the one picked, or the next one. */
function useSelection(list: UpcomingBirthday[]) {
  const [picked, setPicked] = useState<string | null>(null);
  const selected = list.find((b) => b.id === picked) ?? list[0];
  return [selected, setPicked] as const;
}

function useWords() {
  const { t, fmt } = useI18n();
  return {
    /** "Today", "Tomorrow", "12 days". */
    count: (b: UpcomingBirthday) => (b.days === 0 ? t("common.today") : b.days === 1 ? t("common.tomorrow") : t("birthdays.days", { n: b.days })),
    /** "in 12 days" while it's close, otherwise the date. */
    when: (b: UpcomingBirthday) => (b.days === 0 ? t("common.today") : b.days === 1 ? t("common.tomorrow") : b.days <= 31 ? t("common.inDays", { n: b.days }) : fmt.dateMedium(b.next)),
    turns: (b: UpcomingBirthday) => (b.turns ? t(b.days === 0 ? "birthdays.turnsToday" : "birthdays.turns", { n: b.turns }) : ""),
    /** "5 months, 6 days". */
    span: (b: UpcomingBirthday) => {
      const m = b.months === 1 ? t("birthdays.oneMonth") : t("birthdays.months", { n: b.months });
      const d = b.restDays === 1 ? t("birthdays.oneDay") : t("birthdays.days", { n: b.restDays });
      return b.restDays ? `${m}, ${d}` : m;
    },
    sleeps: (n: number) => (n === 1 ? t("birthdays.oneSleep") : t("birthdays.sleeps", { n })),
  };
}

/** A contact has its own colour or the muted one; anyone else takes the colour of the person they are or belong to. */
const colorOf = (b: { origin: UpcomingBirthday["origin"]; memberId?: string; color?: string }, getMember: (id?: string) => Member | undefined) =>
  b.origin === "contact" ? b.color ?? CONTACT_MUTED : getMember(b.memberId)?.color ?? NEUTRAL;

/** A person's own picture, a contact's uploaded one; anyone else gets their initials in their colour. */
function BirthdayAvatar({ b, size = "md" }: { b: UpcomingBirthday; size?: "sm" | "md" }) {
  const { getMember } = useStore();
  const m = getMember(b.memberId);
  if (b.origin === "member" && m) return <Avatar member={m} size={size} />;
  if (b.photo) return <img src={b.photo} alt="" className={cn("shrink-0 rounded-full object-cover", size === "sm" ? "h-8 w-8" : "h-11 w-11")} />;
  return (
    <span style={{ "--m": colorOf(b, getMember) } as CSSProperties}
      className={cn("tint-strong m-text inline-grid shrink-0 place-items-center rounded-full font-display font-bold leading-none", size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-base")}>
      {initials(b.name)}
    </span>
  );
}

// ── The wheel ───────────────────────────────────────────────────────────────
const C = 200;
const point = (f: number, r: number) => {
  const a = f * 2 * Math.PI - Math.PI / 2;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};

/**
 * The year as a circle, January at the top, each birthday a dot (D46). A tap
 * on a dot selects it; the arc runs from today to the selected birthday.
 */
function BirthdayWheel({ list, selected, onSelect, compact = false }: {
  list: UpcomingBirthday[]; selected?: UpcomingBirthday; onSelect: (id: string) => void; compact?: boolean;
}) {
  const today = useToday();
  const { t, fmt } = useI18n();
  const { getMember } = useStore();
  const words = useWords();
  // Clip-path ids for the pictures: unique per wheel, and plain enough for url(#…).
  const uid = useId();
  const clipId = (id: string) => `bd${uid}${id}`.replace(/[^\w-]/g, "_");
  const R = compact ? 172 : 160, dot = compact ? 22 : 17;
  // Neighbours may overlap a little, like stacked chips; only close ones move inwards.
  const rings = wheelRings(list, (1.3 * dot) / (2 * Math.PI * R));
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearLength = (new Date(today.getFullYear() + 1, 0, 1).getTime() - yearStart.getTime()) / 86_400_000;
  const dayFraction = (d: Date) => (Math.round((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86_400_000) + 0.5) / yearLength;
  const todayF = dayFraction(today);
  const tone = selected ? colorOf(selected, getMember) : NEUTRAL;
  const key = (id: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
    }
  };
  // The selected dot is drawn last, so its ring sits on top.
  const ordered = [...list].sort((a, b) => Number(a.id === selected?.id) - Number(b.id === selected?.id));
  const [tx, ty] = point(todayF, R);

  return (
    <svg viewBox={compact ? "-2 -2 404 404" : "-26 -26 452 452"} role="group" aria-label={t("birthdays.wheel")} className="h-auto w-full overflow-visible">
      <circle cx={C} cy={C} r={R} fill="none" stroke="rgb(var(--line))" strokeWidth={2} />
      {!compact && Array.from({ length: 12 }, (_, i) => {
        const f0 = dayFraction(new Date(today.getFullYear(), i, 1)) - 0.5 / yearLength;
        const [x1, y1] = point(f0, R - 7), [x2, y2] = point(f0, R + 7);
        const [lx, ly] = point(dayFraction(new Date(today.getFullYear(), i, 15)), R + 34);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgb(var(--line))" strokeWidth={2} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill={i === today.getMonth() ? "rgb(var(--ink))" : "rgb(var(--soft))"}
              className="text-[12px] font-bold uppercase tracking-wider">{fmt.monthShort(new Date(2024, i, 15))}</text>
          </g>
        );
      })}
      {selected && selected.days > 0 && (() => {
        const [bx, by] = point(selected.yearFraction, R);
        return <path d={`M ${tx} ${ty} A ${R} ${R} 0 ${selected.days / yearLength > 0.5 ? 1 : 0} 1 ${bx} ${by}`} fill="none" stroke={tone} strokeWidth={6} strokeLinecap="round" />;
      })()}
      <circle cx={tx} cy={ty} r={5} fill="rgb(var(--ink))"><title>{t("common.today")}</title></circle>
      {!compact && (() => {
        const [px, py] = point(todayF, R + 14);
        return <path d="M 0 -6 L 6 5 L -6 5 Z" fill="rgb(var(--ink))" transform={`translate(${px} ${py}) rotate(${todayF * 360 + 180})`} />;
      })()}
      {ordered.map((b) => {
        const [x, y] = point(b.yearFraction, R - (rings.get(b.id) ?? 0) * (2 * dot + 2));
        const on = b.id === selected?.id;
        const color = colorOf(b, getMember);
        const m = b.origin === "member" ? getMember(b.memberId) : undefined;
        const emoji = m?.avatar.kind === "emoji" ? m.avatar.value : null;
        return (
          <g key={b.id} role="button" tabIndex={0} aria-pressed={on} aria-label={`${b.name}, ${fmt.dateLong(b.next)}, ${words.when(b)}`}
            onClick={() => onSelect(b.id)} onKeyDown={key(b.id)} className="cursor-pointer outline-none [&:focus-visible>circle:first-child]:stroke-[rgb(var(--ink))]">
            <circle cx={x} cy={y} r={dot + 6} fill="none" strokeWidth={3} stroke={on ? color : "transparent"} />
            <circle cx={x} cy={y} r={dot} fill={color} stroke="rgb(var(--surface))" strokeWidth={3} />
            {b.photo ? (
              <>
                <clipPath id={clipId(b.id)}><circle cx={x} cy={y} r={dot - 1.5} /></clipPath>
                <image href={b.photo} x={x - dot} y={y - dot} width={2 * dot} height={2 * dot} preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${clipId(b.id)})`} className="pointer-events-none" />
              </>
            ) : (
              <text x={x} y={y + 1} textAnchor="middle" dominantBaseline="middle" fill="#fff"
                className={cn("pointer-events-none font-display font-bold", emoji ? (compact ? "text-[22px]" : "text-[17px]") : compact ? "text-[15px]" : "text-[12px]")}>
                {emoji ?? initials(b.name)}
              </text>
            )}
          </g>
        );
      })}
      {selected && !compact && <WheelCentre b={selected} tone={tone} />}
    </svg>
  );
}

function WheelCentre({ b, tone }: { b: UpcomingBirthday; tone: string }) {
  const { fmt } = useI18n();
  const words = useWords();
  const nameSize = b.name.length > 16 ? 17 : b.name.length > 11 ? 21 : 26;
  const sleeps = b.days > 0 && b.days <= SLEEPS_FROM ? b.days : 0;
  return (
    <g aria-live="polite" className="pointer-events-none">
      <text x={C} y={C - 52} textAnchor="middle" fill="rgb(var(--ink))" className="font-display font-bold" style={{ fontSize: nameSize }}>{b.name}</text>
      {b.turns && <text x={C} y={C - 28} textAnchor="middle" fill={tone} className="text-[15px] font-bold">{words.turns(b)}</text>}
      <text x={C} y={C + 14} textAnchor="middle" fill="rgb(var(--ink))" className="num font-display text-[40px] font-bold">{words.count(b)}</text>
      <text x={C} y={C + 38} textAnchor="middle" fill="rgb(var(--soft))" className="text-[13px]">
        {fmt.dateLong(b.next)}{b.days > 31 ? ` · ${words.span(b)}` : ""}
      </text>
      {sleeps > 0 && (
        <>
          {Array.from({ length: sleeps }, (_, i) => <circle key={i} cx={C - ((sleeps - 1) * 19) / 2 + i * 19} cy={C + 62} r={6} fill="rgb(var(--star))" />)}
          <text x={C} y={C + 86} textAnchor="middle" fill="rgb(var(--soft))" className="text-[12px]">{words.sleeps(sleeps)}</text>
        </>
      )}
    </g>
  );
}

// ── Calendar → Birthdays ────────────────────────────────────────────────────
/** The wheel with the list beside it. On the wall it fills the screen, and the list scrolls on its own. */
export function BirthdaysView({ filter, wall = false }: { filter?: Set<string>; wall?: boolean }) {
  const { t } = useI18n();
  const list = useBirthdays(filter);
  const [selected, select] = useSelection(list);
  if (!list.length) return <p className="max-w-prose rounded-card bg-surface p-5 text-soft">{t("birthdays.none")}</p>;
  const soon = list.filter((b) => b.days <= SOON_DAYS), later = list.filter((b) => b.days > SOON_DAYS);
  return (
    <div className={cn("grid gap-5", wall ? "min-h-0 flex-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : "items-start xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]")}>
      <section className={cn("flex flex-col items-center gap-2 rounded-panel bg-surface p-4 md:p-6", wall && "min-h-0 justify-center")}>
        <div className={cn("w-full", wall ? "max-w-[min(100%,calc(100dvh-220px))]" : "max-w-[540px]")}><BirthdayWheel list={list} selected={selected} onSelect={select} /></div>
      </section>
      <div className={cn("flex flex-col gap-5", wall && "no-scrollbar min-h-0 overflow-y-auto")}>
        {soon.length > 0 && <BirthdayGroup title={t("birthdays.soon")} list={soon} selected={selected} onSelect={select} />}
        {later.length > 0 && <BirthdayGroup title={t("birthdays.later")} list={later} selected={selected} onSelect={select} />}
      </div>
    </div>
  );
}

function BirthdayGroup({ title, list, selected, onSelect }: { title: string; list: UpcomingBirthday[]; selected?: UpcomingBirthday; onSelect: (id: string) => void }) {
  const { t, fmt } = useI18n();
  const { getMember } = useStore();
  const words = useWords();
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wider text-soft">{title} ({list.length})</h2>
      <ul className="flex flex-col gap-1 rounded-card bg-surface p-2">
        {list.map((b) => (
          <li key={b.id}>
            <button onClick={() => onSelect(b.id)} aria-current={b.id === selected?.id} style={{ "--m": colorOf(b, getMember) } as CSSProperties}
              className={cn("flex w-full items-center gap-3 rounded-tile p-2 text-left hover:bg-sunken", b.id === selected?.id && "tint hover:bg-[unset]")}>
              <BirthdayAvatar b={b} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold">{b.name}</span>
                  {b.origin === "member" && <span className="shrink-0 rounded-full bg-sunken px-2 py-0.5 text-xs font-bold text-soft">{t("birthdays.family")}</span>}
                </span>
                <span className="block truncate text-sm text-soft">{fmt.dateLong(b.next)}{b.turns ? ` · ${words.turns(b)}` : ""}</span>
              </span>
              <span className="num shrink-0 font-display text-lg font-semibold">{words.count(b)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Wall tile and home widget ───────────────────────────────────────────────
/** A small wheel beside the selected (at first: the next) birthday, then the three after it. */
export function BirthdaysCompact({ large = false }: { large?: boolean }) {
  const { t } = useI18n();
  const { getMember } = useStore();
  const words = useWords();
  const list = useBirthdays();
  const [selected, select] = useSelection(list);
  if (!list.length || !selected) return <p className="text-soft">{t("birthdays.none")}</p>;
  const rest = list.filter((b) => b.id !== selected.id).slice(0, 3);
  const sleeps = selected.days > 0 && selected.days <= SLEEPS_FROM ? selected.days : 0;
  return (
    // In a narrow slot (the wall's top strip) the wheel shrinks and the next birthday stays readable.
    <div className="bday-compact flex flex-col gap-3">
      <div className={cn("bday-compact-grid grid items-center gap-4", large ? "grid-cols-[150px_minmax(0,1fr)]" : "grid-cols-[120px_minmax(0,1fr)]")}>
        <div className="bday-compact-wheel"><BirthdayWheel list={list} selected={selected} onSelect={select} compact /></div>
        <div className="min-w-0" aria-live="polite">
          <p className="bday-compact-label text-xs font-bold uppercase tracking-wider text-soft">{t("birthdays.next")}</p>
          <p className={cn("bday-compact-name font-display font-bold leading-tight", large ? "text-2xl" : "text-xl")}>{selected.name}</p>
          {selected.turns && <p className="bday-compact-turns font-bold" style={{ color: colorOf(selected, getMember) }}>{words.turns(selected)}</p>}
          <p className={cn("bday-compact-when num font-display font-semibold", large ? "text-xl" : "text-lg")}>{words.when(selected)}</p>
          {sleeps > 0 && (
            <p className="bday-compact-sleeps mt-1 flex flex-wrap gap-1" role="img" aria-label={words.sleeps(sleeps)} title={words.sleeps(sleeps)}>
              {Array.from({ length: sleeps }, (_, i) => <span key={i} className="h-3 w-3 rounded-full bg-star" />)}
            </p>
          )}
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="bday-compact-rest flex flex-col gap-2 border-t border-line pt-3">
          {rest.map((b) => (
            <li key={b.id}>
              <button onClick={() => select(b.id)} className="flex w-full items-center gap-2.5 text-left" style={{ "--m": colorOf(b, getMember) } as CSSProperties}>
                <span className="m-bg h-3 w-3 shrink-0 rounded-full" />
                <span className={cn("min-w-0 flex-1 truncate", large && "text-lg")}>{b.name}</span>
                <span className="num shrink-0 text-soft">{words.when(b)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The wall display's full-screen birthday wheel, opened from the button above the lanes (D46, D57). */
export function BirthdaysFullscreen({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  // Not inert underneath: the photo frame comes up over it and must still wake on a touch.
  useOverlay(true, { root, onClose, layer: 40, inert: false });
  return (
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("birthdays.title")} className="fixed inset-0 z-40 flex flex-col gap-5 overflow-hidden bg-bg p-6 outline-none max-lg:overflow-y-auto">
      <header className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="font-display text-4xl font-bold tracking-tight">{t("birthdays.title")}</h1>
        <button onClick={onClose} className="flex h-16 items-center gap-3 rounded-full bg-surface px-6 text-lg font-bold"><X size={26} />{t("common.close")}</button>
      </header>
      <BirthdaysView wall />
    </div>
  );
}
