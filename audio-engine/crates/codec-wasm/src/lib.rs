//! codec-wasm — flat C-ABI decode interface for the Decode Worker.
//! Non-realtime context: allocation allowed (worker thread).
//!
//! Flow (worker):
//!   mq_dec_new() → mq_dec_push(bytes) → mq_dec_info → mq_dec_pop_pcm(...)
//!   → repeat → mq_dec_eof() → mq_dec_drop()
//!
//! Seek: caller drops and re-creates (mq_dec_reset helper), pushing bytes
//! from the new Range offset.

#![allow(clippy::missing_safety_doc)]

use audio_codec::decoder::DecoderHandle;

const MAX_DECODERS: usize = 4;

struct Slot {
    dec: Option<DecoderHandle>,
}
static mut DECODERS: [Slot; MAX_DECODERS] = [
    Slot { dec: None },
    Slot { dec: None },
    Slot { dec: None },
    Slot { dec: None },
];

fn with_dec_mut<R>(handle: u32, f: impl FnOnce(&mut DecoderHandle) -> R) -> Result<R, i32> {
    if handle as usize >= MAX_DECODERS {
        return Err(-2);
    }
    let decs: *mut [Slot; MAX_DECODERS] = unsafe { &raw mut DECODERS };
    match unsafe { (*decs)[handle as usize].dec.as_mut() } {
        Some(d) => Ok(f(d)),
        None => Err(-2),
    }
}

/// Bump on ANY ABI-breaking change to the mq_dec_* export surface.
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

// ── scratch marshalling buffer (JS copies fetch chunks in, PCM out) ──
// Grows on demand; JS re-creates TypedArray views after each call that may
// have grown it (memory resize detaches old views).
static mut SCRATCH: Vec<u8> = Vec::new();

/// Pointer to ≥ `min_len` zeroed scratch bytes in linear memory.
/// Worker-thread use (non-realtime; allocation allowed).
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

#[no_mangle]
pub extern "C" fn mq_dec_new() -> i32 {
    let decs: *mut [Slot; MAX_DECODERS] = unsafe { &raw mut DECODERS };
    for (i, slot) in unsafe { (*decs).iter_mut().enumerate() } {
        if slot.dec.is_none() {
            slot.dec = Some(DecoderHandle::new());
            return i as i32;
        }
    }
    -1
}

#[no_mangle]
pub extern "C" fn mq_dec_drop(handle: u32) -> i32 {
    let decs: *mut [Slot; MAX_DECODERS] = unsafe { &raw mut DECODERS };
    unsafe { (*decs)[handle as usize].dec = None };
    0
}

/// Push compressed bytes (ptr, len in wasm linear memory).
#[no_mangle]
pub unsafe extern "C" fn mq_dec_push(handle: u32, ptr: *const u8, len: u32) -> i32 {
    if ptr.is_null() || len == 0 {
        return 0;
    }
    let bytes = std::slice::from_raw_parts(ptr, len as usize);
    match with_dec_mut(handle, |d| d.push(bytes)) {
        Ok(_) => 0,
        Err(e) => e,
    }
}

#[no_mangle]
pub extern "C" fn mq_dec_eof(handle: u32) -> i32 {
    match with_dec_mut(handle, |d| d.mark_eof()) {
        Ok(_) => 0,
        Err(e) => e,
    }
}

/// 1 when the probe succeeded and stream info is known.
#[no_mangle]
pub extern "C" fn mq_dec_started(handle: u32) -> i32 {
    match with_dec_mut(handle, |d| d.is_started() as i32) {
        Ok(v) => v,
        Err(e) => e,
    }
}

#[no_mangle]
pub extern "C" fn mq_dec_sample_rate(handle: u32) -> i32 {
    match with_dec_mut(handle, |d| d.sample_rate() as i32) {
        Ok(v) => v,
        Err(e) => e,
    }
}

