//! Band-limited-ish LFO with wave shaping + tempo sync quantisation.

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum LfoShape {
    Sine,
    Triangle,
    Square,
    SampleHold,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TempoSync {
    Off,
    Whole,  // 1/1
    Quarter, // 1/4
    Eighth, // 1/8
    EighthT, // 1/8T
    Sixteenth, // 1/16
}

impl TempoSync {
    /// Note length in beats.
    pub fn beats(self) -> f32 {
        match self {
            TempoSync::Off => 0.0,
            TempoSync::Whole => 4.0,
            TempoSync::Quarter => 1.0,
            TempoSync::Eighth => 0.5,
            TempoSync::EighthT => 1.0 / 3.0,
            TempoSync::Sixteenth => 0.25,
        }
    }
}

pub struct Lfo {
    sample_rate: f32,
    phase: f32,     // 0..1
    rate_hz: f32,
    depth: f32,     // 0..1
    shape: LfoShape,
    hold_value: f32,
    next_hold: usize,
    samples_per_hold: usize,
}

impl Lfo {
    pub fn new(sample_rate: f32, rate_hz: f32, depth: f32, shape: LfoShape) -> Self {
        Self {
            sample_rate,
            phase: 0.0,
            rate_hz: rate_hz.clamp(0.01, 30.0),
            depth: depth.clamp(0.0, 1.0),
            shape,
            hold_value: 0.0,
            next_hold: 0,
            samples_per_hold: (sample_rate / rate_hz.clamp(0.01, 30.0)) as usize,
        }
    }

    /// Configure from BPM + sync instead of raw Hz.
    pub fn set_tempo(&mut self, bpm: f32, sync: TempoSync) {
        if sync == TempoSync::Off {
            return;
        }
        let beat_len = 60.0 / bpm.clamp(20.0, 300.0);
        self.set_rate(1.0 / (beat_len * sync.beats()));
    }

    pub fn set_rate(&mut self, hz: f32) {
        self.rate_hz = hz.clamp(0.01, 30.0);
        self.samples_per_hold = (self.sample_rate / self.rate_hz) as usize;
    }

    pub fn set_depth(&mut self, d: f32) {
        self.depth = d.clamp(0.0, 1.0);
    }

    pub fn set_shape(&mut self, s: LfoShape) {
        self.shape = s;
    }

    pub fn shape(&self) -> LfoShape {
        self.shape
    }

    /// Phase offset for stereo spread (applied as starting-phase delta).
    pub fn set_phase_offset(&mut self, offset: f32) {
        self.phase = offset.fract();
    }

    /// Advance one sample; return value in −1..1 scaled by depth.
    #[inline]
    pub fn tick(&mut self) -> f32 {
        self.phase += self.rate_hz / self.sample_rate;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        let raw = match self.shape {
            LfoShape::Sine => (2.0 * std::f32::consts::PI * self.phase).sin(),
            LfoShape::Triangle => 4.0 * (self.phase - 0.5).abs() - 1.0,
            LfoShape::Square => {
                if self.phase < 0.5 { 1.0 } else { -1.0 }
            }
            LfoShape::SampleHold => {
                self.next_hold += 1;
                if self.next_hold >= self.samples_per_hold.max(1) {
                    self.next_hold = 0;
                    // cheap deterministic pseudo-random in −1..1
                    let x = self.phase * 997.0;
                    self.hold_value = (x.sin() * 0.7 + (x * 0.5).cos() * 0.3);
                }
                self.hold_value
            }
        };
        raw * self.depth
    }

    pub fn reset(&mut self) {
        self.phase = 0.0;
        self.hold_value = 0.0;
        self.next_hold = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sine_lfo_bounds_and_period() {
        let mut lfo = Lfo::new(48000.0, 1.0, 1.0, LfoShape::Sine);
        let mut max = 0.0_f32;
        let mut min = 0.0_f32;
        let mut zero_crossings = 0;
        let mut prev = 0.0_f32;
        for i in 0..48000 {
            let v = lfo.tick();
            max = max.max(v);
            min = min.min(v);
            if (v >= 0.0) != (prev >= 0.0) && i > 0 {
                zero_crossings += 1;
            }
            prev = v;
        }
        assert!(max <= 1.0001 && min >= -1.0001);
        assert!((max - 1.0).abs() < 0.05, "sine peak {max}");
        assert!((min + 1.0).abs() < 0.05);
        assert_eq!(zero_crossings, 2, "1 Hz sine → 2 zero crossings per second");
    }

    #[test]
    fn tempo_sync_quantizes() {
        let mut lfo = Lfo::new(48000.0, 7.0, 0.5, LfoShape::Triangle);
        lfo.set_tempo(120.0, TempoSync::Quarter);
        // 120 BPM → 2 beats/s → 1/4 note = 2 Hz
        assert!((lfo.rate_hz - 2.0).abs() < 1e-6);
        lfo.set_tempo(120.0, TempoSync::Eighth);
        assert!((lfo.rate_hz - 4.0).abs() < 1e-6);
        lfo.set_tempo(90.0, TempoSync::EighthT);
        // 90 BPM → 1.5 beats/s; 1/8T = 1/3 beat → 4.5 Hz
        assert!((lfo.rate_hz - 4.5).abs() < 1e-4);
    }
}
