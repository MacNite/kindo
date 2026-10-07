import { CalendarDays, Gift, Home, ImageIcon, ListChecks, Settings, ShoppingCart, Sparkles, UtensilsCrossed } from "lucide-react";
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
  { href: "/settings", key: "nav.settings", Icon: Settings, mobile: false },
] as const satisfies readonly { href: string; key: MessageKey; Icon: unknown; mobile: boolean }[];

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));
