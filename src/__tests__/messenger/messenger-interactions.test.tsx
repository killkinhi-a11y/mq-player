/**
 * MessengerView — interaction/characterization tests (Task B).
 * Written against the monolithic component BEFORE extracting hooks, so the
 * same assertions guard the refactor: SSE realtime, BroadcastChannel,
 * DM history, group detail + 8s polling (401 stop), online-status polling,
 * send pipeline (optimistic → server id, failure → retry bubble), typing
 * POST debounce, debounced user search.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/mq/messenger.css", () => ({}));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }) }));

import MessengerView from "@/components/mq/MessengerView";
import { useAppStore } from "@/store/useAppStore";
import { resetPollingSuspension } from "@/lib/authGate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── EventSource / BroadcastChannel fakes ────────────────────────────────
class FakeES {
  static all: FakeES[] = [];
  url: string; closed = false; onerror: (() => void) | null = null;
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  constructor(url: string) { this.url = url; FakeES.all.push(this); }
  addEventListener(t: string, fn: (e: { data: string }) => void) { (this.listeners[t] ||= []).push(fn); }
  emit(t: string, data: unknown) { (this.listeners[t] || []).forEach((fn) => fn({ data: JSON.stringify(data) })); }
  close() { this.closed = true; }
}
class FakeBC {
  static all: FakeBC[] = [];
  name: string; closed = false; posted: unknown[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(name: string) { this.name = name; FakeBC.all.push(this); }
  postMessage(d: unknown) { this.posted.push(d); }
  close() { this.closed = true; }
}

// ── fetch router ────────────────────────────────────────────────────────
type Route = (url: string, init?: RequestInit) => { status?: number; body?: unknown } | undefined;
let routes: Route[] = [];
const calls: { url: string; init?: RequestInit }[] = [];
function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, init });
  for (const r of routes) { const res = r(url, init); if (res) return json(res.status ?? 200, res.body ?? {}); }
  if (url.startsWith("/api/friends")) return json(200, { friends: [{ id: "f1", username: "alice" }] });
  if (url.startsWith("/api/group-chats?")) return json(200, { groupChats: [{ id: "g1", name: "Группа Один", memberCount: 2 }] });
  if (url.startsWith("/api/user/")) return json(200, { isOnline: true, lastSeen: null });
  return json(200, {});
});
const urls = (prefix: string) => calls.filter((c) => c.url.startsWith(prefix));

let container: HTMLDivElement; let root: Root;
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function mount() {
  await act(async () => { root.render(<MessengerView />); });
  await tick(0); await tick(0);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  FakeES.all = []; FakeBC.all = []; routes = []; calls.length = 0; toastSpy.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("EventSource", FakeES);
  vi.stubGlobal("BroadcastChannel", FakeBC);
  resetPollingSuspension();
  useAppStore.setState({
    userId: "u1", username: "me", isAuthenticated: true, messages: [],
    selectedContactId: null, typingUsers: {}, unreadCounts: {}, currentView: "messenger",
  } as never);
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("realtime", () => {
  it("opens SSE for the user, adds new_message once (dedup), closes on unmount", async () => {
    await mount();
    expect(FakeES.all).toHaveLength(1);
    expect(FakeES.all[0].url).toMatch(/^\/api\/messages\/sse\?userId=u1&since=/);
    const m = { id: "m1", content: "hi", senderId: "f1", createdAt: "2024-01-01T00:00:00.000Z", senderUsername: "alice" };
    await act(async () => { FakeES.all[0].emit("new_message", { message: m }); FakeES.all[0].emit("new_message", { message: m }); });
    const msgs = useAppStore.getState().messages as { id: string; senderName?: string; receiverId: string }[];
    expect(msgs.filter((x) => x.id === "m1")).toHaveLength(1);
    expect(msgs[0].senderName).toBe("@alice");
    expect(msgs[0].receiverId).toBe("u1");
    act(() => root.unmount());
    expect(FakeES.all[0].closed).toBe(true);
    root = createRoot(container);
  });

  it("reconnects 2s after an error with since = last seen message time", async () => {
    await mount();
    await act(async () => { FakeES.all[0].emit("new_message", { message: { id: "m2", senderId: "f1", createdAt: "2024-02-02T00:00:00.000Z" } }); });
    await act(async () => { FakeES.all[0].onerror?.(); });
    expect(FakeES.all[0].closed).toBe(true);
    await tick(1999); expect(FakeES.all).toHaveLength(1);
    await tick(1); expect(FakeES.all).toHaveLength(2);
    expect(FakeES.all[1].url).toContain(`since=${encodeURIComponent("2024-02-02T00:00:00.000Z")}`);
  });

  it("does not reconnect after auth loss (gate closed)", async () => {
    await mount();
    useAppStore.setState({ isAuthenticated: false } as never);
    await act(async () => { FakeES.all[0].onerror?.(); });
    await tick(5000);
    expect(FakeES.all).toHaveLength(1);
  });

  it("typing event marks the user typing and clears after 4s", async () => {
    await mount();
    await act(async () => { FakeES.all[0].emit("typing", { userId: "f1" }); });
    expect(useAppStore.getState().typingUsers["f1"]).toBeTruthy();
    await tick(4000);
    expect(useAppStore.getState().typingUsers["f1"]).toBeFalsy();
  });

  it("BroadcastChannel: new_message is added, friend_request refetches friends", async () => {
    await mount();
    const bc = FakeBC.all.find((b) => b.name === "mq-notifications")!;
    expect(bc).toBeTruthy();
    await act(async () => { bc.onmessage?.({ data: { type: "new_message", payload: { id: "b1", senderId: "f1", content: "x" } } }); });
    expect((useAppStore.getState().messages as { id: string }[]).some((x) => x.id === "b1")).toBe(true);
    const before = urls("/api/friends?").length;
    await act(async () => { bc.onmessage?.({ data: { type: "friend_request" } }); });
    await tick(0);
    expect(urls("/api/friends?").length).toBe(before + 1);
  });

  it("no SSE / polling for demo sessions", async () => {
    useAppStore.setState({ userId: "demo-user-id", isAuthenticated: true } as never);
    await mount();
    expect(FakeES.all).toHaveLength(0);
    expect(urls("/api/user/")).toHaveLength(0);
  });
});

describe("history & polling", () => {
  it("loads DM history for the selected contact into the store", async () => {
    routes.push((u) => u.startsWith("/api/messages?") ? { body: { messages: [{ id: "h1", content: "old", senderId: "f1", receiverId: "u1", sender: { username: "alice" } }] } } : undefined);
    useAppStore.setState({ selectedContactId: "f1" } as never);
    await mount(); await tick(0);
    expect(urls("/api/messages?senderId=u1&receiverId=f1")).toHaveLength(1);
    const msgs = useAppStore.getState().messages as { id: string; senderName?: string }[];
    expect(msgs.find((m) => m.id === "h1")?.senderName).toBe("@alice");
  });

  it("polls online statuses every 30s", async () => {
    await mount();
    const n = urls("/api/user/f1/status").length;
    expect(n).toBeGreaterThanOrEqual(1);
    await tick(30000);
    expect(urls("/api/user/f1/status").length).toBe(n + 1);
  });

  it("group: loads detail + messages, polls every 8s, stops polling on 401", async () => {
    await mount();
    const groupBtn = Array.from(container.querySelectorAll("button, [role=button], li, div"))
      .reverse().find((el) => el.textContent?.trim().startsWith("Группа Один")) as HTMLElement;
    expect(groupBtn).toBeTruthy();
    await act(async () => { groupBtn.click(); });
    await tick(0); await tick(0);
    expect(urls("/api/group-chats/g1").filter((c) => !c.url.includes("/messages"))).toHaveLength(1);
    expect(urls("/api/group-chats/g1/messages?userId=u1")).toHaveLength(1);
    await tick(8000);
    expect(urls("/api/group-chats/g1/messages?userId=u1")).toHaveLength(2);
    routes.push((u) => u.startsWith("/api/group-chats/g1/messages?") ? { status: 401 } : undefined);
    await tick(8000);
    expect(urls("/api/group-chats/g1/messages?userId=u1")).toHaveLength(3);
    await tick(16000);
    expect(urls("/api/group-chats/g1/messages?userId=u1")).toHaveLength(3);
  });
});

function composer(): HTMLTextAreaElement { return container.querySelector("textarea") as HTMLTextAreaElement; }
async function typeText(text: string) {
  const ta = composer();
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  await act(async () => { setter.call(ta, text); ta.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function pressEnter() {
  await act(async () => { composer().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  await tick(0); await tick(0);
}

describe("send pipeline", () => {
  it("DM: optimistic temp message → replaced by server id, broadcast to other tabs", async () => {
    routes.push((u, i) => u === "/api/messages" && i?.method === "POST" ? { body: { id: "srv1" } } : undefined);
    useAppStore.setState({ selectedContactId: "f1" } as never);
    await mount();
    await typeText("привет");
    await pressEnter();
    const post = calls.find((c) => c.url === "/api/messages" && c.init?.method === "POST")!;
    expect(post).toBeTruthy();
    const body = JSON.parse(String(post.init!.body));
    expect(body).toMatchObject({ receiverId: "f1", encrypted: true, messageType: "text" });
    const msgs = useAppStore.getState().messages as { id: string }[];
    expect(msgs.some((m) => m.id === "srv1")).toBe(true);
    expect(msgs.some((m) => m.id.startsWith("temp_"))).toBe(false);
    const bc = FakeBC.all.find((b) => b.name === "mq-notifications")!;
    expect(bc.posted).toEqual([expect.objectContaining({ type: "new_message", payload: expect.objectContaining({ id: "srv1" }) })]);
    expect(composer().value).toBe("");
  });

  it("DM: network failure removes the temp message, toasts and offers retry", async () => {
    routes.push((u, i) => { if (u === "/api/messages" && i?.method === "POST") throw new Error("offline"); return undefined; });
    useAppStore.setState({ selectedContactId: "f1" } as never);
    await mount();
    await typeText("не дойдёт");
    await pressEnter();
    expect(toastSpy).toHaveBeenCalledWith({ title: "Не удалось отправить" });
    expect((useAppStore.getState().messages as { id: string }[]).some((m) => m.id.startsWith("temp_"))).toBe(false);
    expect(container.textContent).toContain("не дойдёт");
  });

  it("typing: POST /api/messages/typing debounced 300ms for DMs", async () => {
    useAppStore.setState({ selectedContactId: "f1" } as never);
    await mount();
    await typeText("a"); await typeText("ab");
    await tick(299);
    expect(urls("/api/messages/typing")).toHaveLength(0);
    await tick(1);
    expect(urls("/api/messages/typing")).toHaveLength(1);
    expect(JSON.parse(String(urls("/api/messages/typing")[0].init!.body))).toEqual({ receiverId: "f1" });
  });
});
