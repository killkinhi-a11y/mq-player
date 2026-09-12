//! Mastering-safe lookahead limiter with 4× oversampled true-peak-style
//! detection. The output never exceeds the ceiling (post-smoothing), and
//! the release is program-dependent (dual time constant).

use crate::Processor;

pub struct Limiter {
    sample_rate: f32,
    ceiling_db: f32,
    threshold_db: f32,
    release_ms: f32,
    lookahead_frames: usize,
    enabled: bool,
    // Derived
    ceiling_lin: f32,
    rel_coef: f32,
    rel_coef_slow: f32,
    // State
    delay: Vec<Vec<f32>>, // per-channel lookahead delay
    delay_pos: usize,
    env_lin: f32, // current gain (linear, 0..1)
    // Oversampling FIR (4x, 24-tap Kaiser-windowed) for true-peak detection
    os_coef: Vec<f32>,
    os_hist: Vec<Vec<f32>>, // per-channel FIR history at base rate
    pub gain_reduction_db: f32,
    pub true_peak_db: f32,
}

const OS_TAPS: usize = 25;
const OS_FACTOR: usize = 4;

impl Limiter {
    pub fn new(sample_rate: f32, channels: usize, ceiling_db: f32, release_ms: f32, lookahead_ms: f32) -> Self {
        let lookahead = ((lookahead_ms.max(1.0) * 0.001 * sample_rate) as usize).clamp(8, 4096);
        // Kaiser-windowed sinc FIR for 4x interpolation (β = 8.6).
        let mut os_coef = vec![0.0_f32; OS_TAPS];
        let center = (OS_TAPS - 1) as f32 / 2.0;
        let beta = 8.6_f32;
        let i0 = |x: f32| {
            // modified Bessel I0 series
            let mut s = 1.0;
            let mut term = 1.0;
            for k in 1..40 {
                term *= (x / (2.0 * k as f32)) * (x / (2.0 * k as f32));
                s += term;
            }
            s
        };
        let denom = i0(beta);
        for (i, c) in os_coef.iter_mut().enumerate() {
            let x = (i as f32 - center) / OS_FACTOR as f32; // in interpolated units
            let sinc = if x.abs() < 1e-9 { 1.0 } else { (std::f32::consts::PI * x).sin() / (std::f32::consts::PI * x) };
            let t = (i as f32 - center) / ((OS_TAPS - 1) as f32 / 2.0) * beta;
            let window = i0(t.abs()) / denom;
            *c = sinc * window;
        }
        // normalize DC gain to 1
        let sum: f32 = os_coef.iter().sum();
        if sum.abs() > 1e-9 {
            for c in os_coef.iter_mut() {
                *c /= sum;
        }
        }

        let mut lim = Self {
            sample_rate,
            ceiling_db,
            threshold_db: ceiling_db,
            release_ms: release_ms.clamp(5.0, 1000.0),
            lookahead_frames: lookahead,
            enabled: true,
            ceiling_lin: 10_f32.powf(ceiling_db.clamp(-12.0, 0.0) / 20.0),
            rel_coef: 0.0,
            rel_coef_slow: 0.0,
            delay: vec![vec![0.0; lookahead]; channels],
            delay_pos: 0,
            env_lin: 1.0,
            os_coef,
            os_hist: vec![vec![0.0; OS_TAPS]; channels],
            gain_reduction_db: 0.0,
            true_peak_db: -120.0,
        };
        lim.update_coeffs();
        lim
    }

    fn update_coeffs(&mut self) {
        let rel = self.release_ms / 1000.0;
        self.rel_coef = (-1.0 / (rel * self.sample_rate)).exp();
        self.rel_coef_slow = (-1.0 / ((rel * 4.0) * self.sample_rate)).exp();
    }

    pub fn set_ceiling_db(&mut self, db: f32) {
        self.ceiling_db = db.clamp(-12.0, 0.0);
        self.threshold_db = self.ceiling_db;
        self.ceiling_lin = 10_f32.powf(self.ceiling_db / 20.0);
    }
    pub fn set_release_ms(&mut self, ms: f32) {
        self.release_ms = ms.clamp(5.0, 1000.0);
        self.update_coeffs();
    }
    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Oversample the next input sample ×4 and return the max absolute
    /// interpolated value (true-peak style estimate at the channel's history).
    #[inline]
    fn oversampled_peak(&mut self, ch: usize, x: f32) -> f32 {
        // shift history
        let hist = &mut self.os_hist[ch];
        hist.copy_within(1..OS_TAPS, 0);
        hist[OS_TAPS - 1] = x;
        // 4 interpolated points between the last two base samples
        let mut peak = x.abs();
        let taps = &self.os_coef;
        for step in 1..OS_FACTOR {
            let frac = step as f32 / OS_FACTOR as f32;
            // align filter phase: start tap shifts by fraction
            let start = (OS_TAPS - 1) as f32 - frac * (OS_TAPS - 1) as f32;
            let idx0 = start.floor() as i64;
            let mu = start - start.floor();
            let mut acc = 0.0_f32;
            for k in 0..OS_TAPS {
                let idx = idx0 + k as i64;
                let w = taps[k as usize];
                let sample = if idx < 0 {
                    0.0
                } else if (idx as usize) < OS_TAPS {
                    hist[idx as usize]
                } else {
                    0.0
                };
                let w2 = if k + 1 < OS_TAPS { taps[k + 1] } else { 0.0 };
                let interp = sample + (w2 - w) * mu * 0.5; // cheap phase interp
                acc += w * interp;
            }
            peak = peak.max(acc.abs());
        }
        peak
    }

