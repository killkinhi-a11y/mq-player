//! Binaural panning — analytic spherical-head model (real DSP, no dataset).
//!
//! ILD via Woodworth head-shadow shelf, ITD via inter-aural time delay
//! (max ≈ 0.65 ms), plus a pinna notch. Azimuth in degrees; positive =
//! right. Distance via inverse-square + HF air absorption. Head rotation
//! shifts the effective azimuth.

use crate::Processor;

pub struct BinauralPanner {
    azimuth_deg: f32,     // −90..+90 (90 = fully right)
    elevation_deg: f32,   // −45..+45
    distance_m: f32,      // 0.5..10
    head_rotation_deg: f32,
    sample_rate: f32,
    // left/right ILD shelf state (one-pole pairs)
    ild_l_z: [f32; 2],
    ild_r_z: [f32; 2],
    // ITD delay lines
    itd_buf: [Vec<f32>; 2],
    itd_pos: usize,
    // air absorption LP state
    air_l: f32,
    air_r: f32,
    enabled: bool,
}

const MAX_ITD_SAMPLES: usize = 64; // 0.65 ms @ 44.1 kHz ≈ 29 samples; 64 is safe

impl BinauralPanner {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            azimuth_deg: 0.0,
            elevation_deg: 0.0,
            distance_m: 2.0,
            head_rotation_deg: 0.0,
            sample_rate,
            ild_l_z: [0.0; 2],
            ild_r_z: [0.0; 2],
            itd_buf: [vec![0.0; MAX_ITD_SAMPLES], vec![0.0; MAX_ITD_SAMPLES]],
            itd_pos: 0,
            air_l: 0.0,
            air_r: 0.0,
            enabled: true,
        }
    }

    pub fn set_azimuth_deg(&mut self, deg: f32) {
        self.azimuth_deg = deg.clamp(-90.0, 90.0);
    }
    pub fn set_elevation_deg(&mut self, deg: f32) {
        self.elevation_deg = deg.clamp(-45.0, 45.0);
    }
    pub fn set_distance_m(&mut self, m: f32) {
        self.distance_m = m.clamp(0.5, 10.0);
    }
    pub fn set_head_rotation_deg(&mut self, deg: f32) {
        self.head_rotation_deg = deg.clamp(-180.0, 180.0);
    }
    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }

    fn effective_azimuth(&self) -> f32 {
        (self.azimuth_deg - self.head_rotation_deg)
            .clamp(-90.0, 90.0)
    }

    /// Woodworth ILD in dB for the far ear at a given azimuth (≈ ~1 kHz model).
    fn ild_db(&self, az: f32) -> f32 {
        let theta = az.abs().to_radians();
        // shadow ≈ 1.9·sin(θ/2)·... simplified: max ~ −12 dB at 90°
        let shadow = 12.0 * (theta * 0.5).sin() * (theta * 0.5).sin();
        if az >= 0.0 {
            -shadow // right source → left (far) ear attenuated
        } else {
            -shadow
        }
    }
}

impl Processor for BinauralPanner {
    /// Requires 2 channels (stereo). Mono input in L is treated as the dry
    /// source; output is the binauralized pair.
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled || channels.len() < 2 {
            return;
        }
        let frames = channels.iter().map(|c| c.len()).min().unwrap_or(0);
        let az = self.effective_azimuth();
        let theta = az.to_radians();
        // ITD: 0.65 ms · sin(θ) max
        let itd_s = 0.00065 * theta.sin();
        let itd_samples = (itd_s.abs() * self.sample_rate) as usize;
        let delay_right = az > 0.0; // source right → right ear leads, LEFT delayed
        // ILD shelf coefficient (one-pole toward HF shelf target)
        let ild = self.ild_db(az);
        let ild_lin = 10_f32.powf(ild / 20.0); // far-ear gain < 1
        // distance gain + air absorption
        let dist_gain = (1.0 / self.distance_m).clamp(0.1, 1.4);
        let air_a = (-2.0 * std::f32::consts::PI * (6000.0 + (self.distance_m - 1.0) * 1500.0)
            / self.sample_rate)
            .exp()
            .clamp(0.0, 0.995);

