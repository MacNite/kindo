import { Cloud, CloudRain, CloudSun, Snowflake, Sun } from "lucide-react";
import type { Sky } from "@/lib/types";

const MAP = { sun: Sun, partly: CloudSun, cloud: Cloud, rain: CloudRain, snow: Snowflake };
export function WeatherIcon({ sky, className, strokeWidth = 1.75 }: { sky: Sky; className?: string; strokeWidth?: number }) {
  const I = MAP[sky];
  return <I className={className} strokeWidth={strokeWidth} aria-hidden />;
}
