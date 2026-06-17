"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";

/**
 * Keyboard shortcuts help modal (M4.2).
 *
 * Opens when the user presses `?` (handled in useKeyboardShortcuts.ts) or
 * clicks the keyboard icon in Settings. Closes on Escape, click outside,
 * or the X button.
 *
 * Lists every shortcut defined in useKeyboardShortcuts.ts. If you add a
 * shortcut there, add a row here too.
 */

interface ShortcutRow {
  keys: string[];
  action: string;
  category: "playback" | "navigation" | "library";
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: ["Space"], action: "Играть / пауза", category: "playback" },
  { keys: ["→"], action: "Перемотать вперёд на 10 сек", category: "playback" },
  { keys: ["←"], action: "Перемотать назад на 10 сек", category: "playback" },
  { keys: ["↑"], action: "Громче на 5", category: "playback" },
  { keys: ["↓"], action: "Тише на 5", category: "playback" },
  { keys: ["M"], action: "Без звука / вернуть звук", category: "playback" },
  { keys: ["N"], action: "Следующий трек", category: "playback" },
  { keys: ["P"], action: "Предыдущий трек", category: "playback" },
  { keys: ["B"], action: "A-B повтор (отметить A, затем B, затем сбросить)", category: "playback" },
  { keys: ["L"], action: "Лайк текущего трека", category: "library" },
  { keys: ["F"], action: "Полноэкранный вид трека", category: "navigation" },
  { keys: ["Esc"], action: "Закрыть полноэкранный вид", category: "navigation" },
  { keys: ["?"], action: "Показать эту справку", category: "navigation" },
];

const CATEGORY_LABELS: Record<ShortcutRow["category"], string> = {
  playback: "Воспроизведение",
  navigation: "Навигация",
  library: "Библиотека",
};

const CATEGORY_ORDER: ShortcutRow["category"][] = ["playback", "navigation", "library"];

export function KeyboardShortcutsHelp() {
  const isOpen = useAppStore((s) => s.shortcutsHelpOpen);
  const setOpen = useAppStore((s) => s.setShortcutsHelpOpen);

  // Close on Escape — also handled in useKeyboardShortcuts but with
  // lower priority (only closes FullTrackView there). Repeat here for
  // clarity when the modal is open.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler, true); // capture phase
    return () => window.removeEventListener("keydown", handler, true);
  }, [isOpen, setOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-help-title"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-full max-w-lg rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--mq-card, #1a1a1a)",
              border: "1px solid var(--mq-border, #2a2a2a)",
              boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--mq-border, #2a2a2a)" }}
            >
              <div className="flex items-center gap-2.5">
                <Keyboard className="w-5 h-5" style={{ color: "var(--mq-accent, #e03131)" }} />
                <h2
                  id="shortcuts-help-title"
                  className="text-base font-bold"
                  style={{ color: "var(--mq-text, #fff)" }}
                >
                  Горячие клавиши
                </h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg cursor-pointer transition-opacity hover:opacity-70"
                style={{ color: "var(--mq-text-muted, #888)" }}
                aria-label="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="overflow-y-auto px-5 py-4 flex-1">
              {CATEGORY_ORDER.map((cat) => {
                const rows = SHORTCUTS.filter((s) => s.category === cat);
                if (rows.length === 0) return null;
                return (
                  <div key={cat} className="mb-5 last:mb-0">
                    <h3
                      className="text-[11px] font-semibold uppercase tracking-wider mb-2.5"
                      style={{ color: "var(--mq-text-muted, #888)" }}
                    >
                      {CATEGORY_LABELS[cat]}
                    </h3>
                    <div className="flex flex-col gap-1">
                      {rows.map((row, idx) => (
                        <div
                          key={`${cat}-${idx}`}
                          className="flex items-center justify-between py-1.5 px-2 rounded-lg"
                          style={{ backgroundColor: "transparent" }}
                        >
                          <span
                            className="text-sm"
                            style={{ color: "var(--mq-text, #fff)" }}
                          >
                            {row.action}
                          </span>
                          <div className="flex items-center gap-1">
                            {row.keys.map((k, ki) => (
                              <kbd
                                key={ki}
                                className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold min-w-[24px] text-center"
                                style={{
                                  backgroundColor: "rgba(255,255,255,0.06)",
                                  border: "1px solid var(--mq-border, #2a2a2a)",
                                  color: "var(--mq-text, #fff)",
                                  boxShadow: "0 1px 0 rgba(0,0,0,0.3)",
                                }}
                              >
                                {k}
                              </kbd>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p
                className="text-[11px] mt-4 pt-3"
                style={{
                  color: "var(--mq-text-muted, #888)",
                  borderTop: "1px solid var(--mq-border, #2a2a2a)",
                }}
              >
                Горячие клавиши не срабатывают, когда фокус в поле ввода
                (поиск, чат, редактирование плейлиста).
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
