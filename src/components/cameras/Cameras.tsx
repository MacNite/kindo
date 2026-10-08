"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { BellRing, ChevronRight, Mic, MicOff, RotateCw, Video, Volume2, X } from "lucide-react";
import type { CameraInfo, Ring } from "@/lib/cameras";
import { useI18n } from "@/i18n";
import { useStore } from "@/lib/state/store";
import { useCameraStream, useTalk } from "@/lib/state/useCamera";
import { activeRing } from "@/lib/services/cameras";
import { Button, LinkButton } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Panel, PageHeader } from "../ui/Panel";
import { cn } from "../ui/cn";
import { useOverlay } from "../ui/useOverlay";

/** How often a still picture is refreshed while it's on screen. */
const PICTURE_MS = 10_000;
/** A ring someone has touched stays open this long after the last touch, even past the ring itself. */
const TOUCHED_MS = 60_000;

/** Rings dismissed on this screen, kept across pages (the wall and the app have separate layouts). */
const DISMISSED_KEY = "kindo-dismissed-rings";
function dismissedRings(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function dismissRing(id: string) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedRings().slice(-19), id]));
  } catch {}
}

/**
 * A camera's latest still picture, refreshed every few seconds while the page
 * is visible. Cheap enough for the wall to show all day; live video only
 * starts when someone taps it.
 */
function CameraPicture({ camera, height = 480, className }: { camera: CameraInfo; height?: number; className?: string }) {
  const [tick, setTick] = useState(() => Date.now());
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    if (!camera.snapshot) return;
    const id = setInterval(() => document.visibilityState === "visible" && setTick(Date.now()), PICTURE_MS);
    return () => clearInterval(id);
  }, [camera.snapshot]);
  if (!camera.snapshot || broken) {
    return <span className={cn("grid place-items-center bg-sunken text-soft", className)}><Video size={32} aria-hidden /></span>;
  }
  return (
    // A proxied, ever-changing picture: next/image would only add a cache in the way.
    <img src={`/api/cameras/${encodeURIComponent(camera.id)}/snapshot?h=${height}&t=${tick}`} alt="" draggable={false}
      onError={() => setBroken(true)} onLoad={() => setBroken(false)} className={cn("bg-sunken object-cover", className)} />
  );
}

/** One camera as a picture with its name: tap to watch live. */
function CameraButton({ camera, onOpen, large }: { camera: CameraInfo; onOpen: () => void; large?: boolean }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onOpen} aria-label={t("cameras.watch", { name: camera.name })}
      className="group relative block w-full overflow-hidden rounded-card text-left">
      <CameraPicture camera={camera} className="aspect-video w-full" height={large ? 480 : 240} />
      <span className={cn("absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 font-bold text-white", large ? "text-lg" : "text-sm")}>
        {camera.doorbell && <BellRing size={large ? 20 : 16} aria-hidden />}<span className="truncate">{camera.name}</span>
      </span>
    </button>
  );
}

/**
 * The compact view for the wall's household column and the home-screen
 * widget: every camera's picture, live on a tap.
 */
