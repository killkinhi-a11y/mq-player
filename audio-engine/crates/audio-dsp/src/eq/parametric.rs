//! Parametric EQ (ordered band chain) and Graphic EQ (fixed band map on top
//! of the same biquads). MQ ships a 10-band graphic default (same frequencies
//! as the existing JS equalizer view) and supports custom band counts.

use super::biquad::{BiquadBand, FilterKind};
use crate::Processor;

pub struct ParametricEq {
    bands: Vec<BiquadBand>,
    enabled: bool,
}

impl ParametricEq {
    /// Build from (kind, freq, gain_db, q) tuples.
    pub fn new(sample_rate: f32, channels: usize, defs: &[(FilterKind, f32, f32, f32)]) -> Self {
        Self {
            bands: defs
                .iter()
                .map(|(k, f, g, q)| BiquadBand::new(*k, sample_rate, *f, *g, *q, channels))
                .collect(),
            enabled: true,
        }
    }

    pub fn set_enabled(&mut self, on: bool) {
        self.enabled = on;
    }
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }
    pub fn band_count(&self) -> usize {
        self.bands.len()
    }

    /// Adjust band gain (dB). Index-safe: no-op on out-of-range.
    pub fn set_band_gain(&mut self, idx: usize, db: f32) {
        if let Some(b) = self.bands.get_mut(idx) {
            b.set_gain_db(db);
        }
    }

    pub fn set_band_freq(&mut self, idx: usize, hz: f32) {
        if let Some(b) = self.bands.get_mut(idx) {
            b.set_freq(hz);
        }
    }

    pub fn set_band_q(&mut self, idx: usize, q: f32) {
        if let Some(b) = self.bands.get_mut(idx) {
            b.set_q(q);
        }
    }

    pub fn set_all_gains(&mut self, dbs: &[f32]) {
        for (i, db) in dbs.iter().enumerate() {
            if let Some(b) = self.bands.get_mut(i) {
                b.set_gain_db(*db);
            }
        }
    }

    pub fn band_gain(&self, idx: usize) -> Option<f32> {
        self.bands.get(idx).map(|b| b.gain_db())
    }
}

impl Processor for ParametricEq {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        if !self.enabled {
            return;
        }
        for band in self.bands.iter_mut() {
            band.process(channels);
        }
    }

    fn reset(&mut self) {
        for b in self.bands.iter_mut() {
            b.reset();
        }
    }
}

/// Standard 10-band frequencies (mirrors src/lib/eq.ts of the JS player).
pub const GRAPHIC_10_FREQS: [f32; 10] = [
    32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

pub struct GraphicEq {
    inner: ParametricEq,
    band_freqs: Vec<f32>,
}

impl GraphicEq {
    /// 10/15/31-band (or custom) graphic EQ. Shelf edges + peaking mids.
    pub fn new_band_count(sample_rate: f32, channels: usize, freqs: &[f32]) -> Self {
        let defs: Vec<(FilterKind, f32, f32, f32)> = freqs
            .iter()
            .enumerate()
            .map(|(i, f)| {
                let kind = if i == 0 {
                    FilterKind::LowShelf
                } else if i == freqs.len() - 1 {
                    FilterKind::HighShelf
                } else {
                    FilterKind::Peaking
                };
                (kind, *f, 0.0, 1.0)
            })
            .collect();
        Self {
            inner: ParametricEq::new(sample_rate, channels, &defs),
            band_freqs: freqs.to_vec(),
        }
    }

    pub fn new_10(sample_rate: f32, channels: usize) -> Self {
        Self::new_band_count(sample_rate, channels, &GRAPHIC_10_FREQS)
    }

    pub fn set_gains(&mut self, dbs: &[f32]) {
        self.inner.set_all_gains(dbs);
    }

    pub fn set_gain(&mut self, idx: usize, db: f32) {
        self.inner.set_band_gain(idx, db);
    }

    pub fn gains(&self) -> Vec<f32> {
        (0..self.band_freqs.len())
            .map(|i| self.inner.band_gain(i).unwrap_or(0.0))
            .collect()
    }

    pub fn set_enabled(&mut self, on: bool) {
        self.inner.set_enabled(on);
    }
}

impl Processor for GraphicEq {
    fn process(&mut self, channels: &mut [&mut [f32]]) {
        self.inner.process(channels);
    }
    fn reset(&mut self) {
        self.inner.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graphic_10_flat_is_identity() {
        let mut eq = GraphicEq::new_10(48000.0, 2);
        let mut l = vec![0.5_f32; 1024];
        let mut r = vec![-0.5_f32; 1024];
        for blk in (0..1024).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[blk..blk + 128], &mut r[blk..blk + 128]];
            eq.process(&mut chans);
        }
        for (a, b) in l.iter().zip(r.iter()) {
            assert!((a - 0.5).abs() < 1e-4);
            assert!((b + 0.5).abs() < 1e-4);
        }
    }

    #[test]
    fn bass_boost_changes_signal() {
        let mut eq = GraphicEq::new_10(48000.0, 1);
        eq.set_gains(&[6.0, 5.0, 3.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
        // Coefficient smoothing ≈ 8 blocks (~21 ms) — measure steady state
        // after the ramp settles, on the tail half of a longer signal.
        let sr = 48000.0;
        let n = 32768;
        let mut signal: Vec<f32> = (0..n)
            .map(|i| (2.0 * std::f32::consts::PI * 60.0 * i as f32 / sr).sin() * 0.25)
            .collect();
        let ref_rms = 0.25_f32 * 0.7071;
        for blk in (0..n).step_by(128) {
            let mut chans: Vec<&mut [f32]> = vec![&mut signal[blk..blk + 128]];
            eq.process(&mut chans);
        }
        let tail = &signal[n / 2..];
        let out_rms: f32 = (tail.iter().map(|v| v * v).sum::<f32>() / tail.len() as f32).sqrt();
        assert!(out_rms > ref_rms * 1.5, "60 Hz sine must be boosted: {out_rms} vs {ref_rms}");
    }
}
