"use client";
import type { CSSProperties } from "react";
import { House, Moon, Sun, Sunrise } from "lucide-react";
import type { Member, Period } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { addDays, sameDay } from "@/lib/dates";
import { dayProgress } from "@/lib/services/household";
import { Avatar } from "../ui/Avatar";
import { cn } from "../ui/cn";

const DAYS = 14;
const ROWS: { id: Period | "chores"; Icon: typeof Sun }[] = [
  { id: "morning", Icon: Sunrise }, { id: "afternoon", Icon: Sun }, { id: "evening", Icon: Moon }, { id: "chores", Icon: House },
];

/**
 * Completion history (§19.3): the last two weeks per person, one row per
 * time of day. Calm by design: a dot fills as the routine got done, no
 * streaks or scores (§6, §9).
 */
export function History() {
  const { t } = useI18n();
  const { getMembers, allRoutines, allChores } = useStore();
  const people = getMembers().filter((m) => allRoutines().some((r) => r.memberId === m.id) || allChores().some((c) => c.memberId === m.id));
  if (!people.length) return <p className="rounded-panel bg-surface p-6 text-soft">{t("history.empty")}</p>;
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-prose text-soft">{t("history.hint")}</p>
      {people.map((m) => <MemberHistory key={m.id} member={m} />)}
    </div>
  );
}

function MemberHistory({ member }: { member: Member }) {
  const { t, fmt } = useI18n();
  const { data, routineDay } = useStore();
  const days = Array.from({ length: DAYS }, (_, i) => addDays(routineDay, i - DAYS + 1));
  const progress = days.map((d) => dayProgress(data, member.id, d));
  const rows = ROWS.filter((r) => progress.some((p) => (r.id === "chores" ? p.choresDue > 0 : p.periods[r.id])));

  return (
    <section style={{ "--m": member.color } as CSSProperties} className="overflow-x-auto rounded-panel bg-surface p-5">
      <header className="mb-4 flex items-center gap-3">
        <Avatar member={member} size="md" />
        <h2 className="font-display text-xl font-bold">{member.name}</h2>
      </header>
      <table className="w-full min-w-[560px] border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="w-10" />
            {days.map((d) => (
              <th key={d.toISOString()} scope="col" className={cn("font-bold text-soft", sameDay(d, routineDay) && "text-ink")}>
                <span className="block">{fmt.weekday(d, "narrow")}</span>
                <span className="num block font-normal">{fmt.dayNum(d)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, Icon }) => (
            <tr key={id}>
              <th scope="row" aria-label={id === "chores" ? t("home.chores") : t(`period.${id}`)} className="m-text"><Icon size={18} className="mx-auto" /></th>
              {progress.map((p) => {
                const cell = id === "chores" ? (p.choresDue ? { due: p.choresDue, done: p.choresDone } : undefined) : p.periods[id];
                const label = `${id === "chores" ? t("home.chores") : t(`period.${id}`)}, ${fmt.dateMedium(p.day)}: ${cell ? t("common.ofTotal", { done: cell.done, total: cell.due }) : t("history.nothingDue")}`;
                return (
                  <td key={p.day.toISOString()} className="text-center" title={label} aria-label={label}>
                    {cell ? <Dot share={cell.due ? cell.done / cell.due : 0} /> : <span className="text-line">·</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** A circle that fills like a pie: empty, part done, all done. */
function Dot({ share }: { share: number }) {
  const deg = Math.round(share * 360);
  return (
    <span aria-hidden className="mx-auto block h-6 w-6 rounded-full border-2 m-border"
      style={{ background: share >= 1 ? "var(--m)" : `conic-gradient(var(--m) ${deg}deg, transparent ${deg}deg)` }} />
  );
}
