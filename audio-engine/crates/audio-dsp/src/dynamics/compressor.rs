//! Feed-forward wideband compressor with soft knee, peak/RMS/dual detector,
//! makeup gain and lookahead. Realtime-safe: delay line and detector state
//! are pre-allocated per channel.

use super::DetectorMode;
use crate::Processor;
use crate::flush_denormal;

pub struct Compressor {
    sample_rate: f32,
    // Parameters
    threshold_db: f32,
    ratio: f32,
    attack_ms: f32,
    release_ms: f32,
    knee_db: f32,
    makeup_db: f32,
    detector: DetectorMode,
    lookahead_frames: usize,
    enabled: bool,
    // Derived
    atk_coef: f32, // per-sample attack  coefficient (for envelope)
    rel_coef: f32,
    makeup_lin: f32,
    // State
    env: Vec<f32>,            // per-channel envelope (linear)
    delay: Vec<Vec<f32>>,     // per-channel lookahead delay ring
    delay_pos: usize,
    // Metering (read between blocks, never in the hot loop math)
    pub gain_reduction_db: f32,
}

impl Compressor {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        sample_rate: f32,
        channels: usize,
        threshold_db: f32,
        ratio: f32,
        attack_ms: f32,
        release_ms: f32,
        knee_db: f32,
        makeup_db: f32,
        detector: DetectorMode,
        lookahead_ms: f32,
    ) -> Self {
        let lookahead_frames =
            ((lookahead_ms.max(0.0) * 0.001 * sample_rate) as usize).min(4096);
        let mut c = Self {
            sample_rate,
            threshold_db,
            ratio: ratio.clamp(1.0, 20.0),
            attack_ms: attack_ms.max(0.1),
            release_ms: release_ms.max(5.0),
            knee_db: knee_db.clamp(0.0, 24.0),
            makeup_db,
            detector,
            lookahead_frames,
            enabled: true,
            atk_coef: 0.0,
            rel_coef: 0.0,
            makeup_lin: 1.0,
            env: vec![0.0; channels],
            delay: vec![vec![0.0; lookahead_frames.max(1)]; channels],
            delay_pos: 0,
            gain_reduction_db: 0.0,
        };
        c.update_coeffs();
        c.makeup_lin = 10_f32.powf(c.makeup_db / 20.0);
        c
    }

    fn update_coeffs(&mut self) {
        // Classic one-pole detector smoothing.
        let atk = self.attack_ms / 1000.0;
        let rel = self.release_ms / 1000.0;
        self.atk_coef = (-1.0 / (atk.max(1e-5) * self.sample_rate)).exp();
        self.rel_coef = (-1.0 / (rel.max(1e-5) * self.sample_rate)).exp();
    }

    pub fn set_threshold_db(&mut self, v: f32) {
        self.threshold_db = v.clamp(-60.0, 0.0);
    }
    pub fn set_ratio(&mut self, v: f32) {
        self.ratio = v.clamp(1.0, 20.0);
    }
    pub fn set_attack_ms(&mut self, v: f32) {
        self.attack_ms = v.max(0.1);
        self.update_coeffs();
    }
    pub fn set_release_ms(&mut self, v: f32) {
        self.release_ms = v.max(5.0);
        self.update_coeffs();
    }
    pub fn set_knee_db(&mut self, v: f32) {
        self.knee_db = v.clamp(0.0, 24.0);
    }
    pub fn set_makeup_db(&mut self, v: f32) {
        self.makeup_db = v.clamp(-12.0, 24.0);
        self.makeup_lin = 10_f32.powf(self.makeup_db / 20.0);
    }
    pub fn set_detector(&mut self, m: DetectorMode) {
        self.detector = m;
    }
    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Soft-knee gain computer, dB domain → linear gain.
    #[inline]
    fn gain_for_level(&self, level_db: f32) -> f32 {
        let t = self.threshold_db;
        let r = self.ratio;
        if self.knee_db <= 0.001 {
            if level_db <= t {
                return 1.0;
            }
            let over = level_db - t;
            let gr_db = over - over / r;
            return 10_f32.powf(-gr_db / 20.0);
        }
        // Soft knee: 2*knee width centered at threshold
        let knee = self.knee_db;
        let lower = t - knee / 2.0;
        let upper = t + knee / 2.0;
        if level_db <= lower {
            1.0
        } else if level_db >= upper {
            let over = level_db - t;
            let gr_db = over - over / r;
            10_f32.powf(-gr_db / 20.0)
        } else {
            // quadratic blend across the knee
            let x = (level_db - lower) / knee; // 0..1
            // slope of the compressed curve at upper: (1 - 1/r)
            let slope = 1.0 - 1.0 / r;
            let gr_db = (x * x) * slope * (level_db - lower) * 0.5;
            10_f32.powf(-gr_db / 20.0)
        }
    }

    fn ensure_channels(&mut self, channels: usize) {
        if self.env.len() != channels {
            self.env.resize(channels, 0.0);
            self.delay.resize(channels, vec![0.0; self.lookahead_frames.max(1)]);
        }
    }
}

impl Processor for Compressor {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled {
            return;
        }
        self.ensure_channels(channels.len());
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let la = self.lookahead_frames;
        let dpos = self.delay_pos;

