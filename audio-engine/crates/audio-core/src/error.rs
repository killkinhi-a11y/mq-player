//! Errors — typed, mapped 1:1 to JS error codes by the wasm layer.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreError {
    Audio(String),
    Buffer(String),
    Dsp(String),
    UnsupportedFormat(String),
    UnsupportedFeature(String),
    InvalidParameter(String),
    OutOfMemory,
}

impl CoreError {
    /// Stable JS-side error code.
    pub fn code(&self) -> &'static str {
        match self {
            CoreError::Audio(_) => "AudioError",
            CoreError::Buffer(_) => "BufferError",
            CoreError::Dsp(_) => "DSPError",
            CoreError::UnsupportedFormat(_) => "UnsupportedFormat",
            CoreError::UnsupportedFeature(_) => "UnsupportedFeature",
            CoreError::InvalidParameter(_) => "InvalidParameter",
            CoreError::OutOfMemory => "OutOfMemory",
        }
    }

    pub fn recoverable(&self) -> bool {
        !matches!(self, CoreError::OutOfMemory)
    }
}

impl std::fmt::Display for CoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let (kind, msg): (&str, &str) = match self {
            CoreError::Audio(m) => ("AudioError", m.as_str()),
            CoreError::Buffer(m) => ("BufferError", m.as_str()),
            CoreError::Dsp(m) => ("DSPError", m.as_str()),
            CoreError::UnsupportedFormat(m) => ("UnsupportedFormat", m.as_str()),
            CoreError::UnsupportedFeature(m) => ("UnsupportedFeature", m.as_str()),
            CoreError::InvalidParameter(m) => ("InvalidParameter", m.as_str()),
            CoreError::OutOfMemory => ("OutOfMemory", "memory exhausted"),
        };
        write!(f, "{kind}: {msg}")
    }
}

impl std::error::Error for CoreError {}
