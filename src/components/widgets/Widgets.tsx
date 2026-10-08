"use client";
import Link from "next/link";
import type { CSSProperties, JSX } from "react";
import { Cake, Check, GraduationCap, Heart, Play, CalendarHeart } from "lucide-react";
import type { WidgetId } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useNow } from "@/lib/useNow";
import { useToday } from "@/lib/useToday";
import { usePhotoPlaylist } from "@/lib/state/photos";
import { upcomingDates } from "@/lib/dates-important";
import { sameDay, daysUntil } from "@/lib/dates";
import { Panel } from "../ui/Panel";
import { Avatar, AvatarStack, ColorRail } from "../ui/Avatar";
import { WeatherIcon } from "../ui/WeatherIcon";
import { Pictogram } from "../ui/Pictogram";
import { Photo } from "../ui/PhotoPlaceholder";
import { RewardAmount } from "../ui/RewardAmount";
import { cn } from "../ui/cn";
import { HomeWidget } from "../home/HomeControl";
import { BirthdaysCompact } from "../birthdays/Birthdays";

// ── Clock ───────────────────────────────────────────────────────────────────
export function BigClock({ size = "md" }: { size?: "md" | "xl" }) {
  const now = useNow(1000);
  const { fmt } = useI18n();
  return (
    <div>
      <p className={cn("num font-display font-semibold leading-[0.85] tracking-[-0.04em]", size === "xl" ? "text-[clamp(4.5rem,6vw,7.25rem)]" : "text-6xl")}>
        {fmt.clock(now)}<span className="ml-2 text-[0.35em] tracking-normal text-soft">{fmt.meridiem(now)}</span>
      </p>
      <p className={cn("mt-3 font-bold", size === "xl" ? "text-2xl" : "text-lg")}>{fmt.dateLong(now)}</p>
    </div>
  );
}
function ClockWidget() {
  return <Panel><BigClock /></Panel>;
}

