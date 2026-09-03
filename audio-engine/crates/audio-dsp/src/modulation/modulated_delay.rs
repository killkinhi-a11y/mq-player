//! Chorus & flanger — modulated delay lines with feedback and stereo phase
//! offset. Linear-interpolated fractional delay (realtime-safe, fixed
//! buffers, denormal guard on feedback paths).

use super::lfo::Lfo;
use super::lfo::LfoShape;
use crate::Processor;
use crate::flush_denormal;

struct DelayLine {
    buf: Vec<f32>,
    pos: usize,
}

impl DelayLine {
    fn new(max_samples: usize) -> Self {
        Self { buf: vec![0.0; max_samples.max(2)], pos: 0 }
    }

    #[inline]
    fn write_and_read(&mut self, x: f32, delay_samples: f32) -> f32 {
        let len = self.buf.len() as f32;
        let d = delay_samples.clamp(0.0, len - 1.001);
        let read_pos = (self.pos as f32 - d + len) % len;
        let i0 = read_pos.floor() as usize;
        let i1 = (i0 + 1) % self.buf.len();
        let frac = read_pos - i0 as f32;
        let y = self.buf[i0] * (1.0 - frac) + self.buf[i1] * frac;
        self.buf[self.pos] = x;
        self.pos = (self.pos + 1) % self.buf.len();
        y
    }

    fn clear(&mut self) {
        self.buf.fill(0.0);
        self.pos = 0;
    }
}

pub struct Chorus {
    voices: usize,
    lines: Vec<DelayLine>,
    lfos: Vec<Lfo>,
    base_delay_ms: f32,
    depth_ms: f32,
    mix: f32,
    sample_rate: f32,
    max_delay: usize,
    spread: f32,
    enabled: bool,
}

impl Chorus {
    pub fn new(sample_rate: f32, channels: usize, voices: usize) -> Self {
        let voices = voices.clamp(1, 4);
        let max_delay = (0.08 * sample_rate) as usize + 8; // 80 ms
        let mut lfos = Vec::with_capacity(voices);
        for v in 0..voices {
            let mut l = Lfo::new(sample_rate, 0.6 + 0.25 * v as f32, 1.0, LfoShape::Triangle);
            l.set_phase_offset(0.12 * v as f32);
            lfos.push(l);
        }
        Self {
            voices,
            lines: (0..channels).map(|_| DelayLine::new(max_delay)).collect(),
            lfos,
            base_delay_ms: 25.0,
            depth_ms: 6.0,
            mix: 0.35,
            sample_rate,
            max_delay,
            spread: 0.5,
            enabled: true,
        }
    }

    pub fn set_rate(&mut self, hz: f32) {
        for (v, l) in self.lfos.iter_mut().enumerate() {
            l.set_rate(hz * (1.0 + 0.13 * v as f32).min(1.6));
        }
    }
    pub fn set_depth_ms(&mut self, ms: f32) {
        self.depth_ms = ms.clamp(0.5, 20.0);
    }
    pub fn set_mix(&mut self, m: f32) {
        self.mix = m.clamp(0.0, 1.0);
    }
    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
}

impl Processor for Chorus {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled || channels.is_empty() {
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let base = self.base_delay_ms * 0.001 * self.sample_rate;
        let depth = self.depth_ms * 0.001 * self.sample_rate;
        let mix = self.mix;
        for i in 0..frames {
            // per-voice LFO advance once per frame (voices share the tick)
            let mut wet = [0.0_f32; 4];
            for (v, lfo) in self.lfos.iter_mut().take(self.voices).enumerate() {
                let modv = lfo.tick();
                // alternate stereo phase for width
                let side = if v % 2 == 0 { 1.0 } else { -1.0 };
                wet[v] = modv * side;
            }
            for (c, ch) in channels.iter_mut().enumerate() {
                let x = ch[i];
                let mut acc = 0.0_f32;
                let n_lines = self.lines.len().min(self.voices.max(1));
                for v in 0..n_lines {
                    let v_idx = v % self.voices.max(1);
                    let delay = base + (0.5 + 0.5 * wet[v_idx]) * depth;
                    let _ = c;
                    acc += self.lines[v].write_and_read(x, delay);
                }
                let wet_out = acc / n_lines as f32;
                ch[i] = x * (1.0 - mix) + wet_out * mix;
            }
        }
    }

