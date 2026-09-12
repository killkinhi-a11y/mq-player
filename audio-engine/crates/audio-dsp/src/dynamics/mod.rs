//! Dynamics processors.

pub mod compressor;
pub mod expander;
pub mod limiter;

pub use compressor::Compressor;
pub use expander::{Expander, NoiseGate};
pub use limiter::Limiter;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DetectorMode {
    Peak,
    Rms,
    Dual,
}
