//! MqAudioEngine — the realtime engine core. Owns the full DSP graph and
//! transport, consumes commands between blocks, accumulates stats.

use crate::command::{Command, CommandQueue, Opcode};
use crate::quality::QualityMode;
use crate::CoreError;
use audio_analysis::loudness::LufsMeter;
use audio_analysis::meters::{Meters, PeakKind};
use audio_dsp::dynamics::compressor::Compressor;
use audio_dsp::dynamics::expander::{Expander, NoiseGate};
use audio_dsp::dynamics::limiter::Limiter;
use audio_dsp::dynamics::DetectorMode;
use audio_dsp::Processor;
use audio_dsp::eq::linear_phase::LinearPhaseEq;
use audio_dsp::eq::parametric::{GraphicEq, GRAPHIC_10_FREQS};
use audio_dsp::modulation::modulated_delay::{Chorus, Flanger};
use audio_dsp::modulation::phaser::Phaser;
use audio_dsp::modulation::tremolo::Tremolo;
use audio_dsp::modulation::lfo::LfoShape;
use audio_dsp::restoration::{DeClipper, SpectralEnhancer};
use audio_dsp::saturation::waveshapers::{SaturationKind, Waveshaper};
use audio_dsp::spatial::binaural::BinauralPanner;
use audio_dsp::spatial::reverb::{EarlyReflections, FdnReverb};
use audio_dsp::spatial::width::StereoWidth;
use audio_memory::ring_buffer::PlanarRingBuffer;

/// Insert mode: PCM arrives via worklet inputs (element/HLS path).
/// Stream mode: PCM arrives from the decode worker ring.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EngineMode {
    Insert,
    Stream,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct EngineStats {
    pub playhead_frames: u64,
    pub buffered_frames: u32,
    pub underruns: u32,
    pub overruns: u32,
    pub blocks_processed: u32,
    pub avg_process_ns: f32,
    pub max_process_ns: u32,
    pub last_process_ns: u32,
    pub peak: f32,
    pub rms: f32,
    pub lufs_short: f32,
    pub lufs_integrated: f32,
    pub gr_db: f32,
    pub true_peak_db: f32,
}

pub struct MqAudioEngine {
    pub sample_rate: f32,
    pub channels: usize,
    mode: EngineMode,

    // graph (stereo path; mono → duplicated)
    eq: GraphicEq,
    lp_eq: LinearPhaseEq,
    compressor: Compressor,
    limiter: Limiter,
    gate: NoiseGate,
    expander: Expander,
    chorus: Chorus,
    flanger: Flanger,
    phaser: Phaser,
    tremolo: Tremolo,
    saturation: Waveshaper,
    reverb: FdnReverb,
    er: EarlyReflections,
    binaural: BinauralPanner,
    width: StereoWidth,
    declip: DeClipper,
    enhancer: SpectralEnhancer,

    // master
    volume: f32, // 0..1
    pan: f32,    // −1..1
    quality: QualityMode,
    bypass_all: bool,
    linear_phase_active: bool,

    // transport
    playing: bool,
    playhead_frames: u64,
    rate: f32, // playback rate (affects playhead advance)

    // stream ring (Stream mode)
    ring: PlanarRingBuffer,
    eof: bool,

    // commands + stats
    cmds: CommandQueue,
    pub stats: EngineStats,
    meters: Meters,
    lufs: LufsMeter,

    // process-time tracking
    proc_accum_ns: f32,
    proc_count: u32,
    mono_bridge: Vec<f32>,
}

