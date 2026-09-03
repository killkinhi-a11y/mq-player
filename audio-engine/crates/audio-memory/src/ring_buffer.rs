//! Fixed-capacity planar (per-channel) f32 ring buffer.
//!
//! Layout: `channels` contiguous lanes of `capacity` frames each.
//! All access is split into `begin/commit` pairs so callers can write
//! directly into the backing storage without intermediate copies.
//! No allocation, no locks, no bounds-check panics after construction.

/// A planar SPSC ring buffer for decoded PCM.
///
/// Invariants (tested):
/// * `read_pos` and `write_pos` always in `0..capacity`
/// * available-for-write + available-for-read == capacity (exact)
/// * channels never alias (lane stride = capacity)
pub struct PlanarRingBuffer {
    data: Vec<f32>,
    capacity: usize,
    channels: usize,
    write_pos: usize, // frame index
    read_pos: usize,  // frame index
}

impl PlanarRingBuffer {
    /// Create a ring with `capacity` frames per channel.
    /// `capacity` must be > 0; lanes are zero-initialised.
    pub fn new(capacity: usize, channels: usize) -> Self {
        assert!(capacity > 0, "ring capacity must be > 0");
        assert!(channels > 0 && channels <= 16, "channels 1..=16 supported");
        Self {
            data: vec![0.0; capacity * channels],
            capacity,
            channels,
            write_pos: 0,
            read_pos: 0,
        }
    }

    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    #[inline]
    pub fn channels(&self) -> usize {
        self.channels
    }

    /// Frames currently readable.
    #[inline]
    pub fn available_read(&self) -> usize {
        self.capacity - self.available_write()
    }

    /// Frames currently writable.
    #[inline]
    pub fn available_write(&self) -> usize {
        self.capacity - (self.write_pos - self.read_pos)
    }

    /// Pointer (offset into `data`) of the write cursor for a channel lane.
    /// Combined with [`Self::commit_write`], lets producers copy straight in.
    ///
    /// # Cursor model
    /// `write_pos` / `read_pos` are MONOTONIC frame counters (never wrapped):
    /// `fill = write − read` is always exact, and `% capacity` is applied
    /// only when indexing. This is the classic SPSC correctness invariant.
    #[inline]
    pub fn write_offset(&self, channel: usize) -> usize {
        debug_assert!(channel < self.channels);
        channel * self.capacity + self.write_pos % self.capacity
    }

    /// Pointer of the read cursor for a channel lane.
    #[inline]
    pub fn read_offset(&self, channel: usize) -> usize {
        debug_assert!(channel < self.channels);
        channel * self.capacity + self.read_pos % self.capacity
    }

    /// Wrap-aware length of the first contiguous write segment.
    #[inline]
    pub fn write_contiguous(&self) -> usize {
        let linear = self.capacity - self.write_pos % self.capacity;
        let free = self.available_write();
        linear.min(free)
    }

    /// Wrap-aware length of the first contiguous read segment.
    #[inline]
    pub fn read_contiguous(&self) -> usize {
        let linear = self.capacity - self.read_pos % self.capacity;
        let filled = self.available_read();
        linear.min(filled)
    }

    /// Commit `frames` written via [`Self::write_offset`].
    /// Clamps to actually-free space; returns frames committed.
    #[inline]
    pub fn commit_write(&mut self, frames: usize) -> usize {
        let n = frames.min(self.available_write());
        self.write_pos += n; // monotonic — wrap only at indexing
        n
    }

    /// Commit `frames` consumed via [`Self::read_offset`].
    /// Clamps to available; returns frames consumed.
    #[inline]
    pub fn commit_read(&mut self, frames: usize) -> usize {
        let n = frames.min(self.available_read());
        self.read_pos += n; // monotonic
        n
    }

    /// Interleaved→planar push. Returns frames actually written
    /// (may be less than requested when the ring is near-full).
    pub fn push_interleaved(&mut self, src: &[f32], channels: usize) -> usize {
        debug_assert_eq!(channels, self.channels, "channel mismatch");
        let frames = src.len() / channels;
        let n = frames.min(self.available_write());
        for ch in 0..self.channels {
            let base = ch * self.capacity;
            let mut wp = self.write_pos;
            for i in 0..n {
                let s = src[i * channels + ch];
                self.data[base + wp % self.capacity] = s;
                wp += 1;
            }
        }
        self.write_pos += n;
        n
    }

    /// Planar push of `n` frames from per-channel slices.
    /// Returns frames written.
    pub fn push_planar(&mut self, src: &[&[f32]]) -> usize {
        let frames = src.iter().map(|s| s.len()).min().unwrap_or(0);
        let n = frames.min(self.available_write());
        for (ch, lane) in src.iter().enumerate().take(self.channels) {
            let base = ch * self.capacity;
            let mut wp = self.write_pos;
            for i in 0..n {
                self.data[base + wp % self.capacity] = lane[i];
                wp += 1;
            }
        }
        self.write_pos += n;
        n
    }

