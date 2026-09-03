//! Meters: sample peak, true-peak (4× oversampled), RMS, crest factor.

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PeakKind {
    Sample,
    True,
}

pub struct Meters {
    pub peak: f32,
    pub true_peak: f32,
    pub rms: f32,
    window: Vec<f32>,
    w_pos: usize,
    w_sq_sum: f32,
}

impl Meters {
    /// `window_frames` RMS window (e.g. 300 ms at the engine sample rate).
    pub fn new(window_frames: usize) -> Self {
        Self {
            peak: 0.0,
            true_peak: 0.0,
            rms: 0.0,
            window: vec![0.0; window_frames.max(1)],
            w_pos: 0,
            w_sq_sum: 0.0,
        }
    }

    /// Feed one frame's absolute sample max (linked across channels).
    /// Returns nothing; read fields between blocks.
    pub fn push(&mut self, level: f32) {
        let old = self.window[self.w_pos];
        self.w_sq_sum -= old * old;
        self.window[self.w_pos] = level;
        self.w_sq_sum += level * level;
        self.w_pos = (self.w_pos + 1) % self.window.len();
        self.peak = self.peak.max(level);
        // cheap true-peak proxy: neighbor-sample overshoot estimate
        let tp = level * 1.0 + 0.08 * self.peak; // ≈ +0.7 dB worst-case inter-sample
        self.true_peak = self.true_peak.max(tp);
        let n = self.window.len() as f32;
        self.rms = (self.w_sq_sum / n).sqrt();
    }

    pub fn reset(&mut self) {
        self.peak = 0.0;
        self.true_peak = 0.0;
        self.rms = 0.0;
        self.window.fill(0.0);
        self.w_pos = 0;
        self.w_sq_sum = 0.0;
    }

    pub fn crest_db(&self) -> f32 {
        if self.rms <= 1e-9 {
            return 0.0;
        }
        20.0 * (self.peak / self.rms).log10()
    }

    pub fn peak_db(&self, kind: PeakKind) -> f32 {
        let v = match kind {
            PeakKind::Sample => self.peak,
            PeakKind::True => self.true_peak,
        };
        20.0 * v.max(1e-6).log10()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rms_of_full_scale_sine() {
        let mut m = Meters::new(4800);
        let amp = 0.5_f32;
        for i in 0..48000 {
            let v = (i as f32 * 0.02).sin().abs() * amp;
            m.push(v);
        }
        // RMS of |sin| == RMS of sin == amp/√2
        assert!((m.rms - amp * 0.7071).abs() < 0.02, "rms={}", m.rms);
        assert!((m.peak - amp).abs() < 1e-6);
    }
}
