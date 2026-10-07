"use client";
import { useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Cloud, Globe, Lock, MapPin, Plus, Rss, Smartphone } from "lucide-react";
import type { CalendarEvent, CalendarProvider } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useNow } from "@/lib/useNow";
import { useToday } from "@/lib/useToday";
import { getMember, getMembers } from "@/lib/services/household";
import { eventsOn, getSource, getSources } from "@/lib/services/calendar";
import { addDays, monthGrid, sameDay, startOfWeek, startOfDay } from "@/lib/dates";
import { Button, IconButton } from "../ui/Button";
import { Segmented, Field, inputCls } from "../ui/Segmented";
import { MemberFilter } from "../ui/MemberFilter";
import { Avatar, AvatarStack, ColorRail } from "../ui/Avatar";
import { Dialog } from "../ui/Dialog";
import { cn } from "../ui/cn";
import { toggled } from "@/lib/sets";

type View = "month" | "week" | "agenda";

export const PROVIDER_ICON: Record<CalendarProvider, typeof Cloud> = { caldav: Cloud, google: Globe, ics: Rss, local: Smartphone };

/** Colour for an event: its single person, or neutral for whole-family events. */
const evStyle = (e: CalendarEvent) => ({ "--m": e.memberIds.length ? getMember(e.memberIds[0])!.color : "rgb(var(--soft))" } as CSSProperties);
const colors = (e: CalendarEvent) => e.memberIds.map((id) => getMember(id)!.color);

