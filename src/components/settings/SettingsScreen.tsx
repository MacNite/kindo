"use client";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Cake, CalendarDays, CalendarHeart, ChevronRight, Gift, House, ImageIcon, KeyRound, Languages, LayoutGrid, Lock, Monitor, Palette, Pencil, Plug, Plus, Sparkles, UserRound, Users,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { usePrefs } from "@/lib/state/prefs";
import { fixedScheme } from "@/lib/designs";
import { useStore } from "@/lib/state/store";
import { updateHousehold } from "@/lib/services/actions";
import { LANGUAGES, REGIONS, type RegionId } from "@/i18n/config";
import { MemberEditor, DatesSection, RoutineSettings } from "./Editors";
import { AccountSection, DevicesSection, LoginEditor, PinCard } from "./AccountSections";
import { CalendarSourcesSection, IntegrationsSection } from "./IntegrationSections";
import { BirthdaySettings } from "./BirthdaySettings";
import { WallTilesCard } from "./WallTiles";
import { MediaPinCard } from "./MediaPinCard";
import { DesignPicker } from "./DesignPicker";
import { MemberColors } from "./MemberColors";
import { lockAgain } from "@/lib/services/accounts";
import { ErrorText } from "../ui/ErrorText";
import { RewardModePicker } from "../rewards/RewardsScreen";
import { PageHeader } from "../ui/Panel";
import { Avatar } from "../ui/Avatar";
import { Button, LinkButton } from "../ui/Button";
import { Field, Segmented, inputCls } from "../ui/Segmented";
import { cn } from "../ui/cn";

