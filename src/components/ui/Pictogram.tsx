import { getPictogram } from "@/lib/pictograms";
import { cn } from "./cn";

/** Renders a task picture: built-in pictogram id, "emoji:🐱" or "img:<url>". */
export function Pictogram({ id, className, strokeWidth = 1.75 }: { id: string; className?: string; strokeWidth?: number }) {
  if (id.startsWith("emoji:")) return <span className={cn("leading-none", className)} aria-hidden>{id.slice(6)}</span>;
  if (id.startsWith("img:")) return <img src={id.slice(4)} alt="" className={cn("rounded-tile object-cover", className)} />;
  const p = getPictogram(id);
  if (!p) return null;
  return <p.Icon className={className} strokeWidth={strokeWidth} aria-hidden />;
}
