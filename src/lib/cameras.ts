/**
 * Cameras and the doorbell (§22): Frigate's cameras on the wall, a ring from
 * Home Assistant's visitor sensor, and talking back through the doorbell.
 * Pure helpers shared by the server and the screens.
 */

/**
 * A camera the admin added. Names only: Frigate's address, login and the
 * camera's own stream URLs stay on the server (§17).
 */
export interface CameraSetup {
  /** Kindo's id for the camera, stable across renames. */
  id: string;
  /** What the family sees, e.g. "Front door". */
  name: string;
  /** Frigate's camera, for still pictures. */
  camera?: string;
  /** The go2rtc stream for watching and listening. */
  stream: string;
  /** The go2rtc stream that carries the camera's speaker (backchannel); talking is off without one. */
  talkStream?: string;
  /** Home Assistant's binary sensor for the doorbell button (Reolink: "Visitor"); ringing is off without one. */
  visitorEntity?: string;
}

/** What every screen may know about a camera. */
export interface CameraInfo {
  id: string;
  name: string;
  /** Has a still picture (a Frigate camera). */
  snapshot: boolean;
  /** Someone with the right may talk through it. */
  talk: boolean;
  /** Rings when its button is pressed. */
  doorbell: boolean;
}

/** A doorbell press that is still going on. */
export interface Ring { id: string; cameraId: string; at: Date; endsAt: Date }

/** What Frigate and Home Assistant offer, for the admin to pick from. */
export interface CameraChoices {
  /** Frigate's cameras. */
  cameras: string[];
  /** go2rtc's streams. */
  streams: string[];
  /** Home Assistant's binary sensors, visitor sensors first; empty without Home Assistant. */
  visitors: { entityId: string; name: string }[];
}

/** How long every screen shows a ring. */
export const RING_MS = 60_000;
/** Presses closer together than this are one ring (the button bounces, Home Assistant reconnects). */
export const RING_DEBOUNCE_MS = 15_000;
/** A talk lease lasts this long unless renewed... */
export const TALK_LEASE_MS = 30_000;
/** ...and a talking screen renews it this often. */
export const TALK_RENEW_MS = 10_000;

/** Frigate camera and go2rtc stream names: what Frigate itself allows, nothing that could bend a URL. */
export const STREAM_NAME = /^[A-Za-z0-9_.-]{1,64}$/;
export const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

export const cameraInfo = (c: CameraSetup): CameraInfo => ({
  id: c.id, name: c.name, snapshot: Boolean(c.camera), talk: Boolean(c.talkStream), doorbell: Boolean(c.visitorEntity),
});

/** Suffixes Frigate's docs and common setups use for the two-way stream of a camera. */
const TALK_SUFFIXES = ["_twt", "_twoway", "_two_way", "_talk", "_backchannel"];

/**
 * A first guess for a Frigate camera: the stream of the same name to watch,
 * and its two-way twin (`front_door_twt`, `front_door_twoway`) to talk.
 */
export function guessStreams(camera: string, streams: readonly string[]): { stream?: string; talkStream?: string } {
  const stream = streams.includes(camera) ? camera : streams.find((s) => s.startsWith(camera) && !TALK_SUFFIXES.some((x) => s.endsWith(x)));
  const talkStream = TALK_SUFFIXES.map((x) => `${camera}${x}`).find((s) => streams.includes(s));
  return { stream, talkStream };
}

/** A new camera id from its name: lowercase, safe in URLs, unique among `taken`. */
export function cameraId(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "camera";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}-${i}`;
  return id;
}

/** Binary sensors that look like a doorbell button come first in the picker. */
export const looksLikeVisitor = (entityId: string, name = "") => /visitor|doorbell|klingel|besucher|ring/i.test(`${entityId} ${name}`);

/**
 * Whether a WebRTC offer wants to send media (a microphone) rather than only
 * receive it. A section without a direction attribute is sendrecv (RFC 8866).
 * Watching must never open a camera's speaker, whatever the browser offers.
 */
export function offerSends(sdp: string): boolean {
  const sections = sdp.split(/\r?\nm=/).slice(1);
  return sections.some((m) => {
    if (/^application\b/.test(m)) return false;
    const dir = m.match(/\r?\na=(sendrecv|sendonly|recvonly|inactive)\b/)?.[1] ?? "sendrecv";
    return dir === "sendrecv" || dir === "sendonly";
  });
}