impl MqAudioEngine {
    pub fn new(sample_rate: f32, channels: usize, mode: EngineMode, ring_frames: usize) -> Result<Self, CoreError> {
        let ch = channels.clamp(1, 8);
        let mut e = Self {
            sample_rate,
            channels: ch,
            mode,
            eq: GraphicEq::new_10(sample_rate, ch),
            lp_eq: LinearPhaseEq::new(sample_rate, 1024, &[(20.0, 0.0), (20000.0, 0.0)]),
            compressor: Compressor::new(sample_rate, ch, -20.0, 3.0, 12.0, 180.0, 8.0, 0.0, DetectorMode::Rms, 0.0),
            limiter: Limiter::new(sample_rate, ch, -1.0, 120.0, 3.0),
            gate: NoiseGate::new(sample_rate, ch, -55.0, 2.0, 100.0, 200.0, 30.0),
            expander: Expander::new(sample_rate, ch, -35.0, 2.0, 10.0, 200.0, 4.0, 20.0, 30.0),
            chorus: Chorus::new(sample_rate, ch, 2),
            flanger: Flanger::new(sample_rate, ch),
            phaser: Phaser::new(sample_rate, ch, 6),
            tremolo: Tremolo::new(sample_rate, 0.0, 0.0, LfoShape::Sine),
            saturation: Waveshaper::new(SaturationKind::Tube, sample_rate, ch, 2),
            reverb: FdnReverb::new(sample_rate, 1800.0, 0.5, 0.0),
            er: EarlyReflections::new(sample_rate, 1.0),
            binaural: BinauralPanner::new(sample_rate),
            width: StereoWidth::new(),
            declip: DeClipper::new(-1.5, ch),
            enhancer: SpectralEnhancer::new(sample_rate, ch),
            volume: 0.85,
            pan: 0.0,
            quality: QualityMode::Clean,
            bypass_all: false,
            linear_phase_active: false,
            playing: false,
            playhead_frames: 0,
            rate: 1.0,
            ring: PlanarRingBuffer::new(ring_frames.max(4096), ch),
            eof: false,
            cmds: CommandQueue::new(256),
            stats: EngineStats::default(),
            meters: Meters::new((0.3 * sample_rate) as usize),
            lufs: LufsMeter::new(sample_rate, ch),
            proc_accum_ns: 0.0,
            proc_count: 0,
            mono_bridge: vec![0.0; 4096],
        };
        // Apply the initial quality mode's stage flags immediately.
        // Processor constructors default many stages to `enabled: true`
        // (e.g. binaural distance-attenuation would halve the signal in
        // Clean mode without this).
        e.apply_quality();
        Ok(e)
    }

    pub fn mode(&self) -> EngineMode {
        self.mode
    }
    pub fn is_playing(&self) -> bool {
        self.playing
    }
    pub fn quality(&self) -> QualityMode {
        self.quality
    }
    pub fn volume(&self) -> f32 {
        self.volume
    }

    /// Push decoded PCM into the stream ring (worker side, marshalled by
    /// the worklet message pump — single-threaded ownership).
    pub fn push_pcm(&mut self, ch: usize, frames: usize) -> usize {
        let n = frames.min(self.ring.available_write());
        if n == 0 {
            self.stats.overruns += 1;
        }
        let _ = ch;
        n
    }

    /// The wasm layer writes decoded planar PCM directly into ring lanes.
    pub fn ring_lane_mut(&mut self, ch: usize) -> &mut [f32] {
        self.ring.lane_mut(ch)
    }

    pub fn ring_write_offsets(&self) -> (usize, usize) {
        (
            self.ring.write_offset(0),
            if self.channels > 1 { self.ring.write_offset(1) } else { self.ring.write_offset(0) },
        )
    }

    pub fn ring_commit_write(&mut self, frames: usize) -> usize {
        self.ring.commit_write(frames)
    }

    pub fn ring_available_write(&self) -> usize {
        self.ring.available_write()
    }

    /// Ring lane length (capacity in frames) for wasm ABI pointer math.
    pub fn ring_lane_len(&self) -> usize {
        self.ring.capacity()
    }

    pub fn set_eof(&mut self, eof: bool) {
        self.eof = eof;
    }

    pub fn enqueue(&mut self, cmd: Command) -> bool {
        self.cmds.push(cmd)
    }

    /// Mark EOF + drain state: true when the ring is empty and EOF is set
    /// (track finished → worklet reports 'ended').
    pub fn is_drained(&self) -> bool {
        self.eof && self.ring.available_read() == 0
    }

    fn apply_quality(&mut self) {
        let f = self.quality.stage_flags();
        // Direct/Clean start from a neutral slate
        self.eq.set_enabled(f[0] && !self.linear_phase_active);
        self.lp_eq.set_enabled(f[6]);
        self.linear_phase_active = f[6];
        self.compressor.set_enabled(f[1]);
        self.limiter.set_enabled(f[5]);
        self.gate.set_enabled(f[1] && matches!(self.quality, QualityMode::Dynamic | QualityMode::Master));
        self.expander.set_enabled(false); // opt-in only
        self.saturation.set_enabled(f[2]);
        self.saturation.set_oversampling(if f[7] { 4 } else { 2 });
        self.reverb.set_enabled(f[3]);
        self.er.set_enabled(f[3]);
        self.binaural.set_enabled(f[3]);
        self.chorus.set_enabled(false);
        self.flanger.set_enabled(false);
        self.phaser.set_enabled(false);
        self.tremolo.set_enabled(false);
        self.declip.set_enabled(false);
        self.enhancer.set_enabled(false);
    }

