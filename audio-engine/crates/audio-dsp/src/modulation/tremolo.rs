//! Tremolo — amplitude modulation with selectable LFO shape + tempo sync.

use super::lfo::{Lfo, LfoShape, TempoSync};
use crate::Processor;

pub struct Tremolo {
    lfo: Lfo,
    depth: f32, // 0..1 (0 = none, 1 = full on→off)
    enabled: bool,
    sample_rate: f32,
}

impl Tremolo {
    pub fn new(sample_rate: f32, rate_hz: f32, depth: f32, shape: LfoShape) -> Self {
        Self {
            lfo: Lfo::new(sample_rate, rate_hz, 1.0, shape),
            depth: depth.clamp(0.0, 1.0),
            enabled: true,
            sample_rate,
        }
    }

    pub fn set_rate(&mut self, hz: f32) {
        self.lfo.set_rate(hz);
    }

    /// Sync to musical tempo.
    pub fn set_tempo(&mut self, bpm: f32, sync: TempoSync) {
        self.lfo.set_tempo(bpm, sync);
    }

    pub fn set_depth(&mut self, d: f32) {
        self.depth = d.clamp(0.0, 1.0);
    }

    pub fn set_shape(&mut self, s: LfoShape) {
        self.lfo.set_shape(s);
    }

    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }
}

impl Processor for Tremolo {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled || channels.is_empty() {
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let depth = self.depth;
        for i in 0..frames {
            let raw = self.lfo.tick(); // −1..1 (LFO constructed at depth 1.0)
            let g = 1.0 - depth * (1.0 - (0.5 + 0.5 * raw));
            for ch in channels.iter_mut() {
                ch[i] *= g;
            }
        }
    }

    fn reset(&mut self) {
        self.lfo.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tremolo_modulates_amplitude() {
        let mut t = Tremolo::new(48000.0, 2.0, 1.0, LfoShape::Sine);
        let n = 48000;
        let mut s: Vec<f32> = vec![0.5; n];
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut s[blk..blk + 128]];
            t.process(&mut chans);
        }
        // at 2 Hz over 1 s there must be a near-zero point and a near-full point
        let mn = s.iter().fold(1.0_f32, |a, v| a.min(v.abs()));
        let mx = s.iter().fold(0.0_f32, |a, v| a.max(v.abs()));
        assert!(mn < 0.05, "tremolo must dip low: {mn}");
        assert!(mx > 0.45, "tremolo must recover: {mx}");
    }

    #[test]
    fn depth_zero_is_identity() {
        let mut t = Tremolo::new(48000.0, 5.0, 0.0, LfoShape::Triangle);
        let mut s = vec![0.7_f32; 4096];
        let before = s.clone();
        for blk in (0..4096).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut s[blk..blk + 128]];
            t.process(&mut chans);
        }
        for (a, b) in s.iter().zip(before.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }
}
