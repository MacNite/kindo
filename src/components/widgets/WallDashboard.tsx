"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, LayoutGrid, Smile } from "lucide-react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useToday } from "@/lib/useToday";
import { sameDay } from "@/lib/dates";
import { FamilyLanes } from "./FamilyLanes";
import { BigClock, WeatherNow, DatesList } from "./Widgets";
import { Screensaver } from "../photos/Screensaver";
import { Avatar } from "../ui/Avatar";
import { useGreeting } from "./HomeScreen";

/**
 * Always-on kitchen display. Readable from a few metres: one clock, one
 * column of household context, and a lane per person.
 * Idle → photo frame; touch → back. Presence sensing can later call setSaver.
 */
export function WallDashboard() {
  const today = useToday();
  const { t, tx } = useI18n();
  const { idleMinutes, shopping, shoppingLists, data, getMember } = useStore();
  const greeting = useGreeting();
  const [saver, setSaver] = useState(false);
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

  const tonight = data.meals.find((m) => sameDay(m.date, today));
  const cook = getMember(tonight?.cookId);
  const toBuy = shopping.filter((s) => s.listId === shoppingLists[0]?.id && !s.done);

  return (
    <div className="flex h-dvh gap-5 overflow-hidden p-6 max-lg:h-auto max-lg:flex-col">
      <aside className="flex w-[400px] shrink-0 flex-col gap-5 max-lg:w-full">
        <div className="px-1">
          <p className="mb-3 text-xl text-soft">{greeting}, {data.household.name}</p>
          <BigClock size="xl" />
        </div>
        {data.weather && <div className="rounded-panel bg-surface p-6"><WeatherNow large /></div>}
        {tonight && (
          <Link href="/meals" className="rounded-panel bg-surface p-6">
            <p className="text-lg font-bold text-soft">{t("meals.tonight")}</p>
            <p className="font-display text-3xl font-semibold leading-tight">{tx(tonight.dinner)}</p>
            {cook && <p className="mt-2 flex items-center gap-2 text-lg text-soft"><Avatar member={cook} size="sm" />{t("meals.cooks", { name: cook.name })}</p>}
          </Link>
        )}
        <Link href="/shopping" className="flex items-center justify-between rounded-panel bg-surface p-6">
          <span className="text-xl font-bold">{t("nav.shopping")}</span>
          <span className="num font-display text-4xl font-semibold">{toBuy.length}</span>
        </Link>
        <div className="min-h-0 flex-1 overflow-hidden rounded-panel bg-surface p-6">
          <p className="mb-4 text-lg font-bold text-soft">{t("widgets.dates")}</p>
          <DatesList limit={3} large />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-4">
        <FamilyLanes variant="wall" />
        <nav className="flex shrink-0 items-center justify-end gap-3">
          <WallBtn href="/kids" label={t("nav.kids")}><Smile size={26} /></WallBtn>
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
