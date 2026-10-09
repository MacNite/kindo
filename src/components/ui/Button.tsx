import Link from "next/link";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "quiet" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const V: Record<Variant, string> = {
  primary: "bg-ink text-surface hover:bg-ink/90",
  quiet: "bg-sunken text-ink hover:bg-line",
  ghost: "text-ink hover:bg-sunken",
  outline: "border border-line text-ink hover:bg-sunken",
};
const S: Record<Size, string> = {
  sm: "h-9 coarse:h-11 px-3 text-sm gap-1.5 rounded-full",
  md: "h-11 px-4 text-[15px] gap-2 rounded-full",
  lg: "h-14 px-6 text-lg gap-2.5 rounded-full",
};

const buttonCls = (variant: Variant, size: Size, className?: string) =>
  cn("inline-flex items-center justify-center font-bold transition-colors disabled:opacity-40 disabled:pointer-events-none", V[variant], S[size], className);

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ variant = "quiet", size = "md", className, ...p }, ref) => (
    <button ref={ref} className={buttonCls(variant, size, className)} {...p} />
  ),
);
Button.displayName = "Button";

/**
 * A link that looks like a Button: one element, not a button inside a link
 * (invalid, and two tab stops). `native` makes a plain <a> for addresses the
 * app router mustn't handle, such as an API route.
 */
export function LinkButton({ href, variant = "quiet", size = "md", className, native, ...p }: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string; variant?: Variant; size?: Size; native?: boolean;
}) {
  const cls = buttonCls(variant, size, className);
  return native ? <a href={href} className={cls} {...p} /> : <Link href={href} className={cls} {...p} />;
}

export function IconButton({ label, className, size = "md", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-9 w-9 coarse:h-11 coarse:w-11" : size === "lg" ? "h-14 w-14" : "h-11 w-11";
  return <button aria-label={label} title={label} className={cn("inline-grid place-items-center rounded-full text-ink hover:bg-sunken transition-colors disabled:opacity-30", s, className)} {...p} />;
}
