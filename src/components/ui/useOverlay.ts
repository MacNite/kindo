"use client";
import { useEffect, useRef, type RefObject } from "react";

/**
 * Overlays open at the same time (a dialog over a live camera, the doorbell
 * over a dialog) form one stack: only the topmost answers Escape and keeps
 * Tab inside itself, and only it is left interactive. "Topmost" is what is on
 * top on screen: the higher layer (its z-index), then the one opened last.
 */
type Entry = {
  root: RefObject<HTMLElement | null>;
  close: RefObject<() => void>;
  layer: number;
  inert: boolean;
  order: number;
};

const stack: Entry[] = [];
let opened = 0;
/** The elements this module made inert, so it only ever undoes its own. */
const inerted = new Set<HTMLElement>();

const above = (a: Entry, b: Entry) => a.layer > b.layer || (a.layer === b.layer && a.order > b.order);
const topmost = (list: Entry[] = stack) => list.reduce<Entry | undefined>((t, e) => (!t || above(e, t) ? e : t), undefined);

/** The child of <body> an overlay lives in (itself, when it is portalled there). */
const bodyChild = (el: HTMLElement | null) => (el ? Array.from(document.body.children).find((c) => c.contains(el)) : undefined);

/** Everything but the topmost modal overlay (and anything drawn above it) is inert. */
function syncInert() {
  const modal = topmost(stack.filter((e) => e.inert));
  const keep = new Set(modal ? stack.filter((e) => e === modal || above(e, modal)).map((e) => bodyChild(e.root.current)) : []);
  const want = new Set<HTMLElement>();
  if (modal) for (const c of Array.from(document.body.children)) if (c instanceof HTMLElement && !keep.has(c)) want.add(c);
  for (const el of Array.from(inerted)) {
    if (want.has(el)) continue;
    el.inert = false;
    inerted.delete(el);
  }
  // Skip elements that already were inert for some other reason.
  for (const el of Array.from(want)) {
    if (inerted.has(el) || el.inert) continue;
    el.inert = true;
    inerted.add(el);
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const focusables = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((f) => !f.closest("[inert]") && f.getClientRects().length > 0);

function onKey(e: KeyboardEvent) {
  const top = topmost();
  const el = top?.root.current;
  if (!top || !el || e.defaultPrevented) return;
  if (e.key === "Escape") {
    e.preventDefault();
    top.close.current();
    return;
  }
  // Tab wraps around inside the overlay instead of leaving it.
  if (e.key !== "Tab" || !el.contains(document.activeElement)) return;
  const list = focusables(el);
  const first = list[0], last = list[list.length - 1];
  const active = document.activeElement as HTMLElement;
  if (!first || !last) e.preventDefault();
  else if (e.shiftKey && (active === first || !list.includes(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Makes `root` a modal overlay while `open`: it joins the overlay stack,
 * focus moves to `focus` (or the root itself; give it tabIndex -1) and
 * returns to the opener on close. `inert: false` leaves the page usable
 * underneath, for an overlay something else may be drawn over (the wall's
 * photo frame over the birthday wheel).
 */
export function useOverlay(open: boolean, { root, focus, onClose, layer, inert = true }: {
  root: RefObject<HTMLElement | null>;
  focus?: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Its z-index: decides which overlay is on top. */
  layer: number;
  inert?: boolean;
}) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open || !root.current) return;
    const opener = document.activeElement as HTMLElement | null;
    const entry: Entry = { root, close, layer, inert, order: ++opened };
    if (!stack.length) document.addEventListener("keydown", onKey);
    stack.push(entry);
    syncInert();
    (focus?.current ?? root.current).focus({ preventScroll: true });
    return () => {
      const wasTop = topmost() === entry;
      stack.splice(stack.indexOf(entry), 1);
      if (!stack.length) document.removeEventListener("keydown", onKey);
      syncInert();
      // Closing one under another must not pull focus out of the one on top.
      if (wasTop && opener?.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, [open, root, focus, layer, inert]);
}