    fn apply_commands(&mut self) {
        while let Some(cmd) = self.cmds.pop() {
            self.apply(cmd);
        }
    }

    fn apply(&mut self, cmd: Command) {
        use Opcode::*;
        match cmd.op {
            Play => {
                self.playing = true;
            }
            Pause => {
                self.playing = false;
            }
            Stop => {
                self.playing = false;
                self.playhead_frames = 0;
                self.ring.clear();
                self.reset_dsp_state();
            }
            SeekFrames => {
                self.playhead_frames = cmd.a.max(0.0) as u64;
                self.ring.clear();
                self.eof = false;
                self.reset_dsp_state();
            }
            Flush => {
                self.ring.clear();
                self.eof = false;
                self.reset_dsp_state();
            }
            SetVolume => self.volume = cmd.a.clamp(0.0, 1.5),
            SetPan => self.pan = cmd.b.clamp(-1.0, 1.0),
            SetEqEnabled => {
                let on = cmd.a > 0.5 && !self.linear_phase_active;
                self.eq.set_enabled(on);
            }
            SetEqBand => {
                let idx = cmd.a as usize;
                self.eq.set_gain(idx, cmd.b.clamp(-12.0, 12.0));
                // mirror into linear-phase breakpoints when active
                if self.linear_phase_active {
                    let freq = GRAPHIC_10_FREQS.get(idx).copied().unwrap_or(1000.0);
                    let gain = cmd.b.clamp(-12.0, 12.0);
                    self.sync_linear_phase_band(idx, freq, gain);
                }
            }
            SetEqAllBands => { /* handled via repeated SetEqBand from JS */ }
            SetEqModeLinearPhase => {
                self.linear_phase_active = cmd.a > 0.5;
                self.eq.set_enabled(!self.linear_phase_active);
                self.lp_eq.set_enabled(self.linear_phase_active);
            }
            SetCompressorEnabled => self.compressor.set_enabled(cmd.a > 0.5),
            SetCompressorParam => {
                use crate::command::param::*;
                match cmd.b {
                    CP_THRESHOLD => self.compressor.set_threshold_db(cmd.c),
                    CP_RATIO => self.compressor.set_ratio(cmd.c),
                    CP_ATTACK => self.compressor.set_attack_ms(cmd.c),
                    CP_RELEASE => self.compressor.set_release_ms(cmd.c),
                    CP_KNEE => self.compressor.set_knee_db(cmd.c),
                    CP_MAKEUP => self.compressor.set_makeup_db(cmd.c),
                    _ => {}
                }
            }
            SetLimiterEnabled => self.limiter.set_enabled(cmd.a > 0.5),
            SetLimiterParam => {
                use crate::command::param::*;
                match cmd.b {
                    LP_CEILING => self.limiter.set_ceiling_db(cmd.c),
                    LP_RELEASE => self.limiter.set_release_ms(cmd.c),
                    _ => {}
                }
            }
            SetGateEnabled => self.gate.set_enabled(cmd.a > 0.5),
            SetGateParam => {
                use crate::command::param::*;
                match cmd.b {
                    GP_THRESHOLD => self.gate.set_threshold_db(cmd.c),
                    GP_HOLD => self.gate.set_hold_ms(cmd.c),
                    GP_RELEASE => {}
                    GP_RANGE => {}
                    _ => {}
                }
            }
            SetExpanderEnabled => self.expander.set_enabled(cmd.a > 0.5),
            SetExpanderParam => {
                use crate::command::param::*;
                match cmd.b {
                    CP_THRESHOLD => self.expander.set_threshold_db(cmd.c),
                    CP_RATIO => self.expander.set_ratio(cmd.c),
                    CP_ATTACK => {}
                    CP_RELEASE => {}
                    CP_KNEE => {}
                    CP_MAKEUP => {}
                    _ => {}
                }
            }
            SetReverbEnabled => self.reverb.set_enabled(cmd.a > 0.5),
            SetReverbParam => {
                use crate::command::param::*;
                match cmd.b {
                    RP_MIX => self.reverb.set_mix(cmd.c),
                    RP_RT60 => self.reverb.set_rt60_ms(cmd.c),
                    _ => {}
                }
            }
            SetErEnabled => self.er.set_enabled(cmd.a > 0.5),
            SetBinauralEnabled => self.binaural.set_enabled(cmd.a > 0.5),
            SetBinauralParam => {
                use crate::command::param::*;
                match cmd.b {
                    BP_AZIMUTH => self.binaural.set_azimuth_deg(cmd.c),
                    BP_ELEVATION => self.binaural.set_elevation_deg(cmd.c),
                    BP_DISTANCE => self.binaural.set_distance_m(cmd.c),
                    BP_HEADROT => self.binaural.set_head_rotation_deg(cmd.c),
                    _ => {}
                }
            }
            SetWidth => self.width.set_width(cmd.a.clamp(0.0, 3.0)),
            SetChorusEnabled => self.chorus.set_enabled(cmd.a > 0.5),
            SetChorusParam => {
                use crate::command::param::*;
                match cmd.b {
                    CH_RATE => self.chorus.set_rate(cmd.c),
                    CH_DEPTH => self.chorus.set_depth_ms(cmd.c),
                    CH_MIX => self.chorus.set_mix(cmd.c),
                    _ => {}
                }
            }
            SetFlangerEnabled => self.flanger.set_enabled(cmd.a > 0.5),
            SetFlangerParam => {
                use crate::command::param::*;
                match cmd.b {
                    FL_RATE => self.flanger.set_rate(cmd.c),
                    FL_DEPTH => self.flanger.set_depth_ms(cmd.c),
                    FL_FEEDBACK => self.flanger.set_feedback(cmd.c),
                    FL_MIX => self.flanger.set_mix(cmd.c),
                    _ => {}
                }
            }
            SetPhaserEnabled => self.phaser.set_enabled(cmd.a > 0.5),
            SetPhaserParam => {
                use crate::command::param::*;
                match cmd.b {
                    PH_RATE => self.phaser.set_rate(cmd.c),
                    PH_STAGES => self.phaser.set_stages(cmd.c.max(2.0) as usize),
                    PH_FEEDBACK => self.phaser.set_feedback(cmd.c),
                    PH_MIX => self.phaser.set_mix(cmd.c),
                    _ => {}
                }
            }
            SetTremoloEnabled => self.tremolo.set_enabled(cmd.a > 0.5),
            SetTremoloParam => {
                use crate::command::param::*;
                match cmd.b {
                    TR_RATE => self.tremolo.set_rate(cmd.c),
                    TR_DEPTH => self.tremolo.set_depth(cmd.c),
                    _ => {}
                }
            }
            SetSaturationEnabled => self.saturation.set_enabled(cmd.a > 0.5),
            SetSaturationParam => {
                use crate::command::param::*;
                match cmd.b {
                    SA_DRIVE => self.saturation.set_drive(cmd.c),
                    SA_TONE => self.saturation.set_tone(cmd.c),
                    SA_MIX => self.saturation.set_mix(cmd.c),
                    SA_OUTPUT => self.saturation.set_output_db(cmd.c),
                    SA_OVERSAMPLE => self.saturation.set_oversampling(cmd.c.max(1.0) as usize),
                    _ => {}
                }
            }
            SetDeclipEnabled => self.declip.set_enabled(cmd.a > 0.5),
            SetEnhancerEnabled => self.enhancer.set_enabled(cmd.a > 0.5),
            SetNoiseReductionEnabled => self.gate.set_enabled(cmd.a > 0.5),
            SetQualityMode => {
                self.quality = QualityMode::from_u32(cmd.a.max(0.0) as u32);
                self.apply_quality();
            }
            SetBypassAll => {
                self.bypass_all = cmd.a > 0.5;
            }
            SetPlaybackRate => self.rate = cmd.a.clamp(0.25, 3.0),
            Reset => self.reset_dsp_state(),
            _ => {}
        }
    }

