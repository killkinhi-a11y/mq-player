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
 *   from a user-visible state change; audio path is untouched.
 * - No auto-reload (#47): reload happens ONLY from the «Обновить» click
 *   inside UpdateManager.applyUpdate().
 * - Mobile (#35): top placement + safe-area; never covers player/nav/seek.
 * - a11y (#42): role="status" + aria-live=polite; unambiguous button labels;
 *   keyboard focusable; 44px touch targets.
 * - Motion (#36): opacity + translateY only, 220ms, disabled under
 *   prefers-reduced-motion.
 */

import { memo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { RefreshCw, X } from "lucide-react";
import { useUpdateManager } from "@/hooks/useUpdateManager";

function UpdateBannerBase() {
  const { state, info, error, applyUpdate, dismiss } = useUpdateManager();
  const prefersReducedMotion = useReducedMotion();

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
            rounded-xl p-4
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
                    className="mt-1 text-[13px] leading-relaxed"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    Улучшения плеера уже онлайн. Обновитесь, когда удобно —
                    очередь и позиция трека сохранятся.
                  </p>
                </div>
                {info && (
                  <span
                    className="mq-t-num flex-shrink-0 rounded-md px-2 py-1 text-[11px] whitespace-nowrap"
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
                  className="mq-update-apply h-11 min-w-[128px] rounded-lg px-4 text-[14px] font-semibold
                             transition-transform duration-100 active:scale-[0.98]"
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
                  className="h-11 rounded-lg px-4 text-[14px] font-medium transition-colors duration-150"
                  style={{
                    color: "var(--mq-text-muted)",
                    border: "1px solid var(--mq-border-subtle, rgba(255,255,255,0.08))",
                  }}
                  aria-label="Отложить обновление и продолжить прослушивание"
                >
                  Позже
                </button>
              </div>
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
                  className="text-[14px] font-semibold"
                  style={{ color: "var(--mq-text)" }}
                >
                  Обновление…
                </p>
                <p
                  className="text-[12px]"
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
                  className="text-[15px] font-semibold"
                  style={{ color: "var(--mq-text)" }}
                >
                  Не удалось обновить
                </h2>
                <p
                  className="mq-body mt-1 text-[13px]"
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
                  className="h-11 rounded-lg px-4 text-[14px] font-medium transition-colors duration-150"
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
                <p className="text-[14px] font-semibold" style={{ color: "var(--mq-text)" }}>
                  Обновлено
                </p>
                <p className="mq-t-num text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                  {info ? `v${info.version} · ${info.buildId?.replace("mq-build-", "")}` : "MQ обновлён"}
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
