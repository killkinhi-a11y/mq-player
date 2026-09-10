"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, type LucideIcon } from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════
   MQ unified menu engine (v68).

   ONE menu for the whole app — Full Player, rows, cards, artist chips,
   player bar, playlist headers. Contract:

   • Opens on LMB (trigger side stops propagation, nothing else)
   • Portal to <body> — never trapped under cards / overlays / transforms
   • Escape closes · click-outside closes · scroll closes (desktop)
   • Keyboard: ArrowUp/Down roving focus, Home/End, type-ahead, Tab closes
   • Focus returns to the trigger when closed
   • ARIA: role=menu on surface, role=menuitem on items
   • Position: anchored → measured → auto-flip (below↔above) → clamp
   • Mobile (<768px): premium bottom sheet with grabber + dim backdrop
   • Hover = CSS-only (80ms bg) — one owner, zero delay, no scale

   §HOVER one-property-one-owner: this component sets NO transform/opacity
   transitions on items. Mount animation is a one-shot Framer tween on the
   surface (transform+opacity), items never animate.
   ══════════════════════════════════════════════════════════════════════════ */

export type MenuItemSpec = {
  type: "item";
  id: string;
  icon?: LucideIcon;
  label: string;
  /** Right-side value: count, state ("ВКЛ"), shortcut. */
  hint?: string;
  /** Show a check mark instead of hint (toggle state). */
  checked?: boolean;
  /** Accent color (active state like "Убрать лайк"). */
  active?: boolean;
  /** Red — visually separated destructive action. */
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  /** Keep menu open after select (feedback actions). */
  keepOpen?: boolean;
};

export type MenuSepSpec = { type: "separator" };
export type MenuLabelSpec = { type: "label"; text: string };

export type MenuElement = MenuItemSpec | MenuSepSpec | MenuLabelSpec;

export interface MenuCoreProps {
  /** Anchor point in client coordinates (viewport space). */
  anchor: { x: number; y: number };
  onClose: () => void;
  elements: MenuElement[];
  /** Optional header node (track art + title block). */
  header?: React.ReactNode;
  /** aria-label for the menu surface. */
  ariaLabel?: string;
  /** Preferred side; auto-flips when there is no room. Default "below". */
  side?: "below" | "above";
  /** Horizontal alignment relative to anchor. Default left edge at x. */
  align?: "start" | "end";
  /** Fixed surface width (px) — defaults to content width, 232..300px. */
  width?: number;
  /** Extra padding-bottom allowance (player bar etc.) when clamping. */
  bottomInset?: number;
}

const ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

export function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

