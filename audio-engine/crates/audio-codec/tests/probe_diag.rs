// Diagnostic: probe a WAV directly (temp scratch test)
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

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
fn probe_direct() {
    let wav = make_wav(4800, 48000);
    let mss = MediaSourceStream::new(
        Box::new(std::io::Cursor::new(wav.clone())),
        Default::default(),
    );
    let hint = Hint::new();
    let probed = symphonia::default::get_probe().format(
        &hint,
        mss,
        &symphonia::core::formats::FormatOptions::default(),
        &MetadataOptions::default(),
    );
    match probed {
        Ok(p) => {
            println!("PROBE OK: tracks={}", p.format.tracks().len());
            for t in p.format.tracks() {
                println!("  track id={} codec={:?} sr={:?} ch={:?}", t.id, t.codec_params.codec, t.codec_params.sample_rate, t.codec_params.channels);
            }
        }
        Err(e) => println!("PROBE ERR: {e:?}"),
    }
}

#[test]
fn handle_direct() {
    use audio_codec::decoder::DecoderHandle;
    let wav = make_wav(4800, 48000);
    let mut dec = DecoderHandle::new();
    dec.push(&wav);
    println!("after push: started={} sr={} ch={}", dec.is_started(), dec.sample_rate(), dec.channels());
    dec.mark_eof();
    println!("after eof: started={} queued={}", dec.is_started(), dec.queued_frames());
    let mut total = 0;
    while let Some(b) = dec.pop_pcm(4096) {
        total += b.frames;
    }
    println!("decoded total={total}");
    assert!(dec.is_started());
}
