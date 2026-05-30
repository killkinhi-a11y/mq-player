"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { ViewType } from "@/store/useAppStore";
import {
  Search,
  MessageCircle,
  Palette,
  Headphones,
  AudioWaveform,
  ListMusic,
  Heart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface TourStep {
  targetId: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
  /** Icon to illustrate this step */
  icon: LucideIcon;
  /** Optional: open the full track view before this step */
  requiresFullTrackView?: boolean;
  /** Optional: navigate to a specific view before this step */
  navigateTo?: ViewType;
}

const TOUR_STORAGE_KEY = "mq-tour-complete";
const TOUR_DONT_SHOW_KEY = "mq-tour-dont-show";

export const TOUR_STEPS: TourStep[] = [
  {
    targetId: "search",
    title: "Поиск музыки",
    description:
      "Найдите любую песню по названию или артисту. Просто начните вводить запрос.",
    position: "bottom",
    icon: Search,
  },
  {
    targetId: "messenger",
    title: "Мессенджер",
    description:
      "Общайтесь с друзьями и делитесь треками прямо из плеера.",
    position: "bottom",
    icon: MessageCircle,
  },
  {
    targetId: "settings",
    title: "Настройки",
    description:
      "Тема, звук, уведомления и другие параметры приложения.",
    position: "bottom",
    icon: Headphones,
  },
  {
    targetId: "player",
    title: "Управление плеером",
    description:
      "Нажмите на обложку для полного плеера. Свайпните вниз, чтобы скрыть. Свайпните по обложке для смены трека.",
    position: "top",
    icon: Headphones,
  },
  {
    targetId: "like-dislike",
    title: "Лайк и дизлайк",
    description:
      "Нажмите ❤️ чтобы добавить в избранное, или 👎 чтобы скрыть из рекомендаций.",
    position: "top",
    icon: Heart,
  },
  {
    targetId: "equalizer",
    title: "Живой эквалайзер",
    description:
      "Визуализация звука и 5-полосный эквалайзер — настройте звук под себя.",
    position: "top",
    requiresFullTrackView: true,
    icon: AudioWaveform,
  },
  {
    targetId: "queue",
    title: "Очередь воспроизведения",
    description:
      "Управляйте очередью — добавляйте и перемещайте треки.",
    position: "top",
    requiresFullTrackView: true,
    icon: ListMusic,
  },
  {
    targetId: "theme-section",
    title: "Темы оформления",
    description:
      "Выберите тему или создайте свой акцентный цвет.",
    position: "bottom",
    navigateTo: "settings",
    icon: Palette,
  },
];

export function useOnboardingTour() {
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const autoStartAttempted = useRef(false);

  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const setView = useAppStore((s) => s.setView);

  const isTourComplete = useCallback(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
    } catch {
      return true;
    }
  }, []);

  const isDontShowAgain = useCallback(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(TOUR_DONT_SHOW_KEY) === "true";
    } catch {
      return false;
    }
  }, []);

  const markTourComplete = useCallback(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
    } catch {}
  }, []);

  const markDontShowAgain = useCallback(() => {
    try {
      localStorage.setItem(TOUR_DONT_SHOW_KEY, "true");
    } catch {}
  }, []);

  const startTour = useCallback(() => {
    // On mobile, skip steps that require FullTrackView
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    let firstStep = 0;
    if (isMobile) {
      while (firstStep < TOUR_STEPS.length && TOUR_STEPS[firstStep].requiresFullTrackView) {
        firstStep++;
      }
    }
    setCurrentStep(firstStep);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev === null) return null;
      let next = prev + 1;
      // On mobile, skip steps that require FullTrackView (equalizer, queue)
      // as they are awkward on small screens
      const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
      while (next < TOUR_STEPS.length && isMobile && TOUR_STEPS[next].requiresFullTrackView) {
        next++;
      }
      if (next >= TOUR_STEPS.length) {
        markTourComplete();
        return null;
      }
      return next;
    });
  }, [markTourComplete]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev === null || prev === 0) return prev;
      return prev - 1;
    });
  }, []);

  const skipTour = useCallback(() => {
    setCurrentStep(null);
    markTourComplete();
  }, [markTourComplete]);

  const endTour = useCallback(() => {
    // Close full track view if it was opened by the tour
    setFullTrackViewOpen(false);
    setCurrentStep(null);
    markTourComplete();
  }, [markTourComplete, setFullTrackViewOpen]);

  const skipAndDontShow = useCallback(() => {
    markDontShowAgain();
    skipTour();
  }, [markDontShowAgain, skipTour]);

  const resetTour = useCallback(() => {
    try {
      localStorage.removeItem(TOUR_STORAGE_KEY);
      localStorage.removeItem(TOUR_DONT_SHOW_KEY);
    } catch {}
    setCurrentStep(0);
  }, []);

  // Auto-start tour after onboarding completes and user is authenticated
  // but only if the tour hasn't been completed yet and "don't show again" isn't set
  useEffect(() => {
    if (autoStartAttempted.current) return;
    if (!isAuthenticated || !onboardingComplete) return;
    if (isTourComplete()) return;
    if (isDontShowAgain()) return;

    autoStartAttempted.current = true;

    // Small delay to let the UI settle after onboarding
    const timer = setTimeout(() => {
      // Double-check that tour still hasn't been completed
      if (!isTourComplete() && !isDontShowAgain()) {
        startTour();
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [isAuthenticated, onboardingComplete, isTourComplete, isDontShowAgain, startTour]);

  // When step changes, open/close FullTrackView and navigate as needed
  useEffect(() => {
    if (currentStep === null) return;
    const step = TOUR_STEPS[currentStep];
    if (step.requiresFullTrackView) {
      setFullTrackViewOpen(true);
    } else {
      // Close full track view if previous step required it but this one doesn't
      setFullTrackViewOpen(false);
    }
    if (step.navigateTo) {
      setView(step.navigateTo);
    }
  }, [currentStep, setFullTrackViewOpen, setView]);

  const isLastStep = currentStep === TOUR_STEPS.length - 1;
  const isFirstStep = currentStep === 0;
  const totalSteps = TOUR_STEPS.length;

  return {
    currentStep,
    steps: TOUR_STEPS,
    isTourActive: currentStep !== null,
    isFirstStep,
    isLastStep,
    totalSteps,
    startTour,
    nextStep,
    prevStep,
    skipTour,
    endTour,
    resetTour,
    skipAndDontShow,
    markDontShowAgain,
    isDontShowAgain,
  };
}
