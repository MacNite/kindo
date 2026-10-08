import { describe, expect, it } from "vitest";
import { cameraId, cameraInfo, guessStreams, looksLikeVisitor, offerSends } from "./cameras";

const offer = (audio: string, video = "a=recvonly") =>
  ["v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "m=video 9 UDP/TLS/RTP/SAVPF 96", video, "m=audio 9 UDP/TLS/RTP/SAVPF 111", audio, ""].join("\r\n");

describe("offerSends (§22)", () => {
  it("lets a watching screen only receive", () => {
    expect(offerSends(offer("a=recvonly"))).toBe(false);
    expect(offerSends(offer("a=inactive"))).toBe(false);
  });
  it("sees a microphone, also when the direction is left out (sendrecv by default)", () => {
    expect(offerSends(offer("a=sendrecv"))).toBe(true);
    expect(offerSends(offer("a=sendonly"))).toBe(true);
    expect(offerSends(offer("a=mid:1"))).toBe(true);
  });
  it("sees sending video too", () => {
    expect(offerSends(offer("a=recvonly", "a=sendonly"))).toBe(true);
  });
});

describe("guessStreams", () => {
  const streams = ["front_door", "front_door_sub", "front_door_twt", "garden", "garden_twoway"];
  it("watches the stream of the same name and talks through its two-way twin", () => {
    expect(guessStreams("front_door", streams)).toEqual({ stream: "front_door", talkStream: "front_door_twt" });
    expect(guessStreams("garden", streams)).toEqual({ stream: "garden", talkStream: "garden_twoway" });
  });
  it("falls back to a stream that starts with the camera's name, never a two-way one", () => {
    expect(guessStreams("drive", ["drive_main", "drive_twt"])).toEqual({ stream: "drive_main", talkStream: "drive_twt" });
    expect(guessStreams("shed", ["shed_twt"])).toEqual({ stream: undefined, talkStream: "shed_twt" });
  });
});

describe("cameras", () => {
  it("makes URL-safe, unique ids from names", () => {
    expect(cameraId("Front door", [])).toBe("front-door");
    expect(cameraId("Front door", ["front-door"])).toBe("front-door-2");
    expect(cameraId("Haustür ✨", [])).toBe("haust-r");
    expect(cameraId("!!!", [])).toBe("camera");
  });
  it("tells screens only names and abilities", () => {
    expect(cameraInfo({ id: "door", name: "Door", camera: "front_door", stream: "front_door", talkStream: "front_door_twt", visitorEntity: "binary_sensor.door_visitor" }))
      .toEqual({ id: "door", name: "Door", snapshot: true, talk: true, doorbell: true });
    expect(cameraInfo({ id: "g", name: "Garden", stream: "garden" })).toEqual({ id: "g", name: "Garden", snapshot: false, talk: false, doorbell: false });
  });
  it("puts doorbell buttons first", () => {
    expect(looksLikeVisitor("binary_sensor.front_door_visitor")).toBe(true);
    expect(looksLikeVisitor("binary_sensor.x", "Haustür Klingel")).toBe(true);
    expect(looksLikeVisitor("binary_sensor.hallway_motion", "Hallway motion")).toBe(false);
  });
});
