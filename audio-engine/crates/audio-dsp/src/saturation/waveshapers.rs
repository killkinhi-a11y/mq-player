//! Waveshapers: tube (asymmetric, triode-inspired) and transistor
//! (symmetric tanh soft clip). Drive/tone/bias/mix/output controls.
//! Oversampling is applied around the nonlinearity (aliasing control).

use crate::Processor;
use crate::saturation::oversampler::Oversampler;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SaturationKind {
    Tube,
    Transistor,
}

pub struct Waveshaper {
    kind: SaturationKind,
    drive: f32,   // 0..1
    bias: f32,    // −0.5..0.5 (tube asymmetry)
    tone: f32,    // 0..1: 0 = dark, 1 = bright
    mix: f32,     // 0..1 dry/wet
    output_db: f32,
    os: Oversampler,
    sample_rate: f32,
    enabled: bool,
}

impl Waveshaper {
    pub fn new(kind: SaturationKind, sample_rate: f32, channels: usize, oversample: usize) -> Self {
        Self {
            kind,
            drive: 0.3,
            bias: if kind == SaturationKind::Tube { 0.05 } else { 0.0 },
            tone: 0.5,
            mix: 1.0,
            output_db: 0.0,
            os: Oversampler::new(oversample, channels),
            sample_rate,
            enabled: true,
        }
    }

    pub fn set_drive(&mut self, d: f32) {
        self.drive = d.clamp(0.0, 1.0);
    }
    pub fn set_bias(&mut self, b: f32) {
        if self.kind == SaturationKind::Tube {
            self.bias = b.clamp(-0.5, 0.5);
        }
    }
    pub fn set_tone(&mut self, t: f32) {
        self.tone = t.clamp(0.0, 1.0);
    }
    pub fn set_mix(&mut self, m: f32) {
        self.mix = m.clamp(0.0, 1.0);
    }
    pub fn set_output_db(&mut self, db: f32) {
        self.output_db = db.clamp(-12.0, 12.0);
    }
    pub fn set_oversampling(&mut self, factor: usize) {
        let channels = self.os_channels();
        self.os = Oversampler::new(factor, channels);
    }
    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }

    fn os_channels(&self) -> usize {
        // fixed stereo path in the engine; harmless for mono (extra lane unused)
        2
    }
}

/// The nonlinear transfer function. Pure free function (no `self` borrow —
/// safe to call from inside the oversampler closure).
#[inline]
fn shape(x: f32, kind: SaturationKind, drive: f32, bias: f32) -> f32 {
    let d = 0.5 + drive * 3.5;
    match kind {
        SaturationKind::Tube => {
            let xi = x * d + bias;
            let y = xi.signum() * (1.0 - (-xi.abs()).exp());
            // bias compensation: remove the DC the bias itself injects
            let bx = bias * d;
            let by = bx.signum() * (1.0 - (-bx.abs()).exp());
            (y - by) / (d * 0.35).max(1.0)
        }
        SaturationKind::Transistor => {
            let xi = x * d;
            xi.tanh() / (d * 0.5).max(1.0)
        }
    }
}

impl Processor for Waveshaper {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled || channels.is_empty() {
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        // 1. Tone pre-filter (in place, per channel with state)
        // 2. Save dry copy for wet/dry mix
        // 3. Oversampled shape
        // 4. Mix + output gain
        let mix = self.mix;
        let out_gain = 10_f32.powf(self.output_db / 20.0);
        let kind = self.kind;
        let drive = self.drive;
        let bias = self.bias;
        let bright = self.tone > 0.5;
        let corner = if bright { 6500.0 } else { 900.0 };
        let a = (-2.0 * std::f32::consts::PI * corner / self.sample_rate)
            .exp()
            .clamp(0.0, 0.995);

        // dry snapshot
        let mut dry: Vec<Vec<f32>> = Vec::with_capacity(channels.len());
        for ch in channels.iter() {
            dry.push(ch[..frames].to_vec());
        }

        // shape (inside oversampler) — closure captures only locals
        self.os.run(channels, &|x, _c| shape(x, kind, drive, bias));

        // post tone + wet/dry + gain
        let mut z: Vec<f32> = vec![0.0; channels.len()];
        for (c, ch) in channels.iter_mut().enumerate() {
            for (i, s) in ch[..frames].iter_mut().enumerate() {
                z[c] += a * (*s - z[c]);
                let wet = z[c] * out_gain;
                *s = wet * mix + dry[c][i] * (1.0 - mix);
            }
        }
    }

    fn reset(&mut self) {
        let factor = if self.os.factor() == 1 { 2 } else { self.os.factor() };
        self.os = Oversampler::new(factor, self.os_channels());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tube_limits_peak() {
        let mut ws = Waveshaper::new(SaturationKind::Tube, 48000.0, 1, 4);
        ws.set_drive(1.0);
        let mut s: Vec<f32> = (0..8192).map(|i| (i as f32 * 0.01).sin() * 3.0).collect();
        let mut chans: Vec<&mut [f32]> = vec![&mut s];
        ws.process(&mut chans);
        let mx = s.iter().fold(0.0_f32, |a, v| a.max(v.abs()));
        assert!(mx < 1.5, "saturated output must stay bounded: {mx}");
        assert!(mx > 0.3, "signal must survive: {mx}");
    }

    #[test]
    fn transistor_is_bounded() {
        let mut ws = Waveshaper::new(SaturationKind::Transistor, 48000.0, 1, 2);
        ws.set_drive(1.0);
        let mut s = vec![5.0_f32; 2048];
        let mut chans: Vec<&mut [f32]> = vec![&mut s];
        ws.process(&mut chans);
        for v in s.iter() {
            assert!(v.is_finite());
            assert!(v.abs() < 2.0);
        }
    }

    #[test]
    fn mix_zero_is_bypass() {
        let mut ws = Waveshaper::new(SaturationKind::Tube, 48000.0, 1, 4);
        ws.set_mix(0.0);
        ws.set_drive(1.0);
        let mut s: Vec<f32> = (0..4096).map(|i| (i as f32 * 0.01).sin() * 0.5).collect();
        let before = s.clone();
        let mut chans: Vec<&mut [f32]> = vec![&mut s];
        ws.process(&mut chans);
        for (a, b) in s.iter().zip(before.iter()) {
            assert!((a - b).abs() < 1e-4, "dry path must be exact: {a} vs {b}");
        }
    }
}
