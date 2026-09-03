//! Numeric command queue (§75: opcodes + parameters, never JSON in the
//! realtime path). Fixed-capacity ring — enqueue happens on the message
//! pump thread, consumption inside `process()` between blocks.

#[derive(Clone, Copy, Debug, PartialEq)]
#[repr(u32)]
pub enum Opcode {
    // transport
    Play = 1,
    Pause = 2,
    Stop = 3,
    SeekFrames = 4,
    Flush = 5,
    // gain / pan
    SetVolume = 10,
    SetPan = 11,
    // EQ (graphic 10-band: a = band index, b = value)
    SetEqEnabled = 20,
    SetEqBand = 21,
    SetEqAllBands = 22,
    SetEqModeLinearPhase = 23,
    // dynamics
    SetCompressorEnabled = 30,
    SetCompressorParam = 31,
    SetLimiterEnabled = 32,
    SetLimiterParam = 33,
    SetGateEnabled = 34,
    SetGateParam = 35,
    SetExpanderEnabled = 36,
    SetExpanderParam = 37,
    // spatial
    SetReverbEnabled = 40,
    SetReverbParam = 41,
    SetErEnabled = 42,
    SetBinauralEnabled = 43,
    SetBinauralParam = 44,
    SetWidth = 45,
    // modulation
    SetChorusEnabled = 50,
    SetChorusParam = 51,
    SetFlangerEnabled = 52,
    SetFlangerParam = 53,
    SetPhaserEnabled = 54,
    SetPhaserParam = 55,
    SetTremoloEnabled = 56,
    SetTremoloParam = 57,
    // saturation
    SetSaturationEnabled = 60,
    SetSaturationParam = 61,
    // restoration
    SetDeclipEnabled = 70,
    SetEnhancerEnabled = 71,
    SetNoiseReductionEnabled = 72,
    // quality / presets
    SetQualityMode = 80,
    SetBypassAll = 81,
    // misc
    SetPlaybackRate = 90,
    Reset = 99,
}

/// Secondary selector for param commands (which parameter of the processor).
pub mod param {
    // compressor params
    pub const CP_THRESHOLD: f32 = 0.0;
    pub const CP_RATIO: f32 = 1.0;
    pub const CP_ATTACK: f32 = 2.0;
    pub const CP_RELEASE: f32 = 3.0;
    pub const CP_KNEE: f32 = 4.0;
    pub const CP_MAKEUP: f32 = 5.0;
    pub const CP_LOOKAHEAD: f32 = 6.0;
    // limiter params
    pub const LP_CEILING: f32 = 0.0;
    pub const LP_RELEASE: f32 = 1.0;
    pub const LP_LOOKAHEAD: f32 = 2.0;
    // gate params
    pub const GP_THRESHOLD: f32 = 0.0;
    pub const GP_HOLD: f32 = 1.0;
    pub const GP_RELEASE: f32 = 2.0;
    pub const GP_RANGE: f32 = 3.0;
    // reverb params
    pub const RP_MIX: f32 = 0.0;
    pub const RP_RT60: f32 = 1.0;
    // binaural params
    pub const BP_AZIMUTH: f32 = 0.0;
    pub const BP_ELEVATION: f32 = 1.0;
    pub const BP_DISTANCE: f32 = 2.0;
    pub const BP_HEADROT: f32 = 3.0;
    // chorus params
    pub const CH_RATE: f32 = 0.0;
    pub const CH_DEPTH: f32 = 1.0;
    pub const CH_MIX: f32 = 2.0;
    // flanger params
    pub const FL_RATE: f32 = 0.0;
    pub const FL_DEPTH: f32 = 1.0;
    pub const FL_FEEDBACK: f32 = 2.0;
    pub const FL_MIX: f32 = 3.0;
    // phaser params
    pub const PH_RATE: f32 = 0.0;
    pub const PH_STAGES: f32 = 1.0;
    pub const PH_FEEDBACK: f32 = 2.0;
    pub const PH_MIX: f32 = 3.0;
    // tremolo params
    pub const TR_RATE: f32 = 0.0;
    pub const TR_DEPTH: f32 = 1.0;
    // saturation params
    pub const SA_DRIVE: f32 = 0.0;
    pub const SA_TONE: f32 = 1.0;
    pub const SA_MIX: f32 = 2.0;
    pub const SA_OUTPUT: f32 = 3.0;
    pub const SA_OVERSAMPLE: f32 = 4.0;
}

#[derive(Clone, Copy, Debug)]
pub struct Command {
    pub op: Opcode,
    pub a: f32, // primary value / index
    pub b: f32, // secondary value
    pub c: f32, // tertiary value
}

/// Fixed-size SPSC command ring. Enqueue is lock-free; overflow returns
/// `false` and the caller retries after the next block.
pub struct CommandQueue {
    slots: Vec<Command>,
    head: usize,
    tail: usize,
    capacity: usize,
}

impl CommandQueue {
    pub fn new(capacity: usize) -> Self {
        Self {
            slots: vec![Command { op: Opcode::Pause, a: 0.0, b: 0.0, c: 0.0 }; capacity.max(2)],
            head: 0,
            tail: 0,
            capacity: capacity.max(2),
        }
    }

    /// Push a command. Returns false when full (non-fatal — retry).
    pub fn push(&mut self, cmd: Command) -> bool {
        let next = (self.head + 1) % self.capacity;
        if next == self.tail {
            return false;
        }
        self.slots[self.head] = cmd;
        self.head = next;
        true
    }

    /// Pop the next command (called from the audio thread between blocks).
    pub fn pop(&mut self) -> Option<Command> {
        if self.tail == self.head {
            return None;
        }
        let cmd = self.slots[self.tail];
        self.tail = (self.tail + 1) % self.capacity;
        Some(cmd)
    }

    pub fn len(&self) -> usize {
        if self.head >= self.tail {
            self.head - self.tail
        } else {
            self.capacity - self.tail + self.head
        }
    }

    pub fn is_empty(&self) -> bool {
        self.tail == self.head
    }

    pub fn clear(&mut self) {
        self.tail = self.head;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fifo_order() {
        let mut q = CommandQueue::new(8);
        for i in 0..7 {
            assert!(q.push(Command { op: Opcode::SetVolume, a: i as f32, b: 0.0, c: 0.0 }));
        }
        assert!(!q.push(Command { op: Opcode::Play, a: 0.0, b: 0.0, c: 0.0 }), "full queue must reject");
        for i in 0..7 {
            let c = q.pop().unwrap();
            assert_eq!(c.a, i as f32);
        }
        assert!(q.pop().is_none());
    }

    #[test]
    fn wraparound() {
        let mut q = CommandQueue::new(4);
        for round in 0..100 {
            assert!(q.push(Command { op: Opcode::SetEqBand, a: round as f32, b: 0.0, c: 0.0 }));
            let c = q.pop().unwrap();
            assert_eq!(c.a, round as f32);
        }
    }
}
