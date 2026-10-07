"use client";
import { useState, type FormEvent } from "react";
import { Check, Plus } from "lucide-react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { TODAY } from "@/lib/data/anchor";
import { getMember, getMembers } from "@/lib/services/household";
import { PageHeader } from "../ui/Panel";
import { Avatar } from "../ui/Avatar";
import { MemberFilter } from "../ui/MemberFilter";
import { cn } from "../ui/cn";
import { toggled } from "@/lib/sets";

export function TasksScreen() {
  const { t, tx, fmt } = useI18n();
  const { tasks, toggleTask, addTask } = useStore();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState(() => new Set(getMembers().filter((m) => m.role !== "child").map((m) => m.id)));
  const visible = tasks.filter((x) => !x.memberId || filter.has(x.memberId));
  const open = visible.filter((x) => !x.done).sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
  const done = visible.filter((x) => x.done);
  const submit = (e: FormEvent) => { e.preventDefault(); if (text.trim()) { addTask(text.trim(), null); setText(""); } };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t("tasks.title")} subtitle={t("tasks.subtitle")} />
      <div className="mb-4"><MemberFilter size="sm" members={getMembers()} selected={filter} onToggle={(id) => setFilter((s) => toggled(s, id))} /></div>
      <form onSubmit={submit} className="mb-5 flex gap-2 rounded-panel bg-surface p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("tasks.placeholder")} className="h-12 min-w-0 flex-1 rounded-full bg-sunken px-5 text-lg placeholder:text-soft focus:outline-none" />
        <button aria-label={t("tasks.add")} className="grid h-12 w-12 place-items-center rounded-full bg-ink text-surface"><Plus /></button>
      </form>
      <h2 className="mb-2 px-2 text-sm font-bold text-soft">{t("tasks.open")}</h2>
      <ul className="mb-6 overflow-hidden rounded-panel bg-surface">
        {open.map((x) => {
          const m = getMember(x.memberId);
          const overdue = x.due && x.due < TODAY;
          return (
            <li key={x.id} className="border-b border-line last:border-0">
              <button onClick={() => toggleTask(x.id)} className="flex min-h-[64px] w-full items-center gap-4 px-4 py-2 text-left">
                <span className="h-7 w-7 shrink-0 rounded-full border-2 border-line" />
                <span className="flex-1">
                  <span className="block text-lg leading-snug">{tx(x.title)}</span>
                  <span className={cn("text-sm", overdue ? "font-bold text-[#B4443C] dark:text-[#E98A80]" : "text-soft")}>
                    {x.due ? (overdue ? t("tasks.overdue") : t("tasks.due", { date: fmt.relDay(x.due, TODAY) })) : t("tasks.noDue")}
                  </span>
                </span>
                {m ? <Avatar member={m} size="sm" /> : <span className="text-sm text-soft">{t("tasks.unassigned")}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {done.length > 0 && <>
        <h2 className="mb-2 px-2 text-sm font-bold text-soft">{t("tasks.done")}</h2>
        <ul className="overflow-hidden rounded-panel bg-surface/60">
          {done.map((x) => (
            <li key={x.id}><button onClick={() => toggleTask(x.id)} className="flex min-h-[56px] w-full items-center gap-4 px-4 text-left text-soft">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-ok text-white"><Check size={16} strokeWidth={3} /></span>
              <span className="line-through">{tx(x.title)}</span></button></li>
          ))}
        </ul>
      </>}
    </div>
  );
}
