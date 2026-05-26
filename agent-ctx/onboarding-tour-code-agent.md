# Task: Add Guided Onboarding Tour

## Summary
Implemented a guided onboarding tour that highlights key UI elements after first login, separate from the existing OnboardingView (genre/artist picker).

## Files Created
1. **`src/hooks/useOnboardingTour.ts`** — Hook managing tour state:
   - 6 tour steps with Russian text (Search, Messenger, Settings, Player, Equalizer, Queue)
   - `currentStep` state (null = tour not active)
   - `startTour()`, `nextStep()`, `prevStep()`, `skipTour()`, `endTour()`, `resetTour()`
   - Persists completion to `localStorage` key `'mq-tour-complete'`
   - Auto-starts when `onboardingComplete` is true and tour not yet completed
   - Steps 5-6 (EQ/Queue) automatically open FullTrackView via `requiresFullTrackView` flag

2. **`src/components/mq/OnboardingTour.tsx`** — Tour overlay component:
   - Spotlight/mask effect using CSS `clip-path: polygon()` to cut a "hole" around the highlighted element
   - Accent-colored highlight border with glow around target element
   - Glassmorphism tooltip with step indicator, title, description
   - Navigation: "Назад" / "Далее" / "Пропустить" / "Готово"
   - Progress dots
   - Framer Motion animations for overlay and tooltip transitions
   - Smart tooltip positioning with viewport-aware flipping/clamping
   - Scroll target into view, retry logic for elements not yet mounted
   - Keyboard navigation (Arrow keys, Enter, Escape)
   - Mobile-friendly (max-width 340px, responsive positioning)

## Files Modified
3. **`src/components/mq/NavBar.tsx`** — Added `data-tour="search"`, `data-tour="messenger"`, `data-tour="settings"` to navigation buttons
4. **`src/components/mq/MobileNav.tsx`** — Same data-tour attributes for mobile nav buttons
5. **`src/components/mq/PlayerBar.tsx`** — Added `data-tour="player"` to the player bar container
6. **`src/components/mq/FullTrackView.tsx`** — Added `data-tour="equalizer"` to the EQ button and `data-tour="queue"` to the Up Next/Queue preview section
7. **`src/app/play/page.tsx`** — Lazy-loaded and rendered `<OnboardingTour />` component when user is authenticated

## Tour Steps
| # | Target | Title (Russian) | Position |
|---|--------|-----------------|----------|
| 1 | search nav button | Поиск музыки | bottom |
| 2 | messenger nav button | Мессенджер | bottom |
| 3 | settings nav button | Настройки | bottom |
| 4 | player bar | Управление плеером | top |
| 5 | EQ button (FullTrackView) | Живой эквалайзер | top |
| 6 | Queue section (FullTrackView) | Очередь воспроизведения | top |

## Build Status
✅ `bun run build` completes with no errors
