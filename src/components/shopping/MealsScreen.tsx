"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, ShoppingCart, BookOpen } from "lucide-react";
import type { Meal, Text } from "@/lib/types";
import { editText, isBlankText } from "@/lib/text";
import { useI18n } from "@/i18n";
import { useToday } from "@/lib/useToday";
import { useStore } from "@/lib/state/store";
import { saveMeal } from "@/lib/services/actions";
import { addDays, dateKey, sameDay, startOfWeek } from "@/lib/dates";
import { PageHeader } from "../ui/Panel";
import { Avatar } from "../ui/Avatar";
import { Button, IconButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Field, inputCls } from "../ui/Segmented";
import { MemberPicker } from "../ui/MemberPicker";
import { ErrorText } from "../ui/ErrorText";
import { cn } from "../ui/cn";

/** A week of dinners, and who cooks (§11). Tap a day to plan it. */
export function MealsScreen() {
  const today = useToday();
  const { t, tx, fmt, region } = useI18n();
  const { data, getMember } = useStore();
  const [week, setWeek] = useState(0);
  const [editing, setEditing] = useState<Date | null>(null);
  const start = addDays(startOfWeek(today, region.weekStartsOn), week * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const mealOn = (d: Date) => data.meals.find((m) => m.day === dateKey(d));

  return (
    <div>
      <PageHeader title={t("meals.title")} subtitle={t("meals.subtitle")}
        actions={<>
          <IconButton label={t("calendar.previous")} onClick={() => setWeek((w) => w - 1)}><ChevronLeft /></IconButton>
          <Button size="sm" variant="outline" onClick={() => setWeek(0)}>{t("calendar.today")}</Button>
          <IconButton label={t("calendar.next")} onClick={() => setWeek((w) => w + 1)}><ChevronRight /></IconButton>
          <Button variant="outline" disabled title={t("common.planned")}><ShoppingCart size={18} />{t("meals.toShopping")}</Button>
        </>} />
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => {
          const m = mealOn(d);
          const cook = getMember(m?.cookId);
          const isToday = sameDay(d, today);
          const past = d < today;
          return (
            <li key={dateKey(d)}>
              <button onClick={() => setEditing(d)} className={cn("flex h-full w-full flex-col rounded-panel p-5 text-left xl:min-h-[260px]", isToday ? "bg-ink text-surface" : "bg-surface hover:ring-2 hover:ring-line", past && "opacity-55")}>
                <p className={cn("font-bold", isToday ? "text-surface/70" : "text-soft")}>{isToday ? t("meals.tonight") : fmt.weekday(d, "long")}</p>
                <p className="num text-sm opacity-70">{fmt.dateMedium(d)}</p>
                <p className={cn("mt-4 font-display text-2xl font-semibold leading-tight", !m && "opacity-50")}>{m ? tx(m.dinner) : t("meals.empty")}</p>
                {m?.note && <p className={cn("mt-2 text-sm", isToday ? "text-surface/75" : "text-soft")}>{tx(m.note)}</p>}
                <span className="flex-1" />
                {cook && <p className="mt-4 flex items-center gap-2 text-sm font-bold"><Avatar member={cook} size="xs" />{t("meals.cooks", { name: cook.name })}</p>}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-6 flex items-center gap-2 text-soft"><BookOpen size={18} />{t("meals.recipesLater")}</p>
      {editing && <MealEditor day={editing} meal={mealOn(editing)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MealEditor({ day, meal, onClose }: { day: Date; meal?: Meal; onClose: () => void }) {
  const { t, tx, fmt, language } = useI18n();
  const { getMembers, run } = useStore();
  // Labels stay bilingual: editing changes only the language on screen.
  const [dinner, setDinner] = useState<Text>(meal?.dinner ?? "");
  const [note, setNote] = useState<Text>(meal?.note ?? "");
  const [cookId, setCookId] = useState<string | null>(meal?.cookId ?? null);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const r = await run(() => saveMeal({ day: dateKey(day), dinner: isBlankText(dinner) ? "" : dinner, note: isBlankText(note) ? undefined : note, cookId }));
    if (r.ok) onClose();
    else setError(r.error);
  };
  return (
    <Dialog open onClose={onClose} title={`${fmt.weekday(day, "long")}, ${fmt.dateMedium(day)}`}
      footer={<><ErrorText code={error} className="mr-auto self-center" /><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" onClick={save}>{t("common.save")}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label={t("meals.dinner")} hint={t("meals.clearHint")}><input className={inputCls} value={tx(dinner)} onChange={(e) => setDinner(editText(dinner, language, e.target.value))} /></Field>
        <Field label={t("meals.note")}><input className={inputCls} value={tx(note)} onChange={(e) => setNote(editText(note, language, e.target.value))} /></Field>
        <Field label={t("meals.cook")}><MemberPicker members={getMembers()} value={cookId} onChange={setCookId} noneLabel={t("meals.nobody")} /></Field>
      </div>
    </Dialog>
  );
}
