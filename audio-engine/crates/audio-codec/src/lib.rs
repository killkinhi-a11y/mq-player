//! audio-codec — incremental streaming decoder on Symphonia.
//!
//! Feeds compressed bytes in (push), decodes PCM out (pop) — the real
//! demux→codec path. Runs in the Decode Worker (non-realtime thread):
//! allocation is allowed HERE, never inside the AudioWorklet.

pub mod decoder;

pub use decoder::{DecoderHandle, PcmBlock};
