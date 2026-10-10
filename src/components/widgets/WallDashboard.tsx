"use client";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ImageIcon, LayoutGrid } from "lucide-react";
import type { WallTileId } from "@/lib/types";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useToday } from "@/lib/useToday";
import { useWakeLock } from "@/lib/useWakeLock";
import { useNight } from "@/lib/state/useNight";
import { sameDay } from "@/lib/dates";
import { FamilyLanes } from "./FamilyLanes";
import { BigClock, WallWeather, DatesList } from "./Widgets";
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
  const { idleMinutes, shopping, shoppingLists, data, getMember, presence, sync, wallTiles } = useStore();
  const greeting = useGreeting();
  const [saver, setSaver] = useState(false);
  /** The birthday wheel over the whole screen (D46). */
  const [wheel, setWheel] = useState(false);
  // The wall stays on, the photo frame is its screensaver (§13), except in the night rest (D59).
  const night = useNight();
  useWakeLock(!night);
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
  // At night only a touch wakes it.
  useEffect(() => {
    if (!presence) return;
    if (presence.present) {
      if (night) return;
      setSaver(false);
      poke();
    } else setSaver(true);
  }, [presence, poke, night]);

  const tonight = data.meals.find((m) => sameDay(m.date, today));
  const cook = getMember(tonight?.cookId);
  const toBuy = shopping.filter((s) => s.listId === shoppingLists[0]?.id && !s.done);
  const tiles: Record<WallTileId, ReactNode> = {
    weather: data.weather && <div className="wall-tile wall-weather"><WallWeather /></div>,
    meal: tonight && (
      <Link href="/meals" className="wall-tile">
        <p className="wall-tile-label text-lg font-bold text-soft">{t("meals.tonight")}</p>
        <p className="wall-meal-dish font-display text-3xl font-semibold leading-tight">{tx(tonight.dinner)}</p>
        {cook && <p className="wall-meal-cook mt-2 flex items-center gap-2 text-lg text-soft"><Avatar member={cook} size="sm" />{t("meals.cooks", { name: cook.name })}</p>}
      </Link>
    ),
    shopping: (
      <Link href="/shopping" className="wall-tile wall-tile-narrow flex items-center justify-between gap-4">
        <span className="text-xl font-bold">{t("nav.shopping")}</span>
        <span className="num font-display text-4xl font-semibold">{toBuy.length}</span>
      </Link>
    ),
    dates: (
      // Fills what the other tiles leave: beside the lanes the column scrolls, in the top strip it shows as many dates as fit.
      <div className="wall-tile wall-grow">
        <p className="wall-tile-title wall-tile-label mb-2 text-lg font-bold text-soft">{t("widgets.dates")}</p>
        <DatesList limit={3} large />
      </div>
    ),
    // The birthday wheel, when the household turned it on (D46). A tap anywhere opens it over the whole screen (D60).
    birthdays: (
      <div className="wall-tile wall-grow wall-openable wall-openable-all">
        <button type="button" onClick={() => setWheel(true)} aria-label={t("widgets.birthdays")} className="wall-open" />
        <p className="wall-tile-title wall-tile-label mb-2 text-lg font-bold text-soft">{t("widgets.birthdays")}</p>
        <BirthdaysCompact large />
      </div>
    ),
    // Switches and solar from Home Assistant (§21), when the household turned the tile on. A tap beside the switches opens its page (D60).
    home: <HomeTile large />,
    // Frigate's cameras as still pictures, live on a tap (§22); beside them a tap opens their page. A ring opens over everything on its own.
    cameras: <CamerasTile large />,
  };

  return (
    <div data-sync={sync} className="wall">
      <aside className="wall-side">
        <div className="wall-clock">
          <p className="wall-greeting text-soft">{greeting}, {data.household.name}</p>
          <BigClock size="xl" />
        </div>
        {wallTiles.filter((x) => x.enabled).map((x) => <Fragment key={x.id}>{tiles[x.id]}</Fragment>)}
        {/* The tiles open their own pages (D60); what is left is the photo frame and the way back to the app. */}
        <nav className="wall-actions">
          <button onClick={() => setSaver(true)} className={WALL_BTN}><ImageIcon size={26} />{t("nav.photos")}</button>
          <Link href="/" className={WALL_BTN}><LayoutGrid size={26} />{t("nav.home")}</Link>
        </nav>
      </aside>

      <main className="wall-main">
        <FamilyLanes variant="wall" />
      </main>

      {wheel && <BirthdaysFullscreen onClose={() => setWheel(false)} />}
      {saver && <Screensaver onWake={() => { setSaver(false); poke(); }} />}
    </div>
  );
}

/** Laid out by `.wall-actions` for the strip, the column and a phone. */
const WALL_BTN = "rounded-panel bg-surface font-bold";
