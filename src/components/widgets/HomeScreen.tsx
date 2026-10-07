"use client";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Check, EyeOff, Monitor, Plus, SlidersHorizontal } from "lucide-react";
import type { WidgetSize } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useNow } from "@/lib/useNow";
import { useToday } from "@/lib/useToday";
import { FAMILY_NAME } from "@/lib/data/members";
import { MEALS } from "@/lib/data/meals";
import { eventsOn } from "@/lib/services/calendar";
import { currentPeriod, getMember, getMembers, routineFor } from "@/lib/services/household";
import { sameDay } from "@/lib/dates";
import { FamilyLanes } from "./FamilyLanes";
import { WIDGETS, WeatherNow, DatesList } from "./Widgets";
import { Button } from "../ui/Button";
import { Avatar, ColorRail } from "../ui/Avatar";
import { Pictogram } from "../ui/Pictogram";
import { RewardAmount } from "../ui/RewardAmount";
import { Panel } from "../ui/Panel";
import { cn } from "../ui/cn";

const SPAN: Record<WidgetSize, string> = { s: "md:col-span-1", m: "md:col-span-2", l: "md:col-span-2 xl:col-span-4" };

export function useGreeting() {
  const now = useNow(60_000);
  const { t } = useI18n();
  return t(`greeting.${currentPeriod(now)}`);
}

export function HomeScreen() {
  return (
    <>
      <div className="md:hidden"><MobileHome /></div>
      <div className="hidden md:block"><DesktopHome /></div>
    </>
  );
}

