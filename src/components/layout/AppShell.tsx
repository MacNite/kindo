"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Monitor, MoreHorizontal, Smile } from "lucide-react";
import { useI18n } from "@/i18n";
import { NAV, isActive } from "./nav";
import { QuickPrefs } from "./QuickPrefs";
import { Dialog } from "../ui/Dialog";
import { cn } from "../ui/cn";
import { useStore } from "@/lib/state/store";
import { Avatar } from "../ui/Avatar";

/**
 * Management shell for phones, tablets and desktops.
 * The wall display (/wall) and child view (/kids) deliberately live outside it.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { t } = useI18n();
  const [more, setMore] = useState(false);
  const { getMembers } = useStore();

  return (
    <div className="min-h-dvh md:flex">
      {/* Side rail: icons on tablets, labels on desktop */}
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col gap-1 px-3 py-5 md:flex md:w-[84px] lg:w-[232px]">
        <Link href="/" className="mb-5 flex items-center gap-2.5 px-2.5">
          <Logo />
          <span className="hidden font-display text-xl font-bold tracking-tight lg:inline">{t("app.name")}</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, key, Icon }) => (
            <Link key={href} href={href} aria-current={isActive(path, href) ? "page" : undefined}
              className={cn("flex h-12 items-center gap-3 rounded-full px-3.5 font-bold transition-colors max-lg:justify-center",
                isActive(path, href) ? "bg-ink text-surface" : "text-soft hover:bg-sunken hover:text-ink")}>
              <Icon size={21} strokeWidth={2} className="shrink-0" />
              <span className="hidden lg:inline">{t(key)}</span>
            </Link>
          ))}
        </nav>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <Link href="/kids" className="flex h-11 items-center gap-3 rounded-full px-3.5 font-bold text-soft hover:bg-sunken hover:text-ink max-lg:justify-center">
            <Smile size={20} className="shrink-0" /><span className="hidden lg:inline">{t("nav.kids")}</span>
          </Link>
          <Link href="/wall" className="flex h-11 items-center gap-3 rounded-full px-3.5 font-bold text-soft hover:bg-sunken hover:text-ink max-lg:justify-center">
            <Monitor size={20} className="shrink-0" /><span className="hidden lg:inline">{t("nav.wall")}</span>
          </Link>
          <div className="hidden lg:block"><QuickPrefs /></div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phone header */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-bg/90 px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur md:hidden">
          <Link href="/" className="flex items-center gap-2"><Logo /><span className="font-display text-lg font-bold">{t("app.name")}</span></Link>
          <QuickPrefs compact />
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 pb-28 pt-2 md:px-6 md:pb-10 md:pt-6 lg:px-8">{children}</main>
      </div>

      {/* Phone bottom navigation: the four things parents reach for most, plus More */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.filter((n) => n.mobile).map(({ href, key, Icon }) => (
          <Link key={href} href={href} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-xs font-bold", isActive(path, href) ? "text-ink" : "text-soft")}>
            <span className={cn("grid h-8 w-14 place-items-center rounded-full", isActive(path, href) && "bg-sunken")}><Icon size={21} /></span>
            {t(key)}
          </Link>
        ))}
        <button onClick={() => setMore(true)} className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-bold text-soft">
          <span className="grid h-8 w-14 place-items-center rounded-full"><MoreHorizontal size={21} /></span>{t("nav.more")}
        </button>
      </nav>

      <Dialog open={more} onClose={() => setMore(false)} title={t("nav.more")}>
        <div className="grid grid-cols-3 gap-3">
          {[...NAV.filter((n) => !n.mobile), { href: "/kids", key: "nav.kids" as const, Icon: Smile }, { href: "/wall", key: "nav.wall" as const, Icon: Monitor }].map(({ href, key, Icon }) => (
            <Link key={href} href={href} onClick={() => setMore(false)} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-card bg-sunken text-sm font-bold">
              <Icon size={26} />{t(key)}
            </Link>
          ))}
        </div>
        <div className="mt-5 flex justify-center gap-2">{getMembers().map((m) => <Avatar key={m.id} member={m} size="sm" />)}</div>
      </Dialog>
    </div>
  );
}

/** Neutral placeholder mark: four overlapping dots in the family colours. */
export function Logo({ size = 30 }: { size?: number }) {
  const { getMembers } = useStore();
  // Family colours, topped up with calm defaults for small or new households.
  const c = [...getMembers().map((m) => m.color), "#3B78C2", "#2E8B6E", "#8A5CD1", "#E39A1B"];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="11" cy="11" r="8" fill={c[0]} /><circle cx="21" cy="11" r="8" fill={c[1]} opacity=".9" />
      <circle cx="11" cy="21" r="8" fill={c[2]} opacity=".9" /><circle cx="21" cy="21" r="8" fill={c[3]} opacity=".9" />
    </svg>
  );
}
