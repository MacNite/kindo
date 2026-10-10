"use client";
import { Fragment, useRef, useState } from "react";
import { BookUser, ChevronRight, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import type { ConnectionInfo, ContactBirthday } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { initials, parseBirthday } from "@/lib/birthdays";
import { listAddressBooks, setContactBooks, setContactPhoto, updateContactBirthday } from "@/lib/services/birthdays";
import { CONTACT_MUTED } from "../birthdays/Birthdays";
import { MEMBER_COLORS, colorName } from "../ui/memberColors";
import { squarePhoto } from "../ui/squarePhoto";
import { Button, LinkButton } from "../ui/Button";
import { Switch, inputCls } from "../ui/Segmented";
import { ErrorText } from "../ui/ErrorText";
import { cn } from "../ui/cn";

interface ContactsConfig { books?: string[]; autoShow?: boolean; syncedAt?: string }
const contactsOf = (c: ConnectionInfo) => (c.config.contacts ?? {}) as ContactsConfig;

/**
 * Settings → Birthdays (§12, D46): which address books feed the birthday
 * wheel, and for each contact whether it shows, the name Kindo uses, whom it
 * belongs to and how it looks: muted, a colour or an uploaded photo (D61).
 * Nothing here is written back to the address book.
 */
export function BirthdaySettings() {
  const { t } = useI18n();
  const { data } = useStore();
  const nextclouds = data.connections.filter((c) => c.kind === "caldav");
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-soft">{t("settings.birthdays.hint")}</p>
      {nextclouds.length ? nextclouds.map((c) => <AddressBooks key={c.id} conn={c} />) : (
        <div className="flex flex-wrap items-center gap-3 rounded-panel bg-surface p-5">
          <p className="flex-1 text-soft">{t("settings.birthdays.noConnection")}</p>
          <LinkButton href="/settings?section=integrations" variant="outline">{t("settings.birthdays.openIntegrations")}<ChevronRight size={16} /></LinkButton>
        </div>
      )}
      <ContactTable contacts={data.birthdays} />
      <p className="max-w-prose text-sm text-soft">{t("settings.birthdays.wallHint")}</p>
    </div>
  );
}

