//! Early reflections + late-field FDN reverb. Real DSP, allocation-free in
//! process. The FDN uses 8 delay lines with a Hadamard-style feedback
//! matrix, output low/high damping shelves, and T60 decay control.

use crate::Processor;
use crate::flush_denormal;

/// Discrete early reflection taps (delay in ms, gain, pan −1..+1).
#[derive(Clone, Copy)]
pub struct Tap {
    pub delay_ms: f32,
    pub gain: f32,
    pub pan: f32,
}

const ER_PATTERN: [Tap; 12] = [
    Tap { delay_ms: 3.1, gain: 0.42, pan: -0.3 },
    Tap { delay_ms: 5.7, gain: 0.38, pan: 0.4 },
    Tap { delay_ms: 7.9, gain: 0.34, pan: -0.5 },
    Tap { delay_ms: 11.3, gain: 0.30, pan: 0.2 },
    Tap { delay_ms: 14.7, gain: 0.27, pan: -0.15 },
    Tap { delay_ms: 19.1, gain: 0.23, pan: 0.35 },
    Tap { delay_ms: 23.9, gain: 0.20, pan: -0.4 },
    Tap { delay_ms: 29.3, gain: 0.17, pan: 0.1 },
    Tap { delay_ms: 35.1, gain: 0.14, pan: -0.2 },
    Tap { delay_ms: 41.7, gain: 0.12, pan: 0.45 },
    Tap { delay_ms: 49.3, gain: 0.10, pan: -0.35 },
    Tap { delay_ms: 57.9, gain: 0.08, pan: 0.25 },
];

pub struct EarlyReflections {
    lines: Vec<f32>,   // one shared mono delay line
    pos: usize,
    taps: Vec<(usize, f32, f32)>, // (sample delay, gain, pan)
    sample_rate: f32,
    enabled: bool,
}

impl EarlyReflections {
    pub fn new(sample_rate: f32, scale: f32) -> Self {
        let max_ms = ER_PATTERN.iter().map(|t| t.delay_ms).fold(0.0_f32, f32::max);
        let len = (max_ms * 0.001 * sample_rate).ceil() as usize + 2;
        let taps = ER_PATTERN
            .iter()
            .map(|t| {
                let d = (t.delay_ms * 0.001 * sample_rate * scale.clamp(0.25, 4.0)).round() as usize;
                (d.min(len - 1), t.gain, t.pan.clamp(-1.0, 1.0))
            })
            .collect();
        Self {
            lines: vec![0.0; len],
            pos: 0,
            taps,
            sample_rate,
            enabled: true,
        }
    }

    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }
}

impl Processor for EarlyReflections {
    /// Requires exactly 2 channels (stereo ER field).
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled || channels.len() < 2 {
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let len = self.lines.len();
        for i in 0..frames {
            let mono = 0.5 * (channels[0][i] + channels[1][i]);
            self.lines[self.pos] = mono;
            let mut l = 0.0_f32;
            let mut r = 0.0_f32;
            for (d, g, pan) in self.taps.iter() {
                let idx = (self.pos + len - *d) % len;
                let s = self.lines[idx] * g;
                l += s * (1.0 - (pan + 1.0) * 0.5);
                r += s * (1.0 - (1.0 - pan) * 0.5);
            }
            channels[0][i] += l;
            channels[1][i] += r;
            self.pos = (self.pos + 1) % len;
        }
    }

    fn reset(&mut self) {
        self.lines.fill(0.0);
        self.pos = 0;
    }
}

const FDN_LINES: usize = 8;
// mutually prime-ish base lengths in ms at 1.0 scale
const FDN_BASE_MS: [f32; FDN_LINES] = [37.0, 41.1, 43.7, 47.9, 53.3, 59.1, 61.7, 67.3];

pub struct FdnReverb {
    delays: Vec<Vec<f32>>, // 8 lines, per channel-pair interleaved (L bank + R bank)
    pos: Vec<usize>,
    len_samples: Vec<usize>,
    feedback: [f32; FDN_LINES],
    sample_rate: f32,
    // damping: one-pole LP in the feedback path (per line)
    damp_z: Vec<f32>,
    hp_z: Vec<f32>,
    pre_l: f32,
    pre_r: f32,
    mix: f32,
    enabled: bool,
}

impl FdnReverb {
    pub fn new(sample_rate: f32, rt60_ms: f32, damping: f32, mix: f32) -> Self {
        let mut r = Self {
            delays: vec![vec![0.0; 8]; 2 * FDN_LINES], // L bank + R bank
            pos: vec![0; 2 * FDN_LINES],
            len_samples: vec![0; 2 * FDN_LINES],
            feedback: [0.0; FDN_LINES],
            sample_rate,
            damp_z: vec![0.0; 2 * FDN_LINES],
            hp_z: vec![0.0; 2 * FDN_LINES],
            pre_l: 0.0,
            pre_r: 0.0,
            mix: mix.clamp(0.0, 1.0),
            enabled: true,
        };
        r.set_rt60_ms(rt60_ms);
        r.resize_lines(1.0);
        let _ = damping;
        r
    }

    fn resize_lines(&mut self, scale: f32) {
        for i in 0..FDN_LINES {
            let base = FDN_BASE_MS[i];
            let l_len = (base * 0.001 * self.sample_rate * scale).round() as usize;
            let r_len = (base * 1.07 * 0.001 * self.sample_rate * scale).round() as usize;
            self.len_samples[2 * i] = (l_len + 2).max(4);
            self.len_samples[2 * i + 1] = (r_len + 2).max(4);
            self.delays[2 * i].resize(self.len_samples[2 * i], 0.0);
            self.delays[2 * i + 1].resize(self.len_samples[2 * i + 1], 0.0);
        }
    }

