"use client";
import { ShoppingCart, BookOpen } from "lucide-react";
import { useI18n } from "@/i18n";
import { MEALS } from "@/lib/data/meals";
import { TODAY } from "@/lib/data/anchor";
import { sameDay } from "@/lib/dates";
import { getMember } from "@/lib/services/household";
import { PageHeader } from "../ui/Panel";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { cn } from "../ui/cn";

export function MealsScreen() {
  const { t, tx, fmt } = useI18n();
  return (
    <div>
      <PageHeader title={t("meals.title")} subtitle={t("meals.subtitle")}
        actions={<Button variant="outline" disabled title={t("common.planned")}><ShoppingCart size={18} />{t("meals.toShopping")}</Button>} />
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {MEALS.map((m) => {
          const cook = getMember(m.cookId);
          const today = sameDay(m.date, TODAY);
          const past = m.date < TODAY;
          return (
            <li key={m.date.toISOString()} className={cn("flex flex-col rounded-panel p-5 xl:min-h-[260px]", today ? "bg-ink text-surface" : "bg-surface", past && "opacity-55")}>
              <p className={cn("font-bold", today ? "text-surface/70" : "text-soft")}>{today ? t("meals.tonight") : fmt.weekday(m.date, "long")}</p>
              <p className="num text-sm opacity-70">{fmt.dateMedium(m.date)}</p>
              <p className="mt-4 font-display text-2xl font-semibold leading-tight">{tx(m.dinner)}</p>
              {m.note && <p className={cn("mt-2 text-sm", today ? "text-surface/75" : "text-soft")}>{tx(m.note)}</p>}
              <span className="flex-1" />
              {cook && <p className="mt-4 flex items-center gap-2 text-sm font-bold"><Avatar member={cook} size="xs" />{t("meals.cooks", { name: cook.name })}</p>}
            </li>
          );
        })}
      </ol>
      <p className="mt-6 flex items-center gap-2 text-soft"><BookOpen size={18} />{t("meals.recipesLater")}</p>
    </div>
  );
}
