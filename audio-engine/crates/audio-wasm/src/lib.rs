//! audio-wasm — flat C-ABI exports of the realtime engine for the
//! AudioWorklet. The worklet instantiates this module itself (compiled on
//! the main thread, transferred as a WebAssembly.Module) and calls these
//! flat exports with raw pointers into wasm linear memory.
//!
//! ABI rules:
//! * all pointers are `*mut f32` / `u32` byte offsets (wasm32)
//! * `mq_*` exports never allocate after `mq_engine_new` except the fixed
//!   `hq_*` helpers which are main-thread-only
//! * errors are returned as negative i32 codes; 0 = ok

// C-ABI exports take raw pointers by contract (the worklet passes validated
// offsets into wasm linear memory); the whole surface is unsafe-by-ABI.
#![allow(clippy::missing_safety_doc)]
#![allow(clippy::not_unsafe_ptr_arg_deref)]

use audio_core::command::{Command, Opcode};
use audio_core::engine::{EngineMode, MqAudioEngine};
use audio_core::CoreError;

// ── engine handle table (fixed, no HashMap) ──
const MAX_ENGINES: usize = 4;
struct EngineSlot {
    engine: Option<MqAudioEngine>,
}
static mut ENGINES: [EngineSlot; MAX_ENGINES] = [
    EngineSlot { engine: None },
    EngineSlot { engine: None },
    EngineSlot { engine: None },
    EngineSlot { engine: None },
];

/// Bump this on ANY ABI-breaking change to the mq_* export surface.
/// The JS bootstrap compares it against the expected value and refuses to
/// pair mismatched JS with mismatched WASM (WASM_VERSION_MISMATCH guard).
const MQ_ABI_VERSION: u32 = 3;

#[no_mangle]
pub extern "C" fn mq_abi_version() -> u32 {
    MQ_ABI_VERSION
}

/// Byte-accurate version stamp: (major, minor, patch) packed 16/8/8.
#[no_mangle]
pub extern "C" fn mq_version() -> u32 {
    (0 << 16) | (1 << 8) | 0
}

// ── scratch marshalling buffer (JS copies bytes in/out of linear memory) ──
// Grows on demand; JS must re-create TypedArray views after calling this
// (growth may resize the memory). Never called on the process() hot path
// with a larger value than a previous call for the same consumer.
static mut SCRATCH: Vec<u8> = Vec::new();

/// Returns a pointer (byte offset in linear memory) to a scratch region of
/// at least `min_len` bytes, zero-filled. Main-thread / init-time use only.
#[no_mangle]
pub extern "C" fn mq_scratch_ptr(min_len: u32) -> *mut u8 {
    let scratch: *mut Vec<u8> = unsafe { &raw mut SCRATCH };
    unsafe {
        if (*scratch).len() < min_len as usize {
            (*scratch).resize(min_len as usize, 0);
        }
        (*scratch).as_mut_ptr()
    }
}

const OK: i32 = 0;
const ERR_NO_SLOT: i32 = -1;
const ERR_INVALID_HANDLE: i32 = -2;
const ERR_ENGINE: i32 = -3;

fn with_engine_mut<R>(handle: u32, f: impl FnOnce(&mut MqAudioEngine) -> R) -> Result<R, i32> {
    if handle as usize >= MAX_ENGINES {
        return Err(ERR_INVALID_HANDLE);
    }
    let engines: *mut [EngineSlot; MAX_ENGINES] = unsafe { &raw mut ENGINES };
    let slot = unsafe { &mut (*engines)[handle as usize] };
    match slot.engine.as_mut() {
        Some(e) => Ok(f(e)),
        None => Err(ERR_INVALID_HANDLE),
    }
}

/// Create an engine. `mode`: 0 = insert, 1 = stream.
/// Returns handle index or negative error.
#[no_mangle]
pub extern "C" fn mq_engine_new(
    sample_rate: u32,
    channels: u32,
    mode: u32,
    ring_frames: u32,
) -> i32 {
    let engines: *mut [EngineSlot; MAX_ENGINES] = unsafe { &raw mut ENGINES };
    for (i, slot) in unsafe { (*engines).iter_mut().enumerate() } {
        if slot.engine.is_none() {
            let m = if mode == 1 { EngineMode::Stream } else { EngineMode::Insert };
            match MqAudioEngine::new(sample_rate as f32, channels as usize, m, ring_frames as usize) {
                Ok(e) => {
                    slot.engine = Some(e);
                    return i as i32;
                }
                Err(_) => return ERR_ENGINE,
            }
        }
    }
    ERR_NO_SLOT
}