const SECTIONS = [
  { id: "family", Icon: House }, { id: "members", Icon: Users }, { id: "dates", Icon: CalendarHeart }, { id: "birthdays", Icon: Cake }, { id: "calendar", Icon: CalendarDays },
  { id: "routines", Icon: Sparkles }, { id: "rewards", Icon: Gift }, { id: "photos", Icon: ImageIcon },
  { id: "dashboard", Icon: LayoutGrid }, { id: "appearance", Icon: Palette }, { id: "language", Icon: Languages },
  { id: "integrations", Icon: Plug }, { id: "devices", Icon: Monitor }, { id: "account", Icon: UserRound },
] as const;
/** Sections only an admin changes; everyone else doesn't see them (the server refuses anyway). */
const ADMIN_ONLY = new Set(["integrations", "devices", "birthdays"]);
type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsScreen() {
  const { t } = useI18n();
  const params = useSearchParams();
  const asked = params.get("section");
  const { viewer, requestPin } = useStore();
  const sections = SECTIONS.filter((s) => (s.id === "account" ? viewer.kind === "user" : !ADMIN_ONLY.has(s.id) || viewer.isAdmin));
  const [section, setSection] = useState<SectionId | null>(() => sections.find((s) => s.id === asked)?.id ?? null);
  // Desktop always shows a section; phones show the list first.
  const active = section ?? "family";

  // A wall display shows settings only after someone enters the PIN (§19.4).
  if (viewer.kind === "device" && !viewer.elevated) {
    return (
      <div>
        <PageHeader title={t("settings.title")} />
        <div className="flex max-w-md flex-col items-start gap-4 rounded-panel bg-surface p-6">
          <Lock size={28} className="text-soft" />
          <p className="text-soft">{viewer.pinSet ? t("pin.settingsLocked") : t("pin.notSet")}</p>
          {viewer.pinSet && <Button variant="primary" onClick={requestPin}><KeyRound size={18} />{t("pin.unlock")}</Button>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("settings.title")}
        actions={viewer.kind === "device" ? <Button variant="outline" onClick={async () => { await lockAgain(); window.location.reload(); }}><Lock size={16} />{t("pin.lock")}</Button> : undefined} />
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <nav className={cn("flex flex-col gap-1", section && "max-md:hidden")}>
          {sections.map(({ id, Icon }) => (
            <button key={id} onClick={() => setSection(id)} aria-current={active === id ? "page" : undefined}
              className={cn("flex h-12 items-center gap-3 rounded-full px-4 text-left font-bold max-md:bg-surface max-md:rounded-card max-md:h-14",
                active === id ? "md:bg-ink md:text-surface" : "text-soft hover:bg-sunken hover:text-ink max-md:text-ink")}>
              <Icon size={19} />{t(`settings.sections.${id}`)}<ChevronRight size={18} className="ml-auto md:hidden" />
            </button>
          ))}
        </nav>
        <div className={cn("min-w-0", !section && "max-md:hidden")}>
          <button onClick={() => setSection(null)} className="mb-3 font-bold text-soft md:hidden"><span aria-hidden>← </span>{t("common.back")}</button>
          <h2 className="mb-4 font-display text-2xl font-bold">{t(`settings.sections.${active}`)}</h2>
          <Section id={active} code={params.get("code") ?? undefined} />
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

function Section({ id, code }: { id: SectionId; code?: string }) {
  const { t, fmt, language, weekdayName, region } = useI18n();
  const { prefs, setPrefs } = usePrefs();
  const { getMembers, getMember, viewer } = useStore();
  const [editingMember, setEditingMember] = useState<string | "new" | null>(null);
  const [editingLogin, setEditingLogin] = useState<string | null>(null);

  switch (id) {
    case "family":
      return <FamilyForm />;

    case "dates":
      return <DatesSection />;

    case "birthdays":
      return <BirthdaySettings />;

    case "account":
      return <AccountSection />;

    case "devices":
      return <DevicesSection initialCode={code} />;

    case "members":
      return (
        <>
          <Hint>{t("settings.members.hint")}</Hint>
          <div className="grid gap-3 lg:grid-cols-2">
            {getMembers().map((m) => (
              <Card key={m.id} className="relative flex items-start gap-4">
                {viewer.isAdmin && <button onClick={() => setEditingMember(m.id)} aria-label={`${t("common.edit")}: ${m.name}`} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-soft hover:bg-sunken"><Pencil size={16} /></button>}
                <Avatar member={m} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xl font-bold">{m.name}</p>
                  <p className="text-sm font-bold text-soft">{t(`roles.${m.role}`)}</p>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                    <dt className="text-soft">{t("settings.members.color")}</dt>
                    <dd className="flex items-center gap-2"><span className="h-4 w-4 rounded-full" style={{ background: m.color }} />{m.color}</dd>
                    {m.birthday && <><dt className="text-soft">{t("settings.members.birthday")}</dt><dd>{fmt.dateShort(new Date(m.birthday + "T00:00"))}</dd></>}
                    <dt className="text-soft">{t("settings.members.login")}</dt>
                    <dd className="min-w-0 truncate">{m.account ? m.account.email ?? t("logins.has") : <span className="text-soft">{m.role === "child" ? t("settings.members.noLogin") : t("logins.none")}</span>}</dd>
                  </dl>
                  {viewer.isAdmin && m.role !== "child" && (
                    <Button size="sm" variant="ghost" className="-ml-3 mt-2" onClick={() => setEditingLogin(m.id)}><KeyRound size={14} />{m.account ? t("logins.manage") : t("logins.give")}</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {viewer.isAdmin && <Button className="mt-4" variant="outline" onClick={() => setEditingMember("new")}><Plus size={18} />{t("settings.members.add")}</Button>}
          {editingMember && <MemberEditor member={editingMember === "new" ? null : getMember(editingMember) ?? null} onClose={() => setEditingMember(null)} />}
          {editingLogin && getMember(editingLogin) && <LoginEditor member={getMember(editingLogin)!} onClose={() => setEditingLogin(null)} />}
        </>
      );

    case "calendar":
      return <CalendarSourcesSection />;

    case "routines":
      return <RoutineSettings />;

    case "rewards":
      return <RewardModePicker />;

    case "photos":
      return <LinkButton href="/photos" variant="outline">{t("nav.photos")}<ChevronRight size={16} /></LinkButton>;

    case "dashboard":
      return (
        <div className="grid max-w-3xl gap-3 md:grid-cols-2">
          <Card>
            <p className="font-bold">{t("settings.dashboard.layout")}</p>
            <p className="mb-4 text-sm text-soft">{t("settings.dashboard.layoutHint")}</p>
            <LinkButton href="/" variant="outline">{t("settings.dashboard.openLayout")}</LinkButton>
          </Card>
          <Card>
            <p className="font-bold">{t("settings.dashboard.kiosk")}</p>
            <p className="mb-4 text-sm text-soft">{t("settings.dashboard.kioskHint")}</p>
            <LinkButton href="/wall" variant="outline">{t("settings.dashboard.openKiosk")}</LinkButton>
          </Card>
          <div className="md:col-span-2"><WallTilesCard /></div>
          <div className="md:col-span-2"><PinCard /></div>
          <div className="md:col-span-2"><MediaPinCard /></div>
        </div>
      );

    case "appearance": {
      const fixed = fixedScheme(prefs.design);
      return (
        <Card className="flex max-w-3xl flex-col gap-6">
          <DesignPicker />
          <Field label={t("settings.appearance.theme")}
            hint={fixed && t(fixed === "dark" ? "settings.appearance.fixedDark" : "settings.appearance.fixedLight", { style: t(`settings.appearance.designs.${prefs.design}`) })}>
            <Segmented value={prefs.theme} onChange={(theme) => setPrefs({ theme })} disabled={!!fixed} options={[
              { value: "light", label: t("settings.appearance.light") }, { value: "dark", label: t("settings.appearance.dark") }, { value: "system", label: t("settings.appearance.system") },
            ]} />
          </Field>
          <Field label={t("settings.appearance.textSize")}>
            <Segmented value={prefs.textSize} onChange={(textSize) => setPrefs({ textSize })} options={[
              { value: "normal", label: t("settings.appearance.normal") }, { value: "large", label: t("settings.appearance.large") },
            ]} />
          </Field>
          <MemberColors />
        </Card>
      );
    }

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
      return <IntegrationsSection />;
  }
}

const TODAY_SAMPLE = new Date(new Date().getFullYear(), 11, 24, 18, 30).getTime();

function FamilyForm() {
  const { t } = useI18n();
  const { data, run } = useStore();
  const h = data.household;
  const [name, setName] = useState(h.name);
  const [location, setLocation] = useState(h.location ?? "");
  const [timezone, setTimezone] = useState(h.timezone);
  const [state, setState] = useState<{ error?: string; saved?: boolean }>({});
  // What became of the saved place: its weather, still loading, or not found (§20 D55).
  const saved = h.location ?? "";
  const locationHint = !saved || location.trim() !== saved ? t("settings.family.locationHint")
    : data.weather ? t("settings.family.weatherFor", { place: data.weather.place })
    : h.weatherError ? t("settings.family.weatherError") : t("settings.family.weatherLoading");
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [h.timezone];
  const save = async () => {
    const r = await run(() => updateHousehold({ name, location, timezone }));
    setState(r.ok ? { saved: true } : { error: r.error });
  };
  return (
    <Card className="flex max-w-xl flex-col gap-4">
      <Field label={t("settings.family.name")} hint={t("settings.family.hint")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t("settings.family.location")} hint={locationHint}><input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
      <Field label={t("settings.family.timezone")}>
        <select className={inputCls} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {(zones.includes(timezone) ? zones : [timezone, ...zones]).map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </Field>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={!name.trim()}>{t("common.save")}</Button>
        {state.saved && <span role="status" className="text-sm font-bold text-ok">{t("common.saved")}</span>}
        <ErrorText code={state.error} />
      </div>
    </Card>
  );
}
