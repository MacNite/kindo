import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "./cn";

/** The one container shape. Hierarchy comes from size & padding, not shadows. */
export function Panel({ title, action, href, children, className, bodyClassName, tone = "surface" }: {
  title?: ReactNode; action?: ReactNode; href?: string; children: ReactNode; className?: string; bodyClassName?: string; tone?: "surface" | "sunken";
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-panel p-5", tone === "surface" ? "bg-surface" : "bg-sunken", className)}>
      {(title || action) && (
        <header className="mb-3 flex items-baseline justify-between gap-3">
          {title && (href
            ? <Link href={href} className="hit font-display text-lg font-semibold tracking-tight hover:underline underline-offset-4">{title}</Link>
            : <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>)}
          {action}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-prose text-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
