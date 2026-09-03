//! Pre-allocated scratch arena for realtime DSP.
//!
//! Every processor requests its scratch space at graph-build time.
//! The arena hands out fixed slices; requesting at runtime returns `None`
//! rather than allocating (realtime contract).

pub struct ScratchArena {
    storage: Vec<f32>,
    cursor: usize,
}

impl ScratchArena {
    /// Allocate `frames * lanes` f32 slots up front.
    pub fn new(frames: usize, lanes: usize) -> Self {
        Self {
            storage: vec![0.0; frames * lanes],
            cursor: 0,
        }
    }

    /// Total remaining scratch slots.
    pub fn remaining(&self) -> usize {
        self.storage.len() - self.cursor
    }

    /// Take a mutable scratch lane of `len` slots. Returns None when the
    /// arena is exhausted — never allocates.
    pub fn take(&mut self, len: usize) -> Option<&mut [f32]> {
        if self.cursor + len > self.storage.len() {
            return None;
        }
        let start = self.cursor;
        self.cursor += len;
        Some(&mut self.storage[start..start + len])
    }

    /// Reset for a new processing block. All previously handed-out slices
    /// must be considered invalidated.
    pub fn reset(&mut self) {
        self.cursor = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hands_out_slices_then_exhausts() {
        let mut arena = ScratchArena::new(8, 1);
        let a = arena.take(3).unwrap();
        a.fill(1.0);
        let b = arena.take(5).unwrap();
        b.fill(2.0);
        assert!(arena.take(1).is_none());
        arena.reset();
        assert!(arena.take(8).is_some());
    }
}