    fn sync_linear_phase_band(&mut self, _idx: usize, freq: f32, gain: f32) {
        // rebuild breakpoints from the current 10-band state
        let gains = self.eq.gains();
        let mut bps: Vec<(f32, f32)> = Vec::with_capacity(10);
        for (i, f) in GRAPHIC_10_FREQS.iter().enumerate() {
            bps.push((*f, gains.get(i).copied().unwrap_or(0.0)));
        }
        let _ = (freq, gain);
        self.lp_eq.set_breakpoints(&bps);
    }

    fn reset_dsp_state(&mut self) {
        self.eq.reset();
        self.lp_eq.reset();
        self.compressor.reset();
        self.limiter.reset();
        self.gate.reset();
        self.expander.reset();
        self.chorus.reset();
        self.flanger.reset();
        self.phaser.reset();
        self.tremolo.reset();
        self.saturation.reset();
        self.reverb.reset();
        self.er.reset();
        self.binaural.reset();
        self.declip.reset();
        self.enhancer.reset();
        self.meters.reset();
        self.lufs.reset();
    }

    /// Core processing: planar in/out. Called by the wasm ABI with pointers
    /// into wasm linear memory. `out` channels get the processed signal.
    /// Returns frames actually produced (0 on underrun in stream mode).
    pub fn process_block(&mut self, out: &mut [&mut [f32]], measure: bool) -> usize {
        let start_ns = if measure { Self::now_ns() } else { 0 };

        self.apply_commands();

        let frames = out.iter().map(|c| c.len()).min().unwrap_or(0);
        if frames == 0 {
            return 0;
        }

        // ── fill inputs from stream ring (Stream mode) ──
        if self.mode == EngineMode::Stream {
            let avail = self.ring.available_read();
            // Paused → silence WITHOUT consuming the ring (otherwise up to a
            // full ring of audio keeps playing after pause).
            if !self.playing {
                for ch in out.iter_mut() {
                    ch.fill(0.0);
                }
                self.publish_stats(start_ns, measure);
                return frames;
            }
            if avail == 0 && self.eof {
                for ch in out.iter_mut() {
                    ch.fill(0.0);
                }
                self.publish_stats(start_ns, measure);
                return frames;
            }
            let n = self.ring.pop_planar(out);
            if n < frames {
                self.stats.underruns += 1;
                for ch in out.iter_mut() {
                    for s in ch[n..].iter_mut() {
                        *s = 0.0;
                    }
                }
            }
        }

        let volume = self.volume;
        let pan = self.pan;
        let pan_l = if pan > 0.0 { 1.0 - pan } else { 1.0 };
        let pan_r = if pan < 0.0 { 1.0 + pan } else { 1.0 };

        // ── master gain + pan ──
        for (c, ch) in out.iter_mut().enumerate() {
            let g = volume * if c == 0 { pan_l } else if c == 1 { pan_r } else { 1.0 };
            for s in ch.iter_mut() {
                *s *= g;
            }
        }

        // ── mono → stereo bridge for spatial processors ──
        let stereo = out.len() >= 2;

        if !self.bypass_all {
            self.declip.process(out);
            if self.linear_phase_active {
                self.lp_eq.process(out);
            } else {
                self.eq.process(out);
            }
            self.enhancer.process(out);
            self.expander.process(out);
            self.gate.process(out);
            self.compressor.process(out);
            self.saturation.process(out);
            if stereo {
                self.er.process(out);
                self.reverb.process(out);
                self.binaural.process(out);
                self.width.process(out);
            }
            self.chorus.process(out);
            self.flanger.process(out);
            self.phaser.process(out);
            self.tremolo.process(out);
            self.limiter.process(out);
        }

        // ── safety: NaN/Inf guard on the final output ──
        for ch in out.iter_mut() {
            for s in ch.iter_mut() {
                if !s.is_finite() {
                    *s = 0.0;
                } else {
                    *s = s.clamp(-8.0, 8.0);
                }
            }
        }

        // ── meters/loudness on the post-master signal ──
        for i in 0..frames {
            let mut level = 0.0_f32;
            for ch in out.iter() {
                level = level.max(ch[i].abs());
            }
            self.meters.push(level);
            // feed LUFS (planar frame)
            let mut frame = [0.0_f32; 8];
            for (c, ch) in out.iter().enumerate().take(8) {
                frame[c] = ch[i];
            }
            self.lufs.push_frame(&frame[..self.channels.min(8)]);
        }

        // playhead advance
        if self.playing {
            self.playhead_frames += (frames as f32 * self.rate) as u64;
        }
        self.stats.blocks_processed += 1;

        self.publish_stats(start_ns, measure);
        frames
    }

