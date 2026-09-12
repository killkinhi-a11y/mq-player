//! Parametric & graphic EQ.

pub mod biquad;
pub mod linear_phase;
pub mod parametric;

pub use biquad::{BiquadBand, FilterKind};
pub use parametric::{GraphicEq, ParametricEq};
