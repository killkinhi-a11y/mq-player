//! Modulation effects: chorus, flanger, phaser, tremolo.

pub mod lfo;
pub mod modulated_delay;
pub mod phaser;
pub mod tremolo;

pub use lfo::{Lfo, LfoShape, TempoSync};
pub use modulated_delay::{Chorus, Flanger};
pub use phaser::Phaser;
pub use tremolo::Tremolo;
