//! audio-memory — realtime-safe memory primitives.
//!
//! Everything here obeys the realtime contract: **zero allocation after
//! construction**. Ring buffers are fixed-capacity, planar-f32, single-producer
//! single-consumer (worker-side writes are marshalled by the worklet message
//! pump, so only one thread ever touches a given instance — SPSC is a logical
//! constraint, enforced by API shape, not locks).

pub mod arena;
pub mod pool;
pub mod ring_buffer;

pub use arena::ScratchArena;
pub use pool::BufferPool;
pub use ring_buffer::PlanarRingBuffer;
