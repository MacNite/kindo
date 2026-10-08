/**
 * Live view and talking in the browser (§22, §20 D48). One RTCPeerConnection
 * per view: video and the camera's sound come in, and while talking the
 * microphone goes out. The handshake is one request to Kindo, which checks
 * who is asking and forwards it to go2rtc; the media itself then flows
 * directly between this screen and go2rtc's WebRTC port on the LAN.
 */

/** Why a view couldn't start: an error code the screens translate (`errors.*`, `cameras.*`). */
export class CameraError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Waits until the browser has its candidates (go2rtc's handshake is one request, not a trickle), or `ms` at most. */
function gathered(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, ms);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export interface CameraLink { pc: RTCPeerConnection; media: MediaStream }

/**
 * Opens a camera. With `mic`, the offer sends the microphone (to the camera's
 * two-way stream) and needs the screen to hold the camera's talk lease.
 */
export async function openCamera(cameraId: string, { mic, screen, signal }: { mic?: MediaStreamTrack; screen?: string; signal?: AbortSignal } = {}): Promise<CameraLink> {
  // A LAN connection to go2rtc: no STUN server, nothing leaves the house.
  const pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: "max-bundle" });
  const media = new MediaStream();
  pc.addEventListener("track", (e) => media.addTrack(e.track));
  pc.addTransceiver("video", { direction: "recvonly" });
  if (mic) pc.addTransceiver(mic, { direction: "sendrecv" });
  else pc.addTransceiver("audio", { direction: "recvonly" });
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc, 1500);
    const res = await fetch(`/api/cameras/${encodeURIComponent(cameraId)}/webrtc`, {
      method: "POST", headers: { "content-type": "application/json" }, signal,
      body: JSON.stringify({ offer: pc.localDescription?.sdp ?? "", talk: Boolean(mic), screen }),
    });
    const body = (await res.json().catch(() => ({}))) as { sdp?: string; error?: string };
    if (!res.ok || typeof body.sdp !== "string") throw new CameraError(body.error ?? "remote");
    await pc.setRemoteDescription({ type: "answer", sdp: body.sdp });
    return { pc, media };
  } catch (e) {
    pc.close();
    if (e instanceof CameraError) throw e;
    throw new CameraError(signal?.aborted ? "aborted" : e instanceof TypeError ? "network" : "remote");
  }
}

/** This browser tab's id for talking, so two screens of one person count as two speakers. */
export function screenId(): string {
  const make = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
  try {
    const known = sessionStorage.getItem("kindo-screen");
    if (known) return known;
    const id = make();
    sessionStorage.setItem("kindo-screen", id);
    return id;
  } catch {
    return make();
  }
}

/** Asks for the microphone, with the browser's echo cancelling: the tablet's speaker is right next to it. */
export async function openMicrophone(): Promise<MediaStreamTrack> {
  if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new CameraError("insecure");
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    const [track] = s.getAudioTracks();
    if (!track) throw new CameraError("micDenied");
    return track;
  } catch (e) {
    if (e instanceof CameraError) throw e;
    throw new CameraError("micDenied");
  }
}