#[no_mangle]
pub extern "C" fn mq_dec_channels(handle: u32) -> i32 {
    match with_dec_mut(handle, |d| d.channels() as i32) {
        Ok(v) => v,
        Err(e) => e,
    }
}

/// Frames waiting in the decoded queue.
#[no_mangle]
pub extern "C" fn mq_dec_queued(handle: u32) -> i32 {
    match with_dec_mut(handle, |d| d.queued_frames() as i32) {
        Ok(v) => v,
        Err(e) => e,
    }
}

/// Pop decoded PCM into wasm linear memory.
/// `max_frames` = capacity of the destination lanes (f32 elements each).
/// ch0/ch1 point to destination buffers. Returns frames copied (0 = empty).
#[no_mangle]
pub unsafe extern "C" fn mq_dec_pop_pcm(
    handle: u32,
    ch0: *mut f32,
    ch1: *mut f32,
    max_frames: u32,
) -> i32 {
    let m = max_frames as usize;
    match with_dec_mut(handle, |d| d.pop_pcm(m)) {
        Ok(None) => 0,
        Ok(Some(block)) => {
            let n = block.frames;
            if !ch0.is_null() {
                let dst = std::slice::from_raw_parts_mut(ch0, m);
                for (i, s) in block.channels.first().map(|c| c.as_slice()).unwrap_or(&[]).iter().enumerate() {
                    if i < m {
                        dst[i] = *s;
                    }
                }
                // mono → duplicate to ch1 when provided
                if !ch1.is_null() {
                    let dst1 = std::slice::from_raw_parts_mut(ch1, m);
                    for i in 0..n.min(m) {
                        dst1[i] = dst[i];
                    }
                }
            } else if !ch1.is_null() && block.channels.len() > 1 {
                let dst1 = std::slice::from_raw_parts_mut(ch1, m);
                for (i, s) in block.channels[1].iter().enumerate() {
                    if i < m {
                        dst1[i] = *s;
                    }
                }
            }
            n as i32
        }
        Err(e) => e,
    }
}

/// Hard reset (seek): clears decoder state. Caller re-pushes new bytes.
#[no_mangle]
pub extern "C" fn mq_dec_reset(handle: u32) -> i32 {
    match with_dec_mut(handle, |d| d.reset()) {
        Ok(_) => 0,
        Err(e) => e,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_wav(frames: usize, sample_rate: u32) -> Vec<u8> {
        let mut out = Vec::new();
        let data_len = frames * 2 * 2;
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len as u32).to_le_bytes());
        out.extend_from_slice(b"WAVE");
        out.extend_from_slice(b"fmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&2u16.to_le_bytes());
        out.extend_from_slice(&sample_rate.to_le_bytes());
        out.extend_from_slice(&(sample_rate * 4).to_le_bytes());
        out.extend_from_slice(&4u16.to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&(data_len as u32).to_le_bytes());
        for i in 0..frames {
            let v = ((i as f32 * 0.05).sin() * 8000.0) as i16;
            out.extend_from_slice(&v.to_le_bytes());
            out.extend_from_slice(&v.to_le_bytes());
        }
        out
    }

    #[test]
    fn full_decode_cycle() {
        let wav = make_wav(2400, 44100);
        let h = mq_dec_new();
        assert!(h >= 0);
        let h = h as u32;
        unsafe {
            mq_dec_push(h, wav.as_ptr(), wav.len() as u32);
        }
        mq_dec_eof(h);
        assert_eq!(mq_dec_started(h), 1);
        assert_eq!(mq_dec_sample_rate(h), 44100);
        assert_eq!(mq_dec_channels(h), 2);
        let mut l = vec![0.0_f32; 4096];
        let mut r = vec![0.0_f32; 4096];
        let mut total = 0;
        loop {
            let n = unsafe { mq_dec_pop_pcm(h, l.as_mut_ptr(), r.as_mut_ptr(), 4096) };
            if n <= 0 {
                break;
            }
            total += n as usize;
        }
        assert_eq!(total, 2400);
        mq_dec_drop(h);
    }
}
