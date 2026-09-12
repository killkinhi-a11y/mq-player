//! Incremental push/pop decoder over Symphonia's probe + format + codec
//! stack. The worker feeds arbitrary chunks (HTTP Range responses); this
//! module maintains internal byte buffering and decodes whenever a full
//! packet is available.

use symphonia::core::audio::{AudioBuffer, AudioBufferRef, Signal};
use symphonia::core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::FormatReader;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Shared, growable byte buffer backing the MediaSourceStream. The worker
/// appends (push), Symphonia pulls (read). `Arc<Mutex>` — Send+Sync for the
/// MediaSource trait; all access is single-threaded in practice (worker).
#[derive(Default)]
struct SharedBuf {
    buf: Vec<u8>,
    pos: usize, // read cursor for the consumer (Symphonia)
}

struct SharedSource(std::sync::Arc<std::sync::Mutex<SharedBuf>>);

impl std::io::Read for SharedSource {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        let mut sb = self.0.lock().map_err(|_| {
            std::io::Error::new(std::io::ErrorKind::Other, "shared buffer poisoned")
        })?;
        if sb.pos >= sb.buf.len() {
            // No data at this moment — non-sticky EOF: the stream re-reads
            // on the next pull, so later pushes are seen.
            return Ok(0);
        }
        let n = (sb.buf.len() - sb.pos).min(out.len());
        out[..n].copy_from_slice(&sb.buf[sb.pos..sb.pos + n]);
        sb.pos += n;
        Ok(n)
    }
}

impl std::io::Seek for SharedSource {
    fn seek(&mut self, pos: std::io::SeekFrom) -> std::io::Result<u64> {
        let mut sb = self.0.lock().map_err(|_| {
            std::io::Error::new(std::io::ErrorKind::Other, "shared buffer poisoned")
        })?;
        let new_pos = match pos {
            std::io::SeekFrom::Start(p) => p as i64,
            std::io::SeekFrom::Current(d) => sb.pos as i64 + d,
            std::io::SeekFrom::End(d) => sb.buf.len() as i64 + d,
        };
        if new_pos < 0 {
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "negative seek"));
        }
        sb.pos = new_pos as usize;
        Ok(sb.pos as u64)
    }
}

impl symphonia::core::io::MediaSource for SharedSource {
    fn is_seekable(&self) -> bool {
        true
    }
    fn byte_len(&self) -> Option<u64> {
        // Live length: grows with pushes. Symphonia uses this for RIFF
        // chunk bounds — reporting the current length keeps parsing valid
        // while more data streams in (WAV data chunk reads stop at EOF).
        self.0.lock().ok().map(|sb| sb.buf.len() as u64)
    }
}

pub struct PcmBlock {
    /// Planar f32 PCM: `channels[channel][frame]`
    pub channels: Vec<Vec<f32>>,
    pub frames: usize,
    pub timestamp_frames: u64,
}

pub struct DecoderHandle {
    shared: std::sync::Arc<std::sync::Mutex<SharedBuf>>,
    format: Option<Box<dyn FormatReader>>,
    decoder: Option<Box<dyn Decoder>>,
    track_id: u32,
    sample_rate: u32,
    channels: usize,
    queue: Vec<PcmBlock>, // decoded but not yet consumed by pop_pcm
    started: bool,
    input_eof: bool,
}

impl DecoderHandle {
    pub fn new() -> Self {
        Self {
            shared: std::sync::Arc::new(std::sync::Mutex::new(SharedBuf::default())),
            format: None,
            decoder: None,
            track_id: 0,
            sample_rate: 0,
            channels: 0,
            queue: Vec::new(),
            started: false,
            input_eof: false,
        }
    }

    /// Feed compressed bytes. Tries to start the pipeline after enough data.
    pub fn push(&mut self, data: &[u8]) {
        if let Ok(mut sb) = self.shared.lock() {
            sb.buf.extend_from_slice(data);
        }
        if !self.started {
            self.try_start();
        }
        if self.started {
            self.decode_available();
        }
    }

