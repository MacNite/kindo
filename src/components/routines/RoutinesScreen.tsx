"use client";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Maximize2, Moon, Plus, Sun, Sunrise, ShieldCheck, Trash2, X } from "lucide-react";
import type { ActionResult, Member, Period, Recurrence, Routine, TaskItem, TaskValue } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { addRoutineSteps, deleteChore, deleteRoutineStep, saveChore, saveRoutineStep } from "@/lib/services/actions";
import { DEFAULT_ROUTINE_POINTS, routineStepValue } from "@/lib/ledger";
import { getPictogram } from "@/lib/pictograms";
import { recurrenceKey } from "@/lib/recurrence";
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

/** What the editor works on: one routine step, or a chore. */
interface Draft {
  kind: "step" | "chore";
  memberId: string | null;
  item: TaskItem;
  recurrence: Recurrence;
  /** Steps: period and rhythm pick the routine the step lands in (D50). */
  period?: Period;
}
const isNew = (d: Draft) => d.item.id === "new";
const PERIODS: Period[] = ["morning", "afternoon", "evening"];
const RHYTHMS: Recurrence["kind"][] = ["daily", "schoolDays", "weekdays", "weekly", "monthly", "once"];

/** Blocks in day order: morning before evening, every day before school days. */
const byDayOrder = (a: Routine, b: Routine) =>
  PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period)
  || RHYTHMS.indexOf(a.recurrence.kind) - RHYTHMS.indexOf(b.recurrence.kind)
  || recurrenceKey(a.recurrence).localeCompare(recurrenceKey(b.recurrence));

export function RoutinesScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"routines" | "chores" | "history">("routines");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState(false);
  const { getMembers } = useStore();
  const kids = getMembers().filter((m) => m.role === "child");
  const firstAdult = getMembers().find((m) => m.role !== "child")?.id ?? null;

  const newChore = () =>
    setDraft({ kind: "chore", memberId: firstAdult, recurrence: { kind: "weekdays", days: [2] }, item: { id: "new", pictogram: "toothbrush", label: "", value: { kind: "expected" } } });

  return (
    <div>
      <PageHeader title={t("routines.title")} subtitle={t("routines.subtitle")}
        actions={kids.map((k) => (
          <Link key={k.id} href={`/kids/${k.id}`}><Button variant="outline" size="md"><Maximize2 size={16} />{k.name}</Button></Link>
        ))} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented value={tab} onChange={setTab} options={[
          { value: "routines", label: t("routines.tabRoutines") }, { value: "chores", label: t("routines.tabChores") },
          { value: "history", label: t("routines.tabHistory") },
        ]} />
        {tab === "routines" && getMembers().length > 0 && (
          <Button variant="primary" onClick={() => setAdding(true)}><Plus size={18} />{t("routines.addRoutine")}</Button>
        )}
        {tab === "chores" && <Button variant="primary" onClick={newChore}><Plus size={18} />{t("routines.addChore")}</Button>}
      </div>

      {tab === "routines" && (
        <div className="flex flex-col gap-8">
          {kids.length === 0 && <p className="rounded-panel bg-surface p-6 text-soft">{t("routines.noChildren")}</p>}
          {kids.map((m) => <MemberRoutines key={m.id} member={m} onEdit={setDraft} />)}
        </div>
      )}

      {tab === "history" && <History />}

      {tab === "chores" && <ChoreList onEdit={setDraft} />}

      {draft && <TaskEditor draft={draft} onClose={() => setDraft(null)} />}
      {adding && <NewRoutine onClose={() => setAdding(false)} />}
    </div>
  );
}

function MemberRoutines({ member, onEdit }: { member: Member; onEdit: (d: Draft) => void }) {
  const i18n = useI18n();
  const { t, tx } = i18n;
  const { allRoutines, rewardMode } = useStore();
  const routines = allRoutines().filter((r) => r.memberId === member.id).sort(byDayOrder);
  const showPoints = rewardMode !== "off" && !!member.routineRewards?.on;
  return (
    <section style={{ "--m": member.color } as CSSProperties}>
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <Avatar member={member} size="md" />
        <h2 className="font-display text-2xl font-bold">{member.name}</h2>
        {rewardMode !== "off" && <RoutineRewards member={member} />}
      </header>
      {routines.length === 0 && <p className="rounded-panel bg-surface p-5 text-soft">{t("routines.noRoutines")}</p>}
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
                  <button key={it.id} onClick={() => onEdit({ kind: "step", memberId: member.id, item: it, recurrence: r.recurrence, period: r.period })} title={tx(it.label)}
                    className="tint m-text relative flex aspect-square flex-col items-center justify-center gap-1 rounded-tile hover:ring-2 hover:ring-[var(--m)]">
                    <Pictogram id={it.pictogram} className="h-7 w-7" />
                    <span className="line-clamp-1 px-1 text-[11px] font-bold text-soft">{tx(it.label)}</span>
                    {showPoints && it.value.kind === "extra" && (
                      <RewardAmount points={it.value.points} iconSize={11} className="absolute right-1.5 top-1 text-[11px] text-ink" />
                    )}
                  </button>
                ))}
                <button onClick={() => onEdit({ kind: "step", memberId: member.id, item: { id: "new", pictogram: "book", label: "", value: { kind: "expected" } }, recurrence: r.recurrence, period: r.period })}
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

