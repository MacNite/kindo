"use client";
import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useI18n } from "@/i18n";
import { IconButton } from "./Button";
import { useOverlay } from "./useOverlay";

/**
 * Bottom sheet on phones, centred dialog on larger screens. Modal: rendered
 * into <body>, everything else is made inert while open, focus moves to the
 * panel (not the first input, so touch screens don't pop up a keyboard) and
 * returns to the opener on close. Only the topmost overlay answers Escape.
 */
export function Dialog({ open, onClose, title, children, footer, wide, top }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
  /** Above everything, the photo frame and a live camera included (the PIN). */
  top?: boolean;
}) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, { root, focus: panel, onClose, layer: top ? 130 : 50 });

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div ref={root} className={`fixed inset-0 ${top ? "z-[130]" : "z-50"} flex items-end justify-center sm:items-center sm:p-6`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button aria-label={t("common.close")} tabIndex={-1} className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] animate-fade [animation-duration:200ms]" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-panel bg-surface outline-none sm:rounded-panel animate-rise ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <header className="flex items-center justify-between gap-3 px-6 pb-2 pt-5">
          <h2 id={titleId} className="font-display text-xl font-bold">{title}</h2>
          <IconButton label={t("common.close")} onClick={onClose}><X size={20} /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
