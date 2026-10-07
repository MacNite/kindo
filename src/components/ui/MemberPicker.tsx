"use client";
import type { Member } from "@/lib/types";
import { Avatar } from "./Avatar";
import { cn } from "./cn";

/** Pick one person, or nobody when `noneLabel` is given. Large targets, colour-coded (§16). */
export function MemberPicker({ members, value, onChange, noneLabel }: {
  members: Member[]; value: string | null; onChange: (id: string | null) => void; noneLabel?: string;
}) {
  const options: (Member | null)[] = noneLabel ? [...members, null] : members;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((m) => {
        const on = value === (m?.id ?? null);
        return (
          <button type="button" key={m?.id ?? "none"} onClick={() => onChange(m?.id ?? null)} aria-pressed={on}
            className={cn("inline-flex h-11 items-center gap-2 rounded-full border-2 pl-1 pr-4 font-bold", on ? "border-ink" : "border-line text-soft")}>
            {m ? <Avatar member={m} size="sm" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-sunken">–</span>}{m?.name ?? noneLabel}
          </button>
        );
      })}
    </div>
  );
}
