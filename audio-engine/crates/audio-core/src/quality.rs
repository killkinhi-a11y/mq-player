//! Quality modes (§35): Direct / Clean / Studio / Dynamic / Immersive /
//! Master. Each mode configures the chain honestly — Direct bypasses
//! everything (bit-transparent PCM within f32 math).

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum QualityMode {
    Direct = 0,    // full bypass
    Clean = 1,     // safety limiter only
    Studio = 2,    // precise EQ + moderate dynamics
    Dynamic = 3,   // dynamics-forward
    Immersive = 4, // spatial-forward
    Master = 5,    // linear-phase EQ + oversampling + true-peak limiter
}

impl QualityMode {
    pub fn from_u32(v: u32) -> Self {
        match v {
            0 => QualityMode::Direct,
            1 => QualityMode::Clean,
            2 => QualityMode::Studio,
            3 => QualityMode::Dynamic,
            4 => QualityMode::Immersive,
            _ => QualityMode::Master,
        }
    }

    /// Which stages are active per mode (eq, dynamics, saturation, spatial,
    /// modulation, limiter, linear_phase_eq, oversampling).
    pub fn stage_flags(self) -> [bool; 8] {
        match self {
            QualityMode::Direct => [false, false, false, false, false, false, false, false],
            QualityMode::Clean => [false, false, false, false, false, true, false, false],
            QualityMode::Studio => [true, true, false, false, false, true, false, false],
            QualityMode::Dynamic => [true, true, true, false, false, true, false, false],
            QualityMode::Immersive => [true, false, false, true, false, true, false, false],
            QualityMode::Master => [true, true, true, false, false, true, true, true],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direct_bypasses_everything() {
        let f = QualityMode::Direct.stage_flags();
        assert!(f.iter().all(|&x| !x));
    }

    #[test]
    fn master_uses_linear_phase_and_oversampling() {
        let f = QualityMode::Master.stage_flags();
        assert!(f[6] && f[7]);
    }
}
