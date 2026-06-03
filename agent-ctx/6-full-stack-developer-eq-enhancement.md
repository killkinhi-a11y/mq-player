# Task 6 - Equalizer Enhancement

## Summary
Improved the live equalizer with better Web Audio API + AnalyserNode + canvas FFT visualization.

## Changes

### `src/lib/audioEngine.ts`
- Changed `analyser.fftSize` from 512 → 2048 (1024 frequency bins instead of 256)
- Added `getTimeDomainData()` export for waveform display

### `src/components/mq/EqualizerView.tsx`
- **Waveform display**: Time-domain waveform below FFT bars at 30% opacity using `getByteTimeDomainData()`
- **Peak hold indicators**: Per-bar peak tracking with slow decay (0.003/frame), bright 2px line at peak
- **Adaptive bar count**: Uses `getAdaptiveBarCount()` instead of hardcoded 64 (256/128/64 based on perf)
- **Color scheme**: All colors derived from `--mq-accent` CSS variable with cached RGB extraction; gradient bars with accent color
- **Glow effect**: Canvas shadowBlur on loud bars (smoothed > 0.5)
- **Reflection/mirror**: Subtle 25% gradient reflection below FFT bars
- **Smooth resize**: ResizeObserver + devicePixelRatio for crisp HiDPI rendering
- **dB scale markings**: Grid lines at -12, -6, 0, +6, +12 dB with labels
- **Performance**: `will-change: transform`, `recordFrameTime()` per frame, proper RAF cleanup
- **Spectral centroid**: Weighted average frequency indicator (triangle + dashed line), smoothed movement

All existing functionality preserved: EQ sliders, presets, toggle, store integration.
