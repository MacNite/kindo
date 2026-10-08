"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Check, Maximize2 } from "lucide-react";
import type { CalendarEvent, Member } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useNow } from "@/lib/useNow";
import { useToday } from "@/lib/useToday";
import { addDays } from "@/lib/dates";
import { Avatar } from "../ui/Avatar";
import { RewardAmount } from "../ui/RewardAmount";
import { Pictogram } from "../ui/Pictogram";
import { cn } from "../ui/cn";

/**
 * The heart of the product: one lane per person, answering
 * "what is happening today and what does each person need to do?"
 */
export function FamilyLanes({ variant = "home" }: { variant?: "home" | "wall" }) {
  const today = useToday();
  const { getMembers, familyEvents } = useStore();
  const members = getMembers();
  const { t, tx, fmt } = useI18n();
  const fam = familyEvents(today);
  const wall = variant === "wall";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {fam.length > 0 && (
        <div className={cn("flex flex-wrap items-center gap-2", wall && "gap-3")}>
          <span className={cn("font-bold text-soft", wall ? "text-lg" : "text-sm")}>{t("common.whole")}</span>
          {fam.map((e) => (
            <span key={e.id} className={cn("inline-flex items-center gap-2 rounded-full bg-surface font-bold", wall ? "h-12 px-5 text-lg" : "h-9 px-3.5 text-sm")}>
              {e.icon && <Pictogram id={e.icon} className={wall ? "h-6 w-6" : "h-4 w-4"} strokeWidth={2} />}
              {tx(e.title)}
              {!e.allDay && <span className="num font-normal text-soft">{fmt.time(e.start)}</span>}
            </span>
          ))}
        </div>
      )}
      <div style={wall ? ({ "--lanes": Math.min(Math.max(members.length, 2), 5) } as CSSProperties) : undefined}
        className={cn("min-h-0 flex-1", wall ? "wall-lanes" : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4")}>
        {members.map((m) => <MemberLane key={m.id} member={m} wall={wall} />)}
      </div>
    </div>
  );
}

function MemberLane({ member, wall }: { member: Member; wall: boolean }) {
  const today = useToday();
  const { t, tx, fmt } = useI18n();
  const now = useNow();
  const { isDone, toggleTaskItem, routineFor, eventsForMember, choresOn, routineDay, periodAt, rewardMode, balances } = useStore();
  const period = periodAt(now);
  const routine = routineFor(member.id, period, routineDay);
  const events = eventsForMember(member.id, today);
  const chores = choresOn(routineDay).filter((c) => c.memberId === member.id);
  const left = routine ? routine.items.filter((i) => !isDone(i.id)).length : 0;
  const isChild = member.role === "child";
  // What a child has collected, readable from across the kitchen (§9).
  const showBalance = isChild && rewardMode !== "off";
  const tomorrow = eventsForMember(member.id, addDays(today, 1)).filter((e) => !e.background);

  return (
    <section style={{ "--m": member.color } as CSSProperties}
      className={cn("lane relative flex min-h-0 flex-col rounded-panel bg-surface", wall ? "lane-wall overflow-y-auto overflow-x-hidden" : "overflow-hidden p-5")}>
      <span aria-hidden className="m-bg absolute inset-x-0 top-0 h-1.5" />
      <header className="flex items-center gap-3">
        <Avatar member={member} size={wall ? "lg" : "md"} />
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-display font-bold leading-none tracking-tight", wall ? "lane-name" : "text-2xl")}>{member.name}</h3>
          <p className={cn("mt-1 truncate text-soft", wall ? "text-lg" : "text-sm")}>
            {routine ? (left ? t("home.routinesLeft", { n: left }) : t("home.allDoneShort")) : events.length ? (events.length === 1 ? t("home.eventOne") : t("home.events", { n: events.length })) : t("home.freeDay")}
          </p>
        </div>
        {isChild && (
          <Link href={`/kids/${member.id}`} aria-label={`${t("routines.childView")}: ${member.name}`}
            className={cn("tint m-text grid shrink-0 place-items-center rounded-full", wall ? "h-14 w-14" : "h-10 w-10 coarse:h-11 coarse:w-11")}>
            <Maximize2 size={wall ? 24 : 18} />
          </Link>
        )}
      </header>

      {showBalance && (
        <p aria-label={t("rewards.balanceOf", { name: member.name })}
          className={cn("mt-3 self-start rounded-full bg-star/15", wall ? "px-4 py-1.5" : "px-3 py-1")}>
          <RewardAmount points={balances[member.id] ?? 0} iconSize={wall ? 30 : 20} className={cn("font-display", wall ? "gap-2 text-3xl" : "text-xl")} />
        </p>
      )}

      {routine && (
        <div className={cn("mt-4 rounded-card tint", wall ? "lane-routine" : "p-3")}>
          <p className={cn("m-text mb-2 font-bold", wall ? "text-lg" : "text-sm")}>{t(`period.${period}`)}</p>
          <div className={cn("lane-steps", wall && "lane-steps-wall")}>
            {routine.items.map((i) => {
              const done = isDone(i.id);
              return (
                <button key={i.id} onClick={() => toggleTaskItem(member.id, i)} aria-pressed={done} aria-label={tx(i.label)} title={tx(i.label)}
                  className={cn("relative grid aspect-square place-items-center rounded-tile transition-colors",
                    done ? "m-bg text-white" : "bg-surface m-text")}>
                  <Pictogram id={i.pictogram} className={wall ? "h-9 w-9" : "h-6 w-6"} />
                  {done && <Check className="absolute right-1 top-1 h-3.5 w-3.5" strokeWidth={3.5} />}
                  {i.value.kind === "extra" && i.value.points > 0 && (
                    <RewardAmount points={i.value.points} plus iconSize={wall ? 16 : 11}
                      className={cn("absolute bottom-1 right-1 rounded-full bg-surface text-ink shadow-sm", wall ? "px-1.5 text-sm" : "px-1 text-xs")} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ol className={cn("mt-4 flex flex-col", wall ? "shrink-0 gap-2.5" : "min-h-0 shrink gap-2 overflow-y-auto no-scrollbar")}>
        {events.map((e) => <LaneEvent key={e.id} e={e} now={now} wall={wall} />)}
        {chores.map((c) => {
          const done = isDone(c.item.id);
          return (
            <li key={c.id}>
              <button onClick={() => toggleTaskItem(member.id, c.item)} className={cn("flex w-full items-center gap-3 text-left", wall ? "min-h-11 text-lg" : "text-[15px] coarse:min-h-11", done && "text-soft")}>
                <span className={cn("grid shrink-0 place-items-center rounded-full border-2 m-border", wall ? "h-9 w-9" : "h-7 w-7", done && "m-bg !border-transparent text-white")}>
                  {done ? <Check size={wall ? 18 : 14} strokeWidth={3} /> : <Pictogram id={c.item.pictogram} className={wall ? "h-5 w-5 m-text" : "h-4 w-4 m-text"} strokeWidth={2} />}
                </span>
                <span className={cn("min-w-0 flex-1", done && "line-through decoration-2")}>{tx(c.item.label)}</span>
                {c.item.value.kind === "extra" && c.item.value.points > 0 && (
                  <RewardAmount points={c.item.value.points} plus iconSize={wall ? 20 : 14} className={cn("shrink-0", done ? "text-soft" : "text-ink")} />
                )}
              </button>
            </li>
          );
        })}
        {!events.length && !chores.length && !routine && <li className="text-soft">{t("home.freeDay")}</li>}
      </ol>
      {wall && tomorrow.length > 0 && (
        <footer className="mt-auto border-t border-line pt-4">
          <p className="mb-2 text-base font-bold text-soft">{t("home.tomorrow")}</p>
          <ul className="flex flex-col gap-1.5">
            {tomorrow.slice(0, 2).map((e) => (
              <li key={e.id} className="flex gap-3 text-lg">
                <span className="num w-16 shrink-0 text-soft">{e.allDay ? "" : fmt.time(e.start)}</span>
                <span className="min-w-0 truncate">{tx(e.title)}</span>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </section>
  );
}

function LaneEvent({ e, now, wall }: { e: CalendarEvent; now: Date; wall: boolean }) {
  const { t, tx, fmt } = useI18n();
  const past = !e.allDay && e.end < now;
  const current = !e.allDay && e.start <= now && e.end > now;
  if (e.background)
    return (
      <li className={cn("flex items-center gap-2 text-soft", wall ? "text-lg" : "text-sm", past && "opacity-50")}>
        {e.icon && <Pictogram id={e.icon} className={wall ? "h-5 w-5" : "h-4 w-4"} strokeWidth={2} />}
        <span>{tx(e.title)}</span>
        <span className="num">{t("common.until", { time: fmt.time(e.end) })}</span>
      </li>
    );
  return (
    <li className={cn("flex gap-3", past && "opacity-45")}>
      <span className={cn("num shrink-0 pt-0.5 text-soft", wall ? "w-16 text-lg" : "w-12 text-sm")}>{e.allDay ? "" : fmt.time(e.start)}</span>
      <span className={cn("min-w-0 flex-1 rounded-tile px-3 py-1.5", current ? "tint-strong" : "tint")}>
        <span className={cn("block font-bold leading-snug", wall ? "text-xl" : "text-[15px]")}>{tx(e.title)}</span>
        {(e.location || current) && (
          <span className={cn("block text-soft", wall ? "text-base" : "text-sm")}>
            {current && <b className="m-text mr-2">{t("common.now")}</b>}{e.location}
          </span>
        )}
      </span>
    </li>
  );
}
