//! Saturation: tube & transistor waveshapers with optional oversampling.

pub mod oversampler;
pub mod waveshapers;

pub use oversampler::Oversampler;
pub use waveshapers::{SaturationKind, Waveshaper};
