//! audio-dsp — the realtime DSP chain.
//!
//! Every processor obeys the realtime contract:
//! * no allocation inside `process`
//! * no locks, no logging, no I/O
//! * parameters change through pre-staged targets + smoothing (no zipper noise)
//! * denormal flush-to-zero on feedback paths
//!
//! Planar channel layout throughout — no interleave/deinterleave per block.

pub mod dynamics;
pub mod eq;
pub mod modulation;
pub mod restoration;
pub mod saturation;
pub mod spatial;

/// Common processor contract. Channels are planar slices of equal length.
pub trait Processor {
    /// Process channels in place. `channels.len()` >= 1; stereo-specific
    /// processors require >= 2 (documented per-processor).
    fn process(&mut self, channels: &mut [&mut [f32]]);
    /// Flush internal state (seek / track boundary). Keeps parameters.
    fn reset(&mut self);
    /// Algorithmic latency in frames (lookahead / FIR delay).
    fn latency(&self) -> usize {
        0
    }
}

/// Flush denormals/subnormals to zero. Called on feedback state — on x86 the
/// FTZ/DAZ bits are usually set by the host, but wasm32 has no such flag, so
/// we guard explicitly. A denormal f32 compares != 0.0, hence the range check.
#[inline]
pub(crate) fn flush_denormal(x: &mut f32) {
    const MIN_NORMAL: f32 = 1.175_494_4e-38;
    if (*x != 0.0) && (*x < MIN_NORMAL) && (*x > -MIN_NORMAL) {
        *x = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn denormal_flush() {
        let mut x = 1e-44_f32; // subnormal
        flush_denormal(&mut x);
        assert_eq!(x, 0.0);
        let mut y = 1e-30_f32; // normal, keep
        flush_denormal(&mut y);
        assert_eq!(y, 1e-30);
    }
}
