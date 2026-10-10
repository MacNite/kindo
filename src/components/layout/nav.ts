import { CalendarDays, Cctv, Gift, Headphones, Home, ImageIcon, Lightbulb, ListChecks, Settings, ShoppingCart, Sparkles, UtensilsCrossed } from "lucide-react";
import type { MessageKey } from "@/i18n";

export const NAV = [
  { href: "/", key: "nav.home", Icon: Home, mobile: true },
  { href: "/calendar", key: "nav.calendar", Icon: CalendarDays, mobile: true },
  { href: "/routines", key: "nav.routines", Icon: Sparkles, mobile: true },
  { href: "/tasks", key: "nav.tasks", Icon: ListChecks, mobile: false },
  { href: "/shopping", key: "nav.shopping", Icon: ShoppingCart, mobile: true },
  { href: "/meals", key: "nav.meals", Icon: UtensilsCrossed, mobile: false },
  { href: "/rewards", key: "nav.rewards", Icon: Gift, mobile: false },
  { href: "/photos", key: "nav.photos", Icon: ImageIcon, mobile: false },
  // Only once something is on the kids' shelf (§23).
  { href: "/media", key: "nav.media", Icon: Headphones, mobile: false, media: true },
  // Only once Home Assistant switches, a solar sensor or talking are set up (§21, §24).
  { href: "/home-control", key: "nav.homeControl", Icon: Lightbulb, mobile: false, homeControl: true },
  // Only once Frigate cameras are set up (§22).
  { href: "/cameras", key: "nav.cameras", Icon: Cctv, mobile: false, cameras: true },
  { href: "/settings", key: "nav.settings", Icon: Settings, mobile: false },
] as const satisfies readonly { href: string; key: MessageKey; Icon: unknown; mobile: boolean; homeControl?: boolean; cameras?: boolean; media?: boolean }[];

/** The navigation this household has: Home control, cameras and listening only where they are set up. */
export const navFor = (homeControl: boolean, cameras = false, media = false) =>
  NAV.filter((n) => (homeControl || !("homeControl" in n)) && (cameras || !("cameras" in n)) && (media || !("media" in n)));

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));
