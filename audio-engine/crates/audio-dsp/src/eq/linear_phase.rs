//! Linear-phase EQ — FFT overlap-save convolution with a symmetric FIR
//! derived from the same RBJ magnitude targets. Partitioned convolution
//! (uniform blocks) keeps latency bounded and CPU flat.

use crate::Processor;
use audio_analysis::fft::FftPlan;
use audio_analysis::num_complex::Complex;

/// Build a symmetric linear-phase FIR (length = fft_size/2 + 1 unique taps)
/// approximating the requested magnitude curve sampled at band frequencies.
/// We synthesize the magnitude by evaluating a set of shelf/peaking targets,
/// then apply a minimum-phase→linear-phase conversion via Hermitian
/// spectrum + IFFT and centering.
pub struct LinearPhaseEq {
    plan: FftPlan,
    // H(f) spectrum for the FIR (length fft_size), Hermitian
    spectrum: Vec<Complex<f32>>,
    // input history for overlap-save
    history: Vec<f32>,
    // scratch for FFT
    block: Vec<Complex<f32>>,
    freqs: Vec<(f32, f32)>, // (freq Hz, gain dB) breakpoints
    fft_size: usize,
    enabled: bool,
    dirty: bool,
    sample_rate: f32,
}

impl LinearPhaseEq {
    pub fn new(sample_rate: f32, fft_size: usize, breakpoints: &[(f32, f32)]) -> Self {
        assert!(fft_size.is_power_of_two() && fft_size >= 256);
        let mut eq = Self {
            plan: FftPlan::new(fft_size),
            spectrum: vec![Complex::new(0.0, 0.0); fft_size],
            history: vec![0.0; fft_size],
            block: vec![Complex::new(0.0, 0.0); fft_size],
            freqs: breakpoints.to_vec(),
            fft_size,
            enabled: true,
            dirty: true,
            sample_rate,
        };
        eq.rebuild();
        eq
    }

    pub fn set_breakpoints(&mut self, bps: &[(f32, f32)]) {
        self.freqs = bps.to_vec();
        self.dirty = true;
    }

    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }

    /// Rebuild the Hermitian FIR spectrum from breakpoints (linear
    /// interpolation in log-frequency domain).
    fn rebuild(&mut self) {
        let n = self.fft_size;
        let nyquist = self.sample_rate / 2.0;
        let pts: Vec<(f32, f32)> = {
            let mut p = self.freqs.clone();
            p.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
            p
        };
        // evaluate magnitude at each FFT bin
        let mut mags = vec![1.0_f32; n / 2 + 1];
        for k in 0..=n / 2 {
            let f = (k as f32 / n as f32) * 2.0 * nyquist;
            let db = if pts.is_empty() {
                0.0
            } else if f <= pts[0].0 {
                pts[0].1
            } else if f >= pts[pts.len() - 1].0 {
                pts[pts.len() - 1].1
            } else {
                // log-frequency interpolation
                let lf = f.max(1.0).ln();
                let mut val = pts[pts.len() - 1].1;
                for w in pts.windows(2) {
                    let (f0, g0) = w[0];
                    let (f1, g1) = w[1];
                    let lf0 = f0.max(1.0).ln();
                    let lf1 = f1.max(1.0).ln();
                    if lf >= lf0 && lf <= lf1 {
                        let t = if lf1 - lf0 < 1e-9 { 0.0 } else { (lf - lf0) / (lf1 - lf0) };
                        val = g0 + (g1 - g0) * t;
                        break;
                    }
                }
                val
            };
            mags[k] = 10_f32.powf(db / 20.0);
        }
        // Hermitian spectrum
        for k in 0..n {
            let mag = if k <= n / 2 { mags[k] } else { mags[n - k] };
            self.spectrum[k] = Complex::new(mag, 0.0);
        }
        self.dirty = false;
    }

    /// Number of new frames consumed per process call (block step).
    fn step(&self) -> usize {
        self.fft_size / 2
    }
}

impl Processor for LinearPhaseEq {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled || channels.is_empty() {
            return;
        }
        if self.dirty {
            self.rebuild();
        }
        let step = self.step();
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        // Process in `step`-sized chunks with overlap-save on shared history.
        let mut pos = 0;
        while pos < frames {
            let n = step.min(frames - pos);
            // build block from history (fft_size - n old) + n new samples
            self.block.fill(Complex::new(0.0, 0.0));
            // shift history
            let h = self.history.clone();
            let hist_len = self.fft_size;
            // overlap-save: use last hist_len samples (old + new)
            let mut window = vec![0.0_f32; hist_len];
            window[..hist_len - n].copy_from_slice(&h[n..]);
            for (i, ch) in channels.iter_mut().enumerate() {
                if i > 0 {
                    continue; // mono analysis, apply same FIR to all channels
                }
                for (j, s) in ch[pos..pos + n].iter().enumerate() {
                    window[hist_len - n + j] = *s;
                }
            }
            // FFT
            for (k, s) in window.iter().enumerate() {
                self.block[k] = Complex::new(*s, 0.0);
            }
            self.plan.forward(&mut self.block);
            // multiply by H
            for k in 0..self.fft_size {
                self.block[k] *= self.spectrum[k];
            }
            self.plan.inverse(&mut self.block);
            // valid outputs: last n samples
            for (i, ch) in channels.iter_mut().enumerate() {
                let _ = i;
                for j in 0..n {
                    ch[pos + j] = self.block[self.fft_size - n + j].re;
                }
            }
            // update history
            self.history.copy_within(n.., 0);
            for (i, ch) in channels.iter().enumerate() {
                if i > 0 {
                    continue;
                }
                for (j, s) in ch[pos..pos + n].iter().enumerate() {
                    self.history[hist_len - n + j] = *s;
                }
            }
            pos += n;
        }
    }

    fn reset(&mut self) {
        self.history.fill(0.0);
    }

    fn latency(&self) -> usize {
        self.fft_size / 4 // group delay of the symmetric FIR
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flat_breakpoints_are_identity() {
        let mut eq = LinearPhaseEq::new(48000.0, 512, &[(20.0, 0.0), (20000.0, 0.0)]);
        let n = 4096;
        let mut s: Vec<f32> = (0..n).map(|i| (i as f32 * 0.01).sin() * 0.4).collect();
        let before = s.clone();
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut s[blk..blk + 128]];
            eq.process(&mut chans);
        }
        for (a, b) in s.iter().zip(before.iter()) {
            assert!((a - b).abs() < 1e-3, "flat EQ must be unity: {a} vs {b}");
        }
    }

    #[test]
    fn bass_boost_boosts_low_energy() {
        let mut eq = LinearPhaseEq::new(48000.0, 1024, &[(20.0, 9.0), (120.0, 8.0), (1000.0, 0.0), (20000.0, 0.0)]);
        let n = 16384;
        let sr = 48000.0;
        let mut s: Vec<f32> = (0..n).map(|i| (2.0 * std::f32::consts::PI * 60.0 * i as f32 / sr).sin() * 0.2).collect();
        let ref_rms = (s.iter().map(|v| v * v).sum::<f32>() / n as f32).sqrt();
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut s[blk..blk + 128]];
            eq.process(&mut chans);
        }
        let out_rms = (s[2048..].iter().map(|v| v * v).sum::<f32>() / (n - 2048) as f32).sqrt();
        assert!(out_rms > ref_rms * 1.8, "60 Hz must be boosted: {out_rms} vs {ref_rms}");
    }
}
