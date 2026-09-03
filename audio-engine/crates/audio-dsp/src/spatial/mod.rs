//! Spatial processing: early reflections, algorithmic reverb (FDN),
//! binaural panning (spherical-head model), stereo width.

pub mod binaural;
pub mod reverb;
pub mod width;

pub use binaural::BinauralPanner;
pub use reverb::{EarlyReflections, FdnReverb};
pub use width::StereoWidth;