// ── Weather ─────────────────────────────────────────────────────────────────
export function WeatherNow({ large }: { large?: boolean }) {
  const today = useToday();
  const { t, fmt } = useI18n();
  const w = useStore().data.weather;
  if (!w) return null;
  return (
    <div className="flex items-center gap-4">
      <WeatherIcon sky={w.sky} className={large ? "h-16 w-16" : "h-12 w-12"} strokeWidth={1.5} />
      <div>
        <p className={cn("num font-display font-semibold leading-none", large ? "text-5xl" : "text-4xl")}>{w.now}°</p>
        <p className={cn("text-soft", large ? "text-lg" : "text-sm")}>{t(`sky.${w.sky}`)}, {t("weather.range", { high: w.high, low: w.low })}</p>
      </div>
      <span className="sr-only">{fmt.dateLong(today)}</span>
    </div>
  );
}
function WeatherWidget() {
  const { t, fmt } = useI18n();
  const weather = useStore().data.weather;
  if (!weather) return <Panel title={t("widgets.weather")}><p className="text-soft">{t("weather.none")}</p></Panel>;
  return (
    <Panel title={t("widgets.weather")} action={<span className="text-sm text-soft">{weather.place}</span>}>
      <WeatherNow />
      <div className="mt-4 grid grid-cols-4 gap-1.5">
        {weather.days.map((d) => (
          <div key={d.date.toISOString()} className="flex flex-col items-center gap-1 rounded-tile bg-sunken py-2 text-sm">
            <span className="font-bold">{fmt.weekday(d.date)}</span>
            <WeatherIcon sky={d.sky} className="h-5 w-5" strokeWidth={2} />
            <span className="num">{d.high}°<span className="text-soft"> {d.low}°</span></span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ── Today agenda ────────────────────────────────────────────────────────────
function AgendaWidget() {
  const today = useToday();
  const { t, tx, fmt } = useI18n();
  const now = useNow();
  const { eventsOn, getMember } = useStore();
  const events = eventsOn(today).filter((e) => !e.background);
  const rest = events.filter((e) => e.allDay || e.end > now);
  return (
    <Panel title={t("widgets.agenda")} href="/calendar">
      {rest.length === 0 ? <p className="text-soft">{t("home.nothingLeft")}</p> : (
        <ol className="flex flex-col gap-2.5">
          {rest.map((e) => {
            const ms = e.memberIds.flatMap((id) => getMember(id) ?? []);
            return (
              <li key={e.id} className="flex items-stretch gap-3">
                <span className="num w-14 shrink-0 pt-0.5 text-sm text-soft">{e.allDay ? t("common.allDay") : fmt.time(e.start)}</span>
                <ColorRail colors={ms.length ? ms.map((m) => m.color) : []} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-snug">{tx(e.title)}</span>
                  {e.location && <span className="block text-sm text-soft">{e.location}</span>}
                </span>
                {ms.length > 0 && <AvatarStack members={ms} />}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

// ── Upcoming ────────────────────────────────────────────────────────────────
export function UpcomingList({ limit = 6 }: { limit?: number }) {
  const today = useToday();
  const { tx, fmt } = useI18n();
  const { upcoming, getMember } = useStore();
  const items = upcoming(today, 14, limit, { afterToday: true });
  let last = "";
  return (
    <ol className="flex flex-col gap-2">
      {items.map((e) => {
        const day = fmt.relDay(e.start);
        const head = day !== last ? (last = day) : null;
        const ms = e.memberIds.flatMap((id) => getMember(id) ?? []);
        return (
          <li key={e.id}>
            {head && <p className="mb-1 mt-2 text-sm font-bold text-soft first:mt-0">{head}, {fmt.dateMedium(e.start)}</p>}
            <div className="flex items-center gap-3">
              <ColorRail colors={ms.map((m) => m.color)} className="h-8 self-center" />
              <span className="min-w-0 flex-1 truncate font-bold">{tx(e.title)}</span>
              <span className="num text-sm text-soft">{e.allDay ? "" : fmt.time(e.start)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
function UpcomingWidget() {
  const { t } = useI18n();
  return <Panel title={t("widgets.upcoming")} href="/calendar"><UpcomingList /></Panel>;
}

// ── Chores ──────────────────────────────────────────────────────────────────
function ChoresWidget() {
  const { t, tx } = useI18n();
  const { isDone, toggleTaskItem, choresOn, getMember, routineDay } = useStore();
  const chores = choresOn(routineDay);
  return (
    <Panel title={t("widgets.chores")} href="/routines">
      <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {chores.map((c) => {
          const m = getMember(c.memberId);
          const done = isDone(c.item.id);
          return (
            <li key={c.id} style={{ "--m": m?.color ?? "rgb(var(--soft))" } as CSSProperties}>
              <button onClick={() => toggleTaskItem(c.memberId, c.item)} className="flex w-full items-center gap-3 rounded-tile py-1 text-left">
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-tile", done ? "m-bg text-white" : "tint m-text")}>
                  {done ? <Check size={20} strokeWidth={3} /> : <Pictogram id={c.item.pictogram} className="h-5 w-5" strokeWidth={2} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-bold leading-tight", done && "text-soft line-through")}>{tx(c.item.label)}</span>
                  <span className="text-sm text-soft">{m?.name ?? t("common.anyone")}</span>
                </span>
                {c.item.value.kind === "extra" && <RewardAmount points={c.item.value.points} plus className="text-sm" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// ── Routines summary (kids) ─────────────────────────────────────────────────
function RoutinesWidget() {
  const { t } = useI18n();
  const { isDone, children, routineFor, routineDay: today, periodAt } = useStore();
  const period = periodAt();
  return (
    <Panel title={t("widgets.routines")} href="/routines">
      <div className="flex flex-col gap-3">
        {children().map((m) => {
          const r = routineFor(m.id, period, today);
          const done = r ? r.items.filter((i) => isDone(i.id)).length : 0;
          return (
            <Link key={m.id} href={`/kids/${m.id}`} style={{ "--m": m.color } as CSSProperties} className="flex items-center gap-3 rounded-card tint p-3">
              <Avatar member={m} size="sm" />
              <span className="font-bold">{m.name}</span>
              <span className="ml-auto flex gap-1">
                {r?.items.map((i) => <span key={i.id} className={cn("h-2.5 w-2.5 rounded-full", isDone(i.id) ? "m-bg" : "bg-surface")} />)}
              </span>
              <span className="num text-sm text-soft">{t("common.ofTotal", { done, total: r?.items.length ?? 0 })}</span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Meals ───────────────────────────────────────────────────────────────────
function MealsWidget() {
  const today = useToday();
  const { t, tx, fmt } = useI18n();
  const { data, getMember } = useStore();
  const tonight = data.meals.find((m) => sameDay(m.date, today));
  const next = data.meals.filter((m) => m.date > today).slice(0, 2);
  const cook = getMember(tonight?.cookId);
  return (
    <Panel title={t("widgets.meals")} href="/meals">
      {!tonight && <p className="text-soft">{t("meals.empty")}</p>}
      {tonight && (
        <div>
          <p className="text-sm font-bold text-soft">{t("meals.tonight")}</p>
          <p className="font-display text-2xl font-semibold leading-tight">{tx(tonight.dinner)}</p>
          {cook && <p className="mt-1 flex items-center gap-2 text-sm text-soft"><Avatar member={cook} size="xs" />{t("meals.cooks", { name: cook.name })}</p>}
        </div>
      )}
      {next.length > 0 && <ul className="mt-4 flex flex-col gap-1.5 border-t border-line pt-3 text-[15px]">
        {next.map((m) => (
          <li key={m.day} className="flex gap-3"><span className="w-10 font-bold text-soft">{fmt.weekday(m.date)}</span>{tx(m.dinner)}</li>
        ))}
      </ul>}
    </Panel>
  );
}

// ── Shopping ────────────────────────────────────────────────────────────────
function ShoppingWidget() {
  const { t, tx } = useI18n();
  const { shopping, toggleShopping, shoppingLists } = useStore();
  const list = shoppingLists[0];
  const open = shopping.filter((s) => s.listId === list?.id && !s.done);
  return (
    <Panel title={t("widgets.shopping")} href="/shopping" action={<span className="num text-sm text-soft">{t("shopping.items", { n: open.length })}</span>}>
      <ul className="flex flex-col gap-1">
        {open.slice(0, 6).map((s) => (
          <li key={s.id}>
            <button onClick={() => toggleShopping(s.id)} className="flex w-full items-center gap-3 py-1 text-left">
              <span className="h-5 w-5 shrink-0 rounded-md border-2 border-line" />
              <span className="truncate">{tx(s.name)}</span>
            </button>
          </li>
        ))}
      </ul>
      {open.length > 6 && <Link href="/shopping" className="mt-2 inline-block text-sm font-bold text-soft">+{open.length - 6}</Link>}
    </Panel>
  );
}

// ── Dates ───────────────────────────────────────────────────────────────────
const DATE_ICON = { birthday: Cake, anniversary: Heart, school: GraduationCap, other: CalendarHeart };
export function DatesList({ limit = 4, large }: { limit?: number; large?: boolean }) {
  const today = useToday();
  const { t, tx, fmt } = useI18n();
  const { data, getMember } = useStore();
  const dates = upcomingDates(data.dates, today);
  if (!dates.length) return <p className="text-soft">{t("dates.none")}</p>;
  return (
    <ul className={cn("flex flex-col", large ? "gap-3" : "gap-2.5")}>
      {dates.slice(0, limit).map((d) => {
        const I = DATE_ICON[d.kind];
        const m = getMember(d.memberId);
        const n = daysUntil(today, d.next);
        return (
          <li key={d.id} className="flex items-center gap-3" style={{ "--m": m?.color ?? "rgb(var(--soft))" } as CSSProperties}>
            <span className={cn("grid shrink-0 place-items-center rounded-full tint m-text", large ? "h-12 w-12" : "h-9 w-9")}><I size={large ? 22 : 17} strokeWidth={2} /></span>
            <span className="min-w-0 flex-1">
              <span className={cn("block font-bold leading-tight", large && "text-lg")}>{tx(d.title)}</span>
              <span className="text-sm text-soft">
                {d.turns ? (d.kind === "anniversary" ? t("dates.years", { n: d.turns }) : t("dates.turns", { n: d.turns })) : t(`dates.${d.kind}`)}, {fmt.dateMedium(d.next)}
              </span>
            </span>
            <span className={cn("num shrink-0 whitespace-nowrap rounded-full bg-sunken px-2.5 py-1 text-sm font-bold", n <= 7 && "tint-strong")}>{fmt.relDay(d.next, today)}</span>
          </li>
        );
      })}
    </ul>
  );
}
function DatesWidget() {
  const { t } = useI18n();
  return <Panel title={t("widgets.dates")}><DatesList /></Panel>;
}

function BirthdaysWidget() {
  const { t } = useI18n();
  return <Panel title={t("widgets.birthdays")} href="/calendar?view=birthdays"><BirthdaysCompact /></Panel>;
}

// ── Photos ──────────────────────────────────────────────────────────────────
function PhotosWidget() {
  const { t, fmt } = useI18n();
  const now = useNow(20_000);
  const photos = usePhotoPlaylist();
  const { albums } = useStore();
  const p = photos.length ? photos[Math.floor(now.getTime() / 20_000) % photos.length] : undefined;
  const album = p && albums.find((a) => a.id === p.albumId);
  return (
    <section className="relative min-h-[220px] overflow-hidden rounded-panel bg-sunken">
      {p ? <Photo photo={p} className="absolute inset-0 h-full w-full" /> : <p className="p-5 text-soft">{t("photos.none")}</p>}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/45 to-transparent p-4 text-white">
        <div className="text-sm">{p && <><p className="font-bold">{p.place}</p><p className="opacity-85">{p.takenAt && `${fmt.dateMedium(p.takenAt)}, `}{album?.name}</p></>}</div>
        <Link href="/screensaver" aria-label={t("photos.start")} className="grid h-10 w-10 place-items-center rounded-full bg-white/25 backdrop-blur"><Play size={18} fill="currentColor" /></Link>
      </div>
    </section>
  );
}

export const WIDGETS: Record<WidgetId, () => JSX.Element> = {
  clock: ClockWidget, weather: WeatherWidget, agenda: AgendaWidget, upcoming: UpcomingWidget, routines: RoutinesWidget,
  chores: ChoresWidget, meals: MealsWidget, shopping: ShoppingWidget, dates: DatesWidget, birthdays: BirthdaysWidget, photos: PhotosWidget, home: HomeWidget,
};