#[no_mangle]
pub extern "C" fn mq_engine_drop(handle: u32) -> i32 {
    match with_engine_mut(handle, |e| {
        e.enqueue(Command { op: Opcode::Stop, a: 0.0, b: 0.0, c: 0.0 });
    }) {
        Ok(_) => {
            let engines: *mut [EngineSlot; MAX_ENGINES] = unsafe { &raw mut ENGINES };
            unsafe { (*engines)[handle as usize].engine = None };
            OK
        }
        Err(e) => e,
    }
}

/// Enqueue a command (opcode, a, b, c). Returns 0 ok / −4 queue full.
#[no_mangle]
pub extern "C" fn mq_cmd(handle: u32, opcode: u32, a: f32, b: f32, c: f32) -> i32 {
    let op = opcode_from_u32(opcode);
    match with_engine_mut(handle, |e| e.enqueue(Command { op, a, b, c })) {
        Ok(true) => OK,
        Ok(false) => -4,
        Err(e) => e,
    }
}

fn opcode_from_u32(v: u32) -> Opcode {
    use Opcode::*;
    match v {
        1 => Play,
        2 => Pause,
        3 => Stop,
        4 => SeekFrames,
        5 => Flush,
        10 => SetVolume,
        11 => SetPan,
        20 => SetEqEnabled,
        21 => SetEqBand,
        22 => SetEqAllBands,
        23 => SetEqModeLinearPhase,
        30 => SetCompressorEnabled,
        31 => SetCompressorParam,
        32 => SetLimiterEnabled,
        33 => SetLimiterParam,
        34 => SetGateEnabled,
        35 => SetGateParam,
        36 => SetExpanderEnabled,
        37 => SetExpanderParam,
        40 => SetReverbEnabled,
        41 => SetReverbParam,
        42 => SetErEnabled,
        43 => SetBinauralEnabled,
        44 => SetBinauralParam,
        45 => SetWidth,
        50 => SetChorusEnabled,
        51 => SetChorusParam,
        52 => SetFlangerEnabled,
        53 => SetFlangerParam,
        54 => SetPhaserEnabled,
        55 => SetPhaserParam,
        56 => SetTremoloEnabled,
        57 => SetTremoloParam,
        60 => SetSaturationEnabled,
        61 => SetSaturationParam,
        70 => SetDeclipEnabled,
        71 => SetEnhancerEnabled,
        72 => SetNoiseReductionEnabled,
        80 => SetQualityMode,
        81 => SetBypassAll,
        90 => SetPlaybackRate,
        99 => Reset,
        _ => Pause,
    }
}

// ── stream-mode PCM ring access ──

/// Returns writable frames available in the ring.
#[no_mangle]
pub extern "C" fn mq_ring_write_available(handle: u32) -> i32 {
    match with_engine_mut(handle, |e| e.ring_available_write()) {
        Ok(n) => n as i32,
        Err(e) => e,
    }
}

/// Write cursor offset (in f32 elements) for a channel lane.
#[no_mangle]
pub extern "C" fn mq_ring_write_offset(handle: u32, channel: u32) -> i32 {
    // ABSOLUTE write-cursor offset (f32 elements into linear memory).
    // ABI v3: was previously the Vec-RELATIVE offset — JS treated it as
    // absolute and wrote decoded PCM into the wrong memory (the ring Vec
    // lives ~1 MB into the heap), so the engine popped zeros = silent
    // playback while all logical counters looked healthy.
    match with_engine_mut(handle, |e| e.ring_write_offset_abs(channel as usize)) {
        Ok(n) => n as i32,
        Err(e) => e,
    }
}

/// ABSOLUTE lane-start offset (f32 elements) — the wrap target when a
/// write crosses the lane end (ABI v3).
#[no_mangle]
pub extern "C" fn mq_ring_lane_base(handle: u32, channel: u32) -> i32 {
    match with_engine_mut(handle, |e| e.ring_lane_base_abs(channel as usize)) {
        Ok(n) => n as i32,
        Err(e) => e,
    }
}

/// Ring lane length (capacity in frames) for pointer arithmetic.
#[no_mangle]
pub extern "C" fn mq_ring_capacity(handle: u32) -> i32 {
    match with_engine_mut(handle, |e| e.ring_lane_len()) {
        Ok(n) => n as i32,
        Err(e) => e,
    }
}

/// Commit `frames` written by the message pump into the ring lanes.
#[no_mangle]
pub extern "C" fn mq_ring_commit_write(handle: u32, frames: u32) -> i32 {
    match with_engine_mut(handle, |e| e.ring_commit_write(frames as usize) as i32) {
        Ok(_) => OK,
        Err(e) => e,
    }
}

