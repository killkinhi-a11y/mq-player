import { describe, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useLoader } from "@/hooks/useLoader";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<P, R>(hook: (p: P) => R, opts?: { initialProps: P }) {
  const result = { current: undefined as unknown as R };
  const Probe = (p: { props: P }) => { result.current = hook(p.props); return null; };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe, { props: opts?.initialProps as P })));
  return { result, rerender: (props: P) => act(() => root.render(createElement(Probe, { props }))) };
}

async function waitFor(fn: () => void, timeout = 1000) {
  const start = Date.now();
  for (;;) {
    try { fn(); return; } catch (e) {
      if (Date.now() - start > timeout) throw e;
      await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    }
  }
}

describe("useLoader", () => {
  it("loads, derives loading, and keeps previous data across key changes", async () => {
    const load = vi.fn(async (_s: AbortSignal) => "v");
    const { result, rerender } = renderHook(({ k }) => useLoader(k, load), { initialProps: { k: "a" } });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe("v");
    rerender({ k: "b" });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe("v");
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reload re-runs the loader and failures keep last data", async () => {
    let n = 0;
    const load = vi.fn(async () => { n += 1; if (n === 2) throw new Error("x"); return n; });
    const { result } = renderHook(() => useLoader("k", load));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe(1);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("drops responses for an outdated key", async () => {
    const resolvers: Array<(v: string) => void> = [];
    const load = vi.fn(() => new Promise<string>((r) => resolvers.push(r)));
    const { result, rerender } = renderHook(({ k }) => useLoader(k, load), { initialProps: { k: "a" } });
    rerender({ k: "b" });
    await act(async () => { resolvers[0]("old"); resolvers[1]("new"); });
    await waitFor(() => expect(result.current.data).toBe("new"));
  });

  it("null key skips loading", () => {
    const load = vi.fn(async () => 1);
    const { result } = renderHook(() => useLoader(null, load));
    expect(result.current.loading).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });
});