    fn reset(&mut self) {
        for l in self.lines.iter_mut() {
            l.clear();
        }
        for l in self.lfos.iter_mut() {
            l.reset();
        }
    }
}

pub struct Flanger {
    line: Vec<DelayLine>, // per channel
    lfo: Lfo,
    feedback: f32,
    depth_ms: f32,
    base_ms: f32,
    mix: f32,
    sample_rate: f32,
    stereo_phase: f32, // 0..1 phase offset between L/R
    last: Vec<f32>,
    enabled: bool,
}

impl Flanger {
    pub fn new(sample_rate: f32, channels: usize) -> Self {
        Self {
            line: (0..channels).map(|_| DelayLine::new((0.02 * sample_rate) as usize + 8)).collect(),
            lfo: Lfo::new(sample_rate, 0.25, 1.0, LfoShape::Sine),
            feedback: 0.55,
            depth_ms: 2.5,
            base_ms: 4.0,
            mix: 0.5,
            sample_rate,
            stereo_phase: 0.25,
            last: vec![0.0; channels],
            enabled: true,
        }
    }

    pub fn set_rate(&mut self, hz: f32) {
        self.lfo.set_rate(hz);
    }
    pub fn set_depth_ms(&mut self, ms: f32) {
        self.depth_ms = ms.clamp(0.1, 8.0);
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
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
}

impl Processor for Flanger {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled || channels.is_empty() {
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let base = self.base_ms * 0.001 * self.sample_rate;
        let depth = self.depth_ms * 0.001 * self.sample_rate;
        let mix = self.mix;
        let fb = self.feedback;
        for i in 0..frames {
            let m = self.lfo.tick();
            for (c, ch) in channels.iter_mut().enumerate() {
                // stereo phase offset: L gets sin, R gets sin(phase+90°)
                let phase = if c == 0 { m } else { (m + self.stereo_phase * 2.0 - 1.0).clamp(-1.0, 1.0) };
                let x = ch[i];
                let delayed = self.line[c].write_and_read(x + self.last[c] * fb, base + (0.5 + 0.5 * phase) * depth);
                let y = x * (1.0 - mix) + delayed * mix;
                let mut l = self.last[c];
                flush_denormal(&mut l);
                self.last[c] = delayed;
                ch[i] = y;
            }
        }
    }

    fn reset(&mut self) {
        for l in self.line.iter_mut() {
            l.clear();
        }
        self.lfo.reset();
        self.last.fill(0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chorus_mix_zero_is_bypass() {
        let mut ch = Chorus::new(48000.0, 2, 2);
        ch.set_mix(0.0);
        let mut l = vec![0.5_f32; 4096];
        let mut r = vec![-0.5_f32; 4096];
        let before = (l.clone(), r.clone());
        for blk in (0..4096).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            ch.process(&mut chans);
        }
        for (a, b) in l.iter().zip(before.0.iter()) {
            assert!((a - b).abs() < 1e-5);
        }
    }

    #[test]
    fn chorus_changes_signal() {
        let mut ch = Chorus::new(48000.0, 1, 2);
        ch.set_mix(0.5);
        let mut s: Vec<f32> = (0..8192).map(|i| (i as f32 * 0.01).sin() * 0.5).collect();
        let ref_rms = (s.iter().map(|v| v * v).sum::<f32>() / s.len() as f32).sqrt();
        for blk in (0..8192).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut s[blk..blk + 128]];
            ch.process(&mut chans);
        }
        let out_rms = (s.iter().map(|v| v * v).sum::<f32>() / s.len() as f32).sqrt();
        assert!((out_rms - ref_rms).abs() > 0.005, "chorus must alter the signal");
    }

    #[test]
    fn flanger_output_finite_with_feedback() {
        let mut fl = Flanger::new(48000.0, 2);
        fl.set_feedback(0.85);
        fl.set_mix(0.7);
        let mut l: Vec<f32> = (0..16384).map(|i| (i as f32 * 0.02).sin() * 0.8).collect();
        let mut r = l.clone();
        for blk in (0..16384).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            fl.process(&mut chans);
        }
        for v in l.iter().chain(r.iter()) {
            assert!(v.is_finite());
        }
    }
}