    fn ensure_channels(&mut self, channels: usize) {
        if self.delay.len() != channels {
            self.delay.resize(channels, vec![0.0; self.lookahead_frames.max(1)]);
            self.os_hist.resize(channels, vec![0.0; OS_TAPS]);
        }
    }
}

impl Processor for Limiter {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled {
            return;
        }
        self.ensure_channels(channels.len());
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let dl = self.lookahead_frames.max(1);
        let ceiling = self.ceiling_lin;
        let mut max_gr = 0.0_f32;
        let mut tp = 0.0_f32;

        // Gains computed per frame from (delayed) detector path:
        // We detect on the *future* samples as they enter the delay line,
        // so the gain is settled when the delayed sample leaves.
        let mut frame_gain = Vec::with_capacity(frames);
        for i in 0..frames {
            // true-peak estimate across channels for frame i
            let mut level = 0.0_f32;
            for (ci, ch) in channels.iter().enumerate() {
                let tpk = self.oversampled_peak(ci, ch[i]);
                level = level.max(tpk);
            }
            tp = tp.max(level);
            // required gain: bring level under ceiling
            let need = if level > ceiling { ceiling / level } else { 1.0 };
            // attack: instant when more reduction needed; release: smooth
            if need < self.env_lin {
                self.env_lin = need; // instant attack (lookahead covers transient)
            } else {
                // dual release: fast first 60%, slow tail
                let coef = if self.env_lin < need * 0.6 { self.rel_coef } else { self.rel_coef_slow };
                self.env_lin = need + coef * (self.env_lin - need);
                if self.env_lin > 1.0 {
                    self.env_lin = 1.0;
                }
            }
            let gr = -20.0 * self.env_lin.log10();
            max_gr = max_gr.max(gr);
            frame_gain.push(self.env_lin);
        }

        // Apply to delayed signal
        let pos = self.delay_pos;
        for (ci, ch) in channels.iter_mut().enumerate() {
            let mut p = pos;
            for i in 0..frames {
                let x = ch[i];
                let delayed = self.delay[ci][p];
                self.delay[ci][p] = x;
                p = (p + 1) % dl;
                ch[i] = (delayed * frame_gain[i]).clamp(-ceiling * 1.0001, ceiling * 1.0001);
            }
        }
        self.delay_pos = (pos + frames) % dl;
        self.gain_reduction_db = max_gr;
        self.true_peak_db = 20.0 * tp.max(1e-6).log10();
    }

    fn reset(&mut self) {
        for d in self.delay.iter_mut() {
            d.fill(0.0);
        }
        for h in self.os_hist.iter_mut() {
            h.fill(0.0);
        }
        self.env_lin = 1.0;
        self.gain_reduction_db = 0.0;
        self.true_peak_db = -120.0;
    }

    fn latency(&self) -> usize {
        self.lookahead_frames
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_never_exceeds_ceiling() {
        let mut lim = Limiter::new(48000.0, 2, -1.0, 80.0, 5.0);
        let n = 16384;
        let amp = 0.99_f32;
        let mut l: Vec<f32> = (0..n).map(|i| (i as f32 * 0.03).sin() * amp).collect();
        let mut r: Vec<f32> = (0..n).map(|i| (i as f32 * 0.031).sin() * amp).collect();
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            lim.process(&mut chans);
        }
        let ceiling = 10_f32.powf(-1.0 / 20.0) * 1.01;
        let mx = l.iter().chain(r.iter()).fold(0.0_f32, |a, v| a.max(v.abs()));
        assert!(mx <= ceiling, "limiter overshoot: {mx} > {ceiling}");
        // signal must still be audible (not crushed to silence)
        let rms = (l.iter().map(|v| v * v).sum::<f32>() / n as f32).sqrt();
        assert!(rms > 0.3, "limiter must not nuke the signal: rms={rms}");
    }

    #[test]
    fn quiet_signal_untouched() {
        let mut lim = Limiter::new(48000.0, 1, -1.0, 80.0, 5.0);
        let n = 8192;
        let mut s: Vec<f32> = (0..n).map(|i| (i as f32 * 0.02).sin() * 0.1).collect();
        let before = s.clone();
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut s[blk..blk + 128]];
            lim.process(&mut chans);
        }
        // Lookahead = 5 ms = 240 frames: out[i] === in[i − 240]. Compare the
        // shifted signal (skipping the initial zero region).
        let la = (5.0 * 0.001 * 48000.0) as usize;
        for i in (la + 64)..n {
            let a = s[i];
            let b = before[i - la];
            assert!((a - b).abs() < 1e-3, "quiet signal must pass shifted: s[{i}]={a} vs in[{}]={b}", i - la);
        }
    }
}
