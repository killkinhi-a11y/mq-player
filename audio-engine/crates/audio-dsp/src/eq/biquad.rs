//! High-quality biquad filters (RBJ Audio-EQ-Cookbook coefficients) with
//! one-pole coefficient smoothing per block — parameter changes never
//! zipper. Denormal protection on the direct-form state.

use crate::Processor;
use crate::flush_denormal;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FilterKind {
    LowShelf,
    HighShelf,
    LowPass,
    HighPass,
    Notch,
    BandPass,
    Peaking,
}

/// A single biquad band applied identically to every channel
/// (per-channel filter state).
pub struct BiquadBand {
    kind: FilterKind,
    sample_rate: f32,
    freq: f32, // Hz
    gain_db: f32,
    q: f32,

    // Target coefficients (from latest parameters)
    t_b0: f32, t_b1: f32, t_b2: f32, t_a1: f32, t_a2: f32,
    // Active (smoothed) coefficients
    b0: f32, b1: f32, b2: f32, a1: f32, a2: f32,
    // Per-channel direct-form-I state
    x1: Vec<f32>,
    x2: Vec<f32>,
    y1: Vec<f32>,
    y2: Vec<f32>,
    channels: usize,
    smoothing: f32, // one-pole coefficient for coefficient smoothing
}

impl BiquadBand {
    pub fn new(kind: FilterKind, sample_rate: f32, freq: f32, gain_db: f32, q: f32, channels: usize) -> Self {
        let mut band = Self {
            kind,
            sample_rate,
            freq: freq.clamp(10.0, 20000.0),
            gain_db: gain_db.clamp(-24.0, 24.0),
            q: q.clamp(0.05, 20.0),
            t_b0: 1.0, t_b1: 0.0, t_b2: 0.0, t_a1: 0.0, t_a2: 0.0,
            b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0,
            x1: vec![0.0; channels],
            x2: vec![0.0; channels],
            y1: vec![0.0; channels],
            y2: vec![0.0; channels],
            channels,
            smoothing: 0.12,
        };
        band.recompute_targets();
        // Snap to targets on first build (no ramp from identity).
        band.b0 = band.t_b0;
        band.b1 = band.t_b1;
        band.b2 = band.t_b2;
        band.a1 = band.t_a1;
        band.a2 = band.t_a2;
        band
    }

    /// RBJ cookbook coefficients. f64 math for precision, f32 runtime.
    fn recompute_targets(&mut self) {
        let sr = self.sample_rate as f64;
        let f0 = (self.freq as f64).clamp(10.0, sr * 0.49);
        let q = (self.q as f64).clamp(0.05, 20.0);
        let db = (self.gain_db as f64).clamp(-24.0, 24.0);
        let a = 10_f64.powf(db / 40.0); // sqrt of linear gain
        let w0 = 2.0 * std::f64::consts::PI * f0 / sr;
        let cw = w0.cos();
        let sw = w0.sin();
        let alpha = sw / (2.0 * q);

        let (b0, b1, b2, mut a0, a1, a2) = match self.kind {
            FilterKind::Peaking => (
                1.0 + alpha * a,
                -2.0 * cw,
                1.0 - alpha * a,
                1.0 + alpha / a,
                -2.0 * cw,
                1.0 - alpha / a,
            ),
            FilterKind::LowShelf => {
                let sq = 2.0 * (a as f64).sqrt() * alpha;
                (
                    a * ((a + 1.0) - (a - 1.0) * cw + sq),
                    2.0 * a * ((a - 1.0) - (a + 1.0) * cw),
                    a * ((a + 1.0) - (a - 1.0) * cw - sq),
                    (a + 1.0) + (a - 1.0) * cw + sq,
                    -2.0 * ((a - 1.0) + (a + 1.0) * cw),
                    (a + 1.0) + (a - 1.0) * cw - sq,
                )
            }
            FilterKind::HighShelf => {
                let sq = 2.0 * (a as f64).sqrt() * alpha;
                (
                    a * ((a + 1.0) + (a - 1.0) * cw + sq),
                    -2.0 * a * ((a - 1.0) + (a + 1.0) * cw),
                    a * ((a + 1.0) + (a - 1.0) * cw - sq),
                    (a + 1.0) - (a - 1.0) * cw + sq,
                    2.0 * ((a - 1.0) - (a + 1.0) * cw),
                    (a + 1.0) - (a - 1.0) * cw - sq,
                )
            }
            FilterKind::LowPass => (
                (1.0 - cw) / 2.0,
                1.0 - cw,
                (1.0 - cw) / 2.0,
                1.0 + alpha,
                -2.0 * cw,
                1.0 - alpha,
            ),
            FilterKind::HighPass => (
                (1.0 + cw) / 2.0,
                -(1.0 + cw),
                (1.0 + cw) / 2.0,
                1.0 + alpha,
                -2.0 * cw,
                1.0 - alpha,
            ),
            FilterKind::BandPass => (alpha, 0.0, -alpha, 1.0 + alpha, -2.0 * cw, 1.0 - alpha),
            FilterKind::Notch => (1.0, -2.0 * cw, 1.0, 1.0 + alpha, -2.0 * cw, 1.0 - alpha),
        };
        a0 = if a0.abs() < 1e-12 { 1.0 } else { a0 };
        self.t_b0 = (b0 / a0) as f32;
        self.t_b1 = (b1 / a0) as f32;
        self.t_b2 = (b2 / a0) as f32;
        self.t_a1 = (a1 / a0) as f32;
        self.t_a2 = (a2 / a0) as f32;
    }

    // ── Parameter setters (staged, applied smoothly) ──

