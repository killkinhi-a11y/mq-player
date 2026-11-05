/**
 * AuthView — interaction/characterization tests (Task B).
 * Written against the monolithic component BEFORE extracting flow hooks:
 * email login (+ unconfirmed hint), registration → confirmation, forgot
 * password → login prefill, Telegram bot code → register → link, username
 * check debounce, step-entry resets, demo login.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/components/mq/auth-motion.css", () => ({}));
import AuthView from "@/components/mq/AuthView";
import { useAppStore } from "@/store/useAppStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Reply = { status?: number; body?: unknown };
let replies: Record<string, Reply | ((init?: RequestInit) => Reply)> = {};
const calls: { url: string; body?: Record<string, unknown> }[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  const key = Object.keys(replies).find((k) => url.startsWith(k));
  const r0 = key ? replies[key] : url.startsWith("/api/auth/providers")
    ? { body: { google: true, telegramBot: true, telegramBotName: "Bot", email: true } } : { body: {} };
  const r = typeof r0 === "function" ? r0(init) : r0;
  const status = r.status ?? 200;
  return { ok: status < 300, status, json: async () => r.body ?? {} } as Response;
});
const posted = (url: string) => calls.filter((c) => c.url === url);

let container: HTMLDivElement; let root: Root;
const sleep = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
async function mount(step: string) {
  useAppStore.setState({ authStep: step } as never);
  await act(async () => { root.render(<AuthView />); });
  await sleep(10); await settle();
}
/** The live step (AnimatePresence may keep an exiting step for a moment). */
function stepEl(): HTMLElement {
  const step = useAppStore.getState().authStep;
  return (container.querySelector(`[data-auth-step="${step}"]`) as HTMLElement) || container;
}
function button(text: string): HTMLButtonElement {
  const b = Array.from(stepEl().querySelectorAll("button")).find((x) => x.textContent?.trim() === text);
  if (!b) throw new Error(`button "${text}" not found in step ${useAppStore.getState().authStep}`);
  return b as HTMLButtonElement;
}
function input(placeholder: string): HTMLInputElement {
  const i = stepEl().querySelector(`input[placeholder="${placeholder}"]`);
  if (!i) throw new Error(`input "${placeholder}" not found`);
  return i as HTMLInputElement;
}
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
async function type(el: HTMLInputElement, v: string) {
  await act(async () => { setter.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
/** Wait until the current store step is the one mounted (exit animations finish). */
async function settle() {
  for (let i = 0; i < 100; i++) {
    const step = useAppStore.getState().authStep;
    const live = container.querySelectorAll("[data-auth-step]");
    if (live.length === 1 && live[0].getAttribute("data-auth-step") === step) return;
    await sleep(20);
  }
}
async function click(el: HTMLElement) { await act(async () => { el.click(); }); await sleep(10); await settle(); }
function codeInputs(): HTMLInputElement[] {
  return Array.from(stepEl().querySelectorAll('input[inputmode="numeric"]')) as HTMLInputElement[];
}
async function paste(el: HTMLInputElement, text: string) {
  const ev = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
  ev.clipboardData = { getData: () => text };
  await act(async () => { el.dispatchEvent(ev); });
}
const text = () => stepEl().textContent || "";

beforeEach(() => {
  replies = {}; calls.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  useAppStore.setState({ userId: null, isAuthenticated: false, username: null, queue: [], playlists: [] } as never);
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("email login", () => {
  it("validates, posts credentials and signs in", async () => {
    replies["/api/auth/login"] = { body: { userId: "u1", username: "max", email: "a@b.c", role: "user" } };
    await mount("login");
    await type(input("you@example.com"), "a@b.c");
    await type(input("Введите пароль"), "secret1");
    await click(button("Войти"));
    expect(posted("/api/auth/login")[0].body).toEqual({ email: "a@b.c", password: "secret1" });
    expect(useAppStore.getState().userId).toBe("u1");
    expect(useAppStore.getState().isAuthenticated).toBe(true);
  });

  it("403 unconfirmed → error + «Подтвердить почту» jumps to confirm with the email", async () => {
    replies["/api/auth/login"] = { status: 403, body: { error: "Подтвердите почту" } };
    await mount("login");
    await type(input("you@example.com"), "a@b.c");
    await type(input("Введите пароль"), "secret1");
    await click(button("Войти"));
    expect(text()).toContain("Подтвердите почту");
    await click(button("Подтвердить почту"));
    expect(useAppStore.getState().authStep).toBe("confirm");
    expect(text()).toContain("a@b.c");
  });

  it("entering the login step clears a previous login error", async () => {
    replies["/api/auth/login"] = { status: 401, body: { error: "Неверный пароль" } };
    await mount("login");
    await type(input("you@example.com"), "a@b.c");
    await type(input("Введите пароль"), "x");
    await click(button("Войти"));
    expect(text()).toContain("Неверный пароль");
    await act(async () => { useAppStore.getState().setAuthStep("register"); }); await settle();
    await act(async () => { useAppStore.getState().setAuthStep("login"); }); await settle();
    expect(text()).not.toContain("Неверный пароль");
  });
});

describe("registration → confirmation", () => {
  it("rejects an invalid username without a request", async () => {
    await mount("register");
    await type(input("username"), "a b!");
    await type(input("you@example.com"), "a@b.c");
    await type(input("Минимум 6 символов"), "secret1");
    await click(button("Зарегистрироваться"));
    expect(posted("/api/auth/register")).toHaveLength(0);
    expect(text()).toContain("Имя пользователя: 2-20 символов");
  });

  it("registers, shows the dev code hint, verifies the code and signs in", async () => {
    replies["/api/auth/register"] = { body: { devCode: "123456" } };
    replies["/api/auth/verify-code"] = { body: { userId: "u2", username: "newbie", role: "user" } };
    await mount("register");
    await type(input("username"), "newbie");
    await type(input("you@example.com"), "n@b.c");
    await type(input("Минимум 6 символов"), "secret1");
    await click(button("Зарегистрироваться"));
    expect(posted("/api/auth/register")[0].body).toEqual({ username: "newbie", email: "n@b.c", password: "secret1" });
    expect(useAppStore.getState().authStep).toBe("confirm");
    expect(text()).toContain("123456");
    await paste(codeInputs()[0], "654321"); await sleep(10);
    await click(button("Подтвердить"));
    expect(posted("/api/auth/verify-code")[0].body).toEqual({ email: "n@b.c", code: "654321" });
    expect(useAppStore.getState().userId).toBe("u2");
  });

  it("resend shows the server message", async () => {
    replies["/api/auth/register"] = { body: {} };
    replies["/api/auth/send-code"] = { body: { message: "Код отправлен ещё раз" } };
    await mount("register");
    await type(input("username"), "newbie");
    await type(input("you@example.com"), "n@b.c");
    await type(input("Минимум 6 символов"), "secret1");
    await click(button("Зарегистрироваться"));
    await click(button("Отправить код повторно"));
    expect(posted("/api/auth/send-code")[0].body).toEqual({ email: "n@b.c" });
    expect(text()).toContain("Код отправлен ещё раз");
  });
});

describe("forgot password", () => {
  it("request → reset (dev code prefilled) → back to login with the email and a success banner", async () => {
    replies["/api/auth/send-code"] = { body: { message: "Код отправлен", devCode: "111222" } };
    replies["/api/auth/reset-password"] = { body: { ok: true } };
    await mount("forgot-password");
    await type(input("you@example.com"), "f@b.c");
    await click(button("Отправить код"));
    expect(codeInputs().map((i) => i.value).join("")).toBe("111222");
    await type(input("Минимум 6 символов"), "newpass1");
    await type(input("Ещё раз"), "newpass1");
    const resetBtn = Array.from(stepEl().querySelectorAll("button")).find((b) => /пароль/i.test(b.textContent || "") && !b.getAttribute("aria-label"))!;
    await click(resetBtn);
    expect(posted("/api/auth/reset-password")[0].body).toEqual({ email: "f@b.c", code: "111222", newPassword: "newpass1" });
    expect(useAppStore.getState().authStep).toBe("login");
    expect(text()).toContain("Пароль изменён");
    expect(input("you@example.com").value).toBe("f@b.c");
  });

  it("mismatched passwords never hit the server", async () => {
    replies["/api/auth/send-code"] = { body: { devCode: "111222" } };
    await mount("forgot-password");
    await type(input("you@example.com"), "f@b.c");
    await click(button("Отправить код"));
    await type(input("Минимум 6 символов"), "newpass1");
    await type(input("Ещё раз"), "other123");
    const resetBtn = Array.from(stepEl().querySelectorAll("button")).find((b) => /пароль/i.test(b.textContent || "") && !b.getAttribute("aria-label"))!;
    await click(resetBtn);
    expect(posted("/api/auth/reset-password")).toHaveLength(0);
    expect(text()).toContain("Пароли не совпадают");
  });
});

describe("telegram bot flow", () => {
  it("pasted code auto-verifies → new user → register → needsPassword → link with password", async () => {
    let verifyN = 0;
    replies["/api/auth/telegram-verify"] = () => {
      verifyN++;
      if (verifyN === 1) return { body: { isNewUser: true } };
      if (verifyN === 2) return { body: { needsPassword: true, maskedEmail: "m***@b.c" } };
      return { body: { userId: "u3", username: "tguser", role: "user" } };
    };
    replies["/api/auth/username-check"] = { body: { available: true } };
    await mount("telegram");
    await paste(codeInputs()[0], "999888");
    await sleep(260); await settle();
    expect(posted("/api/auth/telegram-verify")[0].body).toEqual({ code: "999888" });
    expect(useAppStore.getState().authStep).toBe("telegram-register");

    await type(input("username"), "tguser");
    await sleep(350);
    expect(calls.some((c) => c.url === "/api/auth/username-check?username=tguser")).toBe(true);
    await click(button("Создать аккаунт"));
    expect(posted("/api/auth/telegram-verify")[1].body).toEqual({ code: "999888", username: "tguser" });
    expect(useAppStore.getState().authStep).toBe("telegram-link");
    expect(text()).toContain("m***@b.c");

    await type(input("Введите пароль от аккаунта"), "pw123456");
    await click(button("Привязать Telegram"));
    expect(posted("/api/auth/telegram-verify")[2].body).toEqual({ code: "999888", username: "tguser", password: "pw123456" });
    expect(useAppStore.getState().userId).toBe("u3");
  });

  it("wrong code shows the server error and clears the boxes", async () => {
    replies["/api/auth/telegram-verify"] = { status: 400, body: { error: "Код неверный" } };
    await mount("telegram");
    await paste(codeInputs()[0], "000000");
    await sleep(260);
    expect(text()).toContain("Код неверный");
    expect(codeInputs().map((i) => i.value).join("")).toBe("");
  });

  it("invalid username is flagged locally without a server check", async () => {
    await mount("telegram-register");
    await type(input("username"), "a");
    await sleep(350);
    expect(calls.some((c) => c.url.startsWith("/api/auth/username-check"))).toBe(false);
    expect(text()).toContain("От 2 до 20 символов");
  });
});

describe("demo login", () => {
  it("signs in as the demo user, seeds the queue and the demo playlist", async () => {
    await mount("telegram");
    await click(button("Демо-режим"));
    await sleep(400);
    const s = useAppStore.getState();
    expect(s.userId).toBe("demo-user-id");
    expect(s.queue.length).toBeGreaterThan(0);
    expect(s.playlists.some((p) => p.name === "Демо-микс MQ")).toBe(true);
  });
});
