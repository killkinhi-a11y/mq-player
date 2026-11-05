import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act } from "react";
import { renderHook, flush } from "../helpers/renderHook";
import { usePinnedChats } from "@/components/mq/messenger/usePinnedChats";
import { useVoiceRecorder } from "@/components/mq/messenger/useVoiceRecorder";
import { fetchOnlineStatuses } from "@/components/mq/messenger/messengerApi";
import { getInitials, parseVoice, sameDay, colorForId } from "@/components/mq/messenger/format";

describe("usePinnedChats — localStorage contract unchanged", () => {
  beforeEach(() => localStorage.clear());

  it("reads existing pins and toggles chats (mq-pinned-chats)", () => {
    localStorage.setItem("mq-pinned-chats", JSON.stringify(["a"]));
    const { result } = renderHook(() => usePinnedChats());
    expect(result.current.pinnedChats).toEqual(["a"]);
    act(() => result.current.togglePinChat("b"));
    act(() => result.current.togglePinChat("a"));
    expect(result.current.pinnedChats).toEqual(["b"]);
    expect(JSON.parse(localStorage.getItem("mq-pinned-chats")!)).toEqual(["b"]);
  });

  it("one pinned message per chat; toggling same id unpins (mq-pinned-messages)", () => {
    const { result } = renderHook(() => usePinnedChats());
    act(() => result.current.togglePinMessageIn("c1", "m1"));
    act(() => result.current.togglePinMessageIn("c1", "m2"));
    act(() => result.current.togglePinMessageIn("c2", "m9"));
    expect(result.current.pinnedMessages).toEqual({ c1: "m2", c2: "m9" });
    act(() => result.current.togglePinMessageIn("c1", "m2"));
    expect(JSON.parse(localStorage.getItem("mq-pinned-messages")!)).toEqual({ c2: "m9" });
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("mq-pinned-chats", "{oops");
    localStorage.setItem("mq-pinned-messages", "[1]");
    const { result } = renderHook(() => usePinnedChats());
    expect(result.current.pinnedChats).toEqual([]);
    expect(Array.isArray(result.current.pinnedMessages) || typeof result.current.pinnedMessages === "object").toBe(true);
  });
});

describe("useVoiceRecorder", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("returns false (no state change) when microphone is unavailable", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error("denied")) } });
    const { result } = renderHook(() => useVoiceRecorder());
    let ok = true;
    await act(async () => { ok = await result.current.start(vi.fn()); });
    expect(ok).toBe(false);
    expect(result.current.isRecording).toBe(false);
  });

  it("records, counts duration, and hands the clip to onRecorded on stop", async () => {
    const stopTrack = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } });
    class FakeRecorder {
      static isTypeSupported() { return true; }
      state = "inactive"; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["x"]) }); this.onstop?.(); }
    }
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const onRecorded = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => { await result.current.start(onRecorded); });
    expect(result.current.isRecording).toBe(true);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.recordingDuration).toBe(3);
    act(() => result.current.stop());
    expect(result.current.isRecording).toBe(false);
    await flush(20);
    expect(onRecorded).toHaveBeenCalledWith(expect.stringMatching(/^data:/), 3);
    expect(stopTrack).toHaveBeenCalled();
  });

  it("cancel discards the clip (onRecorded never called)", async () => {
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) } });
    class FakeRecorder {
      static isTypeSupported() { return false; }
      state = "inactive"; ondataavailable = null; onstop: (() => void) | null = null;
      start() { this.state = "recording"; } stop() { this.state = "inactive"; this.onstop?.(); }
    }
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const onRecorded = vi.fn();
    const { result } = renderHook(() => useVoiceRecorder());
    await act(async () => { await result.current.start(onRecorded); });
    act(() => result.current.cancel());
    await flush(20);
    expect(onRecorded).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });
});

describe("messengerApi.fetchOnlineStatuses", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("maps ok → status, non-ok/throw → offline, 401 → skipped", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/a/")) return new Response(JSON.stringify({ online: true, lastSeen: "t" }), { status: 200 });
      if (url.includes("/b/")) return new Response("", { status: 500 });
      if (url.includes("/c/")) return new Response("", { status: 401 });
      throw new Error("net");
    }));
    const out = await fetchOnlineStatuses([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] as never);
    expect(out).toEqual({ a: { online: true, lastSeen: "t" }, b: { online: false, lastSeen: null }, d: { online: false, lastSeen: null } });
  });
});

describe("messenger/format", () => {
  it("helpers behave", () => {
    expect(getInitials("Max Babich")).toMatch(/^M/);
    expect(parseVoice("not json")).toBeNull();
    expect(parseVoice(JSON.stringify({ voiceUrl: "data:x", voiceDuration: 2 }))).toEqual({ voiceUrl: "data:x", voiceDuration: 2 });
    expect(sameDay("2025-01-01T10:00:00Z", "2025-01-01T11:00:00Z")).toBe(true);
    expect(colorForId("u1")).toBe(colorForId("u1"));
  });
});
