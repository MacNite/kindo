"use client";
import { Coins, Star } from "lucide-react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { POINT_VALUE_EUR } from "@/lib/data/rewards";
import { cn } from "./cn";

/** Shows points in whatever unit the household chose. Renders nothing when rewards are off. */
export function RewardAmount({ points, className, iconSize = 16, plus }: { points: number; className?: string; iconSize?: number; plus?: boolean }) {
  const { rewardMode } = useStore();
  const { fmt } = useI18n();
  if (rewardMode === "off") return null;
  if (rewardMode === "money")
    return <span className={cn("num inline-flex items-center font-bold", className)}>{plus ? "+" : ""}{fmt.money(points * POINT_VALUE_EUR)}</span>;
  const I = rewardMode === "tokens" ? Coins : Star;
  return (
    <span className={cn("num inline-flex items-center gap-1 font-bold", className)}>
      <I size={iconSize} className="text-star" fill={rewardMode === "stars" ? "currentColor" : "none"} strokeWidth={2} aria-hidden />
      {plus ? "+" : ""}{fmt.num(points)}
    </span>
  );
}
