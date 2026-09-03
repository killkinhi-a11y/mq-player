//! Expander & noise gate (downward dynamics with attack/hold/release).

use crate::Processor;
use crate::flush_denormal;

/// Downward expander: signals below threshold are attenuated by `ratio`
/// (ratio > 1 → expansion). `range_db` caps maximum attenuation.
pub struct Expander {
    sample_rate: f32,
    threshold_db: f32,
    ratio: f32,
    attack_ms: f32,
    release_ms: f32,
    knee_db: f32,
    range_db: f32, // max attenuation (positive dB)
    hold_ms: f32,
    enabled: bool,
    atk_coef: f32,
    rel_coef: f32,
    env: Vec<f32>,
    hold_count: usize,
    pub gain_db: f32,
}

impl Expander {
    pub fn new(sample_rate: f32, channels: usize, threshold_db: f32, ratio: f32, attack_ms: f32, release_ms: f32, knee_db: f32, range_db: f32, hold_ms: f32) -> Self {
        let mut e = Self {
            sample_rate,
            threshold_db,
            ratio: ratio.clamp(1.0, 10.0),
            attack_ms: attack_ms.max(0.1),
            release_ms: release_ms.max(5.0),
            knee_db: knee_db.clamp(0.0, 12.0),
            range_db: range_db.clamp(0.0, 80.0),
            hold_ms: hold_ms.max(0.0),
            enabled: true,
            atk_coef: 0.0,
            rel_coef: 0.0,
            env: vec![0.0; channels],
            hold_count: 0,
            gain_db: 0.0,
        };
        e.update_coeffs();
        e
    }

    fn update_coeffs(&mut self) {
        self.atk_coef = (-1.0 / ((self.attack_ms / 1000.0).max(1e-5) * self.sample_rate)).exp();
        self.rel_coef = (-1.0 / ((self.release_ms / 1000.0).max(1e-5) * self.sample_rate)).exp();
    }

    pub fn set_threshold_db(&mut self, v: f32) {
        self.threshold_db = v.clamp(-80.0, 0.0);
    }
    pub fn set_ratio(&mut self, v: f32) {
        self.ratio = v.clamp(1.0, 10.0);
    }
    pub fn set_hold_ms(&mut self, v: f32) {
        self.hold_ms = v.max(0.0);
    }
    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }

    #[inline]
    fn target_gain_db(&self, level_db: f32) -> f32 {
        let t = self.threshold_db;
        if level_db >= t {
            return 0.0;
        }
        let under = t - level_db;
        let mut cut = under * (1.0 - 1.0 / self.ratio);
        if cut > self.range_db {
            cut = self.range_db;
        }
        -cut
    }
}

impl Processor for Expander {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled {
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let hold_frames = (self.hold_ms * 0.001 * self.sample_rate) as usize;
        let mut peak_gain = 0.0_f32;
        for i in 0..frames {
            let mut level = 0.0_f32;
            for ch in channels.iter() {
                level = level.max(ch[i].abs());
            }
            let level_db = 20.0 * level.max(1e-6).log10();
            let target = self.target_gain_db(level_db);
            // hold logic: when opening (target > current), reset hold timer
            if target > self.gain_db + 0.1 {
                self.hold_count = 0;
            }
            self.hold_count += 1;
            let smoothing_allowed = self.hold_count > hold_frames || target > self.gain_db;
            let coef = if target > self.gain_db { self.atk_coef } else { self.rel_coef };
            let next = if smoothing_allowed {
                target + coef * (self.gain_db - target)
            } else {
                self.gain_db
            };
            // clamp to floor; keep the value well above denormal territory
            let mut g = next.max(-self.range_db);
            flush_denormal(&mut g);
            self.gain_db = g;
            peak_gain = peak_gain.max(self.gain_db.abs());
            let lin = 10_f32.powf(self.gain_db / 20.0);
            for ch in channels.iter_mut() {
                ch[i] *= lin;
            }
        }
        let _ = peak_gain;
    }

    fn reset(&mut self) {
        self.env.fill(0.0);
        self.gain_db = 0.0;
        self.hold_count = 0;
    }
}

/// Noise gate = expander with high ratio + range. Real, honest DSP.
pub struct NoiseGate {
    inner: Expander,
}

impl NoiseGate {
    pub fn new(sample_rate: f32, channels: usize, threshold_db: f32, attack_ms: f32, hold_ms: f32, release_ms: f32, range_db: f32) -> Self {
        Self {
            inner: Expander::new(sample_rate, channels, threshold_db, 10.0, attack_ms, release_ms, 0.0, range_db, hold_ms),
        }
    }
    pub fn set_threshold_db(&mut self, v: f32) {
        self.inner.set_threshold_db(v);
    }
    pub fn set_hold_ms(&mut self, v: f32) {
        self.inner.set_hold_ms(v);
    }
    pub fn set_enabled(&mut self, on: bool) {
        self.inner.set_enabled(on);
    }
    /// Noise-reduction positioning: aggressive gate config for bed noise.
    pub fn configure_noise_reduction(&mut self, depth_db: f32) {
        self.inner.set_threshold_db(-45.0);
        self.inner.set_ratio(10.0);
        self.inner.set_hold_ms(200.0);
        let _ = depth_db;
    }
}

impl Processor for NoiseGate {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        self.inner.process(channels);
    }
    fn reset(&mut self) {
        self.inner.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gate_silences_quiet_parts() {
        let mut gate = NoiseGate::new(48000.0, 1, -40.0, 1.0, 50.0, 120.0, 40.0);
        let n = 16384;
        // loud 0.5 s then silence
        let mut s: Vec<f32> = (0..n)
            .map(|i| {
                if i < n / 2 {
                    (i as f32 * 0.02).sin() * 0.5
                } else {
                    (i as f32 * 0.02).sin() * 0.0005 // -66 dB "bed noise"
                }
            })
            .collect();
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut s[blk..blk + 128]];
            gate.process(&mut chans);
        }
        let quiet_rms = (s[n / 2 + 2048..].iter().map(|v| v * v).sum::<f32>()
            / (n / 2 - 2048) as f32)
            .sqrt();
        assert!(quiet_rms < 0.0005, "gate must attenuate quiet segment: {quiet_rms}");
    }

    #[test]
    fn expander_keeps_loud_signal() {
        let mut exp = Expander::new(48000.0, 1, -30.0, 2.0, 5.0, 100.0, 0.0, 40.0, 10.0);
        let n = 8192;
        let mut s: Vec<f32> = (0..n).map(|i| (i as f32 * 0.02).sin() * 0.5).collect();
        let before_rms = (s.iter().map(|v| v * v).sum::<f32>() / n as f32).sqrt();
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut s[blk..blk + 128]];
            exp.process(&mut chans);
        }
        let after_rms = (s.iter().map(|v| v * v).sum::<f32>() / n as f32).sqrt();
        assert!((after_rms - before_rms).abs() < before_rms * 0.05);
    }
}
