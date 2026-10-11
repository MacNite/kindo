"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { CloudOff, Users } from "lucide-react";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useNow } from "@/lib/useNow";
import { nextUp, shortNames, type NextUpItem } from "@/lib/nextUp";
import { Avatar, AvatarStack, ColorRail } from "../ui/Avatar";
import { Pictogram } from "../ui/Pictogram";

/**
 * The wall's "Next up" (D69): the household's earliest timed commitment still
 * ahead, whoever it belongs to, in one line above the lanes, readable across
 * the kitchen. Time and title in ink; whose it is by their colour and name
 * (initials where three or more share it, or the line is narrow). A tap opens
 * the calendar, like the tiles do (D60).
 */
export function NextUp() {
  const { t, tx, fmt } = useI18n();
  const { data, getMembers, sync } = useStore();
  const now = useNow();
  const members = getMembers();
  const next = useMemo(() => nextUp(data.events, members, now), [data.events, members, now]);
  const short = useMemo(() => shortNames(members), [members]);
  // The device's network is gone, or the server hasn't answered for a minute (a restart, Wi-Fi
  // without internet): either way what is shown may be out of date.
  const [lost, setLost] = useState(false);
  useEffect(() => {
    if (sync !== "connecting") return;
    const id = setTimeout(() => setLost(true), LOST_AFTER_MS);
    return () => { clearTimeout(id); setLost(false); };
  }, [sync]);
  const offline = sync === "offline" || (sync === "connecting" && lost);

  const first = next?.items[0];
  const others = next?.items.slice(1) ?? [];
  const whoOf = (i: NextUpItem) => {
    const names = i.owners.map((m) => m.name);
    return i.family ? t("common.whole") : names.length === 2 ? t("nextUp.two", { a: names[0], b: names[1] }) : names.join(", ");
  };
  const also = others.length === 1 ? t("nextUp.alsoOne") : t("nextUp.also", { n: others.length });
  const label = next && first
    ? [t("nextUp.title"), next.tomorrow ? t("common.tomorrow") : next.now ? t("common.now") : "", fmt.time(next.start), tx(first.event.title), whoOf(first), others.length ? also : ""].filter(Boolean).join(", ")
    : `${t("nextUp.title")}: ${t("nextUp.none")}`;

  return (
    <Link href="/calendar" aria-label={offline ? `${label}. ${t("nextUp.offlineHint")}` : label} data-next-up={first?.event.id ?? "none"}
      style={first?.owners[0] ? ({ "--m": first.owners[0].color } as CSSProperties) : undefined}
      className="wall-next rounded-panel bg-surface">
      <ColorRail colors={first && !first.family ? first.owners.map((m) => m.color) : []} className="wall-next-rail" />
      <span className="wall-next-body">
        <span className="wall-next-label">{t("nextUp.title")}</span>
        {next && first ? (
          <>
            <span className="wall-next-when">
              {next.tomorrow && <span className="wall-next-day">{t("common.tomorrow")}</span>}
              <span className="num wall-next-time font-display">{fmt.time(next.start)}</span>
              {next.now && <b className="wall-next-now m-text">{t("common.now")}</b>}
            </span>
            <span className="wall-next-title font-display" title={tx(first.event.title)}>
              {first.event.icon && <Pictogram id={first.event.icon} className="wall-next-icon" strokeWidth={2} />}
              {tx(first.event.title)}
            </span>
            <span className="wall-next-who">
              {first.family ? (
                <span className="wall-next-owner"><Users className="wall-next-family" strokeWidth={2.25} aria-hidden />{t("common.whole")}</span>
              ) : first.owners.map((m) => (
                <span key={m.id} className="wall-next-owner">
                  <Avatar member={m} size="sm" />
                  {/* The name, or initials where three or more share the line or it is narrow. */}
                  {first.owners.length > 2 ? short.get(m.id) : <>
                    <span className="wall-next-name">{m.name}</span>
                    <span className="wall-next-short">{short.get(m.id)}</span>
                  </>}
                </span>
              ))}
            </span>
            {others.length > 0 && (
              <span className="wall-next-more" title={also}>
                <AvatarStack members={unique(others.flatMap((i) => i.owners))} />
                <span className="wall-next-more-long">{also}</span>
                <span className="wall-next-more-short">{t("nextUp.moreShort", { n: others.length })}</span>
              </span>
            )}
          </>
        ) : (
          <span className="wall-next-none">{t("nextUp.none")}</span>
        )}
        {offline && (
          <span className="wall-next-offline" title={t("nextUp.offlineHint")}>
            <CloudOff size={20} strokeWidth={2.5} aria-hidden /><span className="wall-next-offline-text">{t("nextUp.offline")}</span>
          </span>
        )}
      </span>
    </Link>
  );
}

/** How long the wall may try to reach the server before it says it is offline; a page load or a short blip stays quiet. */
const LOST_AFTER_MS = 60_000;

const unique = <T extends { id: string }>(list: T[]) => list.filter((x, i) => list.findIndex((y) => y.id === x.id) === i);