    pub fn set_freq(&mut self, freq: f32) {
        let f = freq.clamp(10.0, 20000.0);
        if (f - self.freq).abs() < 1e-3 {
            return;
        }
        self.freq = f;
        self.recompute_targets();
    }

    pub fn set_gain_db(&mut self, db: f32) {
        let g = db.clamp(-24.0, 24.0);
        if (g - self.gain_db).abs() < 1e-3 {
            return;
        }
        self.gain_db = g;
        if matches!(self.kind, FilterKind::Peaking | FilterKind::LowShelf | FilterKind::HighShelf) {
            self.recompute_targets();
        }
    }

    pub fn set_q(&mut self, q: f32) {
        let v = q.clamp(0.05, 20.0);
        if (v - self.q).abs() < 1e-3 {
            return;
        }
        self.q = v;
        self.recompute_targets();
    }

    pub fn gain_db(&self) -> f32 {
        self.gain_db
    }
    pub fn freq(&self) -> f32 {
        self.freq
    }

    /// Bypass: unity pass-through for this block (still consumes audio).
    pub fn process_bypassed(&mut self, _channels: &mut [&mut [f32]]) {}

    fn smooth_step(&mut self) {
        // One-pole per block toward targets. ~1 ms at 128-frame blocks/48 kHz
        // is 7-8 blocks — smooth enough to be click-free for gain changes.
        let s = self.smoothing;
        self.b0 += (self.t_b0 - self.b0) * s;
        self.b1 += (self.t_b1 - self.b1) * s;
        self.b2 += (self.t_b2 - self.b2) * s;
        self.a1 += (self.t_a1 - self.a1) * s;
        self.a2 += (self.t_a2 - self.a2) * s;
    }

    fn ensure_channels(&mut self, channels: usize) {
        if self.channels != channels {
            self.x1.resize(channels, 0.0);
            self.x2.resize(channels, 0.0);
            self.y1.resize(channels, 0.0);
            self.y2.resize(channels, 0.0);
            self.channels = channels;
        }
    }
}

impl Processor for BiquadBand {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        self.ensure_channels(channels.len());
        self.smooth_step();
        let (b0, b1, b2, a1, a2) = (self.b0, self.b1, self.b2, self.a1, self.a2);
        for (ch, io) in channels.iter_mut().enumerate() {
            let (mut x1, mut x2, mut y1, mut y2) =
                (self.x1[ch], self.x2[ch], self.y1[ch], self.y2[ch]);
            for s in io.iter_mut() {
                let x = *s;
                let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
                x2 = x1;
                x1 = x;
                flush_denormal(&mut y2);
                y2 = y1;
                y1 = y;
                *s = y;
            }
            flush_denormal(&mut x1);
            flush_denormal(&mut x2);
            flush_denormal(&mut y1);
            flush_denormal(&mut y2);
            self.x1[ch] = x1;
            self.x2[ch] = x2;
            self.y1[ch] = y1;
            self.y2[ch] = y2;
        }
    }

    fn reset(&mut self) {
        self.x1.fill(0.0);
        self.x2.fill(0.0);
        self.y1.fill(0.0);
        self.y2.fill(0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn impulse_response(band: &mut BiquadBand) -> Vec<f32> {
        let mut input = vec![0.0; 256];
        input[0] = 1.0;
        let mut out = vec![0.0; 256];
        // feed in 8-frame blocks like a worklet would
        for blk in (0..256).step_by(8) {
            let mut lane: Vec<f32> = input[blk..blk + 8].to_vec();
            let mut chans: Vec<&mut [f32]> = vec![&mut lane];
            band.process(&mut chans);
            out[blk..blk + 8].copy_from_slice(&lane);
        }
        out
    }

    #[test]
    fn unity_peaking_band_is_identity() {
        let mut band = BiquadBand::new(FilterKind::Peaking, 48000.0, 1000.0, 0.0, 1.0, 1);
        let ir = impulse_response(&mut band);
        assert!((ir[0] - 1.0).abs() < 1e-3, "gain=0 dB peaking must pass unity");
        for v in ir.iter().skip(1) {
            assert!(v.abs() < 1e-3);
        }
    }

    #[test]
    fn lowpass_suppresses_impulse_energy_late() {
        let mut band = BiquadBand::new(FilterKind::LowPass, 48000.0, 2000.0, 0.0, 0.707, 1);
        let ir = impulse_response(&mut band);
        // 2 kHz LPF rings ~Q/f ≈ 0.35 ms (17 samples) — tail must be tiny.
        let tail_energy: f32 = ir[64..].iter().map(|v| v * v).sum();
        let head_energy: f32 = ir[..64].iter().map(|v| v * v).sum();
        assert!(tail_energy < head_energy * 0.05);
    }

    #[test]
    fn highpass_rejects_dc() {
        let mut band = BiquadBand::new(FilterKind::HighPass, 48000.0, 100.0, 0.0, 0.707, 2);
        let n = 4096;
        let mut l = vec![1.0_f32; n];
        let mut r = vec![1.0_f32; n];
        // process in blocks
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            band.process(&mut chans);
        }
        // DC must be (nearly) eliminated in steady state
        let mean: f32 = l[n - 512..].iter().sum::<f32>() / 512.0;
        assert!(mean.abs() < 1e-4, "HPF steady-state DC leakage: {mean}");
    }

    #[test]
    fn output_stays_finite() {
        let mut band = BiquadBand::new(FilterKind::Peaking, 48000.0, 8000.0, 18.0, 0.3, 2);
        let mut l = vec![0.9_f32; 2048];
        let mut r = vec!(-0.9_f32; 2048);
        for blk in (0..2048).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            band.process(&mut chans);
        }
        for v in l.iter().chain(r.iter()) {
            assert!(v.is_finite());
        }
    }
}
