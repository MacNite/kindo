"use client";
import { isValidElement, useId, type ReactNode } from "react";
import { cn } from "./cn";

export function Segmented<T extends string>({ value, onChange, options, size = "md", className, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: "sm" | "md"; className?: string; label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full bg-sunken p-1", className)}>
      {options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("inline-flex items-center gap-1.5 rounded-full font-bold transition-colors",
            size === "sm" ? "hit h-8 px-3 text-sm coarse:h-9" : "h-10 px-4 coarse:h-11",
            value === o.value ? "bg-surface text-ink shadow-[0_1px_0_rgb(var(--line))]" : "text-soft hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn("hit relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-ok" : "bg-line")}>
      <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-surface transition-all", checked ? "left-6" : "left-1")} />
    </button>
  );
}

/**
 * A labelled form field. Around a native input it is a <label>; around
 * anything else (person chips, pickers) a labelled group, because a <label>
 * wrapping buttons turns its whole area into a click on the first one.
 */
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  const id = useId();
  const native = isValidElement(children) && typeof children.type === "string" && ["input", "select", "textarea"].includes(children.type);
  if (native) {
    return (
      <label className="block">
        <span className="mb-1.5 block text-sm font-bold">{label}</span>
        {children}
        {hint && <span className="mt-1 block text-sm text-soft">{hint}</span>}
      </label>
    );
  }
  return (
    <div role="group" aria-labelledby={id} className="block">
      <span id={id} className="mb-1.5 block text-sm font-bold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-soft">{hint}</span>}
    </div>
  );
}

export const inputCls = "h-11 w-full rounded-tile border border-line bg-surface px-3.5 text-ink placeholder:text-soft/70 focus:outline-none focus:border-ink/40";
