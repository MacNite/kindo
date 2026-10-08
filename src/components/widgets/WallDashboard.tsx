"use client";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Cake, Cctv, ImageIcon, LayoutGrid, Lightbulb, Smile } from "lucide-react";
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
import { CamerasTile } from "../cameras/Cameras";
import { BirthdaysCompact, BirthdaysFullscreen } from "../birthdays/Birthdays";
import { useGreeting } from "./HomeScreen";

/**
 * Always-on kitchen display. Readable from a few metres: one clock, one
 * column of household context (which tiles, and in which order, is set in
 * Settings → Dashboard), and a lane per person.
 * Idle → photo frame; touch → back. Home Assistant presence wakes it or brings the photos back.
 */
export function WallDashboard() {
  const today = useToday();
  const { t, tx } = useI18n();
  const { idleMinutes, shopping, shoppingLists, data, getMember, presence, sync, wallTiles, home, cameras } = useStore();
  const greeting = useGreeting();
  const [saver, setSaver] = useState(false);
  /** The birthday wheel over the whole screen (D46). */
  const [wheel, setWheel] = useState(false);
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
    weather: data.weather && <div className="wall-tile"><WeatherNow large /></div>,
    meal: tonight && (
      <Link href="/meals" className="wall-tile">
        <p className="text-lg font-bold text-soft">{t("meals.tonight")}</p>
        <p className="font-display text-3xl font-semibold leading-tight">{tx(tonight.dinner)}</p>
        {cook && <p className="mt-2 flex items-center gap-2 text-lg text-soft"><Avatar member={cook} size="sm" />{t("meals.cooks", { name: cook.name })}</p>}
      </Link>
    ),
    shopping: (
      <Link href="/shopping" className="wall-tile wall-tile-narrow flex items-center justify-between gap-4">
        <span className="text-xl font-bold">{t("nav.shopping")}</span>
        <span className="num font-display text-4xl font-semibold">{toBuy.length}</span>
      </Link>
    ),
    dates: (
      // Fills what the other tiles leave, but never shrinks below its dates: the column scrolls instead.
      <div className="wall-tile wall-grow">
        <p className="wall-tile-title mb-2 text-lg font-bold text-soft">{t("widgets.dates")}</p>
        <DatesList limit={3} large />
      </div>
    ),
    // The birthday wheel, when the household turned it on (D46).
    birthdays: (
      <div className="wall-tile">
        <p className="wall-tile-title mb-2 text-lg font-bold text-soft">{t("widgets.birthdays")}</p>
        <BirthdaysCompact large />
      </div>
    ),
    // Switches and solar from Home Assistant (§21), when the household turned the tile on.
    home: <HomeTile large />,
    // Frigate's cameras as still pictures, live on a tap (§22). A ring opens over everything on its own.
    cameras: <CamerasTile large />,
  };

  return (
    <div data-sync={sync} className="wall">
      <aside className="wall-side">
        <div className="wall-clock">
          <p className="mb-2 text-xl text-soft">{greeting}, {data.household.name}</p>
          <BigClock size="xl" />
        </div>
        {wallTiles.filter((x) => x.enabled).map((x) => <Fragment key={x.id}>{tiles[x.id]}</Fragment>)}
      </aside>

      <main className="wall-main">
        <FamilyLanes variant="wall" />
        <nav className="flex shrink-0 flex-wrap items-center justify-end gap-3">
          <button onClick={() => setWheel(true)} className="flex h-14 items-center gap-3 rounded-full bg-surface px-5 text-lg font-bold min-[1600px]:h-16 min-[1600px]:px-6"><Cake size={26} />{t("widgets.birthdays")}</button>
          <WallBtn href="/kids" label={t("nav.kids")}><Smile size={26} /></WallBtn>
          {home && <WallBtn href="/home-control" label={t("nav.homeControl")}><Lightbulb size={26} /></WallBtn>}
          {cameras.length > 0 && <WallBtn href="/cameras" label={t("nav.cameras")}><Cctv size={26} /></WallBtn>}
          <button onClick={() => setSaver(true)} className="flex h-14 items-center gap-3 rounded-full bg-surface px-5 text-lg font-bold min-[1600px]:h-16 min-[1600px]:px-6"><ImageIcon size={26} />{t("nav.photos")}</button>
          <WallBtn href="/" label={t("nav.home")}><LayoutGrid size={26} /></WallBtn>
        </nav>
      </main>

      {wheel && <BirthdaysFullscreen onClose={() => setWheel(false)} />}
      {saver && <Screensaver onWake={() => { setSaver(false); poke(); }} />}
    </div>
  );
}

function WallBtn({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return <Link href={href} className="flex h-14 items-center gap-3 rounded-full bg-surface px-5 text-lg font-bold min-[1600px]:h-16 min-[1600px]:px-6">{children}{label}</Link>;
}