    fn publish_stats(&mut self, start_ns: u64, measure: bool) {
        if measure {
            let dt = Self::now_ns() - start_ns;
            self.stats.last_process_ns = dt as u32;
            self.stats.max_process_ns = self.stats.max_process_ns.max(dt as u32);
            self.proc_accum_ns += dt as f32;
            self.proc_count += 1;
            if self.proc_count >= 64 {
                self.stats.avg_process_ns = self.proc_accum_ns / self.proc_count as f32;
                self.proc_accum_ns = 0.0;
                self.proc_count = 0;
            }
        }
        self.stats.playhead_frames = self.playhead_frames;
        self.stats.buffered_frames = self.ring.available_read() as u32;
        self.stats.peak = self.meters.peak;
        self.stats.rms = self.meters.rms;
        self.stats.lufs_short = self.lufs.short_term();
        self.stats.lufs_integrated = self.lufs.integrated();
        self.stats.gr_db = self.compressor.gain_reduction_db.max(self.limiter.gain_reduction_db);
        self.stats.true_peak_db = self.meters.peak_db(PeakKind::True);
    }

    fn now_ns() -> u64 {
        // wasm32 has no std::time::Instant — the worklet passes
        // performance.now() deltas via the JS ABI instead. For native tests
        // we use a monotonic start point.
        #[cfg(target_arch = "wasm32")]
        {
            0
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            use std::sync::OnceLock;
            use std::time::Instant;
            static START: OnceLock<Instant> = OnceLock::new();
            let start = START.get_or_init(Instant::now);
            start.elapsed().as_nanos() as u64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direct_mode_passes_audio_unity() {
        let mut eng = MqAudioEngine::new(48000.0, 2, EngineMode::Stream, 16384).unwrap();
        eng.enqueue(Command { op: Opcode::SetQualityMode, a: 0.0, b: 0.0, c: 0.0 });
        eng.enqueue(Command { op: Opcode::Play, a: 0.0, b: 0.0, c: 0.0 });
        eng.enqueue(Command { op: Opcode::SetVolume, a: 1.0, b: 0.0, c: 0.0 });
        // push a sine into the ring via lanes
        let n = 8192;
        let sr = 48000.0;
        {
            let (o0, o1) = eng.ring_write_offsets();
            let l = eng.ring_lane_mut(0);
            for i in 0..n {
                let idx = (o0 + i) % l.len();
                l[idx] = (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sr).sin() * 0.5;
            }
            let r = eng.ring_lane_mut(1);
            for i in 0..n {
                let idx = (o1 + i) % r.len();
                r[idx] = (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sr).sin() * 0.5;
            }
            eng.ring_commit_write(n);
        }
        let mut l = vec![0.0_f32; n];
        let mut r = vec![0.0_f32; n];
        let mut produced = 0;
        while produced < n {
            let mut chans: Vec<&mut [f32]> = vec![&mut l[..], &mut r[..]];
            // process 128-frame blocks
            let _ = chans;
            let step = 128.min(n - produced);
            let mut bl = vec![0.0; step];
            let mut br = vec![0.0; step];
            let mut chans: Vec<&mut [f32]> = vec![&mut bl, &mut br];
            eng.process_block(&mut chans, true);
            l[produced..produced + step].copy_from_slice(&bl);
            r[produced..produced + step].copy_from_slice(&br);
            produced += step;
        }
        let rms = (l.iter().map(|v| v * v).sum::<f32>() / n as f32).sqrt();
        assert!((rms - 0.3535).abs() < 0.02, "Direct mode must be unity: rms={rms}");
    }

    #[test]
    fn stream_underrun_counts_when_ring_empty() {
        let mut eng = MqAudioEngine::new(48000.0, 2, EngineMode::Stream, 16384).unwrap();
        eng.enqueue(Command { op: Opcode::Play, a: 0.0, b: 0.0, c: 0.0 });
        let mut l = vec![0.0_f32; 256];
        let mut r = vec![0.0_f32; 256];
        let mut chans: Vec<&mut [f32]> = vec![&mut l, &mut r];
        eng.process_block(&mut chans, false);
        assert!(eng.stats.underruns >= 1, "empty ring must count underrun");
    }

    #[test]
    fn volume_command_scales_output() {
        let mut eng = MqAudioEngine::new(48000.0, 1, EngineMode::Insert, 4096).unwrap();
        // Direct mode: no limiter lookahead — pure gain path under test.
        eng.enqueue(Command { op: Opcode::SetQualityMode, a: 0.0, b: 0.0, c: 0.0 });
        eng.enqueue(Command { op: Opcode::SetVolume, a: 0.5, b: 0.0, c: 0.0 });
        let mut s = vec![1.0_f32; 512];
        let mut chans: Vec<&mut [f32]> = vec![&mut s];
        eng.process_block(&mut chans, false);
        let mean = s.iter().sum::<f32>() / 512.0;
        assert!((mean - 0.5).abs() < 0.05, "volume must scale: {mean}");
    }
}
