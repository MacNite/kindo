"use client";
import { Star } from "lucide-react";
import type { RewardMode } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { cn } from "./cn";

/** A gold coin a child recognises without reading: a filled disc with a rim and a star stamped on it. */
function Coin({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("text-star", className)} aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="currentColor" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="rgb(0 0 0 / 0.22)" strokeWidth="1.5" />
      <path d="m12 7.6 1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4Z" fill="rgb(0 0 0 / 0.22)" />
    </svg>
  );
}

/** The picture for a point: a filled star or a coin. Money has none, it is shown as an amount. */
function RewardIcon({ mode, size = 16, className }: { mode: RewardMode; size?: number; className?: string }) {
  if (mode === "tokens") return <Coin size={size} className={className} />;
  if (mode === "stars") return <Star size={size} className={cn("text-star", className)} fill="currentColor" strokeWidth={2} aria-hidden />;
  return null;
}

/** Shows points in whatever unit the household chose. Renders nothing when rewards are off. */
export function RewardAmount({ points, className, iconSize = 16, plus }: { points: number; className?: string; iconSize?: number; plus?: boolean }) {
  const { rewardMode, pointValue } = useStore();
  const { fmt } = useI18n();
  if (rewardMode === "off") return null;
  if (rewardMode === "money")
    return <span className={cn("num inline-flex items-center font-bold", className)}>{plus ? "+" : ""}{fmt.money(points * pointValue)}</span>;
  return (
    <span className={cn("num inline-flex items-center gap-1 font-bold", className)}>
      <RewardIcon mode={rewardMode} size={iconSize} />
      {plus ? "+" : ""}{fmt.num(points)}
    </span>
  );
}