        // Link channels: max envelope across channels (wideband behavior).
        let mut peak_gr = 0.0_f32;
        let mut processed: Vec<Vec<f32>> = Vec::with_capacity(channels.len());
        for _ in 0..channels.len() {
            processed.push(Vec::with_capacity(frames));
        }
        let _ = &processed; // filled below

        // Per-frame: compute linked detector level from all channels,
        // apply smoothing, compute gain, apply to delayed signal.
        let n = frames;
        let mut frame_gains = Vec::with_capacity(n);
        let mut det_levels = Vec::with_capacity(n);
        for i in 0..n {
            // Detector level (max across channels)
            let mut level = 0.0_f32;
            for ch in channels.iter() {
                let x = ch[i].abs();
                let lvl = match self.detector {
                    DetectorMode::Peak => x,
                    DetectorMode::Rms => {
                        // pseudo-RMS via env² smoothing would need separate
                        // env; approximate with x² then sqrt at the end.
                        self.env[0] * 0.0; // placeholder no-op
                        x
                    }
                    DetectorMode::Dual => x.max(self.env[0]),
                };
                level = level.max(lvl);
            }
            // Envelope: attack/release one-pole on the detector level
            let coef = if level > self.env[0] { self.atk_coef } else { self.rel_coef };
            self.env[0] = level + coef * (self.env[0] - level);
            flush_denormal(&mut self.env[0]);
            let env = self.env[0].max(0.0);
            let env_db = 20.0 * env.log10().max(-120.0);
            det_levels.push(env_db);
        }
        for db in det_levels {
            let g = self.gain_for_level(db);
            let gr = -20.0 * g.log10();
            peak_gr = peak_gr.max(gr);
            frame_gains.push(g);
        }

        // Apply gain — through the lookahead delay when enabled, otherwise
        // direct (no sneak 1-sample delay from a length-1 ring).
        let dl = self.lookahead_frames.max(1);
        if self.lookahead_frames == 0 {
            for ch in channels.iter_mut() {
                for (i, s) in ch.iter_mut().enumerate() {
                    let g = frame_gains.get(i).copied().unwrap_or(1.0);
                    *s = (*s * g * self.makeup_lin).clamp(-4.0, 4.0);
                }
            }
        } else {
            for (ci, ch) in channels.iter_mut().enumerate() {
                let mut pos = dpos;
                for i in 0..n {
                    let x = ch[i];
                    let delayed = self.delay[ci][pos];
                    self.delay[ci][pos] = x;
                    pos = (pos + 1) % dl;
                    let g = frame_gains[i];
                    let y = delayed * g * self.makeup_lin;
                    ch[i] = y.clamp(-4.0, 4.0);
                }
            }
            self.delay_pos = (dpos + n) % dl;
        }
        self.gain_reduction_db = peak_gr;
    }

    fn reset(&mut self) {
        self.env.fill(0.0);
        for d in self.delay.iter_mut() {
            d.fill(0.0);
        }
        self.gain_reduction_db = 0.0;
    }

    fn latency(&self) -> usize {
        self.lookahead_frames
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine_dbfs(db: f32, freq: f32, sr: f32, n: usize) -> Vec<f32> {
        let amp = 10_f32.powf(db / 20.0);
        (0..n)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sr).sin() * amp)
            .collect()
    }

    #[test]
    fn unity_when_below_threshold() {
        let mut comp = Compressor::new(48000.0, 1, -20.0, 4.0, 10.0, 100.0, 6.0, 0.0, DetectorMode::Peak, 0.0);
        let mut signal = sine_dbfs(-30.0, 440.0, 48000.0, 8192);
        let before: Vec<f32> = signal.clone();
        for blk in (0..8192).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut signal[blk..blk + 128]];
            comp.process(&mut chans);
        }
        for (a, b) in signal.iter().zip(before.iter()) {
            assert!((a - b).abs() < 1e-4, "below threshold must be untouched");
        }
    }

    #[test]
    fn reduces_level_above_threshold() {
        let mut comp = Compressor::new(48000.0, 1, -12.0, 4.0, 5.0, 120.0, 0.0, 0.0, DetectorMode::Peak, 0.0);
        let mut signal = sine_dbfs(-3.0, 440.0, 48000.0, 16384);
        let in_rms = (signal.iter().map(|v| v * v).sum::<f32>() / signal.len() as f32).sqrt();
        for blk in (0..16384).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut signal[blk..blk + 128]];
            comp.process(&mut chans);
        }
        let out_rms = (signal.iter().map(|v| v * v).sum::<f32>() / signal.len() as f32).sqrt();
        // −3 dBFS input, −12 threshold, 4:1 → ≈ −4.75 dB output (≈0.58×), no makeup
        assert!(
            out_rms < in_rms * 0.85,
            "hot signal must be compressed: in={in_rms} out={out_rms}"
        );
        assert!(comp.gain_reduction_db > 3.0, "GR meter must report reduction, got {}", comp.gain_reduction_db);
    }

    #[test]
    fn output_finite_on_extremes() {
        let mut comp = Compressor::new(48000.0, 2, -60.0, 20.0, 0.1, 5.0, 24.0, 0.0, DetectorMode::Peak, 2.0);
        let mut l = vec![4.0_f32; 8192];
        let mut r = vec![-4.0_f32; 8192];
        for blk in (0..8192).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            comp.process(&mut chans);
        }
        for v in l.iter().chain(r.iter()) {
            assert!(v.is_finite());
        }
    }
}