/** Points for a child's routine steps, while they get used to them (§9, D49). */
function RoutineRewards({ member }: { member: Member }) {
  const { t } = useI18n();
  const { setRoutineRewards } = useStore();
  const { on, points } = member.routineRewards ?? { on: false, points: DEFAULT_ROUTINE_POINTS };
  return (
    <div className="ml-auto flex flex-wrap items-center gap-3 rounded-full bg-surface py-1.5 pl-4 pr-2" title={t("routines.routineRewardsHint")}>
      <span className="text-sm font-bold">{t("routines.routineRewards")}</span>
      {on && (
        <span className="flex items-center gap-2 text-sm text-soft">
          <Stepper value={points} min={1} max={100} onChange={(n) => setRoutineRewards(member.id, true, n)} />
          {t("routines.perStep")}
        </span>
      )}
      <Switch label={`${t("routines.routineRewards")}: ${member.name}`} checked={on} onChange={(v) => setRoutineRewards(member.id, v, points)} />
    </div>
  );
}

function ChoreList({ onEdit }: { onEdit: (d: Draft) => void }) {
  const i18n = useI18n();
  const { t, tx } = i18n;
  const { allChores, getMember, rewardMode } = useStore();
  const chores = allChores();
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
                {c.item.value.kind === "extra" && rewardMode !== "off" && (
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
    </div>
  );
}

/** People picker for new routines and chores: several at once, or "anyone" alone. */
function PeoplePicker({ people, selected, onPick, disabled }: {
  people: (Member | null)[]; selected: (id: string | null) => boolean; onPick: (id: string | null) => void; disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2">
      {people.map((m) => (
        <button key={m?.id ?? "any"} type="button" disabled={disabled} onClick={() => onPick(m?.id ?? null)} aria-pressed={selected(m?.id ?? null)}
          className={cn("inline-flex h-11 items-center gap-2 rounded-full border-2 pl-1 pr-4 font-bold", selected(m?.id ?? null) ? "border-ink" : "border-line text-soft")}>
          {m ? <Avatar member={m} size="sm" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-sunken">?</span>}{m?.name ?? t("common.anyone")}
        </button>
      ))}
    </div>
  );
}

/**
 * "New routine": who, when, how often, and several pictures at once. Steps
 * join the routine a person already has for that period and rhythm (D50).
 */
function NewRoutine({ onClose }: { onClose: () => void }) {
  const { t, tx } = useI18n();
  const { getMembers, getMember, run, periodAt } = useStore();
  const kids = getMembers().filter((m) => m.role === "child");
  const [who, setWho] = useState<string[]>(kids.length === 1 ? [kids[0].id] : []);
  const [period, setPeriod] = useState<Period>(() => periodAt());
  const [recurrence, setRecurrence] = useState<Recurrence>({ kind: "daily" });
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const member = getMember(who[0]);
  const toggle = (id: string) => setSteps((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const labelOf = (id: string) => getPictogram(id)?.label ?? "";

  const save = async () => {
    setBusy(true);
    const r = await run(() => addRoutineSteps({ memberIds: who, period, recurrence, steps: steps.map((pictogram) => ({ pictogram, label: labelOf(pictogram) })) }));
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };

  return (
    <Dialog open wide onClose={onClose} title={t("routines.addRoutine")}
      footer={<>
        <ErrorText code={error} className="mr-auto self-center" />
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" onClick={save} disabled={busy || !who.length || !steps.length}>{t("common.save")}</Button>
      </>}>
      <div style={{ "--m": member?.color ?? "rgb(var(--soft))" } as CSSProperties} className="flex flex-col gap-6">
        <Field label={t("routines.assignTo")} hint={t("routines.assignToMany")}>
          <PeoplePicker people={getMembers()} selected={(id) => !!id && who.includes(id)}
            onPick={(id) => id && setWho((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]))} />
        </Field>
        <Field label={t("routines.period")}>
          <Segmented value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p, label: t(`period.${p}`) }))} />
        </Field>
        <Field label={t("routines.repeats")} hint={t("routines.joinsHint")}><RecurrenceEditor value={recurrence} onChange={setRecurrence} /></Field>
        <Field label={t("routines.pickSteps")} hint={t("routines.pickStepsHint")}>
          <div className="flex flex-col gap-3">
            {steps.length > 0 && (
              <ol className="flex flex-wrap gap-2">
                {steps.map((id) => (
                  <li key={id}>
                    <button type="button" onClick={() => toggle(id)} aria-label={t("routines.removeStep", { name: tx(labelOf(id)) || id })}
                      className="tint m-text relative grid h-16 w-16 place-items-center rounded-tile">
                      <Pictogram id={id} className="h-7 w-7" />
                      <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-surface"><X size={12} /></span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <PictogramPicker value={steps[steps.length - 1] ?? ""} selected={steps} onChange={toggle} />
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

function TaskEditor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const { t, tx } = useI18n();
  const { getMember, getMembers, run, rewardMode } = useStore();
  const [d, setD] = useState(draft);
  const step = d.kind === "step";
  // New chores can go to several people at once; one copy is saved per person.
  const multi = isNew(draft) && !step;
  const [who, setWho] = useState<(string | null)[]>([draft.memberId]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const member = getMember(multi ? who[0] ?? null : d.memberId);
  const item = d.item;
  const set = (p: Partial<TaskItem>) => setD((x) => ({ ...x, item: { ...x.item, ...p } }));
  // A step's own setting: "expected" follows the child's routine points (D49).
  const own: TaskValue = item.own ?? { kind: "expected" };
  const routinePoints = member?.routineRewards?.points ?? DEFAULT_ROUTINE_POINTS;
  const preview: TaskItem = { ...item, label: tx(item.label) || " ", value: step ? routineStepValue(own, member?.routineRewards, rewardMode) : item.value };

  const finish = async (call: () => Promise<ActionResult<unknown>>) => {
    setBusy(true);
    const r = await run(call);
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  };
  const saveFor = (memberId: string | null) => step
    ? saveRoutineStep({
      stepId: isNew(d) ? undefined : item.id, memberId: memberId!, period: d.period ?? "morning", recurrence: d.recurrence,
      pictogram: item.pictogram, label: item.label, points: own.kind === "extra" ? own.points : null,
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
    <Dialog open wide onClose={onClose} title={isNew(d) ? (step ? t("routines.newTask") : t("routines.addChore")) : t("routines.editTask")}
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
            <PeoplePicker people={people} selected={selected} onPick={pick} disabled={step} />
          </Field>
          {step && (
            <Field label={t("routines.period")} hint={t("routines.sameBlock")}>
              <Segmented value={d.period ?? "morning"} onChange={(period) => setD((x) => ({ ...x, period }))}
                options={PERIODS.map((p) => ({ value: p, label: t(`period.${p}`) }))} />
            </Field>
          )}
          <Field label={t("routines.repeats")}><RecurrenceEditor value={d.recurrence} onChange={(recurrence) => setD((x) => ({ ...x, recurrence }))} /></Field>
          {step && rewardMode !== "off" && (
            <Field label={t("routines.points")}>
              <div className="flex flex-col gap-3">
                <Segmented value={own.kind} onChange={(k) => set({ own: k === "expected" ? { kind: "expected" } : { kind: "extra", points: routinePoints, needsApproval: false } })}
                  options={[{ value: "expected", label: t("routines.stepDefault") }, { value: "extra", label: t("routines.stepOwn") }]} />
                {own.kind === "extra" && (
                  <div className="flex items-center justify-between gap-3 rounded-card bg-sunken p-4">
                    <RewardAmount points={own.points} iconSize={20} className="text-lg" />
                    <Stepper value={own.points} min={0} max={200} onChange={(points) => set({ own: { ...own, points } })} />
                  </div>
                )}
                <p className="text-sm text-soft">
                  {member?.routineRewards?.on
                    ? t("routines.stepDefaultHint", { name: member.name, n: routinePoints })
                    : t("routines.stepOffHint", { name: member?.name ?? "" })}
                </p>
              </div>
            </Field>
          )}
          {!step && rewardMode !== "off" && <Field label={t("routines.points")}>
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
          <div className="tint rounded-card p-4"><TaskCard item={preview} done={false} onToggle={() => {}} showReward={rewardMode !== "off"} /></div>
        </div>
      </div>
    </Dialog>
  );
}
