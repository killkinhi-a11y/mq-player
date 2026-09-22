"use client";

/**
 * UpdateBanner — Phase M #19–#36: «Новая версия MQ доступна».
 *
 * Visual language (Phase 4B/M): flat raised surface, hairline border, serif
 * display title, mono version metadata, ONE accent action. No glow, no
 * gradient, no blur, no infinite animation.
 *
 * UX guarantees:
 * - Detection NEVER interrupts playback (#24) — this banner appears only
 * from a user-visible state change; audio path is untouched.
 * - No auto-reload (#47): reload happens ONLY from the «Обновить» click
 * inside UpdateManager.applyUpdate().
 * - Mobile (#35): top placement + safe-area; never covers player/nav/seek.
 * - a11y (#42): role="status" + aria-live=polite; unambiguous button labels;
 * keyboard focusable; 44px touch targets.
 * - Motion (#36): opacity + translateY only, 220ms, disabled under
 * prefers-reduced-motion.
 */

import { memo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RefreshCw, X, ChevronDown, Sparkles } from "lucide-react";
import { useUpdateManager } from "@/hooks/useUpdateManager";
import { WEB_RELEASE_NOTES, WEB_RELEASE_NOTES_DETAIL } from "@/lib/releaseNotes";

function UpdateBannerBase() {
  const { state, info, error, applyUpdate, dismiss } = useUpdateManager();
  const prefersReducedMotion = useReducedMotion();
  // v72 (task §20): human-language «Что нового» panel — no commit jargon.
  const [notesOpen, setNotesOpen] = useState(false);

  const visible = state === "available" || state === "updating" || state === "failed" || state === "updated";

  return (
    <AnimatePresence>
      {visible && (
        <motion.section
          role="status"
          aria-live="polite"
          data-update-banner
          data-update-state={state}
          initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="
            fixed z-[110] w-[calc(100vw-2rem)] max-w-[380px]
            sm:w-[380px] sm:right-4 sm:top-[64px] sm:left-auto
            left-4 top-[calc(env(safe-area-inset-top)+8px)]
            rounded-[var(--mq-r-card-lg)] p-4
          "
          style={{
            backgroundColor: "var(--mq-surface-3, #242424)",
            border: "1px solid var(--mq-border-medium, rgba(255,255,255,0.1))",
            boxShadow: "var(--mq-elevation-3, 0 8px 24px rgba(0,0,0,0.5))",
          }}
        >
          {/* ── Content: state-dependent ── */}
          {state === "available" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    className="mq-t-display text-[17px] leading-snug font-semibold"
                    style={{ color: "var(--mq-text)" }}
                  >
                    Новая версия MQ доступна
                  </h2>
                  <p
                    className="mt-1 mq-t-body leading-relaxed"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    Улучшения плеера уже онлайн. Обновитесь, когда удобно —
                    очередь и позиция трека сохранятся.
                  </p>
                </div>
                {info && (
                  <span
                    className="mq-t-num flex-shrink-0 rounded-md px-2 py-1 mq-t-meta-2 whitespace-nowrap"
                    style={{
                      color: "var(--mq-text-muted)",
                      backgroundColor: "var(--mq-surface-1, #0e0e0e)",
                      border: "1px solid var(--mq-border-subtle, rgba(255,255,255,0.08))",
                    }}
                    title={info.releasedAt ? `Выпущена: ${new Date(info.releasedAt).toLocaleString("ru-RU")}` : undefined}
                  >
                    v{info.version}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={applyUpdate}
                  className="mq-update-apply h-11 min-w-[128px] rounded-lg px-4 text-sm font-semibold
                             transition-colors duration-150 hover:brightness-110 active:brightness-95"
                  style={{
                    backgroundColor: "var(--mq-accent)",
                    color: "var(--mq-text-on-accent, #fff)",
                  }}
                  aria-label="Обновить приложение до новой версии"
                >
                  Обновить
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="h-11 rounded-lg px-4 text-sm font-medium transition-colors duration-150 hover:bg-[var(--mq-overlay-hover)]"
                  style={{
                    color: "var(--mq-text-muted)",
                    border: "1px solid var(--mq-border-subtle, rgba(255,255,255,0.08))",
                  }}
                  aria-label="Отложить обновление и продолжить прослушивание"
                >
                  Позже
                </button>
                <button
                  type="button"
                  onClick={() => setNotesOpen((v) => !v)}
                  aria-expanded={notesOpen}
                  className="flex h-11 items-center gap-1 rounded-lg px-3 text-sm font-medium transition-colors duration-150 hover:bg-[var(--mq-overlay-hover)]"
                  style={{ color: "var(--mq-text-muted)" }}
                  aria-label="Что нового в этой версии"
                >
                  Что нового
                  <ChevronDown
                    className="w-4 h-4 transition-transform duration-200"
                    style={{ transform: notesOpen ? "rotate(180deg)" : "none" }}
                    aria-hidden
                  />
                </button>
              </div>

              {/* «Что нового» — human bullets (task §20: no "v2.3.4 — 17 commits
                  for users"). Technical details stay behind «Подробнее». */}
              <AnimatePresence initial={false}>
                {notesOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div
                      className="rounded-lg p-3"
                      style={{
                        backgroundColor: "var(--mq-surface-1, #0e0e0e)",
                        border: "1px solid var(--mq-border-subtle, rgba(255,255,255,0.08))",
                      }}
                    >
                      <p
                        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: "var(--mq-text)" }}
                      >
                        <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} aria-hidden />
                        Что нового в MQ Player
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {WEB_RELEASE_NOTES.map((n) => (
                          <li
                            key={n.text}
                            className="flex items-start gap-2 text-[13px] leading-snug"
                            style={{ color: "var(--mq-text-muted)" }}
                          >
                            <span
                              className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                              style={{
                                backgroundColor: "color-mix(in srgb, var(--mq-accent) 16%, transparent)",
                                color: "var(--mq-accent)",
                              }}
                              aria-hidden
                            >
                              ✓
                            </span>
                            {n.text}
                          </li>
                        ))}
                      </ul>
                      <details className="mt-2">
                        <summary
                          className="cursor-pointer text-xs font-medium select-none"
                          style={{ color: "var(--mq-text-muted)" }}
                        >
                          Подробнее
                        </summary>
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {WEB_RELEASE_NOTES_DETAIL.map((d) => (
                            <li key={d} className="text-[12px] leading-snug" style={{ color: "var(--mq-text-muted)" }}>
                              · {d}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {state === "updating" && (
            <div className="flex items-center gap-3">
              <RefreshCw
                className="w-4 h-4 animate-spin"
                style={{ color: "var(--mq-accent)" }}
                aria-hidden
              />
              <div className="min-w-0">
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--mq-text)" }}
                >
                  Обновление…
                </p>
                <p
                  className="mq-t-meta"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  Загружаем новую версию и восстанавливаем плеер.
                </p>
              </div>
            </div>
          )}

          {state === "failed" && (
            <div className="flex flex-col gap-3">
              <div className="min-w-0">
                <h2
                  className="mq-t-section font-semibold"
                  style={{ color: "var(--mq-text)" }}
                >
                  Не удалось обновить
                </h2>
                <p
                  className="mq-body mt-1 mq-t-body"
                  style={{ color: "var(--mq-text-muted)" }}
                >
                  {error || "Проверьте соединение и попробуйте снова."}
                  Приложение продолжает работать в текущей версии.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={applyUpdate}
                  className="h-11 rounded-lg px-4 text-sm font-medium transition-colors duration-150"
                  style={{
                    color: "var(--mq-text-on-accent, #fff)",
                    backgroundColor: "var(--mq-accent)",
                  }}
                >
                  Попробовать снова
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors duration-150"
                  style={{
                    color: "var(--mq-text-muted)",
                    border: "1px solid var(--mq-border-subtle, rgba(255,255,255,0.08))",
                  }}
                  aria-label="Закрыть уведомление об обновлении"
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
            </div>
          )}

          {state === "updated" && (
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}
                aria-hidden
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7.5L5.5 10.5L11.5 4" stroke="var(--mq-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
                  Обновлено
                </p>
                <p className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
                  Вы на самой свежей версии — приятного прослушивания
                </p>
              </div>
            </div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

export const UpdateBanner = memo(UpdateBannerBase);
export default UpdateBanner;
