/**
 * CoverImage — P0 contract tests (black-square fix).
 *
 * The component must:
 *  1. render the remote <img> when the URL is present and healthy;
 *  2. swap to the quiet gradient+initials fallback when the image fails
 *     (CDN 403 / proxy timeout) — never a broken/black tile;
 *  3. retry the NEW url after a track change (a failed src must not poison
 *     the next track's cover);
 *  4. render the fallback for an empty src without an <img> at all;
 *  5. derive the initials from the first letters of the title.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";

// React 19 act() contract for jsdom test env.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from "react-dom/client";
import CoverImage from "@/components/mq/CoverImage";

const BROKEN = "https://cdn.example.com/broken.jpg";
const OK = "https://cdn.example.com/ok.jpg";

function mount(props: React.ComponentProps<typeof CoverImage>): {
  container: HTMLElement;
  rerender: (p: React.ComponentProps<typeof CoverImage>) => void;
  unmount: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<CoverImage {...props} />);
  });
  return {
    container,
    rerender: (p) => {
      act(() => {
        root.render(<CoverImage {...p} />);
      });
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function imgEl(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector("img");
}

/** Fire the native error event — React's onError listens for exactly it. */
function fireError(el: Element) {
  act(() => {
    el.dispatchEvent(new Event("error", { bubbles: false }));
  });
}

describe("CoverImage (P0 — never a black square)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the remote image when src is set", () => {
    const h = mount({ src: OK, title: "Nightcall" });
    const img = imgEl(h.container);
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(OK);
    h.unmount();
  });

  it("swaps to the fallback tile when the image errors", () => {
    const h = mount({ src: BROKEN, title: "Nightcall", variant: "initials" });
    const img = imgEl(h.container);
    expect(img).not.toBeNull();
    fireError(img!);
    // The broken <img> is gone; the initials tile carries the surface.
    expect(imgEl(h.container)).toBeNull();
    expect(h.container.textContent).toContain("N");
    h.unmount();
  });

  it("retries the new url after a track change (no poisoned state)", () => {
    const h = mount({ src: BROKEN, title: "First" });
    fireError(imgEl(h.container)!);
    expect(imgEl(h.container)).toBeNull();

    h.rerender({ src: OK, title: "Second" });
    const img = imgEl(h.container);
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe(OK);
    h.unmount();
  });

  it("renders the fallback for an empty src without an <img>", () => {
    const h = mount({ src: undefined, title: "Whatever" });
    expect(imgEl(h.container)).toBeNull();
    expect(h.container.querySelector("span")).toBeTruthy();
    h.unmount();
  });

  it("initials derive from the first letters of the title", () => {
    const h = mount({ src: BROKEN, title: "Solar Sailor", variant: "initials" });
    fireError(imgEl(h.container)!);
    expect(h.container.textContent).toContain("SS");
    h.unmount();
  });
});