// ── Desktop / tablet ────────────────────────────────────────────────────────
function DesktopHome() {
  const { t, fmt } = useI18n();
  const greeting = useGreeting();
  const now = useNow();
  const { widgets, moveWidget, updateWidget } = useStore();
  const [editing, setEditing] = useState(false);
  const visible = widgets.filter((w) => w.enabled);
  const hidden = widgets.filter((w) => !w.enabled);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-lg text-soft">{greeting}, {FAMILY_NAME}s</p>
          <h1 className="font-display text-5xl font-bold tracking-tight">{fmt.dateLong(now)}</h1>
        </div>
        <div className="flex items-center gap-6">
          <WeatherNow />
          <div className="flex gap-2">
            <Link href="/wall"><Button variant="outline" size="md"><Monitor size={18} />{t("home.openWall")}</Button></Link>
            <Button variant={editing ? "primary" : "outline"} onClick={() => setEditing((e) => !e)}>
              {editing ? <Check size={18} /> : <SlidersHorizontal size={18} />}{editing ? t("home.doneCustomizing") : t("home.customize")}
            </Button>
          </div>
        </div>
      </header>

      <section aria-label={t("home.familyToday")}>
        <FamilyLanes />
      </section>

      {editing && (
        <div className="rounded-panel border-2 border-dashed border-line p-5">
          <p className="font-bold">{t("home.customizeHint")}</p>
          <p className="mt-3 text-sm font-bold text-soft">{t("home.hiddenWidgets")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hidden.length === 0 && <span className="text-sm text-soft">{t("home.nothingHidden")}</span>}
            {hidden.map((w) => (
              <Button key={w.id} size="sm" variant="quiet" onClick={() => updateWidget(w.id, { enabled: true })}><Plus size={16} />{t(`widgets.${w.id}`)}</Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-flow-row-dense grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {visible.map((w, i) => {
          const W = WIDGETS[w.id];
          return (
            <div key={w.id} className={cn("relative flex flex-col", SPAN[w.size], editing && "rounded-panel ring-2 ring-ink/15 ring-offset-4 ring-offset-bg")}>
              <W />
              {editing && (
                <div className="absolute inset-x-3 top-3 flex items-center gap-1 rounded-full bg-ink p-1 text-surface shadow-lg">
                  <span className="px-2 text-sm font-bold">{t(`widgets.${w.id}`)}</span>
                  <span className="flex-1" />
                  <EditBtn label={t("common.moveEarlier")} disabled={i === 0} onClick={() => moveWidget(w.id, -1)}><ArrowLeft size={16} /></EditBtn>
                  <EditBtn label={t("common.moveLater")} disabled={i === visible.length - 1} onClick={() => moveWidget(w.id, 1)}><ArrowRight size={16} /></EditBtn>
                  <span className="mx-1 inline-flex rounded-full bg-surface/15 p-0.5" role="radiogroup" aria-label={t("common.size")}>
                    {(["s", "m", "l"] as const).map((s) => (
                      <button key={s} role="radio" aria-checked={w.size === s} onClick={() => updateWidget(w.id, { size: s })}
                        className={cn("h-7 w-7 rounded-full text-xs font-bold uppercase", w.size === s && "bg-surface text-ink")}>{s}</button>
                    ))}
                  </span>
                  <EditBtn label={t("common.hide")} onClick={() => updateWidget(w.id, { enabled: false })}><EyeOff size={16} /></EditBtn>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditBtn({ label, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label} className="grid h-8 w-8 place-items-center rounded-full hover:bg-surface/15 disabled:opacity-30" {...p}>{children}</button>;
}

// ── Phone ───────────────────────────────────────────────────────────────────
function MobileHome() {
  const today = useToday();
  const { t, tx, fmt } = useI18n();
  const greeting = useGreeting();
  const now = useNow();
  const { isDone, approvals, resolveApproval } = useStore();
  const period = currentPeriod(now);
  const rest = eventsOn(today).filter((e) => !e.background && (e.allDay || e.end > now));
  const tonight = MEALS.find((m) => sameDay(m.date, today));

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-soft">{greeting}</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{fmt.dateLong(now)}</h1>
        <div className="mt-3"><WeatherNow /></div>
      </header>

      {/* Who's doing what: one swipeable row of people */}
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar">
        {getMembers().map((m) => {
          const r = routineFor(m.id, period, today);
          const left = r ? r.items.filter((i) => !isDone(i.id)).length : 0;
          const next = eventsOn(today).find((e) => e.memberIds.includes(m.id) && !e.background && e.end > now);
          return (
            <Link key={m.id} href={m.role === "child" ? `/kids/${m.id}` : "/calendar"} style={{ "--m": m.color } as CSSProperties}
              className="tint flex w-[136px] shrink-0 flex-col gap-2 rounded-card p-3">
              <Avatar member={m} size="md" />
              <span className="font-display text-lg font-bold leading-none">{m.name}</span>
              <span className="text-sm leading-snug text-soft">
                {r ? (left ? t("home.routinesLeft", { n: left }) : t("home.allDoneShort"))
                  : next ? `${fmt.time(next.start)} ${tx(next.title)}` : t("home.freeDay")}
              </span>
            </Link>
          );
        })}
      </div>

      {approvals.length > 0 && (
        <Panel title={t("home.waitingForOk")}>
          <ul className="flex flex-col gap-3">
            {approvals.map((a) => {
              const m = getMember(a.memberId)!;
              return (
                <li key={a.id} className="flex items-center gap-3" style={{ "--m": m.color } as CSSProperties}>
                  <span className="tint m-text grid h-11 w-11 shrink-0 place-items-center rounded-tile"><Pictogram id={a.item.pictogram} className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold leading-tight">{tx(a.item.label)}</span>
                    <span className="flex items-center gap-2 text-sm text-soft">{m.name} {a.item.value.kind === "extra" && <RewardAmount points={a.item.value.points} plus />}</span>
                  </span>
                  <Button size="sm" variant="primary" onClick={() => resolveApproval(a.id, true)}>{t("common.approve")}</Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel title={t("home.laterToday")} href="/calendar">
        {rest.length === 0 ? <p className="text-soft">{t("home.nothingLeft")}</p> : (
          <ol className="flex flex-col gap-3">
            {rest.map((e) => (
              <li key={e.id} className="flex items-stretch gap-3">
                <span className="num w-12 shrink-0 pt-0.5 text-sm text-soft">{e.allDay ? "" : fmt.time(e.start)}</span>
                <ColorRail colors={e.memberIds.map((id) => getMember(id)!.color)} />
                <span className="font-bold">{tx(e.title)}</span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/meals" className="rounded-panel bg-surface p-4">
          <p className="text-sm font-bold text-soft">{t("meals.tonight")}</p>
          <p className="mt-1 font-display text-lg font-semibold leading-tight">{tonight ? tx(tonight.dinner) : t("meals.empty")}</p>
        </Link>
        <ShoppingTile />
      </div>

      <Panel title={t("widgets.dates")}><DatesList limit={3} /></Panel>
    </div>
  );
}

function ShoppingTile() {
  const { t } = useI18n();
  const { shopping } = useStore();
  const n = shopping.filter((s) => s.listId === "groceries" && !s.done).length;
  return (
    <Link href="/shopping" className="rounded-panel bg-surface p-4">
      <p className="text-sm font-bold text-soft">{t("nav.shopping")}</p>
      <p className="num mt-1 font-display text-3xl font-semibold leading-none">{n}</p>
      <p className="text-sm text-soft">{t("shopping.items", { n }).replace(String(n), "").trim()}</p>
    </Link>
  );
}
