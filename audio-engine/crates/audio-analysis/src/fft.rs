//! FFT wrapper (rustfft) with plan reuse + spectrum analyzer.
//!
//! Plans and scratch are allocated at construction — nothing allocates in
//! the analysis hot path. rustfft's SIMD backend does the heavy lifting.

use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};

pub struct FftPlan {
    size: usize,
    forward: std::sync::Arc<dyn Fft<f32>>,
    inverse: std::sync::Arc<dyn Fft<f32>>,
    scratch: Vec<Complex<f32>>,
}

impl FftPlan {
    pub fn new(size: usize) -> Self {
        assert!(size.is_power_of_two() && size >= 16, "FFT size must be pow2 ≥ 16");
        let mut planner = FftPlanner::<f32>::new();
        let forward = planner.plan_fft_forward(size);
        let inverse = planner.plan_fft_inverse(size);
        Self {
            size,
            forward,
            inverse,
            scratch: vec![Complex::new(0.0, 0.0); size],
        }
    }

    pub fn size(&self) -> usize {
        self.size
    }

    /// In-place forward transform.
    pub fn forward(&mut self, buf: &mut [Complex<f32>]) {
        debug_assert_eq!(buf.len(), self.size);
        self.forward.process_with_scratch(buf, &mut self.scratch);
    }

    /// In-place inverse transform (rustfft inverse is unscaled; we divide by N).
    pub fn inverse(&mut self, buf: &mut [Complex<f32>]) {
        debug_assert_eq!(buf.len(), self.size);
        self.inverse.process_with_scratch(buf, &mut self.scratch);
        let n = self.size as f32;
        for c in buf.iter_mut() {
            *c /= n;
        }
    }
}

/// Real-input spectrum analyzer with Hann windowing and amplitude-correct
/// magnitudes (caller converts to dB as needed).
pub struct SpectrumAnalyzer {
    plan: FftPlan,
    window: Vec<f32>,
    buffer: Vec<Complex<f32>>,
    magnitudes: Vec<f32>,
    norm: f32,
}

impl SpectrumAnalyzer {
    pub fn new(size: usize) -> Self {
        let window: Vec<f32> = (0..size)
            .map(|i| 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / size as f32).cos()))
            .collect();
        // amplitude-correct scaling: peak bin mag of A·sin = A/2·Σw → A = 2·mag/Σw
        let w_sum: f32 = window.iter().sum();
        Self {
            plan: FftPlan::new(size),
            window,
            buffer: vec![Complex::new(0.0, 0.0); size],
            magnitudes: vec![0.0; size / 2],
            norm: 2.0 / w_sum,
        }
    }

    pub fn bins(&self) -> usize {
        self.magnitudes.len()
    }

    /// Analyze `plan.size()` real samples; returns magnitudes DC..Nyquist.
    pub fn spectrum(&mut self, input: &[f32]) -> &[f32] {
        debug_assert_eq!(input.len(), self.plan.size());
        for (i, s) in input.iter().enumerate() {
            self.buffer[i] = Complex::new(s * self.window[i], 0.0);
        }
        let mut buf = std::mem::take(&mut self.buffer);
        self.plan.forward(&mut buf);
        self.buffer = buf;
        for (i, m) in self.magnitudes.iter_mut().enumerate() {
            let c = self.buffer[i];
            *m = (c.re * c.re + c.im * c.im).sqrt() * self.norm;
        }
        &self.magnitudes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sine_peak_lands_on_expected_bin() {
        let size = 1024;
        let mut an = SpectrumAnalyzer::new(size);
        let sr = 48000.0;
        let freq = 1000.0;
        let bin = (freq * size as f32 / sr).round() as usize;
        let input: Vec<f32> = (0..size)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sr).sin() * 0.5)
            .collect();
        let mags = an.spectrum(&input).to_vec();
        let peak_bin = mags
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .map(|(i, _)| i)
            .unwrap();
        assert_eq!(peak_bin, bin, "peak bin {peak_bin} != expected {bin}");
        assert!(mags[peak_bin] > 0.3, "amplitude should be near 0.5, got {}", mags[peak_bin]);
    }

    #[test]
    fn dc_input_peaks_at_bin0() {
        let size = 256;
        let mut an = SpectrumAnalyzer::new(size);
        let input = vec![0.25_f32; size];
        let mags = an.spectrum(&input).to_vec();
        // amplitude spectrum of DC reads 2×A (sine convention) — 0.5 here.
        // Periodic Hann spreads DC exactly into bins 0 and 1 (−N/4):
        // bin1 reads half of bin0 — that's the window, not leakage.
        assert!((mags[0] - 0.5).abs() < 0.01);
        assert!((mags[1] - 0.25).abs() < 0.02, "Hann DC bin1: {}", mags[1]);
        for m in mags.iter().skip(2) {
            assert!(m.abs() < 0.01, "unexpected spread: {m}");
        }
    }

    #[test]
    fn forward_inverse_roundtrip() {
        use rustfft::num_complex::Complex;
        let mut plan = FftPlan::new(64);
        let orig: Vec<Complex<f32>> = (0..64)
            .map(|i| Complex::new((i as f32 * 0.1).sin(), (i as f32 * 0.07).cos()))
            .collect();
        let mut buf = orig.clone();
        plan.forward(&mut buf);
        plan.inverse(&mut buf);
        for (a, b) in buf.iter().zip(orig.iter()) {
            assert!((a.re - b.re).abs() < 1e-4);
            assert!((a.im - b.im).abs() < 1e-4);
        }
    }
}
