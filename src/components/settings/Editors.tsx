"use client";
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { Cake, CalendarHeart, ChevronRight, GraduationCap, Heart, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { ImportantDate, ImportantDateKind, Member, Role } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useToday } from "@/lib/useToday";
import { upcomingDates } from "@/lib/dates-important";
import { deleteImportantDate, deleteMember, saveImportantDate, saveMember, setDayTimes, setHolidayFeeds, syncHolidaysNow } from "@/lib/services/actions";
import { EMOJI_CHOICES } from "@/lib/pictograms";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Avatar } from "../ui/Avatar";
import { Field, Segmented, inputCls } from "../ui/Segmented";
import { MemberPicker } from "../ui/MemberPicker";
import { ErrorText } from "../ui/ErrorText";
import { cn } from "../ui/cn";

/** Calm, distinct member colours that read on both themes (§3, §16). */
export const MEMBER_COLORS = ["#3B78C2", "#2E8B6E", "#8A5CD1", "#E39A1B", "#C2477A", "#2A8C9E", "#B4443C", "#5B6A6D"];
const AVATAR_EMOJI = ["🦊", "🐻", "🦄", "🦖", "🐼", "🐸", "🦁", "🐯", "🐨", "🐰", "🐙", "🦉", "🐝", "🐢", "🐳", "🌻"];

