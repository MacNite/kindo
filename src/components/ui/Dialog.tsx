"use client";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button";

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Dialog({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal>
      <button aria-label="Close" className="absolute inset-0 bg-ink/30 backdrop-blur-[2px] animate-fade [animation-duration:200ms]" onClick={onClose} />
      <div className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-panel bg-surface sm:rounded-panel animate-rise ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <header className="flex items-center justify-between gap-3 px-6 pb-2 pt-5">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <IconButton label="Close" onClick={onClose}><X size={20} /></IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
      </div>
    </div>
  );
}