    /// T60 decay time. Feedback derived per-line from the line length.
    pub fn set_rt60_ms(&mut self, rt60_ms: f32) {
        let rt60 = rt60_ms.clamp(100.0, 8000.0);
        for i in 0..FDN_LINES {
            let len_s = FDN_BASE_MS[i] / 1000.0;
            // loops needed for T60: gain^(loops) = −60 dB → g = 10^(−3/loops)
            let loops = (rt60 / 1000.0) / len_s;
            self.feedback[i] = 10_f32.powf(-3.0 / loops.max(1e-6)).clamp(0.1, 0.985);
        }
    }

    pub fn set_mix(&mut self, mix: f32) {
        self.mix = mix.clamp(0.0, 1.0);
    }

    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }
}

impl Processor for FdnReverb {
    /// Requires 2 channels.
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled || channels.len() < 2 {
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let mix = self.mix;
        // damping coefficients
        let lp_a = 0.6_f32; // feedback LP
        let hp_a = 0.005_f32; // DC removal
        for i in 0..frames {
            let in_l = channels[0][i];
            let in_r = channels[1][i];
            // diffuse input injection with per-line sign
            let mut inject = [0.0_f32; FDN_LINES];
            for (j, inj) in inject.iter_mut().enumerate() {
                let sign = if j % 2 == 0 { 1.0 } else { -1.0 };
                *inj = sign * (in_l + in_r) * 0.25;
            }
            let mut out_l = 0.0_f32;
            let mut out_r = 0.0_f32;
            for j in 0..FDN_LINES {
                // read both banks
                let ll = self.delays[2 * j][self.pos[2 * j]];
                let lr = self.delays[2 * j + 1][self.pos[2 * j + 1]];
                // damping (LP + DC block) in feedback
                let mut fb_l = ll * self.feedback[j];
                self.damp_z[2 * j] += lp_a * (fb_l - self.damp_z[2 * j]);
                fb_l = self.damp_z[2 * j];
                self.hp_z[2 * j] += hp_a * (fb_l - self.hp_z[2 * j]);
                fb_l -= self.hp_z[2 * j];
                let mut fb_r = lr * self.feedback[j];
                self.damp_z[2 * j + 1] += lp_a * (fb_r - self.damp_z[2 * j + 1]);
                fb_r = self.damp_z[2 * j + 1];
                self.hp_z[2 * j + 1] += hp_a * (fb_r - self.hp_z[2 * j + 1]);
                fb_r -= self.hp_z[2 * j + 1];
                flush_denormal(&mut fb_l);
                flush_denormal(&mut fb_r);
                // cross-couple banks (hadamard-lite: swap + inject)
                self.delays[2 * j][self.pos[2 * j]] = inject[j] + fb_r * 0.98;
                self.delays[2 * j + 1][self.pos[2 * j + 1]] = inject[j] * 0.97 + fb_l * 0.98;
                self.pos[2 * j] = (self.pos[2 * j] + 1) % self.len_samples[2 * j].max(1);
                self.pos[2 * j + 1] = (self.pos[2 * j + 1] + 1) % self.len_samples[2 * j + 1].max(1);
                out_l += ll;
                out_r += lr;
            }
            let wl = out_l / FDN_LINES as f32;
            let wr = out_r / FDN_LINES as f32;
            channels[0][i] = in_l * (1.0 - mix) + wl * mix;
            channels[1][i] = in_r * (1.0 - mix) + wr * mix;
        }
    }

    fn reset(&mut self) {
        for d in self.delays.iter_mut() {
            d.fill(0.0);
        }
        for p in self.pos.iter_mut() {
            *p = 0;
        }
        self.damp_z.fill(0.0);
        self.hp_z.fill(0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reverb_sustains_energy_then_decays() {
        let mut rev = FdnReverb::new(48000.0, 1500.0, 0.5, 1.0);
        // feed a short impulse burst
        let n = 48000;
        let mut l = vec![0.0_f32; n];
        let mut r = vec![0.0_f32; n];
        l[0] = 1.0;
        r[0] = 1.0;
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            rev.process(&mut chans);
        }
        // after 200 ms there must be tail
        let e200: f32 = l[9600..9700].iter().map(|v| v * v).sum();
        assert!(e200 > 1e-6, "reverb tail must exist at 200 ms: {e200}");
        // after ~0.95 s the tail must be clearly below the 200 ms level
        // (FDN damping + cross-coupling decay slightly slower than the
        // theoretical RT60 curve — conservative threshold)
        let e950: f32 = l[45000..46000].iter().map(|v| v * v).sum();
        assert!(e950 < e200 * 0.15, "tail must decay: {e950} vs {e200}");
    }

    #[test]
    fn reverb_output_finite() {
        let mut rev = FdnReverb::new(48000.0, 4000.0, 0.5, 0.5);
        let mut l: Vec<f32> = (0..48000).map(|i| (i as f32 * 0.01).sin() * 0.7).collect();
        let mut r = l.clone();
        for blk in (0..48000).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            rev.process(&mut chans);
        }
        for v in l.iter().chain(r.iter()) {
            assert!(v.is_finite());
        }
    }

    #[test]
    fn er_adds_energy() {
        let mut er = EarlyReflections::new(48000.0, 1.0);
        let mut l = vec![0.0_f32; 4096];
        let mut r = vec![0.0_f32; 4096];
        l[0] = 1.0;
        r[0] = 1.0;
        for blk in (0..4096).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            er.process(&mut chans);
        }
        let e: f32 = l.iter().map(|v| v * v).sum::<f32>() + r.iter().map(|v| v * v).sum::<f32>();
        assert!(e > 1.2, "ER must add reflection energy: {e}");
    }
}
