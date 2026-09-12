//! Stereo width via mid/side processing — real M/S matrix, no phase smear.

use crate::Processor;

pub struct StereoWidth {
    width: f32, // 0 = mono, 1 = normal, 2 = wide
    solo_side: bool, // side-only (karaoke-inverse)
    enabled: bool,
}

impl StereoWidth {
    pub fn new() -> Self {
        Self { width: 1.0, solo_side: false, enabled: true }
    }

    pub fn set_width(&mut self, w: f32) {
        self.width = w.clamp(0.0, 3.0);
    }
    pub fn set_solo_side(&mut self, on: bool) {
        self.solo_side = on;
    }
    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }
}

impl Processor for StereoWidth {
    /// Requires 2 channels.
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled || channels.len() < 2 {
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let w = self.width;
        for i in 0..frames {
            let l = channels[0][i];
            let r = channels[1][i];
            let mid = 0.5 * (l + r);
            let side = 0.5 * (l - r);
            if self.solo_side {
                channels[0][i] = side;
                channels[1][i] = -side;
            } else {
                channels[0][i] = mid + side * w;
                channels[1][i] = mid - side * w;
            }
        }
    }

    fn reset(&mut self) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn width_zero_collapses_to_mono() {
        let mut sw = StereoWidth::new();
        sw.set_width(0.0);
        let mut l: Vec<f32> = (0..2048).map(|i| (i as f32 * 0.02).sin()).collect();
        let mut r: Vec<f32> = (0..2048).map(|i| (i as f32 * 0.021).cos()).collect();
        for blk in (0..2048).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            sw.process(&mut chans);
        }
        for (a, b) in l.iter().zip(r.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }

    #[test]
    fn width_two_widens() {
        let mut sw = StereoWidth::new();
        sw.set_width(2.0);
        let mut l = vec![0.5_f32; 1024];
        let mut r = vec![-0.5_f32; 1024];
        let before_side = 0.5;
        for blk in (0..1024).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            sw.process(&mut chans);
        }
        let side = 0.5 * (l[512] - r[512]);
        assert!((side - before_side * 2.0).abs() < 1e-5);
    }
}
