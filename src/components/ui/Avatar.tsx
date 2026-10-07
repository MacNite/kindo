import type { CSSProperties } from "react";
import type { Member } from "@/lib/types";
import { cn } from "./cn";

const SIZES = { xs: "h-6 w-6 text-xs", sm: "h-8 w-8 text-base", md: "h-11 w-11 text-xl", lg: "h-16 w-16 text-3xl", xl: "h-24 w-24 text-5xl" };

export function Avatar({ member, size = "md", ring = false, className }: { member: Member; size?: keyof typeof SIZES; ring?: boolean; className?: string }) {
  const style = { "--m": member.color } as CSSProperties;
  return (
    <span
      style={style}
      title={member.name}
      className={cn("tint-strong inline-grid shrink-0 place-items-center rounded-full leading-none select-none", ring && "ring-2 ring-[var(--m)] ring-offset-2 ring-offset-surface", SIZES[size], className)}
    >
      {member.avatar.kind === "emoji" ? <span aria-hidden>{member.avatar.value}</span>
        : member.avatar.kind === "photo" ? <img src={member.avatar.url} alt="" className="h-full w-full rounded-full object-cover" />
        : <span className="m-text font-display font-bold">{member.name[0]}</span>}
    </span>
  );
}

export function AvatarStack({ members, size = "xs" }: { members: Member[]; size?: keyof typeof SIZES }) {
  return (
    <span className="flex -space-x-1.5">
      {members.map((m) => <Avatar key={m.id} member={m} size={size} className="ring-2 ring-surface" />)}
    </span>
  );
}

/** A thin colour rail used on events and list rows. */
export function ColorRail({ colors, className }: { colors: string[]; className?: string }) {
  const bg = colors.length <= 1 ? colors[0] ?? "rgb(var(--soft))"
    : `linear-gradient(${colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(",")})`;
  return <span aria-hidden className={cn("w-1.5 shrink-0 self-stretch rounded-full", className)} style={{ background: bg }} />;
}
