"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOnboardingTour, TOUR_STEPS } from "@/hooks/useOnboardingTour";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findTargetElement(targetId: string): Element | null {
  return document.querySelector(`[data-tour="${targetId}"]`);
}

function getTargetRect(el: Element): TargetRect {
  const rect = el.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function computeTooltipPosition(
  targetRect: TargetRect,
  position: "top" | "bottom" | "left" | "right",
  tooltipSize: { width: number; height: number }
): { top: number; left: number; adjustedPosition: string } {
  const GAP = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top = 0;
  let left = 0;
  let adjustedPosition = position;

  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  switch (position) {
    case "bottom":
      top = targetRect.top + targetRect.height + GAP;
      left = targetCenterX - tooltipSize.width / 2;
      break;
    case "top":
      top = targetRect.top - tooltipSize.height - GAP;
      left = targetCenterX - tooltipSize.width / 2;
      break;
    case "left":
      top = targetCenterY - tooltipSize.height / 2;
      left = targetRect.left - tooltipSize.width - GAP;
      break;
    case "right":
      top = targetCenterY - tooltipSize.height / 2;
      left = targetRect.left + targetRect.width + GAP;
      break;
  }

  // Smart adjustment: if tooltip goes off-screen, flip or clamp
  if (left < 12) left = 12;
  if (left + tooltipSize.width > vw - 12) left = vw - tooltipSize.width - 12;

  if (position === "bottom" && top + tooltipSize.height > vh - 12) {
    const altTop = targetRect.top - tooltipSize.height - GAP;
    if (altTop > 12) {
      top = altTop;
      adjustedPosition = "top";
    } else {
      top = vh - tooltipSize.height - 12;
    }
  }
  if (position === "top" && top < 12) {
    const altTop = targetRect.top + targetRect.height + GAP;
    if (altTop + tooltipSize.height < vh - 12) {
      top = altTop;
      adjustedPosition = "bottom";
    } else {
      top = 12;
    }
  }

  return { top, left, adjustedPosition };
}

export default function OnboardingTour() {
  const {
    currentStep,
    isTourActive,
    isFirstStep,
    isLastStep,
    totalSteps,
    nextStep,
    prevStep,
    skipTour,
    endTour,
    skipAndDontShow,
  } = useOnboardingTour();

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top: number;
    left: number;
    adjustedPosition: string;
  } | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const tooltipRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tourSwipeStartRef = useRef<number | null>(null);

  const updatePosition = useCallback(() => {
    if (currentStep === null) return;

    const step = TOUR_STEPS[currentStep];
    const el = findTargetElement(step.targetId);
    if (!el) {
      setTargetRect(null);
      setOverlayReady(false);
      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = setTimeout(() => {
        const retryEl = findTargetElement(step.targetId);
        if (retryEl) {
          retryEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          setTimeout(() => {
            const rect = getTargetRect(retryEl);
            setTargetRect(rect);
            const estimatedWidth = Math.min(340, window.innerWidth - 32);
            const estimatedHeight = 240;
            const pos = computeTooltipPosition(rect, step.position, {
              width: estimatedWidth,
              height: estimatedHeight,
            });
            setTooltipPos(pos);
            setOverlayReady(true);
          }, 400);
        }
      }, 600);
      return;
    }

    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }

    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });

    setTimeout(() => {
      const rect = getTargetRect(el);
      setTargetRect(rect);

      const estimatedWidth = Math.min(340, window.innerWidth - 32);
      const estimatedHeight = 240;
      const pos = computeTooltipPosition(rect, step.position, {
        width: estimatedWidth,
        height: estimatedHeight,
      });
      setTooltipPos(pos);
      setOverlayReady(true);
    }, 300);
  }, [currentStep]);

  // Refine tooltip position after it renders
  useEffect(() => {
    if (!tooltipRef.current || !targetRect || currentStep === null) return;

    const step = TOUR_STEPS[currentStep];
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const refined = computeTooltipPosition(
      targetRect,
      step.position,
      { width: tooltipRect.width, height: tooltipRect.height }
    );
    setTooltipPos(refined);
  }, [targetRect, currentStep, overlayReady]);

  // Update position when step changes or on resize
  useEffect(() => {
    if (!isTourActive) return;
    setOverlayReady(false);
    updatePosition();

    const handleResize = () => updatePosition();
    window.addEventListener("resize", handleResize);
    // client-passive-event-listeners: scroll listener just repositions, no preventDefault
    window.addEventListener("scroll", handleResize, { capture: true, passive: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };
  }, [isTourActive, updatePosition]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isTourActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case "Enter":
          if (isLastStep) endTour();
          else nextStep();
          break;
        case "ArrowLeft":
          prevStep();
          break;
        case "Escape":
          skipTour();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTourActive, isLastStep, nextStep, prevStep, skipTour, endTour]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    };
  }, []);

  if (!isTourActive || currentStep === null) return null;

  const step = TOUR_STEPS[currentStep];
  const StepIcon = step.icon;

  // Spotlight padding increased to 16px
  const SPOTLIGHT_PAD = 16;

  // Compute spotlight (cut-out) from targetRect using clip-path polygon
  const spotlightStyle: React.CSSProperties = targetRect
    ? {
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        pointerEvents: "auto",
        // Less opaque overlay (0.7 instead of 0.8)
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        clipPath: targetRect
          ? `polygon(
              0% 0%,
              0% 100%,
              ${targetRect.left - SPOTLIGHT_PAD}px 100%,
              ${targetRect.left - SPOTLIGHT_PAD}px ${targetRect.top - SPOTLIGHT_PAD}px,
              ${targetRect.left + targetRect.width + SPOTLIGHT_PAD}px ${targetRect.top - SPOTLIGHT_PAD}px,
              ${targetRect.left + targetRect.width + SPOTLIGHT_PAD}px ${targetRect.top + targetRect.height + SPOTLIGHT_PAD}px,
              ${targetRect.left - SPOTLIGHT_PAD}px ${targetRect.top + targetRect.height + SPOTLIGHT_PAD}px,
              ${targetRect.left - SPOTLIGHT_PAD}px 100%,
              100% 100%,
              100% 0%
            )`
          : undefined,
      }
    : {
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        pointerEvents: "auto",
      };

  return (
    <>
      {/* Dark overlay with spotlight cut-out */}
      <AnimatePresence>
        {targetRect && overlayReady && (
          <motion.div
            key={`overlay-${currentStep}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={spotlightStyle}
            onClick={skipTour}
          />
        )}
      </AnimatePresence>

      {/* Highlighted border around the target with pulsing glow */}
      <AnimatePresence>
        {targetRect && overlayReady && (
          <motion.div
            key={`highlight-${currentStep}`}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "fixed",
              top: targetRect.top - 4,
              left: targetRect.left - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
              zIndex: 9999,
              borderRadius: 12,
              border: "2px solid var(--mq-accent, #e03131)",
              boxShadow:
                "0 0 20px color-mix(in srgb, var(--mq-accent, #e03131) 30%, transparent), 0 0 60px color-mix(in srgb, var(--mq-accent, #e03131) 10%, transparent)",
              pointerEvents: "none",
            }}
          >
            {/* Pulsing glow animation ring */}
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 8px color-mix(in srgb, var(--mq-accent, #e03131) 20%, transparent)",
                  "0 0 24px color-mix(in srgb, var(--mq-accent, #e03131) 40%, transparent)",
                  "0 0 8px color-mix(in srgb, var(--mq-accent, #e03131) 20%, transparent)",
                ],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{
                position: "absolute",
                inset: -6,
                borderRadius: 16,
                border: "1.5px solid color-mix(in srgb, var(--mq-accent, #e03131) 40%, transparent)",
                pointerEvents: "none",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tooltip */}
      <AnimatePresence mode="wait">
        {tooltipPos && overlayReady && (
          <motion.div
            key={`tooltip-${currentStep}`}
            ref={tooltipRef}
            initial={{
              opacity: 0,
              y: tooltipPos.adjustedPosition === "top" ? -12 : 12,
              scale: 0.95,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              y: tooltipPos.adjustedPosition === "top" ? -12 : 12,
              scale: 0.95,
            }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "fixed",
              top: tooltipPos.top,
              left: Math.max(
                12,
                Math.min(tooltipPos.left, window.innerWidth - 352)
              ),
              zIndex: 10000,
              width: Math.min(340, window.innerWidth - 24),
              pointerEvents: "auto",
            }}
            role="dialog"
            aria-label={step.title}
            aria-modal="true"
            onTouchStart={(e) => {
              tourSwipeStartRef.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (tourSwipeStartRef.current === null) return;
              const dx = tourSwipeStartRef.current - e.changedTouches[0].clientX;
              tourSwipeStartRef.current = null;
              if (Math.abs(dx) > 50) {
                if (dx > 0) {
                  // Swipe left → next
                  if (isLastStep) endTour();
                  else nextStep();
                } else {
                  // Swipe right → prev
                  if (!isFirstStep) prevStep();
                }
              }
            }}
          >
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                backgroundColor: "rgba(20, 20, 28, 0.95)",
                backdropFilter: "blur(40px) saturate(180%)",
                WebkitBackdropFilter: "blur(40px) saturate(180%)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                boxShadow:
                  "0 16px 48px rgba(0,0,0,0.5), 0 0 24px rgba(0,0,0,0.3)",
              }}
            >
              {/* Header with icon, step indicator and close button */}
              <div
                className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--mq-accent, #e03131) 15%, transparent)",
                    }}
                  >
                    <StepIcon
                      className="w-4 h-4 sm:w-3.5 sm:h-3.5"
                      style={{ color: "var(--mq-accent, #e03131)" }}
                    />
                  </div>
                  <span
                    className="text-xs sm:text-[11px] font-bold uppercase tracking-widest"
                    style={{ color: "var(--mq-accent, #e03131)" }}
                  >
                    {currentStep + 1} / {totalSteps}
                  </span>
                </div>
                <button
                  onClick={skipTour}
                  className="p-2 rounded-lg transition-colors hover:bg-white/5 active:bg-white/10"
                  style={{ color: "var(--mq-text-muted, #888)" }}
                  aria-label="Пропустить тур"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Title and description */}
              <div className="px-4 sm:px-5 pb-3">
                <h3
                  className="text-base font-bold mb-1.5 leading-snug"
                  style={{ color: "var(--mq-text, #fff)" }}
                >
                  {step.title}
                </h3>
                <p
                  className="text-[13px] sm:text-[13px] leading-relaxed"
                  style={{ color: "var(--mq-text-muted, #aaa)" }}
                >
                  {step.description}
                </p>
              </div>

              {/* Progress bar */}
              <div className="px-4 sm:px-5 pb-3">
                <div
                  className="w-full h-1 rounded-full overflow-hidden"
                  style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    initial={false}
                    animate={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
                  />
                </div>
              </div>

              {/* Navigation buttons */}
              <div
                className="px-4 sm:px-5 py-3 sm:py-3"
                style={{
                  borderTop: "1px solid var(--mq-border-thin)",
                  backgroundColor: "rgba(255,255,255,0.02)",
                }}
              >
                {/* Top row: Skip / Back + Next */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {!isFirstStep && (
                      <button
                        onClick={prevStep}
                        className="flex items-center gap-1 px-3 py-2 sm:py-1.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/5 active:bg-white/10"
                        style={{
                          color: "var(--mq-text-muted, #aaa)",
                          backgroundColor: "rgba(255,255,255,0.04)",
                        }}
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Назад
                      </button>
                    )}
                    {!isLastStep && (
                      <button
                        onClick={skipTour}
                        className="px-3 py-2 sm:py-1.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/5 active:bg-white/10"
                        style={{
                          color: "var(--mq-text-muted, #888)",
                        }}
                      >
                        Пропустить
                      </button>
                    )}
                  </div>

                  {/* Next / Done button */}
                  <button
                    onClick={isLastStep ? endTour : nextStep}
                    className="flex items-center gap-1.5 px-5 py-2.5 sm:py-2 rounded-xl text-sm font-bold transition-all duration-200 hover:brightness-110 active:scale-95"
                    style={{
                      backgroundColor: "var(--mq-accent, #e03131)",
                      color: "#fff",
                      boxShadow:
                        "0 4px 16px color-mix(in srgb, var(--mq-accent, #e03131) 35%, transparent)",
                    }}
                  >
                    {isLastStep ? "Готово" : "Далее"}
                    {!isLastStep && <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>

                {/* Bottom row */}
                <div className="flex items-center justify-between mt-2.5">
                  <button
                    onClick={skipAndDontShow}
                    className="text-[11px] transition-colors hover:underline py-1"
                    style={{ color: "var(--mq-text-muted, #666)" }}
                  >
                    Пропустить тур
                  </button>

                  <label className="flex items-center gap-1.5 cursor-pointer select-none py-1">
                    <input
                      type="checkbox"
                      checked={dontShowAgain}
                      onChange={(e) => setDontShowAgain(e.target.checked)}
                      className="w-3.5 h-3.5 rounded accent-[var(--mq-accent,#e03131)]"
                    />
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--mq-text-muted, #777)" }}
                    >
                      Не показывать снова
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
