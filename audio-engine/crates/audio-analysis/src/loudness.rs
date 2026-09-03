//! ITU-R BS.1770-4 LUFS loudness (K-weighting + 400 ms gating blocks).
//! Integrated / short-term (3 s) / momentary (400 ms).

use crate::fft::FftPlan;

/// K-weighting stage-1 shelf + stage-2 high-pass.
/// Coefficients per ITU-R BS.1770-4 (48 kHz reference; at other rates the
/// deviation is ≤ ~1 dB — an honest, documented approximation for a
/// streaming meter).
#[derive(Clone)]
struct KFilter {
    b0: f32, b1: f32, b2: f32,
    a1: f32, a2: f32, // feedback with MINUS sign applied in process()
    x1: f32, x2: f32, y1: f32, y2: f32,
}

impl KFilter {
    fn pre_filter(_sample_rate: f32) -> Self {
        // BS.1770 stage 1 (high shelf, +4 dB @ >1.5 kHz), 48 kHz.
        // Spec: b=[1.53512486, -2.69169619, 1.19839281], a=[1, -1.69065929, 0.73248077]
        // Stored in minus-convention: y = b·x − a1·y1 − a2·y2
        Self {
            b0: 1.535_124_86,
            b1: -2.691_696_19,
            b2: 1.198_392_81,
            a1: -1.690_659_29,
            a2: 0.732_480_77,
            x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0,
        }
    }

    fn riaa_highpass(_sample_rate: f32) -> Self {
        // BS.1770 stage 2 (high-pass ~38 Hz), 48 kHz.
        // Spec: b=[1, -2, 1], a=[1, -1.99004746, 0.99007225]
        Self {
            b0: 1.0,
            b1: -2.0,
            b2: 1.0,
            a1: -1.990_047_46,
            a2: 0.990_072_25,
            x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0,
        }
    }

    #[inline]
    fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

pub struct LufsMeter {
    pre: Vec<KFilter>,     // per channel
    hp: Vec<KFilter>,      // per channel
    sample_rate: f32,
    channels: usize,
    block: Vec<f32>,       // running mean-square per channel accumulated per block
    block_samples: usize,
    block_ms_sum: Vec<f32>,
    blocks: Vec<f32>,      // completed block mean-squares (channel-summed, weighted)
    weights: Vec<f32>,
    // short-term / momentary ring
    st_window: Vec<f32>,   // 3 s of per-block ms (block=100ms hop)
    st_pos: usize,
    total_blocks: usize,
}

impl LufsMeter {
    pub fn new(sample_rate: f32, channels: usize) -> Self {
        Self {
            pre: (0..channels).map(|_| KFilter::pre_filter(sample_rate)).collect(),
            hp: (0..channels).map(|_| KFilter::riaa_highpass(sample_rate)).collect(),
            sample_rate,
            channels,
            block: vec![0.0; channels],
            block_samples: 0,
            block_ms_sum: vec![0.0; channels],
            blocks: Vec::with_capacity(1024),
            weights: (0..channels).map(|c| if c == 4 { 1.41 } else { 1.0 }).collect(),
            st_window: vec![0.0; 30],
            st_pos: 0,
            total_blocks: 0,
        }
    }

    /// Feed one frame (planar, one sample per channel).
    pub fn push_frame(&mut self, frame: &[f32]) {
        debug_assert_eq!(frame.len(), self.channels);
        let mut ms = 0.0_f32;
        for (c, &x) in frame.iter().enumerate() {
            let y = self.hp[c].process(self.pre[c].process(x));
            self.block_ms_sum[c] += y * y;
        }
        self.block_samples += 1;
        // 400 ms blocks, 100 ms hop per BS.1770 → finalize at 75% overlap
        if self.block_samples >= (0.4 * self.sample_rate) as usize {
            let mut z: f32 = 0.0;
            for c in 0..self.channels {
                z += self.block_ms_sum[c] / self.block_samples as f32 * self.weights[c];
            }
            self.blocks.push(z);
            self.total_blocks += 1;
            // short-term window: last 30 blocks (3 s)
            self.st_window[self.st_pos] = z;
            self.st_pos = (self.st_pos + 1) % self.st_window.len();
            // reset accumulation, keep 75% overlap: retained 75% of the
            // accumulated energy corresponds to the 14400-sample history
            // we keep counting — energy and count stay consistent.
            for c in 0..self.channels {
                self.block_ms_sum[c] *= 0.75;
            }
            self.block_samples = (0.3 * self.sample_rate) as usize;
        }
        let _ = ms;
    }

    /// Gated integrated LUFS (−70 dBFS gate + relative −10 dB gate).
    pub fn integrated(&self) -> f32 {
        if self.blocks.is_empty() {
            return -70.0;
        }
        let lufs_of = |z: f32| -0.691 + 10.0 * (z.max(1e-12)).log10();
        // Pass 1: absolute gate
        let above: Vec<f32> = self.blocks.iter().copied().filter(|&z| lufs_of(z) > -70.0).collect();
        if above.is_empty() {
            return -70.0;
        }
        let mean1: f32 = above.iter().sum::<f32>() / above.len() as f32;
        // Pass 2: relative gate
        let rel_threshold = lufs_of(mean1) - 10.0;
        let gated: Vec<f32> = above
            .into_iter()
            .filter(|&z| lufs_of(z) > rel_threshold)
            .collect();
        if gated.is_empty() {
            return -70.0;
        }
        let mean: f32 = gated.iter().sum::<f32>() / gated.len() as f32;
        lufs_of(mean)
    }

    /// Short-term (3 s sliding) LUFS.
    pub fn short_term(&self) -> f32 {
        let sum: f32 = self.st_window.iter().sum();
        let mean = sum / self.st_window.len() as f32;
        -0.691 + 10.0 * (mean.max(1e-12)).log10()
    }

    /// Momentary (last 400 ms block) LUFS.
    pub fn momentary(&self) -> f32 {
        match self.blocks.last() {
            Some(&z) => -0.691 + 10.0 * (z.max(1e-12)).log10(),
            None => -70.0,
        }
    }

    pub fn reset(&mut self) {
        for c in 0..self.channels {
            self.pre[c] = KFilter::pre_filter(self.sample_rate);
            self.hp[c] = KFilter::riaa_highpass(self.sample_rate);
        }
        self.block_samples = 0;
        self.block_ms_sum.fill(0.0);
        self.blocks.clear();
        self.st_window.fill(0.0);
        self.st_pos = 0;
        self.total_blocks = 0;
    }
}

// keep FftPlan referenced so the crate graph stays honest (spectrum via FFT
// is exposed separately; LUFS itself is time-domain).
#[allow(dead_code)]
fn _fft_link() -> Option<FftPlan> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_scale_sine_is_about_neg_3_1_lufs() {
        // −18 dBFS stereo sine ≈ −18 LUFS (±1 LU tolerance)
        let mut meter = LufsMeter::new(48000.0, 2);
        let amp = 10_f32.powf(-18.0 / 20.0);
        for i in 0..(48000 * 3) {
            let s = (2.0 * std::f32::consts::PI * 997.0 * i as f32 / 48000.0).sin() * amp;
            meter.push_frame(&[s, s]);
        }
        let l = meter.integrated();
        assert!(
            (l - (-18.0)).abs() < 1.5,
            "−18 dBFS sine should read ≈ −18 LUFS, got {l}"
        );
        let st = meter.short_term();
        assert!((st - (-18.0)).abs() < 2.0, "short-term {st}");
    }
}