export function MemberEditor({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { t } = useI18n();
  const { getMembers, run } = useStore();
  const used = new Set(getMembers().map((m) => m.color));
  const [name, setName] = useState(member?.name ?? "");
  const [role, setRole] = useState<Role>(member?.role ?? "child");
  const [color, setColor] = useState(member?.color ?? MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[0]);
  const [avatar, setAvatar] = useState<Member["avatar"]>(member?.avatar ?? { kind: "emoji", value: "🐼" });
  const [birthday, setBirthday] = useState(member?.birthday ?? "");
  const [error, setError] = useState<string | null>(null);
  const preview: Member = { id: "preview", name: name || "?", role, color, avatar, birthday };
  const done = (r: { ok: boolean; error?: string }) => (r.ok ? onClose() : setError(r.error ?? "server"));

  return (
    <Dialog open onClose={onClose} title={member ? t("settings.members.edit") : t("settings.members.add")}
      footer={<>
        {member && <Button variant="ghost" className="mr-auto" onClick={async () => done(await run(() => deleteMember({ id: member.id })))}><Trash2 size={16} />{t("common.delete")}</Button>}
        <ErrorText code={error} className="self-center" />
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={!name.trim()}
          onClick={async () => done(await run(() => saveMember({ id: member?.id, name, role, color, avatar, birthday: birthday || undefined })))}>{t("common.save")}</Button>
      </>}>
      <div className="flex flex-col gap-5" style={{ "--m": color } as CSSProperties}>
        <div className="flex items-center gap-4">
          <Avatar member={preview} size="lg" />
          <Field label={t("settings.members.name")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
        <Field label={t("settings.members.role")}>
          <Segmented value={role} onChange={setRole} options={(["child", "adult", "admin"] as const).map((r) => ({ value: r, label: t(`roles.${r}`) }))} />
        </Field>
        <Field label={t("settings.members.color")}>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {MEMBER_COLORS.map((c) => (
              <button type="button" key={c} role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)}
                className={cn("h-10 w-10 rounded-full", color === c && "ring-4 ring-ink/30 ring-offset-2 ring-offset-surface")} style={{ background: c }} />
            ))}
          </div>
        </Field>
        <Field label={t("settings.members.avatar")}>
          <div className="grid grid-cols-8 gap-2">
            <button type="button" aria-pressed={avatar.kind === "initial"} onClick={() => setAvatar({ kind: "initial" })}
              className={cn("grid aspect-square place-items-center rounded-tile font-display text-xl font-bold", avatar.kind === "initial" ? "tint-strong ring-2 ring-[var(--m)]" : "bg-sunken")}>
              {(name || "?")[0]}
            </button>
            {[...new Set([...AVATAR_EMOJI, ...EMOJI_CHOICES])].slice(0, 23).map((e) => (
              <button type="button" key={e} aria-pressed={avatar.kind === "emoji" && avatar.value === e} onClick={() => setAvatar({ kind: "emoji", value: e })}
                className={cn("grid aspect-square place-items-center rounded-tile text-2xl", avatar.kind === "emoji" && avatar.value === e ? "tint-strong ring-2 ring-[var(--m)]" : "bg-sunken")}>{e}</button>
            ))}
          </div>
        </Field>
        <Field label={t("settings.members.birthday")}><input type="date" className={inputCls} value={birthday} onChange={(e) => setBirthday(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

const DATE_ICON = { birthday: Cake, anniversary: Heart, school: GraduationCap, other: CalendarHeart };
const KINDS: ImportantDateKind[] = ["birthday", "anniversary", "school", "other"];

/** Birthdays, anniversaries and other dates with countdowns (§12). */
export function DatesSection() {
  const { t, tx, fmt } = useI18n();
  const today = useToday();
  const { data, getMember } = useStore();
  const [editing, setEditing] = useState<ImportantDate | "new" | null>(null);
  const dates = upcomingDates(data.dates, today);
  return (
    <>
      <p className="mb-4 max-w-prose text-soft">{t("settings.dates.hint")}</p>
      <div className="rounded-panel bg-surface p-2">
        <ul className="divide-y divide-line">
          {dates.length === 0 && <li className="p-3 text-soft">{t("dates.none")}</li>}
          {dates.map((d) => {
            const I = DATE_ICON[d.kind];
            const m = getMember(d.memberId);
            return (
              <li key={d.id}>
                <button onClick={() => setEditing(d)} style={{ "--m": m?.color ?? "rgb(var(--soft))" } as CSSProperties} className="flex w-full items-center gap-4 rounded-card p-3 text-left hover:bg-sunken">
                  <span className="tint m-text grid h-10 w-10 shrink-0 place-items-center rounded-full"><I size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{tx(d.title)}</span>
                    <span className="text-sm text-soft">{t(`dates.${d.kind}`)}, {fmt.dateMedium(d.next)}{d.turns ? `, ${d.kind === "anniversary" ? t("dates.years", { n: d.turns }) : t("dates.turns", { n: d.turns })}` : ""}</span>
                  </span>
                  <Pencil size={16} className="text-soft" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        <Button variant="ghost" className="m-2" onClick={() => setEditing("new")}><Plus size={18} />{t("settings.dates.add")}</Button>
      </div>
      {editing && <DateEditor date={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function DateEditor({ date, onClose }: { date: ImportantDate | null; onClose: () => void }) {
  const { t, tx } = useI18n();
  const { getMembers, run } = useStore();
  const [kind, setKind] = useState<ImportantDateKind>(date?.kind ?? "birthday");
  const [title, setTitle] = useState(date ? tx(date.title) : "");
  const [day, setDay] = useState(date?.date ?? "");
  const [yearly, setYearly] = useState(date?.yearly ?? true);
  const [memberId, setMemberId] = useState<string | null>(date?.memberId ?? null);
  const [error, setError] = useState<string | null>(null);
  const done = (r: { ok: boolean; error?: string }) => (r.ok ? onClose() : setError(r.error ?? "server"));
  return (
    <Dialog open onClose={onClose} title={date ? t("settings.dates.edit") : t("settings.dates.add")}
      footer={<>
        {date && <Button variant="ghost" className="mr-auto" onClick={async () => done(await run(() => deleteImportantDate({ id: date.id })))}><Trash2 size={16} />{t("common.delete")}</Button>}
        <ErrorText code={error} className="self-center" />
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" disabled={!title.trim() || !day}
          onClick={async () => done(await run(() => saveImportantDate({ id: date?.id, kind, title, date: day, yearly, memberId })))}>{t("common.save")}</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <Field label={t("settings.dates.kind")}>
          <Segmented size="sm" value={kind} onChange={(k) => { setKind(k); setYearly(k === "birthday" || k === "anniversary"); }} options={KINDS.map((k) => ({ value: k, label: t(`dates.${k}`) }))} />
        </Field>
        <Field label={t("routines.label")}><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={t("settings.dates.date")} hint={yearly ? t("settings.dates.yearlyHint") : undefined}><input type="date" className={inputCls} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" className="h-5 w-5" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />{t("settings.dates.yearly")}</label>
        <Field label={t("settings.dates.who")}><MemberPicker members={getMembers()} value={memberId} onChange={setMemberId} noneLabel={t("common.everyone")} /></Field>
      </div>
    </Dialog>
  );
}

/** Times of day, the daily reset and the school-holiday feeds (§7, §19.3). */
export function RoutineSettings() {
  const { t, fmt } = useI18n();
  const { data, run } = useStore();
  const h = data.household;
  const [times, setTimes] = useState({ dayStartsAt: h.dayStartsAt, morningUntil: h.morningUntil, afternoonUntil: h.afternoonUntil });
  const [feeds, setFeeds] = useState(h.holidayIcsUrls.join("\n"));
  const [state, setState] = useState<{ error?: string; saved?: "times" | "feeds"; syncing?: boolean }>({});
  const upcoming = data.holidays.filter((x) => x.end >= new Date().toISOString().slice(0, 10)).slice(0, 4);

  const saveTimes = async () => {
    const r = await run(() => setDayTimes(times));
    setState(r.ok ? { saved: "times" } : { error: r.error });
  };
  const saveFeeds = async () => {
    const urls = feeds.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    const r = await run(() => setHolidayFeeds({ urls }));
    if (!r.ok) return setState({ error: r.error });
    setState({ saved: "feeds", syncing: urls.length > 0 });
    if (urls.length) {
      const s = await run(() => syncHolidaysNow({}));
      setState(s.ok ? { saved: "feeds" } : { error: s.error });
    }
  };
  const field = (k: keyof typeof times, label: string) => (
    <Field label={label}><input type="time" className={inputCls} value={times[k]} onChange={(e) => setTimes((x) => ({ ...x, [k]: e.target.value }))} /></Field>
  );

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-panel bg-surface p-5">
        <p className="font-bold">{t("settings.routines.periods")}</p>
        <p className="-mt-3 text-sm text-soft">{t("settings.routines.periodsHint")}</p>
        <div className="grid grid-cols-2 gap-3">
          {field("morningUntil", t("settings.routines.morningUntil"))}
          {field("afternoonUntil", t("settings.routines.afternoonUntil"))}
        </div>
        {field("dayStartsAt", t("settings.routines.resetAt"))}
        <p className="-mt-2 text-sm text-soft">{t("settings.routines.resetHint")}</p>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={saveTimes}>{t("common.save")}</Button>
          {state.saved === "times" && <span role="status" className="text-sm font-bold text-ok">{t("common.saved")}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-panel bg-surface p-5">
        <Field label={t("settings.routines.schoolCal")} hint={t("settings.routines.schoolCalHint")}>
          <textarea className={cn(inputCls, "h-24 py-2.5 font-mono text-sm")} value={feeds} onChange={(e) => setFeeds(e.target.value)} placeholder="https://www.schulferien.org/media/ical/deutschland/ferien_baden-wuerttemberg_2026.ics" />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={saveFeeds} disabled={state.syncing}><RefreshCw size={16} className={cn(state.syncing && "animate-spin")} />{t("settings.routines.saveAndSync")}</Button>
          {state.saved === "feeds" && !state.syncing && <span role="status" className="text-sm font-bold text-ok">{t("common.saved")}</span>}
          <ErrorText code={state.error} />
        </div>
        <p className="text-sm text-soft">
          {h.holidaysError ? <span className="font-bold text-[#B4443C] dark:text-[#E98A80]">{t("settings.routines.syncFailed", { error: h.holidaysError })}</span>
            : h.holidaysSyncedAt ? t("settings.routines.synced", { when: `${fmt.dateMedium(h.holidaysSyncedAt)} ${fmt.time(h.holidaysSyncedAt)}`, n: data.holidays.length })
            : h.holidayIcsUrls.length ? t("settings.routines.notSynced") : t("settings.routines.noFeeds")}
        </p>
        {upcoming.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {upcoming.map((x) => <li key={x.start + x.summary} className="flex justify-between gap-3"><span className="font-bold">{x.summary}</span><span className="num text-soft">{x.start === x.end ? x.start : `${x.start} – ${x.end}`}</span></li>)}
          </ul>
        )}
      </div>
      <Link href="/routines"><Button variant="outline">{t("nav.routines")}<ChevronRight size={16} /></Button></Link>
    </div>
  );
}