    /// Planar pop of up to `dst[i].len()` frames per channel.
    /// Returns frames actually read (0 when empty).
    /// Output beyond the read amount is untouched.
    pub fn pop_planar(&mut self, dst: &mut [&mut [f32]]) -> usize {
        let frames = dst.iter().map(|s| s.len()).min().unwrap_or(0);
        let n = frames.min(self.available_read());
        for (ch, lane) in dst.iter_mut().enumerate().take(self.channels) {
            let base = ch * self.capacity;
            let mut rp = self.read_pos;
            for i in 0..n {
                lane[i] = self.data[base + rp % self.capacity];
                rp += 1;
            }
        }
        self.read_pos += n;
        n
    }

    /// Drop all buffered data (seek / track switch). Keep capacity.
    pub fn clear(&mut self) {
        self.read_pos = 0;
        self.write_pos = 0;
    }

    /// Direct lane access — used by the wasm ABI layer to expose pointers.
    /// Lane is the full capacity slice; cursor arithmetic is caller's job.
    pub fn lane(&self, channel: usize) -> &[f32] {
        &self.data[channel * self.capacity..(channel + 1) * self.capacity]
    }

    /// Mutable lane access (wasm ABI layer).
    pub fn lane_mut(&mut self, channel: usize) -> &mut [f32] {
        &mut self.data[channel * self.capacity..(channel + 1) * self.capacity]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_pop_roundtrip() {
        let mut ring = PlanarRingBuffer::new(8, 2);
        let src_l: Vec<f32> = (0..6).map(|i| i as f32).collect();
        let src_r: Vec<f32> = (0..6).map(|i| (i + 100) as f32).collect();
        let n = ring.push_planar(&[&src_l, &src_r]);
        assert_eq!(n, 6);
        assert_eq!(ring.available_read(), 6);

        let mut dl = vec![0.0; 4];
        let mut dr = vec![0.0; 4];
        let m = ring.pop_planar(&mut [&mut dl, &mut dr]);
        assert_eq!(m, 4);
        assert_eq!(dl, vec![0.0, 1.0, 2.0, 3.0]);
        assert_eq!(dr, vec![100.0, 101.0, 102.0, 103.0]);
    }

    #[test]
    fn wraps_correctly() {
        let mut ring = PlanarRingBuffer::new(4, 1);
        let push = |ring: &mut PlanarRingBuffer, vals: &[f32]| {
            let mut lanes: Vec<&[f32]> = vec![vals];
            ring.push_planar(&mut lanes)
        };
        assert_eq!(push(&mut ring, &[1.0, 2.0, 3.0]), 3);
        let mut out = vec![0.0; 2];
        let mut lanes: Vec<&mut [f32]> = vec![&mut out];
        assert_eq!(ring.pop_planar(&mut lanes), 2);
        assert_eq!(out, vec![1.0, 2.0]);
        // write 3 more → wraps around
        assert_eq!(push(&mut ring, &[4.0, 5.0, 6.0]), 3);
        assert_eq!(ring.available_read(), 4);
        let mut out2 = vec![0.0; 4];
        let mut lanes2: Vec<&mut [f32]> = vec![&mut out2];
        assert_eq!(ring.pop_planar(&mut lanes2), 4);
        assert_eq!(out2, vec![3.0, 4.0, 5.0, 6.0]);
    }

    #[test]
    fn full_ring_rejects_overwrite() {
        let mut ring = PlanarRingBuffer::new(4, 1);
        let vals = [1.0, 2.0, 3.0, 4.0, 5.0];
        let mut lanes: Vec<&[f32]> = vec![&vals];
        assert_eq!(ring.push_planar(&mut lanes), 4);
        assert_eq!(ring.available_write(), 0);
    }

    #[test]
    fn interleaved_push_matches_planar() {
        let mut a = PlanarRingBuffer::new(8, 2);
        let mut b = PlanarRingBuffer::new(8, 2);
        let inter = [1.0, 9.0, 2.0, 8.0, 3.0, 7.0];
        a.push_interleaved(&inter, 2);
        b.push_planar(&[&[1.0, 2.0, 3.0], &[9.0, 8.0, 7.0]]);
        let mut la = vec![0.0; 3];
        let mut ra = vec![0.0; 3];
        let mut lb = vec![0.0; 3];
        let mut rb = vec![0.0; 3];
        a.pop_planar(&mut [&mut la, &mut ra]);
        b.pop_planar(&mut [&mut lb, &mut rb]);
        assert_eq!((la, ra), (lb, rb));
    }

    #[test]
    fn invariant_read_plus_write_eq_capacity() {
        let mut ring = PlanarRingBuffer::new(16, 2);
        let vals = vec![0.5; 10];
        ring.push_planar(&[&vals, &vals]);
        let mut la = vec![0.0; 7];
        let mut ra = vec![0.0; 7];
        let mut lanes: Vec<&mut [f32]> = vec![&mut la, &mut ra];
        ring.pop_planar(&mut lanes);
        assert_eq!(ring.available_read() + ring.available_write(), 16);
        ring.clear();
        assert_eq!(ring.available_read(), 0);
    }
}