export function CalendarScreen() {
  const today = useToday();
  const { t, fmt, region } = useI18n();
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState(() => new Set(getMembers().map((m) => m.id)));
  const ws = region.weekStartsOn;

  const step = (dir: 1 | -1) => setCursor((c) => view === "month" ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDays(c, dir * (view === "week" ? 7 : 14)));
  const toggle = (id: string) => setFilter((f) => toggled(f, id));

  const title = view === "month" ? fmt.monthYear(cursor)
    : `${fmt.dateMedium(startOfWeek(cursor, ws))} – ${fmt.dateMedium(addDays(startOfWeek(cursor, ws), 6))}`;

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <div className="min-w-0 flex-1">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="mr-auto font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
          <div className="flex items-center gap-1">
            <IconButton label={t("calendar.previous")} onClick={() => step(-1)}><ChevronLeft /></IconButton>
            <Button size="sm" variant="outline" onClick={() => setCursor(today)}>{t("calendar.today")}</Button>
            <IconButton label={t("calendar.next")} onClick={() => step(1)}><ChevronRight /></IconButton>
          </div>
          <Segmented value={view} onChange={setView} label="View" options={[
            { value: "month", label: t("calendar.month") }, { value: "week", label: t("calendar.week") }, { value: "agenda", label: t("calendar.agenda") },
          ]} />
          <Button variant="primary" onClick={() => setCreating(true)}><Plus size={18} /><span className="max-sm:hidden">{t("calendar.newEvent")}</span></Button>
        </header>
        <div className="mb-4 lg:hidden"><MemberFilter members={getMembers()} selected={filter} onToggle={toggle} size="sm" /></div>

        {view === "month" && <MonthView cursor={cursor} filter={filter} onSelect={setSelected} />}
        {view === "week" && <WeekView cursor={cursor} filter={filter} onSelect={setSelected} />}
        {view === "agenda" && <AgendaView from={view === "agenda" && sameDay(cursor, today) ? new Date() : cursor} filter={filter} onSelect={setSelected} />}
      </div>

      <aside className="hidden w-[280px] shrink-0 flex-col gap-6 lg:flex">
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">{t("calendar.who")}</h2>
          <div className="[&>div]:flex-col [&>div]:items-stretch"><MemberFilter members={getMembers()} selected={filter} onToggle={toggle} /></div>
        </section>
        <SourceList />
      </aside>

      <EventDialog event={selected} onClose={() => setSelected(null)} />
      <NewEventDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function SourceList() {
  const { t, tx } = useI18n();
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold">{t("calendar.sources")}</h2>
      <ul className="flex flex-col gap-2.5">
        {getSources().map((s) => {
          const I = PROVIDER_ICON[s.provider];
          return (
            <li key={s.id} className="flex items-center gap-3 rounded-tile bg-surface p-3">
              <I size={18} className="shrink-0 text-soft" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold leading-tight">{tx(s.name)}</span>
                <span className="block truncate text-xs text-soft">{t(`providers.${s.provider}`)}{s.account ? `, ${s.account}` : ""}</span>
              </span>
              {s.readOnly && <Lock size={14} className="text-soft" aria-label={t("calendar.readOnly")} />}
              {s.defaultMemberIds.length > 0 && <AvatarStack members={s.defaultMemberIds.map((id) => getMember(id)!)} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Month ───────────────────────────────────────────────────────────────────
function MonthView({ cursor, filter, onSelect }: { cursor: Date; filter: Set<string>; onSelect: (e: CalendarEvent) => void }) {
  const today = useToday();
  const { t, tx, fmt, region, weekOrder, weekdayName } = useI18n();
  const days = monthGrid(cursor, region.weekStartsOn);
  const [picked, setPicked] = useState<Date>(today);
  return (
    <>
      <div className="overflow-hidden rounded-panel bg-surface">
        <div className="grid grid-cols-7 border-b border-line">
          {weekOrder.map((d) => <div key={d} className="py-2.5 text-center text-sm font-bold text-soft">{weekdayName(d, "short")}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const evs = eventsOn(d, filter).filter((e) => !e.background);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = sameDay(d, today);
            return (
              <button key={d.toISOString()} onClick={() => setPicked(d)}
                className={cn("flex min-h-[64px] flex-col gap-1 border-b border-r border-line p-1.5 text-left md:min-h-[118px]",
                  !inMonth && "bg-sunken/50 text-soft", sameDay(d, picked) && "max-md:bg-sunken")}>
                <span className={cn("num grid h-7 w-7 place-items-center rounded-full text-sm font-bold", isToday && "bg-ink text-surface")}>{fmt.dayNum(d)}</span>
                <span className="flex flex-wrap gap-1 md:hidden">
                  {evs.slice(0, 4).map((e) => <span key={e.id} style={evStyle(e)} className="m-bg h-1.5 w-1.5 rounded-full" />)}
                </span>
                <span className="hidden flex-col gap-1 md:flex">
                  {evs.slice(0, 3).map((e) => (
                    <span key={e.id} role="button" tabIndex={0} onClick={(ev) => { ev.stopPropagation(); onSelect(e); }} style={evStyle(e)}
                      className={cn("truncate rounded-md px-1.5 py-0.5 text-xs font-bold", e.memberIds.length ? "tint m-text" : "bg-sunken")}>
                      {!e.allDay && <span className="num font-normal opacity-80">{fmt.time(e.start)} </span>}{tx(e.title)}
                    </span>
                  ))}
                  {evs.length > 3 && <span className="px-1.5 text-xs text-soft">{t("calendar.more", { n: evs.length - 3 })}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-4 md:hidden">
        <p className="mb-2 font-bold">{fmt.dateLong(picked)}</p>
        <DayList day={picked} filter={filter} onSelect={onSelect} />
      </div>
    </>
  );
}

// ── Week ────────────────────────────────────────────────────────────────────
const H0 = 7, H1 = 22, HOUR = 56;

function WeekView({ cursor, filter, onSelect }: { cursor: Date; filter: Set<string>; onSelect: (e: CalendarEvent) => void }) {
  const today = useToday();
  const { tx, fmt, region } = useI18n();
  const now = useNow(60_000);
  const start = startOfWeek(cursor, region.weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <>
      {/* Phones: a week is a stack of days */}
      <div className="flex flex-col gap-4 md:hidden">
        {days.map((d) => (
          <section key={d.toISOString()}>
            <p className={cn("mb-1.5 font-bold", sameDay(d, today) ? "text-ink" : "text-soft")}>{fmt.dateLong(d)}</p>
            <DayList day={d} filter={filter} onSelect={onSelect} />
          </section>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-panel bg-surface md:block">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-line">
          <span />
          {days.map((d) => {
            const allDay = eventsOn(d, filter).filter((e) => e.allDay);
            return (
              <div key={d.toISOString()} className="min-w-0 border-l border-line p-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-soft">{fmt.weekday(d)}</span>
                  <span className={cn("num grid h-8 min-w-8 place-items-center rounded-full px-1 font-display text-xl font-semibold", sameDay(d, today) && "bg-ink text-surface")}>{fmt.dayNum(d)}</span>
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  {allDay.map((e) => (
                    <button key={e.id} onClick={() => onSelect(e)} style={evStyle(e)} className={cn("truncate rounded-md px-1.5 py-0.5 text-left text-xs font-bold", e.memberIds.length ? "tint m-text" : "bg-sunken")}>{tx(e.title)}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="relative max-h-[68vh] overflow-y-auto">
          <div className="grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: (H1 - H0) * HOUR }}>
            <div className="relative">
              {Array.from({ length: H1 - H0 }, (_, i) => (
                <span key={i} className="num absolute right-2 -translate-y-1/2 text-xs text-soft" style={{ top: i * HOUR }}>{i ? fmt.time(new Date(2024, 0, 1, H0 + i)) : ""}</span>
              ))}
            </div>
            {days.map((d) => <DayColumn key={d.toISOString()} day={d} filter={filter} onSelect={onSelect} now={now} />)}
          </div>
        </div>
      </div>
    </>
  );
}

function DayColumn({ day, filter, onSelect, now }: { day: Date; filter: Set<string>; onSelect: (e: CalendarEvent) => void; now: Date }) {
  const { tx, fmt } = useI18n();
  const all = eventsOn(day, filter).filter((e) => !e.allDay);
  // School/Kita become thin colour bars at the left edge so they don't crowd real appointments.
  const bg = all.filter((e) => e.background);
  const evs = all.filter((e) => !e.background);
  const inset = bg.length ? bg.length * 7 + 4 : 2;
  // Overlapping events share width only within their own cluster.
  const placed: { e: CalendarEvent; lane: number; n: number }[] = [];
  let cluster: typeof placed = [], lanes: Date[] = [], clusterEnd = 0;
  const flush = () => { cluster.forEach((c) => (c.n = Math.max(1, lanes.length))); placed.push(...cluster); cluster = []; lanes = []; };
  for (const e of [...evs].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    if (cluster.length && e.start.getTime() >= clusterEnd) flush();
    let lane = lanes.findIndex((end) => end <= e.start);
    if (lane < 0) { lane = lanes.length; lanes.push(e.end); } else lanes[lane] = e.end;
    clusterEnd = Math.max(clusterEnd, e.end.getTime());
    cluster.push({ e, lane, n: 1 });
  }
  flush();
  const y = (d: Date) => ((d.getHours() + d.getMinutes() / 60) - H0) * HOUR;
  return (
    <div className="relative border-l border-line" style={{ backgroundImage: `repeating-linear-gradient(to bottom, rgb(var(--line)) 0 1px, transparent 1px ${HOUR}px)` }}>
      {bg.map((e, i) => (
        <button key={e.id} onClick={() => onSelect(e)} title={tx(e.title)} aria-label={tx(e.title)} style={{ ...evStyle(e), top: y(e.start) + 1, height: y(e.end) - y(e.start) - 2, left: 3 + i * 7 }}
          className="m-bg absolute w-[5px] rounded-full opacity-60 hover:opacity-100" />
      ))}
      {placed.map(({ e, lane, n }) => (
        <button key={e.id} onClick={() => onSelect(e)} style={{ ...evStyle(e), top: y(e.start) + 1, height: Math.max(22, y(e.end) - y(e.start) - 2), left: `calc(${inset}px + (100% - ${inset}px) * ${lane / n})`, width: `calc((100% - ${inset}px) / ${n} - 3px)` }}
          className={cn("absolute overflow-hidden rounded-lg px-1.5 py-1 text-left text-xs leading-tight", "tint-strong", "border-l-[3px] m-border !border-l-[var(--m)]")}>
          <span className="block truncate font-bold">{tx(e.title)}</span>
          <span className="num block truncate opacity-75">{fmt.time(e.start)}</span>
        </button>
      ))}
      {sameDay(day, now) && now.getHours() >= H0 && now.getHours() < H1 && (
        <span className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-ink" style={{ top: y(now) }}>
          <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-ink" />
        </span>
      )}
    </div>
  );
}

// ── Agenda ──────────────────────────────────────────────────────────────────
function AgendaView({ from, filter, onSelect }: { from: Date; filter: Set<string>; onSelect: (e: CalendarEvent) => void }) {
  const today = useToday();
  const { fmt } = useI18n();
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(startOfDay(from), i)), [from]);
  return (
    <div className="flex flex-col gap-5">
      {days.map((d) => {
        const evs = eventsOn(d, filter);
        if (!evs.length) return null;
        return (
          <section key={d.toISOString()} className="grid gap-3 md:grid-cols-[180px_1fr]">
            <div className="md:pt-3">
              <p className="font-display text-xl font-semibold">{fmt.relDay(d, today)}</p>
              <p className="text-sm text-soft">{fmt.dateLong(d)}</p>
            </div>
            <DayList day={d} filter={filter} onSelect={onSelect} />
          </section>
        );
      })}
    </div>
  );
}

function DayList({ day, filter, onSelect }: { day: Date; filter: Set<string>; onSelect: (e: CalendarEvent) => void }) {
  const { t, tx, fmt } = useI18n();
  const evs = eventsOn(day, filter);
  if (!evs.length) return <p className="rounded-card bg-surface p-4 text-soft">{t("home.freeDay")}</p>;
  return (
    <ul className="flex flex-col gap-1.5 rounded-card bg-surface p-2">
      {evs.map((e) => {
        const ms = e.memberIds.map((id) => getMember(id)!);
        const S = getSource(e.sourceId);
        const I = S ? PROVIDER_ICON[S.provider] : Cloud;
        return (
          <li key={e.id}>
            <button onClick={() => onSelect(e)} className={cn("flex w-full items-stretch gap-3 rounded-tile p-2 text-left hover:bg-sunken", e.background && "opacity-60")}>
              <span className="num w-[86px] shrink-0 text-sm text-soft">{e.allDay ? t("common.allDay") : `${fmt.time(e.start)}–${fmt.time(e.end)}`}</span>
              <ColorRail colors={colors(e)} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold leading-snug">{tx(e.title)}</span>
                {e.location && <span className="block truncate text-sm text-soft">{e.location}</span>}
              </span>
              <I size={15} className="mt-1 shrink-0 text-soft" aria-hidden />
              {ms.length > 0 && <AvatarStack members={ms} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Dialogs ─────────────────────────────────────────────────────────────────
function EventDialog({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  const { t, tx, fmt } = useI18n();
  if (!event) return null;
  const S = getSource(event.sourceId)!;
  const I = PROVIDER_ICON[S.provider];
  const ms = event.memberIds.map((id) => getMember(id)!);
  return (
    <Dialog open onClose={onClose} title={tx(event.title)}>
      <dl className="flex flex-col gap-4">
        <Row label={t("calendar.when")}>{fmt.dateLong(event.start)}{!event.allDay && `, ${fmt.time(event.start)}–${fmt.time(event.end)}`}</Row>
        {event.location && <Row label={t("calendar.where")}><span className="inline-flex items-center gap-1.5"><MapPin size={16} />{event.location}</span></Row>}
        <Row label={t("calendar.who")}>
          {ms.length ? <span className="flex flex-wrap gap-2">{ms.map((m) => <span key={m.id} className="inline-flex items-center gap-1.5 font-bold"><Avatar member={m} size="xs" />{m.name}</span>)}</span> : t("common.whole")}
        </Row>
        <Row label={t("calendar.source")}>
          <span className="inline-flex items-center gap-2"><I size={16} />{tx(S.name)} <span className="text-soft">({t(`providers.${S.provider}`)})</span>
            {S.readOnly && <span className="inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-xs font-bold"><Lock size={12} />{t("calendar.readOnly")}</span>}
          </span>
        </Row>
      </dl>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[96px_1fr] gap-3"><dt className="text-sm font-bold text-soft">{label}</dt><dd>{children}</dd></div>;
}

function NewEventDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, tx } = useI18n();
  const [who, setWho] = useState(new Set<string>(["lena"]));
  const writable = getSources().filter((s) => !s.readOnly);
  return (
    <Dialog open={open} onClose={onClose} title={t("calendar.newEvent")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" onClick={onClose}>{t("common.save")}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label={t("routines.label")}><input className={inputCls} defaultValue="" placeholder={tx({ en: "e.g. Swimming lesson", de: "z. B. Schwimmkurs" })} /></Field>
        <Field label={t("calendar.who")}>
          <MemberFilter size="sm" members={getMembers()} selected={who} onToggle={(id) => setWho((s) => toggled(s, id))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("calendar.when")}><input type="date" className={inputCls} /></Field>
          <Field label="&nbsp;"><input type="time" className={inputCls} defaultValue="15:00" /></Field>
        </div>
        <Field label={t("calendar.source")} hint={t("common.notSaved")}>
          <select className={inputCls}>{writable.map((s) => <option key={s.id}>{tx(s.name)} ({t(`providers.${s.provider}`)})</option>)}</select>
        </Field>
      </div>
    </Dialog>
  );
}

export { SourceList };