    pub fn mark_eof(&mut self) {
        self.input_eof = true;
        if self.started {
            self.decode_available();
        }
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn channels(&self) -> usize {
        self.channels
    }

    pub fn is_started(&self) -> bool {
        self.started
    }

    pub fn input_eof(&self) -> bool {
        self.input_eof
    }

    /// Frames decoded and waiting in the queue.
    pub fn queued_frames(&self) -> usize {
        self.queue.iter().map(|b| b.frames).sum()
    }

    /// Pop up to `max_frames` of planar PCM. Returns None when the queue is
    /// empty (caller should push more bytes or mark EOF).
    ///
    /// After popping, re-runs `decode_available` — the queue cap (1<<18)
    /// pauses decoding while the queue is full; without this re-trigger the
    /// tail of long tracks would stay undecoded in the byte buffer.
    pub fn pop_pcm(&mut self, max_frames: usize) -> Option<PcmBlock> {
        if self.queue.is_empty() {
            return None;
        }
        let mut block = self.queue.remove(0);
        if block.frames > max_frames {
            // split: keep the remainder in the queue
            let mut rest = PcmBlock {
                channels: Vec::with_capacity(block.channels.len()),
                frames: block.frames - max_frames,
                timestamp_frames: block.timestamp_frames + max_frames as u64,
            };
            for mut lane in block.channels.iter_mut() {
                let tail = lane.split_off(max_frames);
                rest.channels.push(tail);
                lane.truncate(max_frames);
            }
            block.frames = max_frames;
            self.queue.insert(0, rest);
        }
        if self.started {
            self.decode_available();
        }
        Some(block)
    }

    /// Hard reset for seek: clears the byte source, format, and decoder.
    /// The caller re-pushes bytes from the new offset.
    pub fn reset(&mut self) {
        *self = Self::new();
    }

    fn try_start(&mut self) {
        let have = self
            .shared
            .lock()
            .map(|sb| sb.buf.len())
            .unwrap_or(0);
        if have < 4096 && !self.input_eof {
            return; // not enough to probe
        }
        // The MediaSourceStream reads from the LIVE shared buffer — later
        // pushes are visible to the format reader without restarts.
        let mss = MediaSourceStream::new(
            Box::new(SharedSource(std::sync::Arc::clone(&self.shared))),
            Default::default(),
        );
        let hint = Hint::new();
        let probed = symphonia::default::get_probe().format(
            &hint,
            mss,
            &symphonia::core::formats::FormatOptions::default(),
            &MetadataOptions::default(),
        );
        let probed = match probed {
            Ok(p) => p,
            Err(_e) => {
                #[cfg(test)]
                println!("[try_start] probe failed on {have} bytes");
                return; // need more bytes — try again on next push
            }
        };
        let format = probed.format;
        let track = format
            .tracks()
            .iter()
            .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            .cloned();
        let track = match track {
            Some(t) => t,
            None => return,
        };
        let dec = match symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default()) {
            Ok(d) => d,
            Err(_) => return,
        };
        self.sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
        self.channels = track
            .codec_params
            .channels
            .map(|c| c.count())
            .unwrap_or(2)
            .max(1);
        self.track_id = track.id;
        self.format = Some(format);
        self.decoder = Some(dec);
        self.started = true;
    }

