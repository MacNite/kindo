"use client";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ImageIcon, LayoutGrid, Lightbulb, Smile } from "lucide-react";
import type { WallTileId } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useToday } from "@/lib/useToday";
import { useWakeLock } from "@/lib/useWakeLock";
import { sameDay } from "@/lib/dates";
import { FamilyLanes } from "./FamilyLanes";
import { BigClock, WeatherNow, DatesList } from "./Widgets";
import { Screensaver } from "../photos/Screensaver";
import { Avatar } from "../ui/Avatar";
import { HomeTile } from "../home/HomeControl";
import { BirthdaysCompact } from "../birthdays/Birthdays";
import { useGreeting } from "./HomeScreen";

/**
 * Always-on kitchen display. Readable from a few metres: one clock, one
 * column of household context (which tiles, and in which order, is set in
 * Settings → Dashboard), and a lane per person.
 * Idle → photo frame; touch → back. Presence sensing can later call setSaver.
 */
export function WallDashboard() {
  const today = useToday();
  const { t, tx } = useI18n();
  const { idleMinutes, shopping, shoppingLists, data, getMember, presence, sync, wallTiles, home } = useStore();
  const greeting = useGreeting();
  const [saver, setSaver] = useState(false);
  // The wall stays on; the photo frame is its screensaver (§13).
  useWakeLock();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const poke = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaver(true), idleMinutes * 60_000);
  }, [idleMinutes]);

  useEffect(() => {
    poke();
    const evs = ["pointerdown", "keydown"] as const;
    evs.forEach((e) => window.addEventListener(e, poke));
    return () => { clearTimeout(timer.current); evs.forEach((e) => window.removeEventListener(e, poke)); };
  }, [poke]);

  // Home Assistant presence: someone there wakes the wall, nobody there brings the photos back (§13).
  useEffect(() => {
    if (!presence) return;
    if (presence.present) {
      setSaver(false);
      poke();
    } else setSaver(true);
  }, [presence, poke]);

  const tonight = data.meals.find((m) => sameDay(m.date, today));
  const cook = getMember(tonight?.cookId);
  const toBuy = shopping.filter((s) => s.listId === shoppingLists[0]?.id && !s.done);
  const tiles: Record<WallTileId, ReactNode> = {
    weather: data.weather && <div className="rounded-panel bg-surface p-6"><WeatherNow large /></div>,
    meal: tonight && (
      <Link href="/meals" className="rounded-panel bg-surface p-6">
        <p className="text-lg font-bold text-soft">{t("meals.tonight")}</p>
        <p className="font-display text-3xl font-semibold leading-tight">{tx(tonight.dinner)}</p>
        {cook && <p className="mt-2 flex items-center gap-2 text-lg text-soft"><Avatar member={cook} size="sm" />{t("meals.cooks", { name: cook.name })}</p>}
      </Link>
    ),
    shopping: (
      <Link href="/shopping" className="flex items-center justify-between rounded-panel bg-surface p-6">
        <span className="text-xl font-bold">{t("nav.shopping")}</span>
        <span className="num font-display text-4xl font-semibold">{toBuy.length}</span>
      </Link>
    ),
    dates: (
      // Fills what the other tiles leave, but never shrinks below its dates: the column scrolls instead.
      <div className="grow rounded-panel bg-surface p-6">
        <p className="mb-4 text-lg font-bold text-soft">{t("widgets.dates")}</p>
        <DatesList limit={3} large />
      </div>
    ),
    // The birthday wheel, when the household turned it on (D46).
    birthdays: (
      <div className="rounded-panel bg-surface p-6">
        <p className="mb-4 text-lg font-bold text-soft">{t("widgets.birthdays")}</p>
        <BirthdaysCompact large />
      </div>
    ),
    // Switches and solar from Home Assistant (§21), when the household turned the tile on.
    home: <HomeTile large />,
  };

  return (
    <div data-sync={sync} className="flex h-dvh gap-5 overflow-hidden p-6 max-lg:h-auto max-lg:flex-col">
      <aside className="flex w-[400px] shrink-0 flex-col gap-5 overflow-y-auto no-scrollbar max-lg:w-full">
        <div className="px-1">
          <p className="mb-3 text-xl text-soft">{greeting}, {data.household.name}</p>
          <BigClock size="xl" />
        </div>
        {wallTiles.filter((x) => x.enabled).map((x) => <Fragment key={x.id}>{tiles[x.id]}</Fragment>)}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-4">
        <FamilyLanes variant="wall" />
        <nav className="flex shrink-0 items-center justify-end gap-3">
          <WallBtn href="/kids" label={t("nav.kids")}><Smile size={26} /></WallBtn>
          {home && <WallBtn href="/home-control" label={t("nav.homeControl")}><Lightbulb size={26} /></WallBtn>}
          <button onClick={() => setSaver(true)} className="flex h-16 items-center gap-3 rounded-full bg-surface px-6 text-lg font-bold"><ImageIcon size={26} />{t("nav.photos")}</button>
          <WallBtn href="/" label={t("nav.home")}><LayoutGrid size={26} /></WallBtn>
        </nav>
      </main>

      {saver && <Screensaver onWake={() => { setSaver(false); poke(); }} />}
    </div>
  );
}

function WallBtn({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return <Link href={href} className="flex h-16 items-center gap-3 rounded-full bg-surface px-6 text-lg font-bold">{children}{label}</Link>;
}
