"use client";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Maximize2, Moon, Plus, Sun, Sunrise, ShieldCheck, Trash2 } from "lucide-react";
import type { ActionResult, Member, Period, Recurrence, TaskItem, TaskValue } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { deleteChore, deleteRoutineStep, saveChore, saveRoutineStep } from "@/lib/services/actions";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/Panel";
import { Segmented, Switch, Field, inputCls } from "../ui/Segmented";
import { Avatar } from "../ui/Avatar";
import { Pictogram } from "../ui/Pictogram";
import { RewardAmount } from "../ui/RewardAmount";
import { Dialog } from "../ui/Dialog";
import { PictogramPicker, RecurrenceEditor, Stepper, describeRecurrence } from "./Editors";
import { TaskCard } from "./ChildRoutine";
import { History } from "./History";
import { ErrorText } from "../ui/ErrorText";
import { cn } from "../ui/cn";

const PERIOD_ICON: Record<Period, typeof Sun> = { morning: Sunrise, afternoon: Sun, evening: Moon };

/** What the editor works on: a routine step (expected, belongs to a routine) or a chore/extra. */
interface Draft {
  kind: "step" | "chore";
  memberId: string | null;
  item: TaskItem;
  recurrence: Recurrence;
  /** Steps: the routine they belong to, or none for a new routine. */
  routineId?: string;
  period?: Period;
}
const isNew = (d: Draft) => d.item.id === "new";
const PERIODS: Period[] = ["morning", "afternoon", "evening"];

export function RoutinesScreen() {
  const i18n = useI18n();
  const { t } = i18n;
  const [tab, setTab] = useState<"routines" | "chores" | "extras" | "history">("routines");
  const [draft, setDraft] = useState<Draft | null>(null);
  const { getMembers, allRoutines } = useStore();
  const kids = getMembers().filter((m) => m.role === "child");
  const firstAdult = getMembers().find((m) => m.role !== "child")?.id ?? null;

  const newChore = (memberId: string | null, value: TaskValue = { kind: "expected" }, recurrence: Recurrence = { kind: "daily" }) =>
    setDraft({ kind: "chore", memberId, recurrence, item: { id: "new", pictogram: "toothbrush", label: "", value } });
  const newRoutine = (m: Member) => {
    const used = new Set(allRoutines().filter((r) => r.memberId === m.id).map((r) => r.period));
    const period = PERIODS.find((p) => !used.has(p)) ?? "morning";
    setDraft({ kind: "step", memberId: m.id, period, recurrence: { kind: "daily" }, item: { id: "new", pictogram: "toothbrush", label: "", value: { kind: "expected" } } });
  };

  return (
    <div>
      <PageHeader title={t("routines.title")} subtitle={t("routines.subtitle")}
        actions={kids.map((k) => (
          <Link key={k.id} href={`/kids/${k.id}`}><Button variant="outline" size="md"><Maximize2 size={16} />{k.name}</Button></Link>
        ))} />
      <Segmented className="mb-6" value={tab} onChange={setTab} options={[
        { value: "routines", label: t("routines.tabRoutines") }, { value: "chores", label: t("routines.tabChores") },
        { value: "extras", label: t("routines.tabExtras") }, { value: "history", label: t("routines.tabHistory") },
      ]} />

      {tab === "routines" && (
        <div className="flex flex-col gap-8">
          {kids.length === 0 && <p className="rounded-panel bg-surface p-6 text-soft">{t("routines.noChildren")}</p>}
          {kids.map((m) => <MemberRoutines key={m.id} member={m} onEdit={setDraft} onAdd={() => newRoutine(m)} />)}
        </div>
      )}

      {tab === "history" && <History />}

      {tab === "chores" && (
        <ChoreList kind="expected" onEdit={setDraft} onAdd={() => newChore(firstAdult, { kind: "expected" }, { kind: "weekdays", days: [2] })} />
      )}

      {tab === "extras" && (
        <>
          <div className="mb-5 grid gap-3 md:grid-cols-2">
            <Explain title={t("rewards.expectedTitle")} body={t("rewards.expectedBody")} />
            <Explain title={t("rewards.extraTitle")} body={t("rewards.extraBody")} accent />
          </div>
          <ChoreList kind="extra" onEdit={setDraft} onAdd={() => newChore(kids[0]?.id ?? null, { kind: "extra", points: 20, needsApproval: true }, { kind: "once", date: new Date().toISOString().slice(0, 10) })} />
        </>
      )}

      {draft && <TaskEditor draft={draft} onClose={() => setDraft(null)} />}
    </div>
  );
}

function Explain({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-card p-5", accent ? "bg-star/15" : "bg-surface")}>
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mt-1 text-soft">{body}</p>
    </div>
  );
}

