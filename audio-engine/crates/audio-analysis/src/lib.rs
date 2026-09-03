//! audio-analysis — FFT, meters, loudness (LUFS), spectrum.
//!
//! Analysis is **separated from the realtime output path**: engines push
//! snapshot values out of the audio thread at 20–30 Hz; nothing here runs
//! per-sample on the JS-visible layer.

pub mod fft;
pub mod loudness;
pub mod meters;

pub use fft::{FftPlan, SpectrumAnalyzer};
pub use loudness::LufsMeter;
pub use meters::{Meters, PeakKind};

/// Re-export for downstream crates (FFT is the single complex-math consumer).
pub use rustfft::num_complex;
