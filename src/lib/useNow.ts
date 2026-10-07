"use client";
import { useEffect, useState } from "react";

/** Ticks every `ms`; used by clocks and "now" markers. */
export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