function MemberRoutines({ member, onEdit, onAdd }: { member: Member; onEdit: (d: Draft) => void; onAdd: () => void }) {
  const i18n = useI18n();
  const { t, tx } = i18n;
  const { allRoutines } = useStore();
  const routines = allRoutines().filter((r) => r.memberId === member.id);
  return (
    <section style={{ "--m": member.color } as CSSProperties}>
      <header className="mb-3 flex items-center gap-3">
        <Avatar member={member} size="md" />
        <h2 className="font-display text-2xl font-bold">{member.name}</h2>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onAdd}><Plus size={16} />{t("routines.addRoutine")}</Button>
      </header>
      <div className="grid gap-3 lg:grid-cols-3">
        {routines.map((r) => {
          const I = PERIOD_ICON[r.period];
          return (
            <div key={r.id} className="rounded-panel bg-surface p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="tint m-text grid h-9 w-9 place-items-center rounded-full"><I size={18} /></span>
                <div>
                  <p className="font-bold leading-tight">{t(`period.${r.period}`)}</p>
                  <p className="text-sm text-soft">{describeRecurrence(r.recurrence, i18n)}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {r.items.map((it) => (
                  <button key={it.id} onClick={() => onEdit({ kind: "step", memberId: member.id, item: it, recurrence: r.recurrence, routineId: r.id, period: r.period })} title={tx(it.label)}
                    className="tint m-text flex aspect-square flex-col items-center justify-center gap-1 rounded-tile hover:ring-2 hover:ring-[var(--m)]">
                    <Pictogram id={it.pictogram} className="h-7 w-7" />
                    <span className="line-clamp-1 px-1 text-[11px] font-bold text-soft">{tx(it.label)}</span>
                  </button>
                ))}
                <button onClick={() => onEdit({ kind: "step", memberId: member.id, item: { id: "new", pictogram: "book", label: "", value: { kind: "expected" } }, recurrence: r.recurrence, routineId: r.id, period: r.period })}
                  aria-label={t("routines.addStep")} className="grid aspect-square place-items-center rounded-tile border-2 border-dashed border-line text-soft hover:text-ink">
                  <Plus />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ChoreList({ kind, onEdit, onAdd }: { kind: "expected" | "extra"; onEdit: (d: Draft) => void; onAdd: () => void }) {
  const i18n = useI18n();
  const { t, tx } = i18n;
  const { allChores, getMember } = useStore();
  const chores = allChores().filter((c) => c.item.value.kind === kind);
  return (
    <div className="rounded-panel bg-surface p-2">
      <ul className="divide-y divide-line">
        {chores.length === 0 && <li className="p-3 text-soft">{t("routines.noChores")}</li>}
        {chores.map((c) => {
          const m = getMember(c.memberId);
          return (
            <li key={c.id}>
              <button onClick={() => onEdit({ kind: "chore", memberId: c.memberId, item: c.item, recurrence: c.recurrence })} style={{ "--m": m?.color ?? "rgb(var(--soft))" } as CSSProperties}
                className="flex w-full items-center gap-4 rounded-card p-3 text-left hover:bg-sunken">
                <span className="tint m-text grid h-12 w-12 shrink-0 place-items-center rounded-tile"><Pictogram id={c.item.pictogram} className="h-6 w-6" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{tx(c.item.label)}</span>
                  <span className="block text-sm text-soft">{describeRecurrence(c.recurrence, i18n)}</span>
                </span>
                {c.item.value.kind === "extra" && (
                  <span className="flex items-center gap-2">
                    {c.item.value.needsApproval && <ShieldCheck size={18} className="text-soft" aria-label={t("routines.needsApproval")} />}
                    <RewardAmount points={c.item.value.points} plus />
                  </span>
                )}
                {m ? <span className="flex items-center gap-2 text-sm font-bold"><Avatar member={m} size="sm" /><span className="max-sm:hidden">{m.name}</span></span>
                  : <span className="text-sm font-bold text-soft">{t("common.anyone")}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <Button variant="ghost" className="m-2" onClick={onAdd}><Plus size={18} />{t("routines.addChore")}</Button>
    </div>
  );
}

function TaskEditor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const { t, tx } = useI18n();
  const { getMember, getMembers, run } = useStore();
  const [d, setD] = useState(draft);
  // New tasks and new routines can go to several people at once; one copy is saved per person.
  const multi = isNew(draft) && !(draft.kind === "step" && draft.routineId);
  const [who, setWho] = useState<(string | null)[]>([draft.memberId]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const member = getMember(multi ? who[0] ?? null : d.memberId);
  const item = d.item;
  const step = d.kind === "step";
  const set = (p: Partial<TaskItem>) => setD((x) => ({ ...x, item: { ...x.item, ...p } }));
  const preview: TaskItem = { ...item, label: tx(item.label) || " " };

  const finish = async (call: () => Promise<ActionResult<unknown>>) => {
    setBusy(true);
    const r = await run(call);
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };
  const saveFor = (memberId: string | null) => step
    ? saveRoutineStep({
      stepId: isNew(d) ? undefined : item.id, routineId: d.routineId, memberId: memberId!, period: d.period ?? "morning",
      recurrence: d.recurrence, pictogram: item.pictogram, label: item.label,
    })
    : saveChore({ id: isNew(d) ? undefined : item.id, memberId, pictogram: item.pictogram, label: item.label, value: item.value, recurrence: d.recurrence });
  const save = () => finish(async () => {
    if (!multi) return saveFor(d.memberId);
    let last: ActionResult<unknown> = { ok: true, data: undefined };
    for (const id of who) {
      last = await saveFor(id);
      if (!last.ok) break;
    }
    return last;
  });
  const remove = () => finish(() => (step ? deleteRoutineStep({ id: item.id }) : deleteChore({ id: item.id })));
  const people = step ? getMembers() : [...getMembers(), null];
  const selected = (id: string | null) => (multi ? who.includes(id) : d.memberId === id);
  const pick = (id: string | null) => {
    if (!multi) return setD((x) => ({ ...x, memberId: id }));
    // "Anyone" stands alone: it can't be combined with named people.
    setWho((w) => (id === null ? [null] : w.includes(id) ? w.filter((x) => x !== id) : [...w.filter((x) => x !== null), id]));
  };
  const canSave = multi ? who.length > 0 : !(step && !d.memberId);

  return (
    <Dialog open wide onClose={onClose} title={isNew(d) ? (step && !d.routineId ? t("routines.addRoutine") : t("routines.newTask")) : t("routines.editTask")}
      footer={<>
        {!isNew(d) && <Button variant="ghost" className="mr-auto" onClick={remove} disabled={busy}><Trash2 size={16} />{t("common.delete")}</Button>}
        <ErrorText code={error} className="self-center" />
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" onClick={save} disabled={busy || !canSave}>{t("common.save")}</Button>
      </>}>
      <div style={{ "--m": member?.color ?? "rgb(var(--soft))" } as CSSProperties} className="grid gap-6 md:grid-cols-[1fr_220px]">
        <div className="flex flex-col gap-6">
          <Field label={t("routines.pictogram")}><PictogramPicker value={item.pictogram} onChange={(pictogram) => set({ pictogram })} /></Field>
          <Field label={t("routines.label")} hint={t("routines.labelHint")}>
            <input className={inputCls} value={tx(item.label)} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label={t("routines.assignTo")} hint={multi ? t("routines.assignToMany") : undefined}>
            <div className="flex flex-wrap gap-2">
              {people.map((m) => (
                <button key={m?.id ?? "any"} disabled={step && !!d.routineId} onClick={() => pick(m?.id ?? null)} aria-pressed={selected(m?.id ?? null)}
                  className={cn("inline-flex h-11 items-center gap-2 rounded-full border-2 pl-1 pr-4 font-bold", selected(m?.id ?? null) ? "border-ink" : "border-line text-soft")}>
                  {m ? <Avatar member={m} size="sm" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-sunken">?</span>}{m?.name ?? t("common.anyone")}
                </button>
              ))}
            </div>
          </Field>
          {step && (
            <Field label={t("routines.period")} hint={d.routineId ? t("routines.routineWide") : undefined}>
              <Segmented value={d.period ?? "morning"} onChange={(period) => setD((x) => ({ ...x, period }))}
                options={PERIODS.map((p) => ({ value: p, label: t(`period.${p}`) }))} />
            </Field>
          )}
          <Field label={t("routines.repeats")} hint={step && d.routineId ? t("routines.routineWide") : undefined}><RecurrenceEditor value={d.recurrence} onChange={(recurrence) => setD((x) => ({ ...x, recurrence }))} /></Field>
          {!step && <Field label={t("routines.points")}>
            <div className="flex flex-col gap-3">
              <Segmented value={item.value.kind} onChange={(k) => set({ value: k === "expected" ? { kind: "expected" } : { kind: "extra", points: 20, needsApproval: true } })}
                options={[{ value: "expected", label: t("routines.expected") }, { value: "extra", label: t("routines.extra") }]} />
              <p className="text-sm text-soft">{item.value.kind === "expected" ? t("routines.expectedHint") : t("routines.extraHint")}</p>
              {item.value.kind === "extra" && (() => {
                const v = item.value;
                return (
                  <div className="flex flex-col gap-3 rounded-card bg-sunken p-4">
                    <div className="flex items-center justify-between gap-3">
                      <RewardAmount points={v.points} iconSize={20} className="text-lg" />
                      <Stepper value={v.points} step={5} min={5} max={200} onChange={(points) => set({ value: { ...v, points } })} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold">{t("routines.needsApproval")}</span>
                      <Switch label={t("routines.needsApproval")} checked={v.needsApproval} onChange={(needsApproval) => set({ value: { ...v, needsApproval } })} />
                    </div>
                  </div>
                );
              })()}
            </div>
          </Field>}
        </div>
        <div className="md:sticky md:top-0 md:self-start">
          <p className="mb-2 text-sm font-bold text-soft">{t("routines.preview", { name: member?.name ?? t("common.anyone") })}</p>
          <div className="tint rounded-card p-4"><TaskCard item={preview} done={false} onToggle={() => {}} /></div>
        </div>
      </div>
    </Dialog>
  );
}
