"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  CalendarDays, ChevronRight, Cloud, Gift, Globe, House, ImageIcon, Languages, LayoutGrid, Palette, Plug, Plus, Rss, Sparkles, Users,
} from "lucide-react";
import type { Integration } from "@/lib/types";
import { useI18n, type MessageKey } from "@/i18n";
import { usePrefs } from "@/lib/state/prefs";
import { LANGUAGES, REGIONS, type RegionId } from "@/i18n/config";
import { FAMILY_NAME } from "@/lib/data/members";
import { WEATHER } from "@/lib/data/weather";
import { INTEGRATIONS } from "@/lib/data/integrations";
import { getMembers, getMember } from "@/lib/services/household";
import { getSources } from "@/lib/services/calendar";
import { PROVIDER_ICON } from "../calendar/CalendarScreen";
import { RewardModePicker } from "../rewards/RewardsScreen";
import { PageHeader } from "../ui/Panel";
import { Avatar, AvatarStack } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Field, Segmented, Switch, inputCls } from "../ui/Segmented";
import { cn } from "../ui/cn";

const SECTIONS = [
  { id: "family", Icon: House }, { id: "members", Icon: Users }, { id: "calendar", Icon: CalendarDays },
  { id: "routines", Icon: Sparkles }, { id: "rewards", Icon: Gift }, { id: "photos", Icon: ImageIcon },
  { id: "dashboard", Icon: LayoutGrid }, { id: "appearance", Icon: Palette }, { id: "language", Icon: Languages },
  { id: "integrations", Icon: Plug },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsScreen() {
  const { t } = useI18n();
  const [section, setSection] = useState<SectionId | null>(null);
  // Desktop always shows a section; phones show the list first.
  const active = section ?? "integrations";

  return (
    <div>
      <PageHeader title={t("settings.title")} />
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <nav className={cn("flex flex-col gap-1", section && "max-md:hidden")}>
          {SECTIONS.map(({ id, Icon }) => (
            <button key={id} onClick={() => setSection(id)} aria-current={active === id ? "page" : undefined}
              className={cn("flex h-12 items-center gap-3 rounded-full px-4 text-left font-bold max-md:bg-surface max-md:rounded-card max-md:h-14",
                active === id ? "md:bg-ink md:text-surface" : "text-soft hover:bg-sunken hover:text-ink max-md:text-ink")}>
              <Icon size={19} />{t(`settings.sections.${id}`)}<ChevronRight size={18} className="ml-auto md:hidden" />
            </button>
          ))}
        </nav>
        <div className={cn("min-w-0", !section && "max-md:hidden")}>
          <button onClick={() => setSection(null)} className="mb-3 font-bold text-soft md:hidden">← {t("common.back")}</button>
          <h2 className="mb-4 font-display text-2xl font-bold">{t(`settings.sections.${active}`)}</h2>
          <Section id={active} />
        </div>
      </div>
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-panel bg-surface p-5", className)}>{children}</div>;
}
function Hint({ children }: { children: ReactNode }) {
  return <p className="mb-4 max-w-prose text-soft">{children}</p>;
}

function Section({ id }: { id: SectionId }) {
  const { t, tx, fmt, language, weekdayName, region } = useI18n();
  const { prefs, setPrefs } = usePrefs();

  switch (id) {
    case "family":
      return (
        <Card className="flex max-w-xl flex-col gap-4">
          <Field label={t("settings.family.name")} hint={t("settings.family.hint")}><input className={inputCls} defaultValue={FAMILY_NAME} /></Field>
          <Field label={t("settings.family.location")}><input className={inputCls} defaultValue={WEATHER.place} /></Field>
          <Field label={t("settings.family.timezone")}><input className={inputCls} defaultValue="Europe/Berlin" /></Field>
        </Card>
      );

    case "members":
      return (
        <>
          <Hint>{t("settings.members.hint")}</Hint>
          <div className="grid gap-3 lg:grid-cols-2">
            {getMembers().map((m) => (
              <Card key={m.id} className="flex items-start gap-4">
                <Avatar member={m} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-bold">{m.name}</p>
                  <p className="text-sm font-bold text-soft">{t(`roles.${m.role}`)}</p>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-soft">{t("settings.members.color")}</dt>
                    <dd className="flex items-center gap-2"><span className="h-4 w-4 rounded-full" style={{ background: m.color }} />{m.color}</dd>
                    {m.birthday && <><dt className="text-soft">{t("settings.members.birthday")}</dt><dd>{fmt.dateShort(new Date(m.birthday + "T00:00"))}</dd></>}
                    <dt className="text-soft">{t("settings.members.login")}</dt>
                    <dd className="min-w-0 truncate">{m.account ? m.account.email : <span className="text-soft">{t("settings.members.noLogin")}</span>}</dd>
                  </dl>
                </div>
              </Card>
            ))}
          </div>
          <Button className="mt-4" variant="outline"><Plus size={18} />{t("settings.members.add")}</Button>
        </>
      );

    case "calendar":
      return (
        <>
          <Hint>{t("settings.calendar.hint")}</Hint>
          <Card className="p-2">
            <ul className="divide-y divide-line">
              {getSources().map((s) => {
                const I = PROVIDER_ICON[s.provider];
                return (
                  <li key={s.id} className="flex items-center gap-4 p-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-sunken"><I size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{tx(s.name)}</span>
                      <span className="block truncate text-sm text-soft">{t(`providers.${s.provider}`)}{s.account && `, ${s.account}`}</span>
                    </span>
                    <span className="text-sm text-soft max-sm:hidden">{t("settings.calendar.belongsTo")}</span>
                    {s.defaultMemberIds.length ? <AvatarStack size="sm" members={s.defaultMemberIds.map((x) => getMember(x)!)} /> : <span className="text-sm font-bold">{t("common.everyone")}</span>}
                  </li>
                );
              })}
            </ul>
            <Button variant="ghost" className="m-2"><Plus size={18} />{t("settings.calendar.add")}</Button>
          </Card>
        </>
      );

    case "routines":
      return (
        <Card className="flex max-w-xl flex-col gap-4">
          <p className="font-bold">{t("settings.routines.periods")}</p>
          <p className="-mt-3 text-sm text-soft">{t("settings.routines.periodsHint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("settings.routines.morningUntil")}><input type="time" className={inputCls} defaultValue="11:00" /></Field>
            <Field label={t("settings.routines.afternoonUntil")}><input type="time" className={inputCls} defaultValue="17:00" /></Field>
          </div>
          <Field label={t("settings.routines.resetAt")}><input type="time" className={inputCls} defaultValue="03:00" /></Field>
          <Field label={t("settings.routines.schoolCal")}>
            <select className={inputCls}><option>{tx({ en: "Lindenhof Primary (ICS)", de: "Grundschule Lindenhof (ICS)" })}</option></select>
          </Field>
          <Link href="/routines"><Button variant="outline">{t("nav.routines")}<ChevronRight size={16} /></Button></Link>
        </Card>
      );

    case "rewards":
      return <RewardModePicker />;

    case "photos":
      return <Link href="/photos"><Button variant="outline">{t("nav.photos")}<ChevronRight size={16} /></Button></Link>;

    case "dashboard":
      return (
        <div className="grid max-w-3xl gap-3 md:grid-cols-2">
          <Card>
            <p className="font-bold">{t("settings.dashboard.layout")}</p>
            <p className="mb-4 text-sm text-soft">{t("settings.dashboard.layoutHint")}</p>
            <Link href="/"><Button variant="outline">{t("settings.dashboard.openLayout")}</Button></Link>
          </Card>
          <Card>
            <p className="font-bold">{t("settings.dashboard.kiosk")}</p>
            <p className="mb-4 text-sm text-soft">{t("settings.dashboard.kioskHint")}</p>
            <Link href="/wall"><Button variant="outline">{t("settings.dashboard.openKiosk")}</Button></Link>
          </Card>
          <Card className="flex items-center justify-between gap-3 md:col-span-2">
            <span className="font-bold">{t("settings.dashboard.pin")}</span>
            <Switch label={t("settings.dashboard.pin")} checked onChange={() => {}} />
          </Card>
        </div>
      );

    case "appearance":
      return (
        <Card className="flex max-w-xl flex-col gap-6">
          <Field label={t("settings.appearance.theme")}>
            <Segmented value={prefs.theme} onChange={(theme) => setPrefs({ theme })} options={[
              { value: "light", label: t("settings.appearance.light") }, { value: "dark", label: t("settings.appearance.dark") }, { value: "system", label: t("settings.appearance.system") },
            ]} />
          </Field>
          <Field label={t("settings.appearance.textSize")}>
            <Segmented value={prefs.textSize} onChange={(textSize) => setPrefs({ textSize })} options={[
              { value: "normal", label: t("settings.appearance.normal") }, { value: "large", label: t("settings.appearance.large") },
            ]} />
          </Field>
          <div className="flex gap-2">{getMembers().map((m) => <span key={m.id} className="h-10 flex-1 rounded-tile" style={{ background: m.color }} title={m.name} />)}</div>
        </Card>
      );

    case "language": {
      const sample = new Date(TODAY_SAMPLE);
      return (
        <div className="grid max-w-3xl gap-3 md:grid-cols-2">
          <Card className="flex flex-col gap-5">
            <p className="text-sm text-soft">{t("settings.language.hint")}</p>
            <Field label={t("settings.language.language")}>
              <div className="flex flex-col gap-2">
                {LANGUAGES.map((l) => (
                  <button key={l.id} onClick={() => setPrefs({ language: l.id })} aria-pressed={language === l.id}
                    className={cn("flex h-12 items-center justify-between rounded-card border-2 px-4 font-bold", language === l.id ? "border-ink" : "border-line text-soft")}>
                    {l.native}<span className="text-sm uppercase">{l.id}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t("settings.language.region")}>
              <select className={inputCls} value={prefs.region} onChange={(e) => setPrefs({ region: e.target.value as RegionId })}>
                {Object.keys(REGIONS).map((r) => <option key={r} value={r}>{new Intl.DisplayNames([language], { type: "region" }).of(r.split("-")[1])} ({r})</option>)}
              </select>
            </Field>
          </Card>
          <Card>
            <p className="mb-3 font-bold">{t("settings.language.preview")}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
              <dt className="text-soft">{t("settings.language.date")}</dt><dd className="font-bold">{fmt.dateLong(sample)}<br /><span className="num font-normal">{fmt.dateShort(sample)}</span></dd>
              <dt className="text-soft">{t("settings.language.time")}</dt><dd className="num font-bold">{fmt.time(sample)}</dd>
              <dt className="text-soft">{t("settings.language.weekStart")}</dt><dd className="font-bold">{weekdayName(region.weekStartsOn)}</dd>
              <dt className="text-soft">{t("settings.language.number")}</dt><dd className="num font-bold">{fmt.num(1234.5)}</dd>
              <dt className="text-soft">{t("settings.language.currency")}</dt><dd className="num font-bold">{fmt.money(6.25)}</dd>
            </dl>
          </Card>
        </div>
      );
    }

    case "integrations":
      return (
        <>
          <Hint>{t("settings.integrations.hint")}</Hint>
          <div className="grid gap-3 lg:grid-cols-2">
            {INTEGRATIONS.map((i) => <IntegrationCard key={i.id} integration={i} />)}
          </div>
        </>
      );
  }
}

const TODAY_SAMPLE = new Date(new Date().getFullYear(), 11, 24, 18, 30).getTime();

const INT_ICON: Record<Integration["id"], typeof Cloud> = { nextcloud: Cloud, immich: ImageIcon, google: Globe, ics: Rss, homeassistant: House };

function IntegrationCard({ integration: i }: { integration: Integration }) {
  const { t, tx } = useI18n();
  const I = INT_ICON[i.id];
  const status = { connected: { cls: "bg-ok/15 text-ok", dot: "bg-ok" }, partial: { cls: "bg-star/20 text-ink", dot: "bg-star" }, off: { cls: "bg-sunken text-soft", dot: "bg-line" } }[i.status];
  const primary = i.id === "nextcloud";
  return (
    <Card className={cn("flex flex-col gap-3", primary && "lg:col-span-2 ring-2 ring-ink/10")}>
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-tile bg-sunken"><I size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold">{t(`settings.integrations.${i.id}` as MessageKey)}</p>
          <p className="text-sm text-soft">{t(`settings.integrations.${i.id}Body` as MessageKey)}</p>
          <span className={cn("mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", status.cls)}>
            <span className={cn("h-2 w-2 rounded-full", status.dot)} />{t(`common.${i.status}`)}
          </span>
        </div>
      </div>
      {i.detail && <p className="text-sm">{tx(i.detail)}</p>}
      {primary && (
        <div className="grid gap-3 rounded-card bg-sunken p-4 sm:grid-cols-2">
          <Field label="Server"><input className={inputCls} defaultValue="https://cloud.mueller.home" readOnly /></Field>
          <Field label={t("settings.members.login")}><input className={inputCls} defaultValue="anna" readOnly /></Field>
        </div>
      )}
      <div><Button size="sm" variant={i.status === "off" ? "primary" : "outline"}>{i.status === "off" ? t("common.configure") : t("common.edit")}</Button></div>
    </Card>
  );
}
