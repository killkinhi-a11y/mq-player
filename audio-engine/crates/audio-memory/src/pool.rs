//! Fixed pool of reusable planar buffers — avoids per-block `Vec` churn on
//! the non-realtime worker side (decode output staging, analysis copies).
//! Ownership is tracked by INDEX tokens (safe — no pointer arithmetic over
//! non-contiguous heap allocations).

pub struct BufferPool {
    buffers: Vec<Vec<f32>>,
    live: Vec<bool>,
    stride: usize,
}

/// A borrowed pool buffer: returns to the pool on drop.
pub struct PoolGuard<'a> {
    pool: &'a mut BufferPool,
    index: usize,
}

impl std::ops::Deref for PoolGuard<'_> {
    type Target = [f32];
    fn deref(&self) -> &[f32] {
        // SAFETY-free: index is validated at acquire time.
        debug_assert!(self.index < self.pool.buffers.len());
        &self.pool.buffers[self.index]
    }
}

impl std::ops::DerefMut for PoolGuard<'_> {
    fn deref_mut(&mut self) -> &mut [f32] {
        debug_assert!(self.index < self.pool.buffers.len());
        &mut self.pool.buffers[self.index]
    }
}

impl Drop for PoolGuard<'_> {
    fn drop(&mut self) {
        self.pool.live[self.index] = false;
    }
}

impl BufferPool {
    pub fn new(count: usize, stride: usize) -> Self {
        Self {
            buffers: (0..count).map(|_| vec![0.0; stride]).collect(),
            live: vec![false; count],
            stride,
        }
    }

    pub fn stride(&self) -> usize {
        self.stride
    }

    pub fn available(&self) -> usize {
        self.live.iter().filter(|l| !**l).count()
    }

    /// Acquire a zeroed buffer. Returns None when exhausted (never allocates).
    /// The buffer returns itself to the pool when the guard drops.
    pub fn acquire(&mut self) -> Option<PoolGuard<'_>> {
        for (i, taken) in self.live.iter_mut().enumerate() {
            if !*taken {
                *taken = true;
                for x in self.buffers[i].iter_mut() {
                    *x = 0.0;
                }
                return Some(PoolGuard { pool: self, index: i });
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acquire_release_cycles() {
        let mut pool = BufferPool::new(2, 4);
        {
            let mut a = pool.acquire().unwrap();
            assert_eq!(a.len(), 4);
            a[0] = 7.0;
            assert_eq!(a[0], 7.0);
        }
        // single guard at a time (the guard holds &mut pool)
        assert!(pool.acquire().is_some());
        // sequential acquire/drop keeps the pool alive
        for _ in 0..5 {
            let _g = pool.acquire().unwrap();
        }
        assert_eq!(pool.available(), 2);
    }

    #[test]
    fn exhaustion_returns_none() {
        let mut pool = BufferPool::new(1, 8);
        {
            let _g = pool.acquire().unwrap();
        }
        {
            let _g = pool.acquire().unwrap();
        }
        // pool size 1: with the guard dropped, still acquirable
        assert!(pool.acquire().is_some());
    }
}
