//! Polyphase half-band oversampler (2×/4×/8× via chained stages).
//!
//! Nonlinear processors benefit from oversampling: harmonics generated above
//! Nyquist alias back without it. Each stage is a 31-tap half-band FIR
//! (even taps zero except the center). Streaming-correct: cross-block filter
//! tails are preserved, so 128-frame blocks chain seamlessly (no periodic
//! edge artifacts).

pub struct Oversampler {
    factor: usize, // 1, 2, 4, 8
    stages: usize,
    taps: Vec<f32>,               // normalized: Σ taps = 1
    up_tails: Vec<Vec<Vec<f32>>>,   // [channel][stage][T−1] input history
    down_tails: Vec<Vec<Vec<f32>>>, // [channel][stage][T−1]
    work: Vec<f32>,       // current channel signal at the working rate
    stage_buf: Vec<f32>,  // tail ++ block for convolution
}

const HB_TAPS: usize = 31;

impl Oversampler {
    pub fn new(factor: usize, channels: usize) -> Self {
        let factor = match factor {
            2 | 4 | 8 => factor,
            _ => 1,
        };
        let stages = factor.trailing_zeros() as usize;
        // Half-band anti-imaging/anti-alias FIR at the 2×-upsampled rate.
        // Taps live on the UPSAMPLED integer grid; base samples hit even
        // positions. Ideal half-band: h[center] = 0.5, h[odd≠center] = 0,
        // h[even] = 0.5·sinc((i−center)/2)·window. Blackman-windowed.
        let center = (HB_TAPS - 1) as f32 / 2.0;
        let mut taps = vec![0.0_f32; HB_TAPS];
        let blackman = |i: usize| -> f32 {
            let n = (HB_TAPS - 1) as f32;
            0.42 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n).cos()
                + 0.08 * (4.0 * std::f32::consts::PI * i as f32 / n).cos()
        };
        for i in 0..HB_TAPS {
            let s = (i as f32 - center) / 2.0; // half-band sinc argument
            if s.abs() < 1e-9 {
                taps[i] = 0.5;
            } else if s.fract().abs() < 1e-9 {
                // nonzero integer argument → sinc = 0 (odd tap ≠ center)
                taps[i] = 0.0;
            } else {
                let sinc = (std::f32::consts::PI * s).sin() / (std::f32::consts::PI * s);
                taps[i] = 0.5 * sinc * blackman(i);
            }
        }
        // Normalize passband (DC) gain to exactly 1.
        let sum: f32 = taps.iter().sum();
        if sum.abs() > 1e-9 {
            for t in taps.iter_mut() {
                *t /= sum;
            }
        }
        let tail = || vec![vec![0.0_f32; HB_TAPS - 1]; stages.max(1)];
        Self {
            factor,
            stages,
            taps,
            up_tails: (0..channels).map(|_| tail()).collect(),
            down_tails: (0..channels).map(|_| tail()).collect(),
            work: Vec::new(),
            stage_buf: Vec::new(),
        }
    }

    pub fn factor(&self) -> usize {
        self.factor
    }

    /// Reset cross-block filter state (seek / track boundary).
    pub fn reset(&mut self) {
        for ch in self.up_tails.iter_mut() {
            for t in ch.iter_mut() {
                t.fill(0.0);
            }
        }
        for ch in self.down_tails.iter_mut() {
            for t in ch.iter_mut() {
                t.fill(0.0);
            }
        }
    }

    /// One convolution pass with cross-block tail.
    /// `buf` holds L samples at the current rate; `tail` is the previous
    /// block's last T−1 inputs. Output written back into buf in place.
    /// `gain2` doubles the accumulator for upsample stages (DC gain 2).
    /// Free function — avoids borrow conflicts over `self.work`.
    fn filter_stage(
        taps: &[f32],
        stage_buf: &mut Vec<f32>,
        buf: &mut [f32],
        tail: &mut [f32],
        gain2: bool,
    ) {
        let l = buf.len();
        let t = HB_TAPS - 1;
        // stage input: [tail (t) | block (l)] — reuse without reallocation
        stage_buf.clear();
        stage_buf.reserve(t + l);
        stage_buf.extend_from_slice(tail);
        stage_buf.extend_from_slice(buf);
        // convolve: out[m] = Σ taps[k] · in[m + t − k]
        let sb_len = stage_buf.len();
        let scale = if gain2 { 2.0 } else { 1.0 };
        for m in 0..l {
            let mut acc = 0.0_f32;
            for (k, c) in taps.iter().enumerate() {
                let idx = m + t - k;
                if idx < sb_len {
                    acc += c * stage_buf[idx];
                }
            }
            buf[m] = acc * scale;
        }
        // new tail = the last T−1 inputs
        tail.copy_from_slice(&stage_buf[sb_len - t..sb_len]);
    }

    /// Process a planar block through `f` at the oversampled rate.
    /// `f` is invoked with (sample, channel) and must be pure.
    pub fn run<F: Fn(f32, usize) -> f32>(&mut self, channels: &mut [&mut [f32]], f: &F) {
        if self.factor == 1 {
            for (c, ch) in channels.iter_mut().enumerate() {
                for s in ch.iter_mut() {
                    *s = f(*s, c);
                }
            }
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        if frames == 0 {
            return;
        }
        let need = frames * self.factor + HB_TAPS * 2;
        if self.work.len() < need {
            self.work.resize(need, 0.0);
        }
        for (c, ch) in channels.iter_mut().enumerate() {
            if self.up_tails.len() <= c {
                continue;
            }
            // ── upsample cascade ──
            let work = &mut self.work;
            work[..frames].copy_from_slice(&ch[..frames]);
            let mut cur_len = frames;
            for s in 0..self.stages {
                // zero-stuff (reverse in-place — proven safe)
                for i in (1..=cur_len).rev() {
                    work[(i - 1) * 2] = work[i - 1];
                    work[(i - 1) * 2 + 1] = 0.0;
                }
                cur_len *= 2;
                // Disjoint field borrows: work (signal) / stage_buf / tails / taps
                let seg = &mut work[..cur_len];
                let mut tail = std::mem::take(&mut self.up_tails[c][s]);
                let mut stage_buf = std::mem::take(&mut self.stage_buf);
                let taps: &[f32] = &self.taps;
                Self::filter_stage(taps, &mut stage_buf, seg, &mut tail, true);
                self.stage_buf = stage_buf;
                self.up_tails[c][s] = tail;
            }
            // ── nonlinearity at the oversampled rate ──
            for i in 0..cur_len {
                work[i] = f(work[i], c);
            }
            // ── downsample cascade (filter then decimate) ──
            for s in 0..self.stages {
                let seg = &mut work[..cur_len];
                let mut tail = std::mem::take(&mut self.down_tails[c][s]);
                let mut stage_buf = std::mem::take(&mut self.stage_buf);
                let taps: &[f32] = &self.taps;
                Self::filter_stage(taps, &mut stage_buf, seg, &mut tail, false);
                self.stage_buf = stage_buf;
                self.down_tails[c][s] = tail;
                cur_len /= 2;
                for i in 0..cur_len {
                    work[i] = work[i * 2];
                }
            }
            ch[..frames].copy_from_slice(&work[..frames]);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn factor1_identity() {
        let mut os = Oversampler::new(1, 1);
        let mut s = vec![0.3_f32, -0.7, 0.9];
        let before = s.clone();
        os.run(&mut [&mut s], &|x, _| x * 2.0);
        for (a, b) in s.iter().zip(before.iter()) {
            assert!((a - b * 2.0).abs() < 1e-6);
        }
    }

    #[test]
    fn linear_path_preserves_dc() {
        let mut os = Oversampler::new(4, 1);
        // long DC block; measure far from edges
        let n = 4096;
        let mut s = vec![0.25_f32; n];
        os.run(&mut [&mut s], &|x, _| x);
        let mean: f32 = s[512..n - 512].iter().sum::<f32>() / (n - 1024) as f32;
        assert!((mean - 0.25).abs() < 1e-3, "DC preserved, got {mean}");
    }

    #[test]
    fn block_streaming_is_seamless() {
        // process DC in 128-frame chunks — every sample must stay ≈ 0.25
        let mut os = Oversampler::new(8, 1);
        let n = 2048;
        let mut s = vec![0.25_f32; n];
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut s[blk..blk + 128]];
            os.run(&mut chans, &|x, _| x);
        }
        // skip only the very first block (initial tail zeros)
        for (i, v) in s.iter().enumerate().skip(128) {
            assert!((v - 0.25).abs() < 2e-3, "block edge artifact at {i}: {v}");
        }
    }

    #[test]
    fn sine_survives_roundtrip() {
        let mut os = Oversampler::new(8, 2);
        let n = 8192;
        let mut l: Vec<f32> = (0..n).map(|i| (i as f32 * 0.02).sin() * 0.6).collect();
        let mut r = vec![0.0_f32; n];
        let before_rms = (l.iter().map(|v| v * v).sum::<f32>() / n as f32).sqrt();
        os.run(&mut [&mut l, &mut r], &|x, _| x);
        let tail = &l[1024..n - 1024];
        let after_rms = (tail.iter().map(|v| v * v).sum::<f32>() / tail.len() as f32).sqrt();
        assert!(
            (after_rms - before_rms).abs() < before_rms * 0.05,
            "sine amplitude preserved: {after_rms} vs {before_rms}"
        );
    }
}
