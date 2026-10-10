"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type CSSProperties } from "react";
import {
  AudioLines, BookHeadphones, ChevronRight, Disc3, ListMusic, MonitorSmartphone, Pause, Play, SkipBack, SkipForward, Speaker, Square, Volume2,
} from "lucide-react";
import type { Member } from "@/lib/types";
import { shelfFor, type ShelfEntry, type ShelfKind } from "@/lib/media";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { coverUrl, player, playerState, usePlayer } from "@/lib/state/player";
import { useSpeakers } from "@/lib/state/useSpeakers";
import { Button, IconButton, LinkButton } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Panel, PageHeader } from "../ui/Panel";
import { Avatar } from "../ui/Avatar";
import { cn } from "../ui/cn";

const KIND_ICON: Record<ShelfKind, typeof Disc3> = { album: Disc3, playlist: ListMusic, book: BookHeadphones };

/** m:ss or h:mm:ss. */
function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** A shelf item's cover, or its kind's picture when it has none. */
function Cover({ item, className, iconSize = 40 }: { item: ShelfEntry; className?: string; iconSize?: number }) {
  const [failed, setFailed] = useState(false);
  const I = KIND_ICON[item.kind];
  return (
    <span className={cn("relative grid aspect-square place-items-center overflow-hidden rounded-card bg-sunken text-soft", className)}>
      {!failed && (
        <img src={coverUrl(item.id)} alt="" loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {failed && <I size={iconSize} aria-hidden />}
    </span>
  );
}

/** The covers of a shelf: a picture each, the name small beneath (§6: pictures carry the meaning). */
function ShelfGrid({ items, onOpen, large }: { items: ShelfEntry[]; onOpen: (item: ShelfEntry) => void; large?: boolean }) {
  const { t } = useI18n();
  const p = usePlayer();
  return (
    <ul className={cn("grid gap-4", large ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6")}>
      {items.map((item) => {
        const on = p.item?.id === item.id && p.playing;
        return (
          <li key={item.id}>
            <button type="button" data-testid="shelf-cover" onClick={() => onOpen(item)} aria-label={t("media.open", { name: item.name })}
              className={cn("flex w-full flex-col gap-2 rounded-panel p-2 text-left transition-colors hover:bg-sunken", on && "bg-surface ring-2 ring-star")}>
              <span className="relative">
                <Cover item={item} className="w-full shadow-sm" iconSize={large ? 56 : 40} />
                {on && <span className="absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full bg-star text-ink"><AudioLines size={20} aria-hidden /></span>}
              </span>
              <span className={cn("line-clamp-2 px-1 font-bold leading-tight", large ? "text-lg" : "text-sm")}>{item.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** "Who is listening?": a child's own place in an audiobook, and only their shelf. */
function WhoListens({ members, value, onChange }: { members: Member[]; value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useI18n();
  if (!members.length) return null;
  return (
    <div role="radiogroup" aria-label={t("media.who")} className="mb-6 flex flex-wrap items-center gap-2">
      <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)}
        className={cn("h-12 rounded-full border-2 px-4 font-bold", value === null ? "border-ink bg-ink text-surface" : "border-line text-soft")}>{t("media.everyone")}</button>
      {members.map((m) => (
        <button key={m.id} type="button" role="radio" aria-checked={value === m.id} aria-label={m.name} onClick={() => onChange(m.id)} style={{ "--m": m.color } as CSSProperties}
          className={cn("inline-flex h-12 items-center gap-2 rounded-full border-2 pl-1 pr-4 font-bold", value === m.id ? "tint m-border" : "border-line text-soft")}>
          <Avatar member={m} size="sm" />{m.name}
        </button>
      ))}
    </div>
  );
}

/** `/media`: the kids' shelf, for everyone or one child, played here or on a speaker (§23). */
export function MediaScreen() {
  const { t } = useI18n();
  const { data, getMembers, viewer } = useStore();
  const children = getMembers().filter((m) => m.role === "child");
  const asked = useSearchParams().get("for");
  const [who, setWho] = useState<string | null>(children.some((c) => c.id === asked) ? asked : viewer.role === "child" ? viewer.memberId ?? null : null);
  const [open, setOpen] = useState<ShelfEntry | null>(null);
  if (!data.media) {
    return (
      <>
        <PageHeader title={t("media.title")} />
        <Panel>
          <p className="max-w-prose text-soft">{t("media.notSetUp")}</p>
          {viewer.isAdmin && <LinkButton href="/settings?section=integrations" variant="outline" className="mt-4">{t("homeControl.setUp")}<ChevronRight size={16} /></LinkButton>}
        </Panel>
      </>
    );
  }
  const shelf = shelfFor(data.media.shelf, who);
  return (
    <>
      <PageHeader title={t("media.title")} subtitle={t("media.subtitle")} />
      <WhoListens members={children} value={who} onChange={setWho} />
      {shelf.length ? <ShelfGrid items={shelf} onOpen={setOpen} /> : <Panel><p className="text-soft">{t("media.emptyFor")}</p></Panel>}
      {open && <PlayerSheet item={open} memberId={who ?? undefined} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * A child's own shelf on the kiosk (`/kids/<id>/listen`): their colour, big
 * covers, nothing to read. A tap opens the player.
 */
export function KidsListen({ memberId }: { memberId: string }) {
  const { t } = useI18n();
  const { data, getMember } = useStore();
  const member = getMember(memberId);
  const [open, setOpen] = useState<ShelfEntry | null>(null);
  if (!member) return null;
  const shelf = shelfFor(data.media?.shelf ?? [], member.id);
  return (
    <div style={{ "--m": member.color } as CSSProperties} className="tint min-h-dvh">
      <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-6 p-5 sm:p-8">
        <header className="flex items-center gap-4">
          <Link href={`/kids/${member.id}`} aria-label={t("media.backToRoutine")} className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-surface/70">
            <Avatar member={member} size="md" />
          </Link>
          <span className="m-text grid h-16 w-16 place-items-center rounded-full bg-surface/70"><BookHeadphones size={32} aria-hidden /></span>
          <h1 className="sr-only">{t("media.title")}</h1>
        </header>
        {shelf.length ? <ShelfGrid items={shelf} onOpen={setOpen} large /> : <p className="text-lg text-soft">{t("media.emptyFor")}</p>}
      </div>
      {open && <PlayerSheet item={open} memberId={member.id} onClose={() => setOpen(null)} />}
    </div>
  );
}

/**
 * One shelf item: a big cover, a big play button, and where it plays (this
 * screen or one of the admin's speakers). On this screen it also skips and
 * seeks; on a speaker it pauses, stops and turns the volume up to the
 * admin's limit.
 */
export function PlayerSheet({ item, memberId, onClose }: { item: ShelfEntry; memberId?: string; onClose: () => void }) {
  const { t } = useI18n();
  const { data } = useStore();
  const speakers = data.media?.speakers ?? [];
  const [output, setOutput] = useState<string>("screen");
  return (
    <Dialog open onClose={onClose} title={item.name}>
      <div className="flex flex-col items-center gap-5">
        <Cover item={item} className="w-full max-w-[18rem] shadow-md" iconSize={72} />
        {speakers.length > 0 && (
          <div role="radiogroup" aria-label={t("media.output")} className="flex flex-wrap justify-center gap-2">
            {[{ entityId: "screen", name: t("media.thisScreen") }, ...speakers].map((s) => {
              const I = s.entityId === "screen" ? MonitorSmartphone : Speaker;
              return (
                <button key={s.entityId} type="button" role="radio" aria-checked={output === s.entityId} onClick={() => setOutput(s.entityId)}
                  className={cn("inline-flex h-12 items-center gap-2 rounded-full border-2 px-4 font-bold", output === s.entityId ? "border-ink bg-ink text-surface" : "border-line text-soft")}>
                  <I size={18} aria-hidden />{s.name}
                </button>
              );
            })}
          </div>
        )}
        {output === "screen" ? <ScreenControls item={item} memberId={memberId} /> : <SpeakerControls speaker={output} item={item} memberId={memberId} />}
      </div>
    </Dialog>
  );
}

const BIG = "grid h-20 w-20 place-items-center rounded-full bg-ink text-surface transition-transform active:scale-95 disabled:opacity-40";

function ScreenControls({ item, memberId }: { item: ShelfEntry; memberId?: string }) {
  const { t } = useI18n();
  const p = usePlayer();
  const mine = p.item?.id === item.id && p.memberId === memberId;
  const q = mine ? p.queue : null;
  const many = (q?.tracks.length ?? 0) > 1;
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex items-center gap-4">
        {many && <IconButton size="lg" label={t("media.previous")} onClick={() => void player.previous()}><SkipBack size={28} /></IconButton>}
        <button type="button" className={BIG} disabled={mine && p.loading && !p.playing} aria-label={mine && p.playing ? t("media.pause") : t("media.play", { name: item.name })}
          onClick={() => (mine ? player.toggle() : void player.play(item, memberId))}>
          {mine && p.playing ? <Pause size={36} /> : <Play size={36} className="translate-x-0.5" />}
        </button>
        {many && <IconButton size="lg" label={t("media.next")} disabled={p.index >= (q?.tracks.length ?? 1) - 1} onClick={() => void player.next()}><SkipForward size={28} /></IconButton>}
      </div>
      {mine && p.duration > 0 && (
        <div className="w-full">
          <input type="range" min={0} max={Math.round(p.duration)} step={1} value={Math.round(p.position)} aria-label={t("media.position")}
            onChange={(e) => void player.seek(Number(e.target.value))} className="w-full accent-[var(--color-ink,currentColor)]" />
          <div className="flex justify-between text-sm text-soft">
            <span className="num">{clock(p.position)}</span>
            {many && <span>{t("media.part", { n: p.index + 1, total: q!.tracks.length })}</span>}
            <span className="num">{clock(p.duration)}</span>
          </div>
        </div>
      )}
      {mine && <Button variant="ghost" onClick={() => void player.stop()}><Square size={16} />{t("media.stop")}</Button>}
      {mine && p.error && <p role="alert" className="text-sm font-bold">{t(p.error === "tapToPlay" ? "media.tapToPlay" : "media.unavailable")}</p>}
    </div>
  );
}

function SpeakerControls({ speaker, item, memberId }: { speaker: string; item: ShelfEntry; memberId?: string }) {
  const { t } = useI18n();
  const { speakers, play, command, volume } = useSpeakers();
  const s = speakers.find((x) => x.entityId === speaker);
  const [busy, setBusy] = useState(false);
  const [vol, setVol] = useState<number | null>(null);
  if (!s) return null;
  const playing = s.state === "playing";
  const start = async () => {
    setBusy(true);
    // The screen stops its own sound: one place plays at a time.
    if (playerState().playing) player.pause();
    await play(speaker, item.id, memberId);
    setBusy(false);
  };
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <p className="text-center text-sm text-soft" role="status">
        {s.state === "unavailable" ? t("media.speakerUnavailable") : s.title ? t("media.speakerPlaying", { title: s.title }) : t(`media.speaker_${s.state}`)}
      </p>
      <div className="flex items-center gap-4">
        <button type="button" className={BIG} disabled={busy || s.state === "unavailable"} aria-label={t("media.playOn", { name: item.name, speaker: s.name })} onClick={start}>
          <Play size={36} className="translate-x-0.5" />
        </button>
        <IconButton size="lg" label={playing ? t("media.pause") : t("media.resume")} disabled={s.state === "unavailable" || s.state === "off"} onClick={() => command(speaker, playing ? "pause" : "play")}>
          {playing ? <Pause size={28} /> : <Play size={28} />}
        </IconButton>
        <IconButton size="lg" label={t("media.stop")} disabled={s.state === "unavailable"} onClick={() => command(speaker, "stop")}><Square size={24} /></IconButton>
      </div>
      {s.volume !== undefined && (
        <label className="flex w-full items-center gap-3">
          <Volume2 size={20} aria-hidden />
          <input type="range" min={0} max={s.maxVolume} step={5} value={vol ?? Math.min(s.volume, s.maxVolume)} aria-label={t("media.volume")} className="flex-1"
            onChange={(e) => setVol(Number(e.target.value))} onPointerUp={() => vol !== null && void volume(speaker, vol).then(() => setVol(null))}
            onKeyUp={() => vol !== null && void volume(speaker, vol).then(() => setVol(null))} />
        </label>
      )}
    </div>
  );
}

/**
 * What plays on this screen, from anywhere in the app: the cover, the name,
 * play/pause and stop. Above the phone's bottom navigation; on the wall and
 * the child's view a small pill in the corner.
 */
export function MiniPlayer({ kiosk }: { kiosk?: boolean }) {
  const { t } = useI18n();
  const { wallTiles } = useStore();
  const path = usePathname();
  const p = usePlayer();
  const [open, setOpen] = useState(false);
  if (!p.item) return null;
  // The wall's own Listening tile already shows it; a pill would cover a lane.
  if (kiosk && path === "/wall" && wallTiles.some((x) => x.id === "media" && x.enabled)) return null;
  const track = p.queue && p.queue.tracks.length > 1 ? p.queue.tracks[p.index]?.title : undefined;
  return (
    <>
      <div data-testid="mini-player" className={cn("fixed z-40 flex items-center gap-3 rounded-full bg-surface p-2 pr-3 shadow-lg ring-1 ring-line",
        kiosk ? "bottom-4 right-4 max-w-[min(26rem,calc(100vw-2rem))]" : "inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:inset-x-auto md:bottom-6 md:right-6 md:max-w-md")}>
        <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={t("media.open", { name: p.item.name })}>
          <Cover item={p.item} className="h-12 w-12 shrink-0 !rounded-full" iconSize={20} />
          <span className="min-w-0">
            <span className="block truncate font-bold">{p.item.name}</span>
            {track && <span className="block truncate text-sm text-soft">{track}</span>}
          </span>
        </button>
        <IconButton label={p.playing ? t("media.pause") : t("media.resume")} onClick={() => player.toggle()}>{p.playing ? <Pause size={22} /> : <Play size={22} />}</IconButton>
        <IconButton label={t("media.stop")} onClick={() => void player.stop()}><Square size={18} /></IconButton>
      </div>
      {open && <PlayerSheet item={p.item} memberId={p.memberId} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The wall's listening tile (§23): what plays, or the first covers to start one. A tap beside them opens the shelf. */
export function MediaTile({ large }: { large?: boolean }) {
  const { t } = useI18n();
  const { data } = useStore();
  const p = usePlayer();
  const [open, setOpen] = useState<ShelfEntry | null>(null);
  if (!data.media) return null;
  const picks = data.media.shelf.slice(0, 4);
  return (
    <section data-testid="media-tile" className={cn("media-tile flex flex-col gap-3 rounded-panel bg-surface", large ? "wall-openable p-6" : "p-5")}>
      {large && <Link href="/media" aria-label={t("media.title")} tabIndex={-1} className="wall-open" />}
      <Link href="/media" className={cn("font-bold hover:underline underline-offset-4", large ? "wall-tile-label text-lg text-soft" : "font-display text-lg font-semibold tracking-tight")}>{t("media.title")}</Link>
      {p.item ? (
        // The cover itself plays and pauses: one big target that fits the narrowest tile.
        <button type="button" onClick={() => player.toggle()} aria-label={p.playing ? t("media.pause") : t("media.resume")}
          className="relative flex min-w-0 flex-col items-start gap-2 text-left">
          <span className="relative w-full max-w-[9rem]">
            <Cover item={p.item} className="w-full" iconSize={28} />
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-ink/80 text-surface">{p.playing ? <Pause size={24} /> : <Play size={24} className="translate-x-0.5" />}</span>
            </span>
          </span>
          <span className="w-full truncate font-bold">{p.item.name}</span>
        </button>
      ) : (
        <ul className="grid grid-cols-4 gap-2">
          {picks.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => setOpen(item)} aria-label={t("media.open", { name: item.name })} className="block w-full">
                <Cover item={item} className="w-full" iconSize={24} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <PlayerSheet item={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
