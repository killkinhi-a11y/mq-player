//! Phaser — cascaded first-order all-pass filters with LFO-modulated corner
//! frequency and feedback.

use super::lfo::{Lfo, LfoShape};
use crate::Processor;
use crate::flush_denormal;

#[derive(Clone)]
struct AllPass {
    a: f32,  // coefficient
    x1: f32,
    y1: f32,
}

impl AllPass {
    fn new() -> Self {
        Self { a: 0.5, x1: 0.0, y1: 0.0 }
    }

    #[inline]
    fn process(&mut self, x: f32) -> f32 {
        let y = -self.a * x + self.x1 + self.a * self.y1;
        self.x1 = x;
        self.y1 = y;
        y
    }

    fn set_coef(&mut self, a: f32) {
        self.a = a.clamp(-0.95, 0.95);
    }
}

pub struct Phaser {
    stages: usize,
    banks: Vec<Vec<AllPass>>, // per channel
    lfo: Lfo,
    feedback: f32,
    mix: f32,
    sample_rate: f32,
    base_freq: f32,
    sweep_octaves: f32,
    last_out: Vec<f32>,
    enabled: bool,
}

impl Phaser {
    pub fn new(sample_rate: f32, channels: usize, stages: usize) -> Self {
        let stages = stages.clamp(2, 12);
        Self {
            stages,
            banks: (0..channels).map(|_| (0..stages).map(|_| AllPass::new()).collect()).collect(),
            lfo: Lfo::new(sample_rate, 0.4, 1.0, LfoShape::Sine),
            feedback: 0.4,
            mix: 0.5,
            sample_rate,
            base_freq: 300.0,
            sweep_octaves: 3.0,
            last_out: vec![0.0; channels],
            enabled: true,
        }
    }

    pub fn set_rate(&mut self, hz: f32) {
        self.lfo.set_rate(hz);
    }
    pub fn set_stages(&mut self, n: usize) {
        let n = n.clamp(2, 12);
        self.stages = n;
        for bank in self.banks.iter_mut() {
            bank.resize(n, AllPass::new());
        }
    }
    pub fn set_feedback(&mut self, fb: f32) {
        self.feedback = fb.clamp(0.0, 0.9);
    }
    pub fn set_mix(&mut self, m: f32) {
        self.mix = m.clamp(0.0, 1.0);
    }
    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }

    #[inline]
    fn allpass_coef(&self, freq: f32) -> f32 {
        // first-order all-pass: a = (tan(π f / fs) − 1) / (tan(π f / fs) + 1)
        let t = (std::f32::consts::PI * freq / self.sample_rate).tan();
        (t - 1.0) / (t + 1.0)
    }
}

impl Processor for Phaser {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled || channels.is_empty() {
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let mix = self.mix;
        let fb = self.feedback;
        for i in 0..frames {
            let m = 0.5 + 0.5 * self.lfo.tick(); // 0..1
            let freq = self.base_freq * (2.0_f32).powf((m - 0.5) * self.sweep_octaves);
            let coef = self.allpass_coef(freq.clamp(20.0, 8000.0));
            for (c, ch) in channels.iter_mut().enumerate() {
                let x_in = ch[i] + self.last_out[c] * fb;
                let mut y = x_in;
                for ap in self.banks[c].iter_mut().take(self.stages) {
                    ap.set_coef(coef);
                    y = ap.process(y);
                }
                let mut lo = y;
                flush_denormal(&mut lo);
                self.last_out[c] = y;
                ch[i] = ch[i] * (1.0 - mix) + y * mix;
            }
        }
    }

    fn reset(&mut self) {
        for bank in self.banks.iter_mut() {
            for ap in bank.iter_mut() {
                ap.x1 = 0.0;
                ap.y1 = 0.0;
            }
        }
        self.lfo.reset();
        self.last_out.fill(0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn phaser_zero_mix_bypass() {
        let mut p = Phaser::new(48000.0, 2, 6);
        p.set_mix(0.0);
        let mut l = vec![0.4_f32; 4096];
        let mut r = vec![-0.4_f32; 4096];
        let before = (l.clone(), r.clone());
        for blk in (0..4096).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            p.process(&mut chans);
        }
        for (a, b) in l.iter().zip(before.0.iter()) {
            assert!((a - b).abs() < 1e-5);
        }
    }

    #[test]
    fn phaser_notches_move() {
        // Broadband (deterministic LCG noise) — notches always cut energy.
        let mut p = Phaser::new(48000.0, 1, 8);
        p.set_mix(1.0);
        p.set_rate(1.0);
        let n = 48000;
        let mut seed = 12345_u32;
        let mut s: Vec<f32> = (0..n)
            .map(|_| {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                ((seed >> 16) as f32 / 32768.0 - 1.0) * 0.5
            })
            .collect();
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut s[blk..blk + 128]];
            p.process(&mut chans);
        }
        let rms = |v: &[f32]| (v.iter().map(|x| x * x).sum::<f32>() / v.len() as f32).sqrt();
        let first = rms(&s[..4800]);
        let mid = rms(&s[24000..28800]);
        let last = rms(&s[43200..]);
        assert!(
            (first - mid).abs() > 0.005 || (first - last).abs() > 0.005,
            "moving notches must modulate broadband level: {first} vs {mid} vs {last}"
        );
        for v in s.iter() {
            assert!(v.is_finite());
        }
    }
}
