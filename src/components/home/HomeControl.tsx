"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Fan, House, Lightbulb, Plug, Plus, Power, Sun, ToggleRight, UtilityPole, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useHome } from "@/lib/state/useHome";
import { domainOf, powerParts, type EnergyFlow, type SwitchState } from "@/lib/home";
import { Button, LinkButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Panel, PageHeader } from "../ui/Panel";
import { cn } from "../ui/cn";

const DOMAIN_ICON: Record<string, LucideIcon> = { light: Lightbulb, switch: Plug, fan: Fan, input_boolean: ToggleRight };

/**
 * Home control (§21): the switches the admin picked, "everything off", and
 * the solar flow. Calm and large, like the rest of the wall: no graphs, no
 * history, nothing to tinker with.
 */
export function HomeControlScreen() {
  const { t } = useI18n();
  const { viewer } = useStore();
  const { setup, state, loading, toggle, allOff } = useHome();

  if (!setup) {
    return (
      <>
        <PageHeader title={t("homeControl.title")} />
        <Panel>
          <p className="max-w-prose text-soft">{t("homeControl.notSetUp")}</p>
          {viewer.isAdmin && <LinkButton href="/settings?section=integrations" variant="outline" className="mt-4">{t("homeControl.setUp")}<ChevronRight size={16} /></LinkButton>}
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("homeControl.title")} subtitle={t("homeControl.subtitle")}
        actions={setup.controls.length > 0 && <AllOffButton count={setup.controls.length} onConfirm={allOff} size="lg" />} />
      {state && !state.reachable && <p role="status" className="mb-4 rounded-card bg-surface p-4 font-bold">{t("homeControl.unreachable")}</p>}
      <div className="flex flex-col gap-4">
        {setup.energy && (
          <Panel title={t("homeControl.energy")}>
            <EnergyView energy={state?.energy ?? null} loading={loading} large />
          </Panel>
        )}
        {setup.controls.length > 0 && (
          <Panel title={t("homeControl.switches")}>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {(state?.switches ?? setup.controls.map((c) => ({ ...c, on: false, available: false }))).map((s) => (
                <li key={s.entityId}><SwitchButton s={s} pending={!state} onToggle={toggle} large /></li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}

/**
 * The compact view for the wall's household column and the home-screen
 * widget: power now, the switches as chips, and the way to everything else.
 */
export function HomeTile({ large }: { large?: boolean }) {
  const { t } = useI18n();
  const { setup, state, loading, toggle, allOff } = useHome();
  if (!setup) return null;
  const switches = state?.switches ?? setup.controls.map((c) => ({ ...c, on: false, available: false }));
  // In the wall's top strip only one row fits: the first switch and a way to the others.
  const more = large && switches.length > 2 ? switches.length - 1 : 0;
  return (
    <section data-testid="home-tile" className={cn("home-tile flex flex-col gap-4 rounded-panel bg-surface", large ? "p-6" : "p-5")}>
      <header className="flex items-center justify-between gap-3">
        <Link href="/home-control" className={cn("min-w-0 font-bold hover:underline underline-offset-4", large ? "wall-tile-label text-lg text-soft" : "font-display text-lg font-semibold tracking-tight")}>{t("homeControl.title")}</Link>
        {setup.controls.length > 0 && <AllOffButton count={setup.controls.length} onConfirm={allOff} size={large ? "md" : "sm"} />}
      </header>
      {setup.energy && <EnergyView energy={state?.energy ?? null} loading={loading} compact />}
      {setup.controls.length > 0 && (
        <ul className={cn("home-tile-chips grid grid-cols-2 gap-2", more > 0 && "home-tile-chips-more")}>
          {switches.map((s) => (
            <li key={s.entityId}><SwitchChip s={s} pending={!state} onToggle={toggle} large={large} /></li>
          ))}
          {more > 0 && (
            <li className="home-tile-more">
              <Link href="/home-control" aria-label={t("homeControl.moreSwitches", { n: more })}
                className="flex h-14 w-full items-center justify-center gap-1 rounded-full border-2 border-line text-lg font-bold">
                <Plus size={20} aria-hidden />{more}
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** The home-screen widget (§4). */
export function HomeWidget() {
  const { t } = useI18n();
  const { home } = useStore();
  if (!home) return <Panel title={t("widgets.home")}><p className="text-soft">{t("homeControl.notSetUp")}</p></Panel>;
  return <HomeTile />;
}

function Watts({ watts, className }: { watts: number | null; className?: string }) {
  const { fmt } = useI18n();
  if (watts === null) return <span className={cn("num", className)}>–</span>;
  const p = powerParts(watts);
  return <span className={cn("num whitespace-nowrap", className)}>{fmt.num(p.value)}<span className="ml-1 text-[0.55em] font-bold text-soft">{p.unit}</span></span>;
}

/** Solar, the house and the grid, each with its own picture, and how much of the house the sun covers. */
function EnergyView({ energy, loading, large, compact }: { energy: EnergyFlow | null; loading: boolean; large?: boolean; compact?: boolean }) {
  const { t, fmt } = useI18n();
  const solar = energy?.solar ?? null;
  const house = energy?.house ?? null;
  const grid = energy?.grid ?? null;
  const share = solar !== null && house !== null && house > 0 ? Math.min(1, Math.max(0, solar / house)) : null;
  const items: { key: string; Icon: LucideIcon; label: string; watts: number | null; tone: string }[] = [
    { key: "solar", Icon: Sun, label: t("homeControl.solar"), watts: solar, tone: "bg-star/25" },
    ...(house !== null || !compact ? [{ key: "house", Icon: House, label: t("homeControl.house"), watts: house, tone: "bg-sunken" }] : []),
    ...(grid !== null && !compact ? [{
      key: "grid", Icon: UtilityPole, watts: grid, tone: grid < 0 ? "bg-ok/15" : "bg-sunken",
      label: Math.abs(grid) < 1 ? t("homeControl.gridIdle") : grid < 0 ? t("homeControl.gridOut") : t("homeControl.gridIn"),
    }] : []),
  ];
  return (
    <div aria-busy={loading} className="flex flex-col gap-3">
      <ul className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3")}>
        {items.map(({ key, Icon, label, watts, tone }) => (
          <li key={key} data-testid={`energy-${key}`} className={cn("flex items-center gap-3 rounded-card", compact ? "" : "bg-sunken/60 p-4")}>
            <span className={cn("energy-icon grid shrink-0 place-items-center rounded-full", tone, large ? "h-14 w-14" : "h-11 w-11")}><Icon size={large ? 26 : 20} aria-hidden /></span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-soft">{label}</span>
              <Watts watts={watts} className={cn("font-display font-semibold leading-none", large ? "text-4xl" : "text-2xl")} />
            </span>
          </li>
        ))}
      </ul>
      {share !== null && !compact && (
        <div>
          <div className="h-3 overflow-hidden rounded-full bg-sunken" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={t("homeControl.solarShare")}>
            <div className="h-full rounded-full bg-star transition-[width] duration-700" style={{ width: `${share * 100}%` }} />
          </div>
          <p className="mt-1.5 text-sm text-soft">{t("homeControl.solarCovers", { p: fmt.num(Math.round(share * 100)) })}</p>
        </div>
      )}
    </div>
  );
}

function stateLabel(t: ReturnType<typeof useI18n>["t"], s: SwitchState, pending?: boolean) {
  if (pending) return "…";
  if (!s.available) return t("homeControl.unavailable");
  return s.on ? t("homeControl.on") : t("homeControl.off");
}

/** One switch as a big card: the picture glows while it's on. */
function SwitchButton({ s, pending, onToggle, large }: { s: SwitchState; pending?: boolean; onToggle: (id: string, on: boolean) => void; large?: boolean }) {
  const { t } = useI18n();
  const I = DOMAIN_ICON[domainOf(s.entityId)] ?? Power;
  return (
    <button type="button" role="switch" aria-checked={s.on} aria-label={s.name} disabled={pending || !s.available} onClick={() => onToggle(s.entityId, !s.on)}
      className={cn("flex w-full items-center gap-4 rounded-card border-2 p-4 text-left transition-colors disabled:opacity-50",
        s.on ? "border-star bg-star/15" : "border-line bg-surface hover:bg-sunken", large && "min-h-24")}>
      <span className={cn("grid shrink-0 place-items-center rounded-full transition-colors", s.on ? "bg-star text-ink" : "bg-sunken text-soft", large ? "h-14 w-14" : "h-11 w-11")}>
        <I size={large ? 26 : 20} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-lg font-bold leading-tight">{s.name}</span>
        <span className="text-sm text-soft">{stateLabel(t, s, pending)}</span>
      </span>
    </button>
  );
}

/** One switch as a chip, for the wall tile and the widget. */
function SwitchChip({ s, pending, onToggle, large }: { s: SwitchState; pending?: boolean; onToggle: (id: string, on: boolean) => void; large?: boolean }) {
  const I = DOMAIN_ICON[domainOf(s.entityId)] ?? Power;
  return (
    <button type="button" role="switch" aria-checked={s.on} aria-label={s.name} disabled={pending || !s.available} onClick={() => onToggle(s.entityId, !s.on)}
      className={cn("flex w-full items-center gap-2 rounded-full border-2 font-bold transition-colors disabled:opacity-50",
        s.on ? "border-star bg-star/20" : "border-line", large ? "h-14 px-4 text-lg" : "h-11 px-3.5")}>
      <I size={large ? 22 : 18} aria-hidden className={cn("shrink-0", !s.on && "text-soft")} /><span className="truncate">{s.name}</span>
    </button>
  );
}

/** "Everything off" asks once, so a passing elbow doesn't plunge the kitchen into darkness. */
function AllOffButton({ count, onConfirm, size }: { count: number; onConfirm: () => void; size: "sm" | "md" | "lg" }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <Button variant="outline" size={size} onClick={() => setAsking(true)}><Power size={size === "lg" ? 22 : 16} />{t("homeControl.allOff")}</Button>
      {asking && (
        <Dialog open onClose={() => setAsking(false)} title={t("homeControl.allOff")}
          footer={<><Button variant="ghost" onClick={() => setAsking(false)}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={() => { setAsking(false); onConfirm(); }}><Power size={16} />{t("homeControl.allOffConfirm")}</Button></>}>
          <p>{t("homeControl.allOffHint", { n: count })}</p>
        </Dialog>
      )}
    </>
  );
}