export function CamerasTile({ large }: { large?: boolean }) {
  const { t } = useI18n();
  const { cameras } = useStore();
  const [open, setOpen] = useState<CameraInfo | null>(null);
  if (!cameras.length) return null;
  return (
    <section data-testid="cameras-tile" className={cn("flex flex-col gap-3 rounded-panel bg-surface", large ? "p-6" : "p-5")}>
      <Link href="/cameras" className={cn("font-bold hover:underline underline-offset-4", large ? "text-lg text-soft" : "font-display text-lg font-semibold tracking-tight")}>{t("cameras.title")}</Link>
      <ul className={cn("grid gap-3", cameras.length > 1 && "grid-cols-2")}>
        {cameras.map((c) => <li key={c.id}><CameraButton camera={c} large={large} onOpen={() => setOpen(c)} /></li>)}
      </ul>
      {open && <LiveCamera camera={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** The home-screen widget (§4). */
export function CamerasWidget() {
  const { t } = useI18n();
  const { cameras } = useStore();
  if (!cameras.length) return <Panel title={t("widgets.cameras")}><p className="text-soft">{t("cameras.notSetUp")}</p></Panel>;
  return <CamerasTile />;
}

/** `/cameras`: every camera large, live on a tap (§22). */
export function CamerasScreen() {
  const { t } = useI18n();
  const { cameras, viewer } = useStore();
  const [open, setOpen] = useState<CameraInfo | null>(null);
  return (
    <>
      <PageHeader title={t("cameras.title")} subtitle={cameras.length ? t("cameras.subtitle") : undefined} />
      {cameras.length === 0 ? (
        <Panel>
          <p className="max-w-prose text-soft">{t("cameras.notSetUp")}</p>
          {viewer.isAdmin && <LinkButton href="/settings?section=integrations" variant="outline" className="mt-4">{t("cameras.setUp")}<ChevronRight size={16} /></LinkButton>}
        </Panel>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cameras.map((c) => <li key={c.id}><CameraButton camera={c} large onOpen={() => setOpen(c)} /></li>)}
        </ul>
      )}
      {open && <LiveCamera camera={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * A camera over the whole screen, above the photo frame: live video and
 * sound, and Talk where the camera has a speaker. Closing it ends everything:
 * the stream, the microphone and the talk lease.
 */
function LiveCamera({ camera, onClose, ringing, onTouch }: { camera: CameraInfo; onClose: () => void; ringing?: boolean; onTouch?: () => void }) {
  const { t } = useI18n();
  const talk = useTalk(camera.id);
  const { media, state, error, retry } = useCameraStream(camera.id, { mic: talk.mic, screen: talk.mic ? talk.screen : undefined });
  const video = useRef<HTMLVideoElement>(null);
  /** The browser wouldn't play sound without a tap (autoplay rules): show the button that turns it on. */
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.srcObject = media;
    if (!media) return;
    v.muted = false;
    v.play().then(() => setNeedsTap(false), () => {
      v.muted = true;
      setNeedsTap(true);
      void v.play().catch(() => {});
    });
  }, [media]);

  // While someone speaks, the visitor's sound pauses: no echo from the tablet's own speaker.
  useEffect(() => {
    if (video.current && !needsTap) video.current.muted = talk.speaking;
  }, [talk.speaking, needsTap]);

  const root = useRef<HTMLDivElement>(null);
  useOverlay(true, { root, onClose, layer: 110 });

  const unmute = () => {
    const v = video.current;
    if (!v) return;
    v.muted = false;
    void v.play().then(() => setNeedsTap(false), () => {});
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={camera.name} data-testid="live-camera" onPointerDown={onTouch}
      className="fixed inset-0 z-[110] flex flex-col bg-black text-white outline-none">
      <header className="flex items-center gap-3 p-4 sm:p-6">
        {ringing && <span className="grid h-12 w-12 shrink-0 animate-pulse place-items-center rounded-full bg-star text-ink"><BellRing size={24} aria-hidden /></span>}
        <div className="min-w-0 flex-1">
          {ringing && <p className="text-lg font-bold text-white/80">{t("cameras.doorbell")}</p>}
          <h2 className="truncate font-display text-2xl font-bold sm:text-3xl">{camera.name}</h2>
        </div>
        <Button size="lg" variant="ghost" onClick={onClose} className="!text-white hover:!bg-white/15"><X size={24} />{ringing ? t("cameras.dismiss") : t("common.close")}</Button>
      </header>

      <div className="relative min-h-0 flex-1">
        <video ref={video} playsInline autoPlay className="h-full w-full object-contain" />
        {state !== "live" && (
          <div className="absolute inset-0 grid place-items-center">
            {camera.snapshot && <CameraPicture camera={camera} height={720} className="absolute inset-0 h-full w-full object-contain opacity-60" />}
            <div className="relative flex flex-col items-center gap-4 rounded-panel bg-black/60 p-6 text-center">
              {state === "connecting" ? <p role="status" className="text-xl font-bold">{t("cameras.connecting")}</p> : (
                <>
                  <p role="alert" className="max-w-sm text-xl font-bold">{t("cameras.unavailable")}</p>
                  {error && error !== "remote" && <ErrorText code={error} className="!text-white/80" />}
                  <Button size="lg" variant="outline" onClick={retry} className="!border-white/40 !text-white hover:!bg-white/15"><RotateCw size={20} />{t("cameras.retry")}</Button>
                </>
              )}
            </div>
          </div>
        )}
        {needsTap && state === "live" && (
          <button type="button" onClick={unmute} className="absolute left-1/2 top-6 flex h-14 -translate-x-1/2 items-center gap-3 rounded-full bg-white px-6 text-lg font-bold text-ink">
            <Volume2 size={24} aria-hidden />{t("cameras.tapForSound")}
          </button>
        )}
      </div>

      {camera.talk && (
        <footer className="flex flex-col items-center gap-3 p-4 pb-8 sm:p-6">
          <TalkControls talk={talk} />
        </footer>
      )}
    </div>,
    document.body,
  );
}

/**
 * Talk: one tap takes the camera (and asks for the microphone), then the big
 * button sends sound only while it is held. The microphone state is always
 * visible, in words and a picture.
 */
function TalkControls({ talk }: { talk: ReturnType<typeof useTalk> }) {
  const { t } = useI18n();
  const hold = (on: boolean) => (e: ReactPointerEvent) => {
    e.preventDefault();
    talk.speak(on);
  };
  if (talk.state !== "on") {
    return (
      <>
        <Button size="lg" variant="outline" disabled={talk.state === "starting"} onClick={() => void talk.start()}
          className="h-16 !border-white/40 px-8 text-xl !text-white hover:!bg-white/15"><Mic size={26} />{talk.state === "starting" ? t("cameras.connecting") : t("cameras.talk")}</Button>
        <ErrorText code={talk.error} className="!text-danger-on-dark" />
      </>
    );
  }
  return (
    <>
      <p role="status" aria-live="polite" className={cn("flex items-center gap-2 text-lg font-bold", talk.speaking ? "text-white" : "text-white/70")}>
        {talk.speaking ? <Mic size={22} aria-hidden /> : <MicOff size={22} aria-hidden />}{talk.speaking ? t("cameras.micLive") : t("cameras.micMuted")}
      </p>
      <div className="flex items-center gap-3">
        <button type="button" aria-pressed={talk.speaking} onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerCancel={hold(false)} onPointerLeave={hold(false)}
          onKeyDown={(e) => (e.key === " " || e.key === "Enter") && !e.repeat && talk.speak(true)} onKeyUp={(e) => (e.key === " " || e.key === "Enter") && talk.speak(false)}
          onContextMenu={(e) => e.preventDefault()}
          className={cn("flex h-24 min-w-64 touch-none select-none items-center justify-center gap-3 rounded-full px-10 text-2xl font-bold transition-colors",
            talk.speaking ? "bg-danger-solid text-white" : "bg-white text-ink")}>
          <Mic size={32} aria-hidden />{talk.speaking ? t("cameras.talking") : t("cameras.holdToTalk")}
        </button>
        <Button size="lg" variant="ghost" onClick={talk.stop} className="!text-white hover:!bg-white/15">{t("cameras.stopTalk")}</Button>
      </div>
    </>
  );
}

/**
 * Shows a doorbell ring on whatever screen is open, above the photo frame
 * (§22): asks the server when the stream says someone rang, after a
 * reconnect, and when the page comes back. Dismissing closes it on this
 * screen only; it closes on its own when the ring is over, unless someone is
 * using it.
 */
export function DoorbellWatcher() {
  const { cameras, ringTick } = useStore();
  const [ring, setRing] = useState<Ring | null>(null);
  const [touched, setTouched] = useState(0);
  const ringId = useRef<string | null>(null);
  ringId.current = ring?.id ?? null;
  const hasDoorbell = cameras.some((c) => c.doorbell);

  useEffect(() => {
    if (!hasDoorbell) return;
    let live = true;
    const check = () => activeRing({}).then((r) => {
      if (live && r.ok && r.data && !dismissedRings().includes(r.data.id)) {
        // Asking again about the same ring keeps it, and the time someone last touched it.
        if (ringId.current === r.data.id) return;
        ringId.current = r.data.id;
        setRing(r.data);
        setTouched(0);
      }
    }, () => {});
    void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hasDoorbell, ringTick]);

  // Over when the ring is, or a minute after the last touch, whichever is later.
  useEffect(() => {
    if (!ring) return;
    const end = Math.max(new Date(ring.endsAt).getTime(), touched + TOUCHED_MS);
    const id = setTimeout(() => setRing(null), Math.max(0, end - Date.now()));
    return () => clearTimeout(id);
  }, [ring, touched]);

  const camera = ring && cameras.find((c) => c.id === ring.cameraId);
  if (!ring || !camera) return null;
  const close = () => {
    dismissRing(ring.id);
    setRing(null);
  };
  return <LiveCamera key={ring.id} camera={camera} ringing onClose={close} onTouch={() => setTouched(Date.now())} />;
}
