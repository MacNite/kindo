"use client";
import type { CSSProperties, ReactNode } from "react";
import type { Member, Period } from "@/lib/types";
import { celebrationFor, type Motion } from "@/lib/avatars";
import { useI18n, type MessageKey } from "@/i18n";
import { cn } from "../ui/cn";

/** Motions whose figure leaves the circle, which then hides what is outside it. */
const CLIPPED = new Set<Motion>(["gallop", "drive", "peek", "launch"]);
const SPARKS = [0, 60, 120, 180, 240, 300];

/**
 * A finished routine (D60): the child's avatar plays a short animation, then a
 * cheer for the time of day appears. `play` changes each time it should run;
 * null shows it at rest, as when the screen opens on a routine done earlier.
 * Tapping the figure plays it again.
 */
export function Celebration({ member, period, day, play, onReplay, children }: {
  member: Member; period: Period; day: string; play: number | null; onReplay: () => void; children?: ReactNode;
}) {
  const { t } = useI18n();
  const { motion, figure, body, cheer } = celebrationFor(member, day, period);
  const avatar = member.avatar;
  const hero = figure ? <span className={cn("cel-hero", body && "cel-body")} aria-hidden>{figure}</span>
    : avatar.kind === "photo" ? <span className="cel-hero"><img src={avatar.url} alt="" className="cel-photo" /></span>
    : <span className="cel-hero cel-letter font-display font-bold" aria-hidden>{member.name[0]}</span>;

  return (
    <div data-period={period} className="cel grid flex-1 place-items-center rounded-panel bg-surface/70 p-10 text-center animate-rise">
      {/* Keyed by `play`, so a replay starts every animation from the beginning. */}
      <div key={play ?? "rest"} data-motion={motion} className={cn(play !== null && "cel-play")}>
        <span aria-hidden className="cel-cloud a" /><span aria-hidden className="cel-cloud b" />
        <span aria-hidden className="cel-moon" />
        {[1, 2, 3, 4].map((n) => <span key={n} aria-hidden className={`cel-twinkle t${n}`} />)}

        <button type="button" onClick={onReplay} aria-label={t("kids.playAgain")}
          className="cel-scene [--d:10rem] sm:[--d:14rem]">
          <span aria-hidden className="cel-sun" />
          <span className={cn("cel-disc m-bg", CLIPPED.has(motion) && "cel-clip")}>
            <span className="cel-mover">
              {hero}
              {(motion === "gallop" || motion === "drive") && <span aria-hidden className="cel-lines"><i /><i /><i /></span>}
            </span>
          </span>
          <Props motion={motion} />
        </button>

        <p className="cel-cheer m-text mx-auto mt-6 max-w-[18ch] text-balance font-display text-4xl font-bold sm:text-5xl">
          {t(`kids.cheers.${period}.c${cheer}` as MessageKey, { name: member.name })}
        </p>
        {children}
      </div>
    </div>
  );
}

/** The few extra pieces each motion uses; all stay hidden until it plays. */
function Props({ motion }: { motion: Motion }) {
  const puffs = <><span className="cel-puff l" /><span className="cel-puff r" /><span className="cel-puff l2" /><span className="cel-puff r2" /></>;
  const notes = <><span className="cel-note n1">♪</span><span className="cel-note n2">♫</span><span className="cel-note n3">♪</span></>;
  const zz = <><span className="cel-zz z1">z</span><span className="cel-zz z2">z</span><span className="cel-zz z3">Z</span></>;
  const sparks = SPARKS.map((r) => <span key={r} className="cel-spark" style={{ "--r": `${r}deg` } as CSSProperties} />);
  const parts: Record<Motion, ReactNode> = {
    stomp: puffs,
    roar: <><span className="cel-ring r1" /><span className="cel-ring r2" /><span className="cel-ring r3" />{zz}</>,
    hatch: <><span className="cel-egg"><span className="cel-shell bottom" /><span className="cel-shell top" /></span>{sparks}</>,
    gallop: null,
    drive: null,
    rear: <>{puffs}{notes}{zz}</>,
    jump: <><span className="cel-fence"><i /><i /></span><span className="cel-rosette"><span className="tail a" /><span className="tail b" /><span className="face" /></span></>,
    toss: <>{notes}{zz}</>,
    hop: sparks,
    wiggle: <>{notes}{zz}</>,
    spin: sparks,
    peek: sparks,
    fly: null,
    swim: <><span className="cel-bubble b1" /><span className="cel-bubble b2" /><span className="cel-bubble b3" /></>,
    launch: puffs,
  };
  return <span aria-hidden className="contents">{parts[motion]}</span>;
}
