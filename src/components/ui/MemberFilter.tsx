"use client";
import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import type { Member } from "@/lib/types";
import { cn } from "./cn";

/** Toggle chips, one per person, in their colour. */
export function MemberFilter({ members, selected, onToggle, size = "md" }: {
  members: Member[]; selected: Set<string>; onToggle: (id: string) => void; size?: "sm" | "md";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => {
        const on = selected.has(m.id);
        return (
          <button key={m.id} onClick={() => onToggle(m.id)} aria-pressed={on} style={{ "--m": m.color } as CSSProperties}
            className={cn("inline-flex items-center gap-2 rounded-full border-2 pl-1 pr-3.5 font-bold transition-colors",
              size === "sm" ? "h-9 text-sm" : "h-11",
              on ? "tint m-border" : "border-line text-soft opacity-70")}>
            <span className={cn("grid place-items-center rounded-full text-white", size === "sm" ? "h-6 w-6" : "h-8 w-8", on ? "m-bg" : "bg-line")}>
              {on ? <Check size={14} strokeWidth={3} /> : <span className="text-sm">{m.avatar.kind === "emoji" ? m.avatar.value : m.name[0]}</span>}
            </span>
            {m.name}
          </button>
        );
      })}
    </div>
  );
}