export default function MenuCore({
  anchor,
  onClose,
  elements,
  header,
  ariaLabel,
  side = "below",
  align = "start",
  width,
  bottomInset = 0,
}: MenuCoreProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [isSheet, setIsSheet] = useState(false);
  const typeAheadRef = useRef({ buffer: "", lastAt: 0 });

  // Remember the trigger — focus returns to it on close (a11y contract).
  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    setIsSheet(isMobileViewport());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Positioning: measure → flip → clamp. Runs after mount and on resize.
  useLayoutEffect(() => {
    if (!surfaceRef.current) return;
    const el = surfaceRef.current;

    const place = () => {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw < 768) return; // sheet mode — CSS pins to bottom, nothing to do

      const margin = 8;
      let left = align === "end" ? anchor.x - rect.width : anchor.x;
      let top = anchor.y;

      // Vertical flip: preferred side first, flip if it would overflow.
      const spaceBelow = vh - bottomInset - margin - anchor.y;
      const spaceAbove = anchor.y - margin;
      const need = rect.height + 8;
      let effectiveSide = side;
      if (side === "below" && need > spaceBelow && need <= spaceAbove + 4) {
        effectiveSide = "above";
      } else if (side === "above" && need > spaceAbove && need <= spaceBelow + 4) {
        effectiveSide = "below";
      }
      if (effectiveSide === "above") {
        top = anchor.y - rect.height - 8;
      } else {
        top = anchor.y + 8;
      }
      // Last-resort vertical clamp (both sides tight — e.g. tiny window).
      top = Math.min(Math.max(top, margin), Math.max(margin, vh - bottomInset - margin - rect.height));

      // Horizontal clamp.
      left = Math.min(Math.max(left, margin), Math.max(margin, vw - margin - rect.width));

      setPos({ left, top });
    };

    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchor.x, anchor.y, side, align, bottomInset, elements, header]);

  const close = useCallback(() => onClose(), [onClose]);

  // ── Keyboard: Escape/Tab close, arrows rove, Home/End, type-ahead.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        close();
        return;
      }
      const surface = surfaceRef.current;
      if (!surface) return;
      const items = Array.from(surface.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
      const activeIdx = items.indexOf(document.activeElement as HTMLElement);
      const focusAt = (i: number) => {
        const item = items[i];
        if (item) {
          item.focus();
          item.scrollIntoView({ block: "nearest" });
        }
      };

      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusAt(activeIdx < 0 ? 0 : (activeIdx + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        focusAt(activeIdx < 0 ? items.length - 1 : (activeIdx - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        focusAt(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        focusAt(items.length - 1);
        return;
      }
      // Type-ahead: single letters jump to matching item.
      if (/^[a-zA-Zа-яА-Я0-9]$/.test(e.key)) {
        const now = Date.now();
        const ta = typeAheadRef.current;
        ta.buffer = now - ta.lastAt < 500 ? ta.buffer + e.key.toLowerCase() : e.key.toLowerCase();
        ta.lastAt = now;
        const from = activeIdx >= 0 ? activeIdx + 1 : 0;
        const ordered = [...items.slice(from), ...items.slice(0, from)];
        const match = ordered.find((it) =>
          (it.textContent || "").toLowerCase().trim().startsWith(ta.buffer)
        );
        if (match) {
          e.preventDefault();
          match.focus();
        }
      }
    },
    [close]
  );

  // Close-on-scroll contract:
  //  • USER scrolls (wheel / touch-drag) → close immediately. A fixed-viewport
  //    menu detaches from its trigger as soon as the page moves.
  //  • PROGRAMMATIC scrolls (scrollIntoView with global `scroll-behavior:
  //    smooth`, focus jumps, list virtualization) fire trailing scroll events
  //    for ~500ms that must NOT insta-close a freshly opened menu → 600ms
  //    grace on raw scroll events. Scrollbar drags past the grace still close.
  //  • Mobile sheet mode never closes on scroll (sheet is bottom-anchored).
  const openedAtRef = useRef(Date.now());
  const userScrolledRef = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    const markUserScroll = () => {
      userScrolledRef.current = true;
    };
    const onScroll = () => {
      if (isMobileViewport()) return; // sheet: bottom-anchored, scroll-safe
      if (userScrolledRef.current) {
        close();
        return;
      }
      if (Date.now() - openedAtRef.current > 600) close();
    };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", markUserScroll, { passive: true });
    window.addEventListener("touchmove", markUserScroll, { passive: true, capture: true });
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", markUserScroll);
      window.removeEventListener("touchmove", markUserScroll, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [close]);

  // Restore focus to trigger on unmount.
  useEffect(() => {
    return () => {
      const prev = prevFocusRef.current;
      if (prev && document.contains(prev)) prev.focus?.();
    };
  }, []);

  // Focus surface on open so arrows work immediately.
  useEffect(() => {
    const t = setTimeout(() => {
      if (isMobileViewport()) return; // mobile: don't steal focus (keyboard would pop)
      const first = surfaceRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR);
      (first ?? surfaceRef.current)?.focus();
    }, 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = useCallback(
    (item: MenuItemSpec) => {
      if (item.disabled) return;
      item.onSelect();
      if (!item.keepOpen) close();
    },
    [close]
  );

  const renderElement = useCallback(
    (el: MenuElement, i: number) => {
      if (el.type === "separator") return <div key={`sep-${i}`} className="mq-menu-sep" role="separator" />;
      if (el.type === "label") return <div key={`lbl-${i}`} className="mq-menu-label" role="presentation">{el.text}</div>;
      const Icon = el.icon;
      return (
        <button
          key={el.id}
          role="menuitem"
          disabled={el.disabled}
          data-destructive={el.destructive || undefined}
          data-accent={el.active || undefined}
          aria-checked={el.checked}
          onClick={(e) => {
            e.stopPropagation();
            handleSelect(el);
          }}
          className="mq-menu-item"
        >
          <span className="mq-menu-icon" aria-hidden>
            {Icon ? <Icon className="w-[18px] h-[18px]" /> : null}
          </span>
          <span className="mq-t-menu flex-1 min-w-0 truncate">{el.label}</span>
          {el.checked ? (
            <span className="mq-menu-hint" aria-hidden>
              <Check className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            </span>
          ) : el.hint ? (
            <span className="mq-menu-hint mq-t-num truncate max-w-[96px]">{el.hint}</span>
          ) : null}
        </button>
      );
    },
    [handleSelect]
  );

  const content = (
    <div
      ref={surfaceRef}
      role="menu"
      aria-label={ariaLabel}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={`mq-menu-surface${isSheet ? " mq-menu-sheet" : ""}`}
      style={{
        ...(width ? { width } : {}),
        ...(pos && !isSheet ? { left: pos.left, top: pos.top } : {}),
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isSheet && <div className="mq-menu-grabber" aria-hidden />}
      {header}
      {elements.map(renderElement)}
    </div>
  );

  const surfaceAnim = isSheet
    ? { initial: { y: 64, opacity: 0.5 }, animate: { y: 0, opacity: 1 }, exit: { y: 64, opacity: 0 } }
    : { initial: { opacity: 0, scale: 0.97, y: side === "above" ? 4 : -4 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.97 } };

  return createPortal(
    <>
      <div
        className="mq-menu-backdrop"
        data-sheet={isSheet || undefined}
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          close();
        }}
      />
      <motion.div
        initial={surfaceAnim.initial}
        animate={surfaceAnim.animate}
        exit={surfaceAnim.exit}
        transition={{ duration: 0.14, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ display: "contents" }}
      >
        {content}
      </motion.div>
    </>,
    document.body
  );
}

/* ── Submenu page helper ──────────────────────────────────────────────────
   Menus with a "picker" sub-page (Add to playlist) re-render `elements`
   with a Back row. Helper keeps it consistent. */

export function backLabelSpec(text: string, onBack: () => void): MenuItemSpec {
  return {
    type: "item",
    id: "back",
    icon: ChevronLeft,
    label: text,
    onSelect: onBack,
    keepOpen: true,
  };
}

/** Standard menu header: 44px artwork + title/artist lines. */
export function MenuHeader({
  cover,
  title,
  subtitle,
  fallbackIcon,
}: {
  cover?: string;
  title: string;
  subtitle?: string;
  fallbackIcon: LucideIcon;
}) {
  const Icon = fallbackIcon;
  return (
    <div className="mq-menu-header">
      <div
        className="w-11 h-11 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0"
        style={{ backgroundColor: "var(--mq-surface-2)", boxShadow: "var(--mq-art-edge)" }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="mq-t-track-sm truncate" style={{ color: "var(--mq-text)" }} title={title}>
          {title}
        </p>
        {subtitle ? (
          <p className="mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }} title={subtitle}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Open-state helper: one open menu per surface id. */
export function useMenuState() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const open = useCallback((id: string, x: number, y: number) => {
    setAnchor({ x, y });
    setOpenId(id);
  }, []);
  const close = useCallback(() => setOpenId(null), []);
  const toggle = useCallback(
    (id: string, el: HTMLElement) => {
      // Re-open at the element's current position (element may have moved).
      const rect = el.getBoundingClientRect();
      setAnchor({ x: rect.left, y: rect.bottom + 4 });
      setOpenId((prev) => (prev === id ? null : id));
    },
    []
  );
  return { openId, anchor, open, close, toggle };
}