    /// Pull packets from the format reader and decode them into the queue.
    /// Safe to call repeatedly; stops at "not enough data".
    fn decode_available(&mut self) {
        let limit = self.queue.iter().map(|b| b.frames).sum::<usize>();
        // cap queue so we don't decode the entire file at once
        if limit > 1 << 18 {
            return;
        }
        let mut guard = 0;
        while guard < 64 {
            guard += 1;
            let format = match self.format.as_mut() {
                Some(f) => f,
                None => return,
            };
            let packet = match format.next_packet() {
                Ok(p) => p,
                Err(symphonia::core::errors::Error::IoError(ref e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    // out of buffered data — wait for more pushes
                    return;
                }
                Err(symphonia::core::errors::Error::ResetRequired) => {
                    return;
                }
                Err(_) => {
                    // malformed/end — treat as terminal for this session
                    return;
                }
            };
            if packet.track_id() != self.track_id {
                continue;
            }
            let decoder = match self.decoder.as_mut() {
                Some(d) => d,
                None => return,
            };
            let decoded = match decoder.decode(&packet) {
                Ok(d) => d,
                Err(_) => continue,
            };
            // Convert while `decoder` is still borrowed (AudioBufferRef
            // borrows the decoder's internal buffer). Pure free function.
            let out_channels = self.channels.max(1);
            if let Some(block) = convert_ref(&decoded, out_channels, packet.ts) {
                self.queue.push(block);
            }
        }
    }
}

/// Convert any Symphonia sample format into planar f32. Free function to
/// avoid borrow conflicts with the decoder.
fn convert_ref(buf: &AudioBufferRef, out_channels: usize, ts: u64) -> Option<PcmBlock> {
    let frames = buf.frames();
    if frames == 0 {
        return None;
    }
    let src_channels = buf.spec().channels.count();
    // Match the source's CAPACITY (Symphonia allocates packet-size buffers)
    // — `convert` asserts dest capacity ≥ src capacity and equal specs.
    let mut f32buf: AudioBuffer<f32> = AudioBuffer::new(buf.capacity() as u64, buf.spec().clone());
    buf.convert(&mut f32buf);
    f32buf.truncate(frames);
    let mut lanes: Vec<Vec<f32>> = Vec::with_capacity(out_channels);
    for ch in 0..out_channels {
        if ch < src_channels {
            lanes.push(f32buf.chan(ch).to_vec());
        } else {
            // mono → duplicate to fill the requested channel count
            lanes.push(f32buf.chan(0).to_vec());
        }
    }
    Some(PcmBlock { channels: lanes, frames, timestamp_frames: ts })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a minimal WAV (PCM16) file in memory and decode it.
    fn make_wav(frames: usize, sample_rate: u32) -> Vec<u8> {
        let mut out = Vec::new();
        let data_len = frames * 2 * 2; // stereo, s16
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len as u32).to_le_bytes());
        out.extend_from_slice(b"WAVE");
        out.extend_from_slice(b"fmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes()); // PCM
        out.extend_from_slice(&2u16.to_le_bytes()); // stereo
        out.extend_from_slice(&sample_rate.to_le_bytes());
        let byte_rate = sample_rate * 4;
        out.extend_from_slice(&byte_rate.to_le_bytes());
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
    fn decodes_wav_pcm() {
        let wav = make_wav(4800, 48000);
        let mut dec = DecoderHandle::new();
        dec.push(&wav);
        dec.mark_eof();
        assert!(dec.is_started(), "decoder must start on WAV");
        assert_eq!(dec.sample_rate(), 48000);
        assert_eq!(dec.channels(), 2);
        let mut total = 0;
        while let Some(block) = dec.pop_pcm(4096) {
            assert_eq!(block.channels.len(), 2);
            let l = &block.channels[0];
            let r = &block.channels[1];
            assert_eq!(l.len(), r.len());
            // stereo duplicate → L == R
            for (a, b) in l.iter().zip(r.iter()) {
                assert!((a - b).abs() < 1e-6);
            }
            total += block.frames;
        }
        assert_eq!(total, 4800, "must decode all frames, got {total}");
        // signal present
    }

    #[test]
    fn incremental_feed_works() {
        let wav = make_wav(2400, 44100);
        let mut dec = DecoderHandle::new();
        // feed in 3 KB chunks
        for chunk in wav.chunks(3072) {
            dec.push(chunk);
        }
        dec.mark_eof();
        assert!(dec.is_started());
        let total: usize = (0..).map_while(|_| dec.pop_pcm(1024)).map(|b| b.frames).sum();
        assert_eq!(total, 2400);
    }
}