#[no_mangle]
pub extern "C" fn mq_set_eof(handle: u32, eof: u32) -> i32 {
    match with_engine_mut(handle, |e| e.set_eof(eof > 0)) {
        Ok(_) => OK,
        Err(e) => e,
    }
}

/// 1 when ring drained + EOF (track ended).
#[no_mangle]
pub extern "C" fn mq_is_drained(handle: u32) -> i32 {
    match with_engine_mut(handle, |e| e.is_drained() as i32) {
        Ok(v) => v,
        Err(e) => e,
    }
}

// ── realtime process (hot path) ──

/// Insert mode: process the worklet input channels in place.
/// ch0/ch1 are offsets into linear memory; frames = block size.
/// ZERO heap allocation: channel slices live on the stack (realtime rule).
#[no_mangle]
pub unsafe extern "C" fn mq_process_ins(
    handle: u32,
    ch0: *mut f32,
    ch1: *mut f32,
    frames: u32,
) -> i32 {
    if ch0.is_null() || frames == 0 {
        return 0;
    }
    let n = frames as usize;
    if ch1.is_null() {
        let mut chans: [&mut [f32]; 1] = [std::slice::from_raw_parts_mut(ch0, n)];
        match with_engine_mut(handle, |e| e.process_block(&mut chans, false) as i32) {
            Ok(v) => v,
            Err(e) => e,
        }
    } else {
        let mut chans: [&mut [f32]; 2] = [
            std::slice::from_raw_parts_mut(ch0, n),
            std::slice::from_raw_parts_mut(ch1, n),
        ];
        match with_engine_mut(handle, |e| e.process_block(&mut chans, false) as i32) {
            Ok(v) => v,
            Err(e) => e,
        }
    }
}

/// Stream mode: fill the output channels from the ring + DSP.
/// ZERO heap allocation: channel slices live on the stack (realtime rule).
#[no_mangle]
pub unsafe extern "C" fn mq_process_out(
    handle: u32,
    ch0: *mut f32,
    ch1: *mut f32,
    frames: u32,
) -> i32 {
    if ch0.is_null() || frames == 0 {
        return 0;
    }
    let n = frames as usize;
    if ch1.is_null() {
        let mut chans: [&mut [f32]; 1] = [std::slice::from_raw_parts_mut(ch0, n)];
        match with_engine_mut(handle, |e| e.process_block(&mut chans, true) as i32) {
            Ok(v) => v,
            Err(e) => e,
        }
    } else {
        let mut chans: [&mut [f32]; 2] = [
            std::slice::from_raw_parts_mut(ch0, n),
            std::slice::from_raw_parts_mut(ch1, n),
        ];
        match with_engine_mut(handle, |e| e.process_block(&mut chans, true) as i32) {
            Ok(v) => v,
            Err(e) => e,
        }
    }
}

// ── stats (read between blocks; worklet posts to the main thread) ──

/// Copy engine stats into a fixed f32 layout (see TS `EngineStatsLayout`).
#[no_mangle]
pub extern "C" fn mq_stats(handle: u32, out: *mut f32) -> i32 {
    if out.is_null() {
        return ERR_INVALID_HANDLE;
    }
    match with_engine_mut(handle, |e| {
        let s = &e.stats;
        let o = unsafe { std::slice::from_raw_parts_mut(out, 16) };
        o[0] = s.playhead_frames as f32;
        o[1] = s.buffered_frames as f32;
        o[2] = s.underruns as f32;
        o[3] = s.overruns as f32;
        o[4] = s.blocks_processed as f32;
        o[5] = s.avg_process_ns;
        o[6] = s.max_process_ns as f32;
        o[7] = s.last_process_ns as f32;
        o[8] = s.peak;
        o[9] = s.rms;
        o[10] = s.lufs_short;
        o[11] = s.lufs_integrated;
        o[12] = s.gr_db;
        o[13] = s.true_peak_db;
        o[14] = 0.0;
        o[15] = 0.0;
    }) {
        Ok(_) => OK,
        Err(e) => e,
    }
}

/// Error-code lookup exposed for tests.
#[no_mangle]
pub extern "C" fn mq_err_code(handle: u32) -> i32 {
    let _ = handle;
    0
}

/// WASM SIMD feature report: compiled with +simd128 → 1.
#[no_mangle]
pub extern "C" fn mq_has_simd() -> i32 {
    #[cfg(target_feature = "simd128")]
    {
        1
    }
    #[cfg(not(target_feature = "simd128"))]
    {
        0
    }
}