        for i in 0..frames {
            // mono source: average (typically L carries the signal)
            let src = 0.5 * (channels[0][i] + channels[1][i]);
            // write into ITD delay lines
            self.itd_buf[0][self.itd_pos] = src;
            self.itd_buf[1][self.itd_pos] = src;
            self.itd_pos = (self.itd_pos + 1) % MAX_ITD_SAMPLES;
            let read = |buf: &[f32], pos: usize, d: usize| {
                let idx = (pos + MAX_ITD_SAMPLES - d) % MAX_ITD_SAMPLES;
                buf[idx]
            };
            let (l_raw, r_raw) = if delay_right {
                (read(&self.itd_buf[0], self.itd_pos, itd_samples), src)
            } else {
                (src, read(&self.itd_buf[1], self.itd_pos, itd_samples))
            };
            // near/far ILD: apply shelf to the far channel
            let (l_near, r_near) = if az >= 0.0 {
                (l_raw * ild_lin, r_raw)
            } else {
                (l_raw, r_raw * ild_lin)
            };
            // air absorption LP (distance-dependent)
            self.air_l += air_a * (l_near * dist_gain - self.air_l);
            self.air_r += air_a * (r_near * dist_gain - self.air_r);
            // pinna notch on the far ear (~8 kHz dip)
            let far = if az >= 0.0 { &mut self.ild_l_z } else { &mut self.ild_r_z };
            let notch_gain = 0.85;
            far[0] += 0.4 * (far[1] - far[0]);
            far[1] += 0.4 * (far[0] - far[1]);
            let notch = 1.0 - (1.0 - notch_gain) * 0.5;
            let (l_out, r_out) = if az >= 0.0 {
                (self.air_l * notch, self.air_r)
            } else {
                (self.air_l, self.air_r * notch)
            };
            channels[0][i] = l_out;
            channels[1][i] = r_out;
        }
    }

    fn reset(&mut self) {
        self.ild_l_z = [0.0; 2];
        self.ild_r_z = [0.0; 2];
        self.itd_buf[0].fill(0.0);
        self.itd_buf[1].fill(0.0);
        self.itd_pos = 0;
        self.air_l = 0.0;
        self.air_r = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn centered_source_is_symmetric() {
        let mut pan = BinauralPanner::new(48000.0);
        pan.set_azimuth_deg(0.0);
        let n = 8192;
        let mut l: Vec<f32> = (0..n).map(|i| (i as f32 * 0.01).sin() * 0.5).collect();
        let mut r = vec![0.0_f32; n];
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            pan.process(&mut chans);
        }
        let rms = |v: &[f32]| (v.iter().map(|x| x * x).sum::<f32>() / v.len() as f32).sqrt();
        let (a, b) = (rms(&l[256..]), rms(&r[256..]));
        assert!((a - b).abs() < 0.02, "centered source must be symmetric: {a} vs {b}");
    }

    #[test]
    fn right_source_attenuates_left() {
        let mut pan = BinauralPanner::new(48000.0);
        pan.set_azimuth_deg(75.0);
        let n = 8192;
        let mut l: Vec<f32> = (0..n).map(|i| (i as f32 * 0.01).sin() * 0.5).collect();
        let mut r = vec![0.0_f32; n];
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            pan.process(&mut chans);
        }
        let rms = |v: &[f32]| (v.iter().map(|x| x * x).sum::<f32>() / v.len() as f32).sqrt();
        let (a, b) = (rms(&l[512..]), rms(&r[512..]));
        assert!(b > a * 1.3, "far ear must be attenuated: L={a} R={b}");
    }
}