function AddressBooks({ conn }: { conn: ConnectionInfo }) {
  const { t, fmt } = useI18n();
  const { run } = useStore();
  const cfg = contactsOf(conn);
  const [books, setBooks] = useState<{ url: string; name: string }[] | null>(null);
  const [chosen, setChosen] = useState(new Set(cfg.books ?? []));
  const [autoShow, setAutoShow] = useState(cfg.autoShow ?? false);
  const [busy, setBusy] = useState<"load" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setBusy("load");
    const r = await listAddressBooks({ id: conn.id });
    setBusy(null);
    if (r.ok) {
      setBooks(r.data);
      setError(null);
    } else setError(r.error);
  };
  const save = async () => {
    setBusy("save");
    const r = await run(() => setContactBooks({ id: conn.id, books: [...chosen], autoShow }));
    setBusy(null);
    setError(r.ok ? null : r.error);
  };

  return (
    <section className="flex flex-col gap-3 rounded-panel bg-surface p-5" data-testid="contact-books">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-tile bg-sunken"><BookUser size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t("settings.birthdays.source")}: {conn.name}{conn.username && <span className="font-normal text-soft">, {conn.username}</span>}</p>
          <p className="text-sm text-soft">{t("settings.birthdays.sourceHint")}</p>
          <p className="mt-1 text-sm text-soft">
            {!cfg.books?.length ? t("settings.birthdays.off")
              : cfg.syncedAt ? t("settings.birthdays.synced", { when: `${fmt.dateMedium(new Date(cfg.syncedAt))} ${fmt.time(new Date(cfg.syncedAt))}` })
              : t("settings.birthdays.notSynced")}
          </p>
        </div>
      </div>
      {books === null ? (
        <div><Button size="sm" variant="outline" disabled={busy === "load"} onClick={load}>{busy === "load" ? t("settings.birthdays.loading") : t("settings.birthdays.loadBooks")}</Button></div>
      ) : (
        <>
          {books.length === 0 ? <p className="text-soft">{t("settings.birthdays.noBooks")}</p> : (
            <div className="flex flex-wrap gap-2">
              {books.map((b) => (
                <label key={b.url} className="inline-flex h-10 items-center gap-2 rounded-full border-2 border-line px-4 font-bold has-[:checked]:border-ink">
                  <input type="checkbox" className="h-5 w-5" checked={chosen.has(b.url)}
                    onChange={(e) => setChosen((s) => { const n = new Set(s); if (e.target.checked) n.add(b.url); else n.delete(b.url); return n; })} />
                  {b.name}
                </label>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span><span className="block font-bold">{t("settings.birthdays.autoShow")}</span><span className="block text-sm text-soft">{t("settings.birthdays.autoShowHint")}</span></span>
            <Switch label={t("settings.birthdays.autoShow")} checked={autoShow} onChange={setAutoShow} />
          </div>
          <div><Button variant="primary" disabled={busy === "save"} onClick={save}><RefreshCw size={16} className={cn(busy === "save" && "animate-spin")} />{t("settings.birthdays.save")}</Button></div>
        </>
      )}
      <ErrorText code={error} />
    </section>
  );
}

function ContactTable({ contacts }: { contacts: ContactBirthday[] }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const needle = q.trim().toLocaleLowerCase();
  const shown = contacts.filter((c) => !needle || `${c.name} ${c.alias ?? ""}`.toLocaleLowerCase().includes(needle));
  return (
    <section className="rounded-panel bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">{t("settings.birthdays.contacts")}</h3>
        {contacts.length > 0 && <input type="search" className={cn(inputCls, "max-w-xs")} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("settings.birthdays.search")} aria-label={t("settings.birthdays.search")} />}
      </div>
      {contacts.length > 0 && <p className="mb-3 max-w-prose text-sm text-soft">{t("settings.birthdays.lookHint")}</p>}
      {contacts.length === 0 ? <p className="text-soft">{t("settings.birthdays.noContacts")}</p>
        : shown.length === 0 ? <p className="text-soft">{t("settings.birthdays.noMatch")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line text-xs font-bold uppercase tracking-wider text-soft">
                  <th className="p-2">{t("settings.birthdays.show")}</th><th className="p-2">{t("settings.birthdays.look")}</th><th className="p-2">{t("settings.birthdays.name")}</th>
                  <th className="p-2">{t("settings.birthdays.alias")}</th><th className="p-2">{t("settings.birthdays.date")}</th><th className="p-2">{t("settings.birthdays.whose")}</th>
                </tr>
              </thead>
              <tbody>{shown.map((c) => <ContactRow key={c.id} c={c} />)}</tbody>
            </table>
          </div>
        )}
    </section>
  );
}

function ContactRow({ c }: { c: ContactBirthday }) {
  const { t, fmt } = useI18n();
  const { getMembers, run } = useStore();
  const [alias, setAlias] = useState(c.alias ?? "");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (patch: { show?: boolean; alias?: string; memberId?: string | null; color?: string | null }) => {
    const r = await run(() => updateContactBirthday({ id: c.id, ...patch }));
    setError(r.ok ? null : r.error);
  };
  const p = parseBirthday(c.date);
  const day = p ? (p.year ? fmt.dateShort(new Date(p.year, p.month, p.day)) : fmt.dateMedium(new Date(2024, p.month, p.day))) : c.date;
  const name = c.alias?.trim() || c.name;
  return (
    <Fragment>
      <tr className={cn("border-b border-line last:border-0", !c.show && "[&>td:not(:first-child)]:opacity-60", open && "border-b-0")}>
        <td className="p-2"><Switch label={`${t("settings.birthdays.show")}: ${c.name}`} checked={c.show} onChange={(show) => save({ show })} /></td>
        <td className="p-2">
          <button type="button" aria-expanded={open} aria-label={t("settings.birthdays.lookFor", { name })} title={t("settings.birthdays.lookFor", { name })}
            onClick={() => setOpen((o) => !o)} className={cn("rounded-full", open && "ring-4 ring-ink/30 ring-offset-2 ring-offset-surface")}>
            <ContactFace c={c} />
          </button>
        </td>
        <td className="p-2 font-bold">{c.name}<ErrorText code={error} /></td>
        <td className="p-2">
          <input className={cn(inputCls, "h-10 min-w-[160px]")} value={alias} placeholder={t("settings.birthdays.aliasPlaceholder")} aria-label={t("settings.birthdays.aliasFor", { name: c.name })}
            onChange={(e) => setAlias(e.target.value)} onBlur={() => alias.trim() !== (c.alias ?? "") && save({ alias: alias.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        </td>
        <td className="num whitespace-nowrap p-2">{day}</td>
        <td className="p-2">
          <select className={cn(inputCls, "h-10")} value={c.memberId ?? ""} aria-label={`${t("settings.birthdays.whose")}: ${c.name}`}
            onChange={(e) => save({ memberId: e.target.value || null })}>
            <option value="">{t("settings.birthdays.nobody")}</option>
            {getMembers().map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-line last:border-0">
          <td colSpan={6} className="px-2 pb-4"><ContactLook c={c} name={name} onColor={(color) => save({ color })} /></td>
        </tr>
      )}
    </Fragment>
  );
}

/** The contact as the wheel shows it: its photo, or its initials on its colour (muted when it has none). */
function ContactFace({ c }: { c: ContactBirthday }) {
  if (c.photo) return <img src={c.photo} alt="" className="block h-10 w-10 rounded-full object-cover" />;
  return (
    <span style={{ background: c.color ?? CONTACT_MUTED }} className="grid h-10 w-10 place-items-center rounded-full font-display text-sm font-bold text-white">
      {initials(c.alias?.trim() || c.name)}
    </span>
  );
}

/** Colour swatches (muted first, the default) and the photo upload for one contact. */
function ContactLook({ c, name, onColor }: { c: ContactBirthday; name: string; onColor: (color: string | null) => void }) {
  const { t } = useI18n();
  const { run } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (picked: File | undefined) => {
    if (!picked) return;
    setBusy(true);
    let photo: string;
    try {
      photo = await squarePhoto(picked);
    } catch {
      setBusy(false);
      setError("photo");
      return;
    }
    const r = await run(() => setContactPhoto({ id: c.id, photo }));
    setBusy(false);
    setError(r.ok ? null : r.error);
  };
  const remove = async () => {
    const r = await run(() => setContactPhoto({ id: c.id, photo: null }));
    setError(r.ok ? null : r.error);
  };
  const swatch = (value: string | null, label: string) => {
    const on = (c.color ?? null) === value;
    return (
      <button type="button" key={value ?? "muted"} role="radio" aria-checked={on} aria-label={label} title={label} onClick={() => !on && onColor(value)}
        className={cn("h-10 w-10 rounded-full", on && "ring-4 ring-ink/30 ring-offset-2 ring-offset-surface")} style={{ background: value ?? CONTACT_MUTED }} />
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card bg-sunken p-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("settings.birthdays.lookFor", { name })}>
        {swatch(null, t("settings.birthdays.muted"))}
        {MEMBER_COLORS.map((hex) => swatch(hex, t(colorName(hex) ?? "settings.members.color")))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" tabIndex={-1} aria-hidden
          onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => file.current?.click()}>
          <ImagePlus size={16} />{busy ? t("settings.birthdays.uploading") : c.photo ? t("settings.birthdays.changePhoto") : t("settings.birthdays.uploadPhoto")}
        </Button>
        {c.photo && <Button size="sm" variant="outline" disabled={busy} onClick={remove}><Trash2 size={16} />{t("settings.birthdays.removePhoto")}</Button>}
      </div>
      <ErrorText code={error} className="basis-full" />
    </div>
  );
}
