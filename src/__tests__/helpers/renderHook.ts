// Minimal renderHook (react-dom/client + act) — no @testing-library/react dependency.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export function renderHook<R>(hook: () => R) {
  const result = { current: undefined as unknown as R };
  const Probe = () => { result.current = hook(); return null; };
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return { result, unmount: () => act(() => root.unmount()) };
}

export async function flush(ms = 0) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}
