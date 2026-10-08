"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type CSSProperties } from "react";
import { Check, Home, Moon, Star, Sun, Sunrise } from "lucide-react";
import type { Member, Period, TaskItem } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { dateKey } from "@/lib/dates";
import { useNow } from "@/lib/useNow";

import { Avatar } from "../ui/Avatar";
import { Pictogram } from "../ui/Pictogram";
import { cn } from "../ui/cn";

const PERIOD_ICON: Record<Period, typeof Sun> = { morning: Sunrise, afternoon: Sun, evening: Moon };

/** Cards fill the row: two steps get two big cards, not half an empty grid. */
const GRID: Record<number, string> = {
  0: "grid-cols-1", 1: "grid-cols-1 max-w-md", 2: "grid-cols-2 lg:max-w-4xl",
  3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 lg:grid-cols-4", 5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
};

/**
 * Child view: built to work for a four-year-old who can't read.
 * Pictures carry the meaning; words are small helpers for parents/older kids.
 */
export function ChildRoutine({ memberId }: { memberId: string }) {
  const { isDone, toggleTaskItem, rewardMode, getMember, routineFor, choresOn, routineDay: today, periodAt } = useStore();
  const member = getMember(memberId);
  // The routine follows the time of day. A period the child picks holds until the
  // time of day moves on by itself or the household day resets (§19.3).
  const now = useNow(30_000);
  const auto = periodAt(now);
  const [picked, setPicked] = useState<{ period: Period; auto: Period; day: string } | null>(null);
  const period = picked && picked.auto === auto && picked.day === dateKey(today) ? picked.period : auto;
  const setPeriod = (p: Period) => setPicked({ period: p, auto, day: dateKey(today) });
  const { t } = useI18n();
  if (!member) return null;

  const routine = routineFor(member.id, period, today);
  const items = routine?.items ?? [];
  const helping = choresOn(today).filter((c) => c.memberId === member.id).map((c) => c.item);
  const doneCount = items.filter((i) => isDone(i.id)).length;
  const allDone = items.length > 0 && doneCount === items.length;

  return (
    <div style={{ "--m": member.color } as CSSProperties} className="tint min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-6 p-5 sm:p-8">
        <header className="flex items-center gap-4">
          <HoldToLeave />
          <Avatar member={member} size="xl" className="max-sm:!h-16 max-sm:!w-16 max-sm:!text-3xl" />
          <h1 className="m-text font-display text-6xl font-extrabold tracking-tight sm:text-8xl">{member.name}</h1>
          <div className="ml-auto flex gap-2 rounded-full bg-surface/70 p-1.5" role="radiogroup" aria-label="Time of day">
            {(["morning", "afternoon", "evening"] as const).map((p) => {
              const I = PERIOD_ICON[p];
              return (
                <button key={p} role="radio" aria-checked={period === p} aria-label={t(`period.${p}`)} onClick={() => setPeriod(p)}
                  className={cn("grid h-16 w-16 place-items-center rounded-full transition-colors sm:h-20 sm:w-20", period === p ? "m-bg text-white" : "m-text")}>
                  <I className="h-8 w-8 sm:h-10 sm:w-10" strokeWidth={2} />
                </button>
              );
            })}
          </div>
        </header>

        {/* Progress as dots, not numbers */}
        <div className="flex items-center gap-3" aria-label={t("common.ofTotal", { done: doneCount, total: items.length })}>
          {items.map((i) => (
            <span key={i.id} className={cn("h-5 flex-1 rounded-full transition-colors duration-500", isDone(i.id) ? "m-bg" : "bg-surface")} />
          ))}
        </div>

        {allDone ? (
          <div className="grid flex-1 place-items-center rounded-panel bg-surface/70 p-10 text-center animate-rise">
            <div>
              <div className="m-bg mx-auto grid h-40 w-40 place-items-center rounded-full text-white sm:h-56 sm:w-56">
                <PeriodDone period={period} />
              </div>
              <p className="m-text mt-6 font-display text-5xl font-bold">{t("kids.allDone")}</p>
              <div className="mt-6 flex justify-center gap-3">
                {items.map((i) => <span key={i.id} className="m-text grid h-14 w-14 place-items-center rounded-tile bg-surface"><Pictogram id={i.pictogram} className="h-7 w-7" /></span>)}
              </div>
            </div>
          </div>
        ) : (
          <div className={cn("grid gap-4 sm:gap-6", GRID[Math.min(items.length, 5)])}>
            {items.map((i, n) => <TaskCard key={i.id} item={i} done={isDone(i.id)} onToggle={() => toggleTaskItem(member.id, i)} next={!isDone(i.id) && items.findIndex((x) => !isDone(x.id)) === n}
              showReward={rewardMode !== "off"} />)}
          </div>
        )}

        {helping.length > 0 && (
          <section className="mt-2">
            <div className="m-text mb-3 flex items-center gap-2" aria-label={t("home.chores")}>
              <Home className="h-7 w-7" strokeWidth={2.25} />
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {helping.map((i) => (
                <TaskCard key={i.id} item={i} small done={isDone(i.id)} onToggle={() => toggleTaskItem(member.id, i)} showReward={rewardMode !== "off"} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export function TaskCard({ item, done, onToggle, small, next, showReward = true }: {
  item: TaskItem; done: boolean; onToggle: () => void; small?: boolean; next?: boolean; showReward?: boolean;
}) {
  const { tx } = useI18n();
  const [anim, setAnim] = useState(false);
  const extra = item.value.kind === "extra" ? item.value : null;
  return (
    <button
      onClick={() => { onToggle(); setAnim(true); }}
      onAnimationEnd={() => setAnim(false)}
      aria-pressed={done}
      aria-label={tx(item.label)}
      className={cn(
        "relative flex aspect-square flex-col items-center justify-center rounded-[clamp(20px,3vw,36px)] transition-colors duration-300",
        anim && "animate-settle",
        done ? "m-bg text-white" : "bg-surface m-text",
        next && !done && "ring-4 ring-[var(--m)] ring-offset-4 ring-offset-transparent",
      )}>
      <Pictogram id={item.pictogram} strokeWidth={small ? 1.75 : 1.5}
        className={cn("transition-transform duration-300", small ? "h-[42%] w-[42%]" : "h-[48%] w-[48%]", done && "scale-90 opacity-90")} />
      <span className={cn("mt-[4%] px-2 text-center font-bold leading-tight", small ? "text-xs sm:text-sm" : "text-base sm:text-xl", done ? "text-white/85" : "text-soft")}>
        {tx(item.label)}
      </span>
      {done && (
        <span className={cn("absolute grid place-items-center rounded-full bg-white text-[var(--m)]", small ? "right-2 top-2 h-7 w-7" : "right-4 top-4 h-12 w-12")}>
          <Check className={small ? "h-4 w-4" : "h-7 w-7"} strokeWidth={3.5} />
        </span>
      )}
      {extra && showReward && !done && (
        <span className={cn("absolute flex items-center gap-0.5 rounded-full bg-star/20 font-bold text-ink", small ? "left-2 top-2 px-1.5 py-0.5 text-xs" : "left-4 top-4 px-2.5 py-1")}>
          <Star className="h-4 w-4 text-star" fill="currentColor" />{extra.points}
        </span>
      )}
    </button>
  );
}

function PeriodDone({ period }: { period: Period }) {
  const I = period === "evening" ? Moon : Star;
  return <I className="h-24 w-24 sm:h-32 sm:w-32" strokeWidth={1.5} fill="currentColor" />;
}

/** Kiosk exit: a press-and-hold so small hands don't leave by accident. */
function HoldToLeave() {
  const router = useRouter();
  const { t } = useI18n();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [holding, setHolding] = useState(false);
  const start = () => { setHolding(true); timer.current = setTimeout(() => router.push("/wall"), 700); };
  const stop = () => { setHolding(false); clearTimeout(timer.current); };
  return (
    <button onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onKeyDown={(e) => e.key === "Enter" && router.push("/wall")}
      aria-label={`${t("kids.back")} (${t("kids.parentHint")})`} title={t("kids.parentHint")}
      className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-surface/70 text-soft">
      <span className={cn("absolute inset-0 origin-bottom bg-[var(--m)] opacity-30 transition-transform ease-linear", holding ? "scale-y-100 duration-700" : "scale-y-0 duration-150")} />
      <Home size={22} className="relative" />
    </button>
  );
}

export function ChildPicker() {
  const { t } = useI18n();
  const { isDone, children, routineFor, routineDay: today, periodAt } = useStore();
  const period = periodAt(useNow(30_000));
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-10 p-8">
      <Link href="/wall" className="absolute left-6 top-6 grid h-14 w-14 place-items-center rounded-full bg-surface text-soft" aria-label={t("kids.back")}><Home size={22} /></Link>
      <h1 className="sr-only">{t("kids.choose")}</h1>
      <div className="grid w-full max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
        {children().map((m: Member) => {
          const r = routineFor(m.id, period, today);
          return (
            <Link key={m.id} href={`/kids/${m.id}`} style={{ "--m": m.color } as CSSProperties}
              className="tint flex flex-col items-center gap-5 rounded-panel p-10">
              <Avatar member={m} size="xl" className="!h-40 !w-40 !text-8xl" />
              <span className="m-text font-display text-5xl font-extrabold">{m.name}</span>
              <span className="flex gap-2">
                {r?.items.map((i) => <span key={i.id} className={cn("h-4 w-4 rounded-full", isDone(i.id) ? "m-bg" : "bg-surface")} />)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
